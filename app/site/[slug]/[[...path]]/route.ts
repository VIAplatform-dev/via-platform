import { NextRequest } from "next/server";
import { getCapturePage, getSiteCss } from "@/app/lib/site-capture-db";
import { injectCart, injectCss, injectCollectionItems, injectLiveGrids, detectGridHandles, injectSeo, injectPoweredBy, injectShim, prepareEditMode, cleanShopifyChrome } from "@/app/lib/site-capture";
import { captureStorefrontEntry, recordStorePageview } from "@/app/lib/store-visits-db";
import { recordSearch } from "@/app/lib/store-favorites-db";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { getCollectionBySlug, listCollectionItems, listCollectionItemsForStorefront } from "@/app/lib/db/collections";
import { listAvailableItems } from "@/app/lib/db/inventory";

export const dynamic = "force-dynamic";

// Serves a seller's captured site, page by page, straight from VYA. Every internal
// link in the captured HTML points back here (/site/{slug}/…), so the whole site
// navigates on VYA — pixel-faithful, no dependency on their old host.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; path?: string[] }> }) {
 const { slug, path } = await params;
 const pathname = path && path.length ? "/" + path.join("/") : "/";

 let html = await getCapturePage(slug, pathname).catch(() => null);
 if (!html && pathname.endsWith("/")) html = await getCapturePage(slug, pathname.replace(/\/+$/, "")).catch(() => null);
 if (!html && !pathname.endsWith("/") && pathname !== "/") html = await getCapturePage(slug, pathname + "/").catch(() => null);
 if (!html) return new Response("Page not found.", { status: 404, headers: { "Content-Type": "text/plain" } });

 // Edit mode (?edit=1): the seller's own click-to-edit view — no cart, just the
 // visual editor. The save endpoint is auth-gated, so this is safe to serve.
 if (req.nextUrl.searchParams.get("edit") === "1") {
 return new Response(prepareEditMode(html, slug, pathname), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
 }

 // Search tracking: captured sites route their search box to a ?q=/query=/s= URL —
 // log the query for the store's analytics.
 const sp = req.nextUrl.searchParams;
 const query = (sp.get("q") || sp.get("query") || sp.get("s") || "").trim();
 if (query && (pathname.includes("search") || sp.has("q") || sp.has("query"))) {
 recordSearch(slug, query, req.cookies.get("via_sess")?.value || null).catch(() => {});
 }

 // Every product grid on a captured page renders the store's LIVE VYA inventory, not the frozen
 // markup we crawled. That's the whole point of the mirror: when the seller adds, reprices or
 // sells an item in the portal, their site reflects it immediately — no re-crawl. Collection
 // pages show that collection; the homepage (and any other page with a grid) shows the newest
 // inventory, which is what a "featured/archive" strip on a vintage store means in practice.
 const coll = pathname.match(/^\/collections\/([^/]+)\/?$/);
 const isHome = pathname === "/" || pathname === "";
 if (coll || isHome) {
 const seller = await getSellerBySlug(slug).catch(() => null);
 if (seller) {
  // "all" (the shop-all page) shows the whole live inventory; any other handle shows
  // the items assigned to the matching VYA collection.
  let items: Awaited<ReturnType<typeof listCollectionItems>> = [];
  if (isHome || coll![1] === "all") items = await listAvailableItems(seller.id).catch(() => []);
  else {
   // Assigned items PLUS anything matching the handle by category/brand, so listings the seller
   // adds in the portal show up on the collection page they belong to without manual filing.
   const collection = await getCollectionBySlug(seller.id, coll![1]).catch(() => null);
   items = await listCollectionItemsForStorefront(seller.id, collection?.id ?? null, coll![1]).catch(() => []);
  }
  // A collection the seller hasn't organised yet has no assigned items — fall back to live
  // inventory rather than leaving the stale captured grid, which would show sold pieces.
  if (!items.length && coll && coll[1] !== "all") items = await listAvailableItems(seller.id).catch(() => []);
  const card = (it: { id: string; title: string; priceCents: number | null; currency: string | null; images: unknown; sourceId?: string | null }) =>
   ({ id: it.id, title: it.title, priceCents: it.priceCents, currency: it.currency, images: it.images, sourceId: it.sourceId });
  // Keep shoppers on the mirrored site: an imported item links to its captured product page
  // (served on demand, with the VYA buy button wired in). Items the seller created here have no
  // source page, so they fall back to VYA's own product route.
  const hrefFor = (it: { id: string; sourceId?: string | null }) =>
   it.sourceId ? `/site/${slug}/products/${it.sourceId}` : `/products/${it.id}`;

  if (isHome) {
   // A homepage usually has SEVERAL grids ("New in", "Archive", "Bags"). Resolve each to the
   // collection its section links to so they stay distinct; anything we can't identify falls
   // back to the newest live inventory. Replacing only the first would leave the others frozen,
   // still showing pieces that have since sold.
   const handles = detectGridHandles(html);
   const wanted = [...new Set(handles.filter(Boolean) as string[])];
   const byHandle = new Map<string, typeof items>();
   await Promise.all(wanted.map(async (h) => {
    const c = await getCollectionBySlug(seller.id, h).catch(() => null);
    byHandle.set(h, await listCollectionItemsForStorefront(seller.id, c?.id ?? null, h).catch(() => []));
   }));
   const perGrid = handles.map((h) => {
    const fromCollection = h ? byHandle.get(h) : undefined;
    return (fromCollection?.length ? fromCollection : items).map(card);
   });
   if (perGrid.some((g) => g.length)) html = injectLiveGrids(html, perGrid, hrefFor);
  } else if (items.length) {
   html = injectCollectionItems(html, items.map(card), hrefFor);
  }
 }
 }

 const css = await getSiteCss(slug).catch(() => "");
 // Record where this visitor came from (once per session, server-side) + this page view.
 const setCookie = await captureStorefrontEntry(req, slug);
 const sid = req.cookies.get("via_sess")?.value || (setCookie ? /via_sess=([^;]+)/.exec(setCookie)?.[1] || null : null);
 const pageType = pathname === "/" || pathname === "" ? "home" : /\/products?\//.test(pathname) ? "product" : /\/collections?\//.test(pathname) ? "collection" : "page";
 await recordStorePageview({ storeSlug: slug, path: pathname || "/", pageType, sessionId: sid, surface: "storefront" }).catch(() => {});
 const headers: Record<string, string> = {
 "Content-Type": "text/html; charset=utf-8",
 "Cache-Control": "no-store",
 // Defense-in-depth on top of script-stripping: no plugins, no <base> hijack, no clickjacking.
 // Intentionally NOT restricting script/style/img so captured rendering + our cart stay intact.
 "Content-Security-Policy": "object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
 };
 if (setCookie) headers["Set-Cookie"] = setCookie;

 // Canonical + indexable, so the re-hosted site ranks as itself. Served on the seller's own domain
 // → self-canonical to that domain (the real public address); served on a VYA host → the /site path.
 const host = (req.headers.get("host") || "").toLowerCase().split(":")[0];
 const isVyaHost = !host || host === "vyaplatform.com" || host === "www.vyaplatform.com" || host.endsWith(".vercel.app") || host === "localhost";
 const cleanPath = pathname === "/" || pathname === "" ? "" : pathname;
 const canonicalUrl = isVyaHost ? `https://vyaplatform.com/site/${slug}${cleanPath}` : `https://${host}${cleanPath}`;
 return new Response(injectPoweredBy(injectSeo(injectCss(injectShim(injectCart(cleanShopifyChrome(html))), css), { canonicalUrl })), { headers });
}
