import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getCapturePage, updateCapturePageHtml, listCapturePaths } from "@/app/lib/site-capture-db";
import { applyEdits, extractChromeEdits, applyChromeEditsToPage, hasChromeEdits, extractScopedEdits, applyScopedEditsToPage, isCapturedProductPath, NEW_BLOCK_TYPES, type PageEdits, type NewBlock, type EditedSection } from "@/app/lib/site-capture";
import { planCaptureWrite } from "@/app/lib/capture-history";

export const dynamic = "force-dynamic";

// POST { path, edits, images, deleteSecs, dupSecs } — save a seller's in-place edits
// to one captured page (text, image swaps, section add/remove). Auth-gated (only the
// store owner), so the public edit-mode view can't be used to vandalize a site.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => null);
 const path = body?.path ? String(body.path) : "";
 if (!path) return NextResponse.json({ error: "Missing page." }, { status: 400 });

 const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
 // `sections` is the full desired section order (reorder/duplicate/delete in one array);
 // when present it supersedes the legacy per-index deleteSecs/dupSecs.
 const VALID_NEW = new Set<string>(NEW_BLOCK_TYPES);
 const sections = Array.isArray(body?.sections)
 ? (body.sections as unknown[]).map((e): number | NewBlock | EditedSection | null => {
   if (typeof e === "number" && e >= 0) return e;
   const o = e as { new?: unknown; sec?: unknown; text?: unknown; href?: unknown; html?: unknown } | null;
   if (o && typeof o.new === "string" && VALID_NEW.has(o.new)) return { new: o.new as NewBlock["new"], text: typeof o.text === "string" ? o.text : undefined, href: typeof o.href === "string" ? o.href : undefined, html: typeof o.html === "string" ? o.html : undefined };
   // One of her own captured sections, sent back with what she has put inside it. Bounded hard:
   // a section is a section, not a place to post a megabyte.
   if (o && typeof o.sec === "number" && o.sec >= 0 && typeof o.html === "string") return { sec: o.sec, html: o.html.slice(0, 400_000) };
   return null;
   }).filter((e): e is number | NewBlock | EditedSection => e !== null)
 : undefined;
 const p: PageEdits = {
 edits: arr<{ eid: number; text: string }>(body?.edits).filter((e) => typeof e?.eid === "number" && typeof e?.text === "string").map((e) => ({ eid: e.eid, text: String(e.text).slice(0, 5000) })),
 images: arr<{ id: number; src: string }>(body?.images).filter((e) => typeof e?.id === "number" && typeof e?.src === "string").map((e) => ({ id: e.id, src: e.src.slice(0, 2000) })),
 links: arr<{ id: number; href: string }>(body?.links).filter((e) => typeof e?.id === "number" && typeof e?.href === "string").map((e) => ({ id: e.id, href: e.href.slice(0, 2000) })),
 imgStyles: arr<{ id: number; style: string }>(body?.imgStyles).filter((e) => typeof e?.id === "number" && typeof e?.style === "string").map((e) => ({ id: e.id, style: e.style.slice(0, 500) })),
 styles: arr<{ eid: number; style: string }>(body?.styles).filter((e) => typeof e?.eid === "number" && typeof e?.style === "string").map((e) => ({ eid: e.eid, style: e.style.slice(0, 500) })),
 secStyles: arr<{ sec: number; style: string }>(body?.secStyles).filter((e) => typeof e?.sec === "number" && typeof e?.style === "string").map((e) => ({ sec: e.sec, style: e.style.slice(0, 500) })),
 ...(sections !== undefined
 ? { sections }
 : { deleteSecs: arr<number>(body?.deleteSecs).filter((n) => typeof n === "number"), dupSecs: arr<number>(body?.dupSecs).filter((n) => typeof n === "number") }),
 };
 const total = p.edits!.length + p.images!.length + p.links!.length + p.styles!.length + p.imgStyles!.length + p.secStyles!.length + (sections !== undefined ? 1 : (p.deleteSecs!.length + p.dupSecs!.length));
 if (!total) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

 const html = await getCapturePage(slug, path).catch(() => null);
 if (html == null) return NextResponse.json({ error: "Page not found." }, { status: 404 });

 // A save that changes nothing is not written. Each save keeps a version of what it replaced, and
 // this route propagates a header edit to every OTHER page — so letting no-op writes land would
 // spend the seller's undo slots on copies of the page over itself.
 const edited = applyEdits(html, p);
 if (!planCaptureWrite(html, edited).write) return NextResponse.json({ ok: true, applied: 0, propagated: 0, unchanged: true });

 const ok = await updateCapturePageHtml(slug, path, edited);
 if (!ok) return NextResponse.json({ error: "Save failed." }, { status: 500 });

 // Shared header/footer/nav edits → propagate to every other captured page so the whole site stays in
 // sync (each page has its own copy of the chrome). Best-effort; never fails the primary save.
 let propagated = 0;
 try {
 const chrome = extractChromeEdits(html, p);
 if (hasChromeEdits(chrome)) {
 const paths = await listCapturePaths(slug).catch(() => [] as string[]);
 for (const other of paths) {
 if (other === path) continue;
 const oh = await getCapturePage(slug, other).catch(() => null);
 if (!oh) continue;
 const res = applyChromeEditsToPage(oh, chrome);
 if (res.changed && await updateCapturePageHtml(slug, other, res.html).catch(() => false)) propagated++;
 }
 }
 } catch { /* propagation is best-effort */ }

 // THE PRODUCT PAGE IS A TEMPLATE WITH HUNDREDS OF COPIES.
 //
 // A captured store has one product page design and one captured page per piece, so the seller edits
 // whichever product she happened to open and every other product keeps the old wording. Same shape
 // as the chrome propagation above, and safe for the same reason: an edit travels by the value it
 // REPLACED, so "Add to cart" or a size-guide heading — identical on every product page — is carried,
 // while a piece's own title, price and description match nothing and stay where they are.
 let productPages = 0;
 if (isCapturedProductPath(path)) {
 try {
  const tmpl = extractScopedEdits(html, p, "body");
  if (hasChromeEdits(tmpl)) {
  const paths = await listCapturePaths(slug).catch(() => [] as string[]);
  for (const other of paths) {
   if (other === path || !isCapturedProductPath(other)) continue;
   const oh = await getCapturePage(slug, other).catch(() => null);
   if (!oh) continue;
   const res = applyScopedEditsToPage(oh, tmpl, "body");
   if (res.changed && await updateCapturePageHtml(slug, other, res.html).catch(() => false)) productPages++;
  }
  }
 } catch { /* propagation is best-effort; the page she edited is already saved */ }
 }

 return NextResponse.json({ ok: true, applied: total, propagated, productPages });
}
