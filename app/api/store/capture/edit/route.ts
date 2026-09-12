import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getCapturePage, updateCapturePageHtml, listCapturePaths } from "@/app/lib/site-capture-db";
import { applyEditsWithReport, extractChromeEdits, applyChromeEditsToPage, hasChromeEdits, extractScopedEdits, applyScopedEditsToPage, isCapturedProductPath, type PageEdits } from "@/app/lib/site-capture";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listCollections } from "@/app/lib/db/collections";
import { numberingMismatch } from "@/app/lib/site-builder/numbering";
import { parseSectionEntries, payloadHasGrids, entriesTouchGrids } from "@/app/lib/site-builder/save-entries";
import { ensureGridKitSaved } from "@/app/lib/site-builder/grid-kit-store";
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
 const was = (v: unknown, max: number): { was?: string } => (typeof v === "string" ? { was: v.slice(0, max) } : {});
 // `sections` is the full desired section order (reorder/duplicate/delete in one array);
 // when present it supersedes the legacy per-index deleteSecs/dupSecs.
 //
 // Sections are addressed by position, counted by a rule the editor and the save must share. A tab
 // opened under the previous rule would move, hide or delete the wrong section, so it writes nothing.
 // See app/lib/site-builder/numbering.ts.
 if (numberingMismatch(body)) return NextResponse.json({ error: "Your editor is out of date — reload the page to keep editing.", outdated: true }, { status: 409 });
 // Her collections, looked up only when a product grid's settings have to be checked against them.
 let collections: string[] | null = null;
 if (payloadHasGrids(body?.sections)) {
  const seller = await getSellerBySlug(slug).catch(() => null);
  collections = seller ? (await listCollections(seller.id, true).catch(() => [])).map((c) => c.slug) : [];
 }
 // Every entry bounded and validated — new blocks, her own sections (changed, hidden or shown), and
 // product grids, which are stored as their settings only. See app/lib/site-builder/save-entries.ts.
 const sections = Array.isArray(body?.sections) ? parseSectionEntries(body.sections, collections) : undefined;
 const p: PageEdits = {
 // `was` is the value an edit replaces, which the save checks before writing (see applyEditsWithReport).
 // Absent from an editor opened before that check existed — those edits keep the old by-position rule.
 edits: arr<{ eid: number; text: string; was?: unknown }>(body?.edits).filter((e) => typeof e?.eid === "number" && typeof e?.text === "string").map((e) => ({ eid: e.eid, text: String(e.text).slice(0, 5000), ...was(e.was, 5000) })),
 images: arr<{ id: number; src: string; was?: unknown }>(body?.images).filter((e) => typeof e?.id === "number" && typeof e?.src === "string").map((e) => ({ id: e.id, src: e.src.slice(0, 2000), ...was(e.was, 2000) })),
 links: arr<{ id: number; href: string; was?: unknown }>(body?.links).filter((e) => typeof e?.id === "number" && typeof e?.href === "string").map((e) => ({ id: e.id, href: e.href.slice(0, 2000), ...was(e.was, 2000) })),
 imgStyles: arr<{ id: number; style: string; was?: unknown }>(body?.imgStyles).filter((e) => typeof e?.id === "number" && typeof e?.style === "string").map((e) => ({ id: e.id, style: e.style.slice(0, 500), ...was(e.was, 2000) })),
 styles: arr<{ eid: number; style: string; was?: unknown }>(body?.styles).filter((e) => typeof e?.eid === "number" && typeof e?.style === "string").map((e) => ({ eid: e.eid, style: e.style.slice(0, 500), ...was(e.was, 5000) })),
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
 //
 // `skipped` counts edits whose element couldn't be found on the stored page (it changed since the
 // editor loaded). They are reported rather than written somewhere else, and the editor tells her.
 const { html: edited, skipped, resolved } = applyEditsWithReport(html, p);
 if (!planCaptureWrite(html, edited).write) return NextResponse.json({ ok: true, applied: 0, propagated: 0, unchanged: true, skipped });

 const ok = await updateCapturePageHtml(slug, path, edited);
 if (!ok) return NextResponse.json({ error: "Save failed." }, { status: 500 });

 // Her first save with a product grid stores the card look the preview showed her, so shoppers get the
 // same card. Until it is stored, grids render in the plain card — never an error.
 if (sections && entriesTouchGrids(sections)) await ensureGridKitSaved(slug).catch(() => {}); /* allow-swallow: see above */

 // Shared header/footer/nav edits → propagate to every other captured page so the whole site stays in
 // sync (each page has its own copy of the chrome). Best-effort; never fails the primary save.
 let propagated = 0;
 try {
 // From where each edit actually LANDED — the old value copied to other pages must be the one she
 // replaced, not whatever sat at the number her editor sent.
 const chrome = extractChromeEdits(html, resolved);
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
  const tmpl = extractScopedEdits(html, resolved, "body");
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

 return NextResponse.json({ ok: true, applied: total - skipped, propagated, productPages, skipped });
}
