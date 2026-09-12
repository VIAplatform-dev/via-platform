import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { listCapturePaths, getCapturePage, getCaptureOrigin, saveCapturePage, deleteCapturePage } from "@/app/lib/site-capture-db";
import { partitionByReachability } from "@/app/lib/capture-links";
import { looksSquarespace } from "@/app/lib/site-builder/collection-path";
import { detectMenus, sanitizeMenuItems } from "@/app/lib/site-builder/menus";
import { addedPagePath, buildBlankPage, countLinksByPath, countLinksTo, mergePageList, pickBlankTemplatePath, removalRefusal, PAGE_LIMITS, type Platform } from "@/app/lib/site-builder/pages";
import { normalizeMenuHref } from "@/app/lib/site-builder/menus";
import { deletePageRow, loadStoreBuilderRows, savePageRow, saveMenuRow, siteBuilderTablesReady } from "@/app/lib/site-builder/pages-db";

export const dynamic = "force-dynamic";

// HER PAGES — the Pages panel's one endpoint.
//
//  GET    → the merged list: captured paths, her overrides, her menu (stored or read off the header)
//           and which pages nothing links to. Read-only; it never writes a row.
//  PATCH  → rename or hide/show one page.
//  POST   → add a page, built inside her own header and footer.
//  DELETE → remove a page for good (the confirmed second choice next to hiding it).
//
// Nothing here creates a table: see app/api/admin/site-builder/migrate. Until the owner has run it,
// GET still answers with her pages (the list needs no rows at all) and the writes answer 503 so the
// panel can say so plainly.

const NOT_MIGRATED = { error: "Page settings aren’t switched on for this site yet.", notMigrated: true };

/** The two pages a site's own navigation lives on — what "nothing links to this" is judged against. */
async function navSources(slug: string, paths: string[]): Promise<string[]> {
 const wanted = ["/", "/collections"].filter((p) => paths.includes(p));
 const html = await Promise.all(wanted.map((p) => getCapturePage(slug, p).catch(() => null))); /* allow-swallow: a page read only to label the list */
 return html.filter((h): h is string => typeof h === "string" && h.length > 0);
}

export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const paths = await listCapturePaths(slug).catch(() => [] as string[]);
 const [rows, home, origin] = await Promise.all([
  loadStoreBuilderRows(slug),
  getCapturePage(slug, "/").catch(() => null),
  getCaptureOrigin(slug).catch(() => null),
 ]);
 const detected = home ? detectMenus(cheerio.load(home)) : null;
 const stored = rows.menus.get("main") ?? null;
 // Her header changed under her stored order (a re-crawl brought a different menu). Say so rather
 // than applying an order that names items her site no longer has — see menus.ts.
 const drifted = !!(stored && detected && stored.signature !== detected.signature);
 const menu = stored && !drifted ? stored : detected;

 const sources = await navSources(slug, paths);
 const unlinked = sources.length ? partitionByReachability(paths, sources, origin).unlinked : [];
 const productTemplate = paths.find((p) => /^\/products\//.test(p)) ?? null;

 // How many links still point at each page, counted once over her navigation pages rather than once
 // per page — so the confirmation can warn BEFORE she hides something her footer links to.
 const links = countLinksByPath(sources, origin);
 const pages = mergePageList({ paths, rows: rows.pages, menu, unlinked, productTemplate })
  .map((e) => ({ ...e, linkedFrom: links.get(normalizeMenuHref(e.path) ?? e.path) ?? 0 }));

 return NextResponse.json({
  ok: true,
  ready: rows.ready,
  platform: (looksSquarespace(home) ? "squarespace" : "shopify") satisfies Platform,
  pages,
  menu: menu ? { items: menu.items, signature: menu.signature } : null,
  detectedSignature: detected?.signature ?? null,
  drifted,
 });
}

export async function PATCH(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null); /* allow-swallow: answered by the 400 below */
 const path = typeof body?.path === "string" ? body.path.slice(0, PAGE_LIMITS.path) : "";
 if (!path.startsWith("/")) return NextResponse.json({ error: "Missing page." }, { status: 400 });

 const paths = await listCapturePaths(slug).catch(() => [] as string[]);
 if (!paths.includes(path)) return NextResponse.json({ error: "That isn’t one of your pages." }, { status: 404 });
 const productTemplate = paths.find((p) => /^\/products\//.test(p)) ?? null;

 // Home and the cart are never hideable — hiding the cart takes out checkout. Showing one again is
 // always allowed, so the refusal is only checked on the way in.
 if (body?.hidden === true) {
  const refusal = removalRefusal(path, { productTemplate });
  if (refusal) return NextResponse.json({ error: refusal }, { status: 400 });
 }
 if (!(await siteBuilderTablesReady())) return NextResponse.json(NOT_MIGRATED, { status: 503 });

 const patch: { title?: string | null; navLabel?: string | null; hidden?: boolean } = {};
 if (typeof body?.title === "string") patch.title = body.title.slice(0, PAGE_LIMITS.title);
 if (typeof body?.navLabel === "string") patch.navLabel = body.navLabel.slice(0, PAGE_LIMITS.navLabel);
 if (typeof body?.hidden === "boolean") patch.hidden = body.hidden;
 if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

 if (!(await savePageRow(slug, path, patch))) return NextResponse.json(NOT_MIGRATED, { status: 503 });

 // How many links still point here, so hiding a page her footer links to is not a surprise. The
 // links themselves are left alone: a shopper who follows one gets a clean "Page not found".
 const linkedFrom = countLinksTo(await navSources(slug, paths), path, await getCaptureOrigin(slug).catch(() => null));
 return NextResponse.json({ ok: true, path, ...patch, linkedFrom });
}

export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null); /* allow-swallow: answered by the 400 below */
 const title = typeof body?.title === "string" ? body.title.replace(/\s+/g, " ").trim().slice(0, PAGE_LIMITS.title) : "";
 if (!title) return NextResponse.json({ error: "Name the page first." }, { status: 400 });
 if (!(await siteBuilderTablesReady())) return NextResponse.json(NOT_MIGRATED, { status: 503 });

 const paths = await listCapturePaths(slug).catch(() => [] as string[]);
 const home = await getCapturePage(slug, "/").catch(() => null);
 const platform: Platform = looksSquarespace(home) ? "squarespace" : "shopify";
 const templatePath = pickBlankTemplatePath(paths, platform);
 const template = templatePath ? await getCapturePage(slug, templatePath).catch(() => null) : null;
 if (!template) return NextResponse.json({ error: "We couldn’t find a page of yours to build this one from." }, { status: 409 });

 const path = addedPagePath(title, platform, paths);
 // `source_url` stays empty: this page came from her, not from a crawl, and origin detection reads
 // that column (see getCaptureOrigin).
 await saveCapturePage(slug, path, buildBlankPage(template, { title }), "");
 // `kind: "added"` is what a re-import spares — see deleteCaptures.
 if (!(await savePageRow(slug, path, { title, kind: "added" }))) return NextResponse.json(NOT_MIGRATED, { status: 503 });

 // In her menu by default, at the end, because a page nobody can reach is not a page she has added.
 let inMenu = false;
 if (body?.addToMenu !== false && home) {
  const rows = await loadStoreBuilderRows(slug);
  const detected = detectMenus(cheerio.load(home));
  const stored = rows.menus.get("main") ?? null;
  const base = stored && detected && stored.signature === detected.signature ? stored : detected;
  if (base) {
   const items = sanitizeMenuItems([...base.items, { id: `m${base.items.length}`, label: title, href: path }]);
   inMenu = await saveMenuRow(slug, "main", items, base.signature);
  }
 }
 return NextResponse.json({ ok: true, path, title, inMenu });
}

// DELETE ?path= — the page, for good. Hiding is the reversible choice and lives on PATCH; this is the
// second, confirmed one. A version is kept first (site-capture-db.ts), so a mistake is still
// recoverable from the operator's history view.
export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const path = (request.nextUrl.searchParams.get("path") || "").slice(0, PAGE_LIMITS.path);
 if (!path.startsWith("/")) return NextResponse.json({ error: "Missing page." }, { status: 400 });

 const paths = await listCapturePaths(slug).catch(() => [] as string[]);
 if (!paths.includes(path)) return NextResponse.json({ error: "That isn’t one of your pages." }, { status: 404 });
 const refusal = removalRefusal(path, { productTemplate: paths.find((p) => /^\/products\//.test(p)) ?? null });
 if (refusal) return NextResponse.json({ error: refusal }, { status: 400 });

 if (!(await deleteCapturePage(slug, path))) return NextResponse.json({ error: "Couldn’t delete that page." }, { status: 500 });
 await deletePageRow(slug, path);
 return NextResponse.json({ ok: true, path });
}
