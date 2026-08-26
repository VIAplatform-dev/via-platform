import { NextRequest } from "next/server";
import { getCapturePage, getSiteCss, listCapturePaths } from "@/app/lib/site-capture-db";
import { injectCart, injectCss, injectCollectionItems, injectLiveGrids, detectGridHandles, capturedGridProductHandles, injectSeo, injectPoweredBy, injectShim, prepareEditMode, cleanShopifyChrome, stripScripts, injectCartPage, injectSqsCartPage, type CartPageLine } from "@/app/lib/site-capture";
import { isStoreHost } from "@/app/lib/plan-b/store-host";
import { requestedSectionId, extractSection, emptySection, predictiveSearchEmptySection, isPredictiveSearchEmptyId } from "@/app/lib/plan-b/section-render";
import { applyFacets, hasFacetParams } from "@/app/lib/plan-b/facets";
import { searchItems, applySearchChrome, pickSearchTemplatePath } from "@/app/lib/plan-b/search-page";
import { getCartItemIds } from "@/app/lib/storefront-cart-db";
import { applyCartBadge } from "@/app/lib/plan-b/cart-badge";
import { cartItemCount } from "@/app/lib/plan-b/cart-session";
import { getItem } from "@/app/lib/db/inventory";
import { captureStorefrontEntry, recordStorePageview } from "@/app/lib/store-visits-db";
import { recordSearch, recordProductView } from "@/app/lib/store-favorites-db";
import { sqsProductIdentity, applySqsProductIdentity } from "@/app/lib/plan-b/sqs-product";
import { matchItemId } from "@/app/lib/capture-commerce";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { getCollectionBySlug, listCollectionItems, listCollectionItemsForStorefront } from "@/app/lib/db/collections";
import { listStorefrontItems, listStorefrontItemsBySourceIds } from "@/app/lib/db/inventory";

export const dynamic = "force-dynamic";

// Serves a seller's captured site, page by page, straight from VYA. Every internal
// link in the captured HTML points back here (/site/{slug}/…), so the whole site
// navigates on VYA — pixel-faithful, no dependency on their old host.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; path?: string[] }> }) {
 const { slug, path } = await params;
 const pathname = path && path.length ? "/" + path.join("/") : "/";

 // The store's own search results page. Nothing is ever captured at /search — the source renders it
 // per query — so this path has no stored HTML by definition and is built below from the store's own
 // collection template instead. Before that it fell straight through to the 404 on the next line,
 // which is why every hosted storefront's search box led to "Page not found."
 const isSearchPath = /^\/search\/?$/.test(pathname);

 let html = await getCapturePage(slug, pathname).catch(() => null);
 if (!html && pathname.endsWith("/")) html = await getCapturePage(slug, pathname.replace(/\/+$/, "")).catch(() => null);
 if (!html && !pathname.endsWith("/") && pathname !== "/") html = await getCapturePage(slug, pathname + "/").catch(() => null);
 if (!html && !isSearchPath) return new Response("Page not found.", { status: 404, headers: { "Content-Type": "text/plain" } });

 // Edit mode (?edit=1): the seller's own click-to-edit view — no cart, just the
 // visual editor. The save endpoint is auth-gated, so this is safe to serve.
 if (html && req.nextUrl.searchParams.get("edit") === "1") {
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
 // Plan B (this request arrived on the store's OWN registrable domain): the seller's JavaScript is
 // isolated from VYA by the same-origin policy, so it runs — that's what makes their carousels,
 // filters and cart drawer work natively. The shim would only fight it, so it's not injected.
 //
 // Plan A (a VYA origin): the very same stored HTML must be served WITHOUT their scripts, or a
 // Plan B capture becomes stored XSS the moment someone opens it at vyaplatform.com/site/{slug}.
 const onStoreOrigin = isStoreHost(req.headers.get("host"));
 // The header cart badge, on EVERY page. See app/lib/plan-b/cart-badge.ts: a captured page freezes
 // whatever the crawler's own session held, so `/cart` shipped a permanent phantom "1" while every
 // other page showed nothing. Filled in by the cart-page branch below when it has already resolved
 // the lines; otherwise resolved once, just before the badge is applied.
 let cartCount: number | null = null;
 // Shopify's Section Rendering API. Horizon-generation themes re-render one section at a time
 // (facets, sorting, pagination, the search drawer) and morph the fragment into the page. We build
 // the page exactly as normal — live inventory and all — then hand back only that section, so a
 // filtered or paginated view carries the same live data a full page load would.
 const sectionId = onStoreOrigin ? requestedSectionId(req.nextUrl.searchParams) : null;

 // One live-inventory card shape, shared by the collection grids, the homepage strips and search —
 // so a piece looks and links the same wherever a shopper meets it.
 const card = (it: { id: string; title: string; priceCents: number | null; currency: string | null; images: unknown; sourceId?: string | null; status?: string }) =>
  ({ id: it.id, title: it.title, priceCents: it.priceCents, currency: it.currency, images: it.images, sourceId: it.sourceId, available: it.status !== "sold" });
 // Keep shoppers on the mirrored site: an imported item links to its captured product page (served
 // on demand, with the VYA buy button wired in). Items the seller created here have no source page,
 // so they fall back to VYA's own product route.
 // On a store origin the storefront IS the root of its own domain, so these must be root-relative —
 // a /site/{slug}/… href still resolves, but it shows the shopper a VYA-shaped URL on what is
 // supposed to be the seller's own site.
 const productBase = onStoreOrigin ? "" : `/site/${slug}`;
 const hrefFor = (it: { id: string; sourceId?: string | null }) =>
  it.sourceId ? `${productBase}/products/${it.sourceId}` : `/products/${it.id}`;

 // ── SEARCH ────────────────────────────────────────────────────────────────────────────────────
 // Built on the store's OWN collection template, so results arrive in the seller's cards, type and
 // grid rather than in a VYA-shaped list — the same rule the collection pages follow. Predictive
 // search (/api/plan-b/search/suggest) already answered from live inventory; this is the page its
 // "View all results" link, and the Enter key, have always pointed at.
 if (isSearchPath) {
  const seller = await getSellerBySlug(slug).catch(() => null);
  const paths = await listCapturePaths(slug).catch(() => [] as string[]);
  const templatePath = pickSearchTemplatePath(paths);
  const template = templatePath ? await getCapturePage(slug, templatePath).catch(() => null) : null;
  if (!seller || !template) return new Response("Page not found.", { status: 404, headers: { "Content-Type": "text/plain" } });

  const hits = query ? searchItems(await listStorefrontItems(seller.id).catch(() => []), query) : [];
  const pageNo = Number(sp.get("page") || "1") || 1;
  // Pagination has to carry the query, or page 2 of a search is page 2 of everything.
  const selfPath = `${onStoreOrigin ? "" : `/site/${slug}`}/search?q=${encodeURIComponent(query)}`;
  // renderEmpty is unconditional here: "no results" is the honest answer to a query that matched
  // nothing, and falling back to the borrowed template's captured grid would answer it with a page
  // full of pieces that don't match — every one a dead end the shopper clicks anyway.
  const grid = injectCollectionItems(template, hits.map(card), hrefFor, {
   page: pageNo, path: selfPath, keepQuickAdd: onStoreOrigin, renderEmpty: true,
  });
  html = applySearchChrome(grid, { query, count: hits.length, action: `${onStoreOrigin ? "" : `/site/${slug}`}/search` });
 }
 if (!html) return new Response("Page not found.", { status: 404, headers: { "Content-Type": "text/plain" } });
 if (coll || isHome) {
 const seller = await getSellerBySlug(slug).catch(() => null);
 if (seller) {
  // "all" (the shop-all page) shows the whole live inventory; any other handle shows
  // the items assigned to the matching VYA collection.
  let items: Awaited<ReturnType<typeof listCollectionItems>> = [];
  if (isHome || coll![1] === "all") items = await listStorefrontItems(seller.id).catch(() => []);
  else {
   // Assigned items PLUS anything matching the handle by category/brand, so listings the seller
   // adds in the portal show up on the collection page they belong to without manual filing.
   const collection = await getCollectionBySlug(seller.id, coll![1]).catch(() => null);
   items = await listCollectionItemsForStorefront(seller.id, collection?.id ?? null, coll![1]).catch(() => []);
  }
  // A collection with no VYA assignment and no category/brand match is very likely a manually
  // curated Shopify collection with no pattern behind the choice at all ("collection-1", specific
  // pieces someone dragged in). The captured page still knows exactly which products belong on
  // it — read those handles back out and ask for THOSE, live, rather than jumping straight to the
  // seller's whole catalogue, which turned a hand-picked 6-piece edit into a dump of everything
  // they've ever listed. Only if the page itself yields nothing usable (an empty/malformed capture)
  // does this fall back further, so the page still shows something rather than nothing.
  if (!items.length && coll && coll[1] !== "all") {
   const handles = capturedGridProductHandles(html);
   items = handles.length ? await listStorefrontItemsBySourceIds(seller.id, handles).catch(() => []) : [];
   if (!items.length) items = await listStorefrontItems(seller.id).catch(() => []);
  }
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
   if (perGrid.some((g) => g.length)) html = injectLiveGrids(html, perGrid, hrefFor, { keepQuickAdd: onStoreOrigin });
  } else if (items.length) {
   // The shopper's page number, and the path the theme's pagination should point back at.
   const pageNo = Number(req.nextUrl.searchParams.get("page") || "1") || 1;
   const selfPath = onStoreOrigin ? pathname : `/site/${slug}${pathname}`;
   // The theme's filter and sort controls re-request this page with Shopify's parameters attached
   // (see plan-b/facets.ts). Ignoring them meant the facet UI moved, refetched, and got back the
   // same unfiltered grid — which reads as broken filters, not missing ones. Paging is applied by
   // injectCollectionItems from the theme's own page size, so only filter+sort are applied here.
   const faceted = applyFacets(items, req.nextUrl.searchParams, { perPage: 0, paginate: false });
   // A filter that matches nothing must render an EMPTY collection, not silently fall back to the
   // full one — "no pieces match" is a true answer; showing all of them is a lie the shopper acts on.
   // Only when the shopper actually filtered, though: an ordinary page load with no live data still
   // shows the captured grid rather than blanking the store.
   html = injectCollectionItems(html, faceted.items.map(card), hrefFor, {
    page: pageNo, path: selfPath, keepQuickAdd: onStoreOrigin,
    renderEmpty: hasFacetParams(req.nextUrl.searchParams),
   });
  }
 }
 }

 // A SQUARESPACE product page. Its Add-to-cart is driven entirely by the seller's own JavaScript,
 // which posts the product id the capture froze — the SOURCE store's, which means nothing to VYA, so
 // the button did nothing at all. Rewrite that identity to the VYA piece this page shows and the
 // seller's own button drives VYA's cart (see plan-b/sqs-product.ts and the route that answers it).
 // Shopify product pages don't come through here — they have their own route, which already does
 // this through the quick-add form's variant field.
 const sqsProduct = sqsProductIdentity(html);
 if (sqsProduct) {
  const handle = pathname.split("/").filter(Boolean).pop() || null;
  const itemId = await matchItemId(slug, sqsProduct.title, handle).catch(() => null);
  if (itemId) {
   html = applySqsProductIdentity(html, itemId, sqsProduct);
   recordProductView(slug, itemId, req.cookies.get("via_sess")?.value || null).catch(() => {});
  }
 }

 const css = await getSiteCss(slug).catch(() => "");
 // Record where this visitor came from (once per session, server-side) + this page view.
 const setCookie = await captureStorefrontEntry(req, slug);
 const sid = req.cookies.get("via_sess")?.value || (setCookie ? /via_sess=([^;]+)/.exec(setCookie)?.[1] || null : null);
 const pageType = pathname === "/" || pathname === "" ? "home" : isSearchPath ? "search" : /\/products?\//.test(pathname) ? "product" : /\/collections?\//.test(pathname) ? "collection" : "page";
 // A section fetch is part of a page the shopper is ALREADY on — every facet click, sort change and
 // pagination step fires one. Counting them would multiply this store's pageviews by however many
 // times a shopper touched a filter, quietly corrupting the analytics the seller is sold on.
 if (!sectionId) await recordStorePageview({ storeSlug: slug, path: pathname || "/", pageType, sessionId: sid, surface: "storefront" }).catch(() => {});
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

 // The CART PAGE. Its contents belong to this visitor, never to the capture, so the theme's frozen
 // (empty) cart form is replaced with their real VYA cart. Without this the theme's own "add to
 // cart" navigated the shopper to a 404 at the exact moment they were trying to buy.
 if (/^\/cart\/?$/.test(pathname)) {
  const token = req.cookies.get("via_cart")?.value || "";
  const ids = token ? await getCartItemIds(token).catch(() => [] as string[]) : [];
  const lines: CartPageLine[] = [];
  for (const id of ids) {
   const it = await getItem(id).catch(() => null);
   if (!it || it.status === "sold" || it.status === "removed") continue; // one-of-one: sold is gone
   lines.push({
    id: it.id, title: it.title, priceCents: it.priceCents, currency: it.currency,
    image: it.images?.[0] ?? null,
    href: `${onStoreOrigin ? "" : `/site/${slug}`}/products/${it.sourceId || it.id}`,
   });
  }
  // Squarespace's cart page renders itself entirely client-side and has proven unreliable at it
  // (see injectSqsCartPage) — try that first; it no-ops (returns html unchanged) on any page that
  // isn't Squarespace's cart, in which case the Shopify-shaped path below runs instead.
  const sqsHtml = injectSqsCartPage(html, lines, "/checkout?cart=1");
  html = sqsHtml === html ? injectCartPage(html, lines, "/checkout?cart=1") : sqsHtml;
  // The cart page just resolved the visitor's real lines — reuse that count for the header badge
  // rather than resolving the same items a second time.
  cartCount = lines.length;
 }
 // Plan B keeps the seller's scripts, but the denylist is re-applied at SERVE time (inside
 // cleanShopifyChrome) so captures taken under an older, shorter list stop running trackers we've
 // since learned to recognise — no re-crawl of 45 stores required. See stripVendorScripts.
 // Applied to `base`, before the section fragment is cut out of it, so a facet click that re-renders
 // the header section gets the same number a full page load would.
 if (cartCount === null) cartCount = await cartItemCount(req.cookies.get("via_cart")?.value || "");
 const base = applyCartBadge(cleanShopifyChrome(onStoreOrigin ? html : stripScripts(html)), cartCount);

 // Section request → return just that fragment. Deliberately BEFORE injectCss/injectSeo/
 // injectPoweredBy: those write into <head> and append a footer badge, which belong to a document,
 // not to a fragment being morphed into one that already has them. The theme's stylesheet is already
 // loaded on the page doing the morphing.
 if (sectionId) {
  const fragment = extractSection(base, sectionId)
   // Sections that exist in the theme but were never on a captured page — the search drawer's empty
   // state is the one every Horizon store asks for on open.
   ?? (isPredictiveSearchEmptyId(sectionId) ? predictiveSearchEmptySection(sectionId) : emptySection(sectionId));
  return new Response(fragment, {
   headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
 }

 const withCommerce = onStoreOrigin ? base : injectShim(injectCart(base));
 return new Response(injectPoweredBy(injectSeo(injectCss(withCommerce, css), { canonicalUrl })), { headers });
}
