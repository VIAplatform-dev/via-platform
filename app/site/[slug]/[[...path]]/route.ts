import { NextRequest } from "next/server";
import { getCapturePage, getSiteCss } from "@/app/lib/site-capture-db";
import { injectCart, injectCss, injectCollectionItems, prepareEditMode } from "@/app/lib/site-capture";
import { captureStorefrontEntry, recordStorePageview } from "@/app/lib/store-visits-db";
import { recordSearch } from "@/app/lib/store-favorites-db";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { getCollectionBySlug, listCollectionItems } from "@/app/lib/db/collections";
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

 // On a captured collection page, swap the frozen Shopify grid for the store's live
 // VYA inventory assigned to that collection (mapped by slug = the captured handle).
 const coll = pathname.match(/^\/collections\/([^/]+)\/?$/);
 if (coll) {
 const seller = await getSellerBySlug(slug).catch(() => null);
 if (seller) {
  // "all" (the shop-all page) shows the whole live inventory; any other handle shows
  // the items assigned to the matching VYA collection.
  let items: Awaited<ReturnType<typeof listCollectionItems>> = [];
  if (coll[1] === "all") items = await listAvailableItems(seller.id).catch(() => []);
  else { const collection = await getCollectionBySlug(seller.id, coll[1]).catch(() => null); if (collection) items = await listCollectionItems(collection.id).catch(() => []); }
  if (items.length) html = injectCollectionItems(html, items.map((it) => ({ id: it.id, title: it.title, priceCents: it.priceCents, currency: it.currency, images: it.images })));
 }
 }

 const css = await getSiteCss(slug).catch(() => "");
 // Record where this visitor came from (once per session, server-side) + this page view.
 const setCookie = await captureStorefrontEntry(req, slug);
 const sid = req.cookies.get("via_sess")?.value || (setCookie ? /via_sess=([^;]+)/.exec(setCookie)?.[1] || null : null);
 const pageType = pathname === "/" || pathname === "" ? "home" : /\/products?\//.test(pathname) ? "product" : /\/collections?\//.test(pathname) ? "collection" : "page";
 await recordStorePageview({ storeSlug: slug, path: pathname || "/", pageType, sessionId: sid, surface: "storefront" }).catch(() => {});
 const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
 if (setCookie) headers["Set-Cookie"] = setCookie;
 return new Response(injectCss(injectCart(html), css), { headers });
}
