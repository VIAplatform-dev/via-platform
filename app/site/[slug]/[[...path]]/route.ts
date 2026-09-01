import { NextRequest } from "next/server";
import { getCapturePage, getSiteCss, listCapturePaths, getCaptureOrigin } from "@/app/lib/site-capture-db";
import { sameOriginAssets } from "@/app/lib/plan-b/same-origin-assets";
import { suppressThemeCart } from "@/app/lib/plan-b/suppress-theme-cart";
import { detectMyshopifyDomain } from "@/app/lib/plan-b/scripts";
import { buildFallbackCartPage } from "@/app/lib/fallback-cart-page";
import { isReservedCapturePath } from "@/app/lib/plan-b/cart-template-store";
import { applyCartState, injectCart, injectCss, injectCollectionItems, injectLiveGrids, detectGridHandles, capturedGridProductHandles, capturedGridProductHandlesPerGrid, injectSeo, injectPoweredBy, injectShim, prepareEditMode, cleanShopifyChrome, stripScripts, type CartPageLine } from "@/app/lib/site-capture";
import { isStoreHost } from "@/app/lib/plan-b/store-host";
import { requestedSectionId, extractSection, emptySection, predictiveSearchEmptySection, isPredictiveSearchEmptyId } from "@/app/lib/plan-b/section-render";
import { applyFacets, hasFacetParams } from "@/app/lib/plan-b/facets";
import { searchItems, applySearchChrome, pickSearchTemplatePath } from "@/app/lib/plan-b/search-page";
import { getCartItemIds } from "@/app/lib/storefront-cart-db";
import { applyCartBadge } from "@/app/lib/plan-b/cart-badge";
import { injectAccountPanel } from "@/app/lib/plan-b/account-panel";
import { retagFavourites } from "@/app/lib/plan-b/favourites-icon";
import { normaliseBuyButtons } from "@/app/lib/plan-b/button-parity";
import { readShopperToken, SHOPPER_COOKIE } from "@/app/lib/shopper-session";
import { cartItemCount } from "@/app/lib/plan-b/cart-session";
import { getItem } from "@/app/lib/db/inventory";
import { captureStorefrontEntry, recordStorePageview } from "@/app/lib/store-visits-db";
import { recordSearch, recordProductView } from "@/app/lib/store-favorites-db";
import { sqsProductIdentity, applySqsProductIdentity } from "@/app/lib/plan-b/sqs-product";
import { matchItemId } from "@/app/lib/capture-commerce";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { getCollectionBySlug, listCollectionItems, listCollectionItemsForStorefront, getCollectionWithSyncState } from "@/app/lib/db/collections";
import { chooseCollectionItems } from "@/app/lib/plan-b/collection-contents";
import { listStorefrontItems, listStorefrontItemsBySourceIds } from "@/app/lib/db/inventory";
import { resolveStoreSlugAny, isAdminRequest } from "@/app/lib/storeAuth";
import { canEditCapture } from "@/app/lib/capture-edit-access";
import { reviewGate, reviewGateNoticeHtml } from "@/app/lib/capture-review-gate";
import { getReviewState } from "@/app/lib/store-health-db";

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

 // Set only for a signed-in OWNER who opened ?edit=1 before finishing the side-by-side review;
 // appended to her copy of the page below. Never set for a shopper.
 let ownerNotice = "";

 const isCartPath = /^\/cart\/?$/.test(pathname);

 // Reserved internal paths (the derived cart template) are stored as capture rows so they are
 // created and deleted with the capture they describe — but they are data, not pages, and must
 // never be servable.
 if (isReservedCapturePath(pathname)) return new Response("Not found.", { status: 404, headers: { "Content-Type": "text/plain" } });

 let html = await getCapturePage(slug, pathname).catch(() => null);
 if (!html && pathname.endsWith("/")) html = await getCapturePage(slug, pathname.replace(/\/+$/, "")).catch(() => null);
 if (!html && !pathname.endsWith("/") && pathname !== "/") html = await getCapturePage(slug, pathname + "/").catch(() => null);

 // The cart page, when the store's OWN cart page was never captured.
 //
 // captureCartTemplate is best-effort and returns null on any failure, and an audit of the stored
 // captures found five stores where it had failed silently — including one with a cart drawer on all
 // 24 of its pages, and one with 781 pages captured and no cart page. For those, this route answered
 // "Page not found." at the exact moment a shopper was trying to buy.
 //
 // So borrow the chrome from a page we DO hold and render the visitor's real VYA cart inside it
 // (see buildFallbackCartPage). Re-capturing those five would fix those five; this makes a capture
 // miss degrade to a working page for every store, including the next one to fail.
 if (!html && isCartPath) {
  html = await getCapturePage(slug, "/").catch(() => null);
  if (!html) {
   // No home page either — take the shortest path we hold, which is the closest thing to a root.
   const paths = await listCapturePaths(slug).catch(() => [] as string[]);
   const nearest = paths.slice().sort((a, b) => a.length - b.length)[0];
   if (nearest) html = await getCapturePage(slug, nearest).catch(() => null);
  }
 }

 if (!html && !isSearchPath) return new Response("Page not found.", { status: 404, headers: { "Content-Type": "text/plain" } });

 // Edit mode (?edit=1): the seller's own click-to-edit view — no cart, just the visual editor.
 //
 // THIS IS A PUBLIC ROUTE. "/site" is in the middleware's PUBLIC_ROUTES because shoppers browse
 // hosted stores, so this handler is the only thing standing between a visitor and edit mode — and
 // until this check existed there was nothing: anyone who added ?edit=1 to any hosted storefront
 // (VYA path or the seller's own domain) got the seller's editing toolbar over her live shop. The
 // save endpoint was auth-gated, so nothing could be written, but a shopper meeting an "editing
 // your site" bar on a store she is trying to buy from reads it as broken or defaced.
 //
 // Denial is not an error: fall through and serve the ordinary page, so a link someone pasted with
 // ?edit=1 still shows the shop.
 if (html && req.nextUrl.searchParams.get("edit") === "1") {
  const admin = isAdminRequest(req);
  const actingSlug = await resolveStoreSlugAny(req).catch(() => null); /* allow-swallow: an auth blip must show the public page, never the editor */
  if (canEditCapture(slug, { slug: actingSlug, isAdmin: admin }).allowed) {
   // LOOK BEFORE YOU EDIT. She may only edit pages of a capture she has already compared with her
   // own site, side by side, in the Hosted Store tab — see app/lib/capture-review-gate.ts for the
   // rule and why it is this one. Enforced HERE, not only on the button, or it is decorative: the
   // edit URL is a plain link she could keep. Admins (us, debugging a store) are exempt.
   const gate = admin
    ? { passed: true as const, reason: "reviewed" as const }
    : reviewGate(await getReviewState(slug).catch(() => null)); /* allow-swallow: fails OPEN on purpose — this is a workflow step, not the security control (that is canEditCapture above), and a health-table blip must not lock every seller out of her own editor */
   if (gate.passed) {
    return new Response(prepareEditMode(html, slug, pathname), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
   }
   // She IS the owner and simply hasn't reviewed yet. Falling silently through to the public page
   // is right for a shopper and wrong for her — she clicked Edit (or the storefront studio loaded
   // this URL in its iframe) and got a page that won't edit, with nothing saying why. Her copy of
   // the page carries one line naming the step. No shopper reaches this branch.
   ownerNotice = reviewGateNoticeHtml(gate);
  }
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
 const card = (it: { id: string; title: string; priceCents: number | null; currency: string | null; images: unknown; sourceId?: string | null; status?: string; unavailableReason?: string | null; compareAtCents?: number | null }) =>
  ({ id: it.id, title: it.title, priceCents: it.priceCents, currency: it.currency, images: it.images, sourceId: it.sourceId, available: it.status !== "sold", unavailableReason: it.unavailableReason, compareAtCents: it.compareAtCents });
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
  // Have we actually READ this collection from her site? The difference between "never read" and
  // "read, and empty" decides whether an empty collection shows nothing or refills itself from the
  // crawl-day snapshot — see app/lib/plan-b/collection-contents.ts.
  let collectionSync = false;
  if (isHome || coll![1] === "all") items = await listStorefrontItems(seller.id).catch(() => []);
  else {
   // Assigned items PLUS anything matching the handle by category/brand, so listings the seller
   // adds in the portal show up on the collection page they belong to without manual filing.
   // ONE query for both the collection and whether we have read it from her site — the two used to
   // be separate calls, putting a second round trip on the busiest page type across 21 stores.
   const collection = await getCollectionWithSyncState(seller.id, coll![1]).catch(() => null);
   collectionSync = collection?.membershipKnown ?? false;
   // Her own answer about sold pieces, not ours — see collection-sold-policy.ts.
   items = await listCollectionItemsForStorefront(seller.id, collection?.id ?? null, coll![1], collection?.keepsSold ?? null).catch(() => []);
  }
  // A collection with no VYA assignment and no category/brand match is very likely a manually
  // curated Shopify collection with no pattern behind the choice at all ("collection-1", specific
  // pieces someone dragged in). The captured page still knows exactly which products belong on
  // it — read those handles back out and ask for THOSE, live, rather than jumping straight to the
  // seller's whole catalogue, which turned a hand-picked 6-piece edit into a dump of everything
  // they've ever listed. And when even that yields nothing, the collection is empty: say so. See
  // chooseCollectionItems — falling back to the whole catalogue here served all 164 of blummier's
  // pieces under "Alaïa", under "Blumarine", and under 45 other empty collections.
  let renderEmptyCollection = false;
  // Which of the three answers this page is giving, stamped onto it so a check can tell a page that
  // disagrees with our filing (a fault) from one that never claimed to follow it (a fallback).
  let collectionSource: "filed" | "captured" | "empty" | "unknown" = "unknown";
  if (coll && coll[1] !== "all") {
   const handles = items.length ? [] : capturedGridProductHandles(html);
   const fromCapturedGrid = handles.length ? await listStorefrontItemsBySourceIds(seller.id, handles).catch(() => []) : [];
   // Have we actually read this collection from her site? If we have, and nothing is filed in it,
   // it is empty and we say so rather than refilling it from the capture — see collection-contents.
   const chosen = chooseCollectionItems({ assigned: items, fromCapturedGrid, capturedNamedProducts: handles.length > 0, membershipKnown: collectionSync });
   collectionSource = items.length ? "filed" : chosen.items.length ? "captured" : "empty";
   items = chosen.items;
   renderEmptyCollection = chosen.renderEmpty;
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
   // A grid detectGridHandles() couldn't name (no VYA collection, no /collections/ link nearby to
   // even try) still knows what it showed — a "collection focus carousel" picks products via
   // Liquid, which compiles away to plain product links with no collection name left in the HTML at
   // all. Read below, only for the grids that actually need it (skip the work for grids that
   // resolved normally).
   const ownHandlesPerGrid = handles.some((h) => !h || !byHandle.get(h)?.length) ? capturedGridProductHandlesPerGrid(html) : [];
   // Which grids ARE a collection, rather than a rail showing its own captured pieces. Only these
   // may grow past the number of cards the crawl happened to photograph — see injectLiveGrids.
   const uncapped: boolean[] = [];
   const perGrid = await Promise.all(handles.map(async (h, i) => {
    const fromCollection = h ? byHandle.get(h) : undefined;
    if (fromCollection?.length) { uncapped[i] = true; return fromCollection.map(card); }
    uncapped[i] = false;
    const ownHandles = ownHandlesPerGrid[i] || [];
    const own = ownHandles.length ? await listStorefrontItemsBySourceIds(seller.id, ownHandles).catch(() => []) : [];
    return (own.length ? own : items).map(card);
   }));
   if (perGrid.some((g) => g.length)) html = injectLiveGrids(html, perGrid, hrefFor, { keepQuickAdd: onStoreOrigin, uncapped });
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
    renderEmpty: hasFacetParams(req.nextUrl.searchParams) || renderEmptyCollection,
    source: collectionSource,
   });
  } else if (renderEmptyCollection) {
   // An empty collection still has to CLEAR the captured grid — leaving it shows capture-day cards
   // for a collection the seller has emptied.
   html = injectCollectionItems(html, [], hrefFor, { path: onStoreOrigin ? pathname : `/site/${slug}${pathname}`, keepQuickAdd: onStoreOrigin, renderEmpty: true });
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
   // A SOLD piece must not offer a buy button. The Shopify product route already does this; this
   // path did not, so a sold Squarespace product served a live "Add to cart" that the cart endpoint
   // then correctly refused with a 422 — the shopper clicks, nothing happens, and nothing explains
   // why. One-of-one stores are mostly sold stock, so this is the common case, not the edge.
   const mine = await getItem(itemId).catch(() => null);
   if (mine?.status === "sold") html = applyCartState(html, { inCart: false, soldOut: true });
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
 if (isCartPath) {
  const token = req.cookies.get("via_cart")?.value || "";
  // THIS store's bag. A shopper browsing VYA has one per store (see storefront-cart-scope); on the
  // seller's own domain the cookie is already theirs alone, and passing the seller changes nothing.
  const bagSeller = (await getSellerBySlug(slug).catch(() => null))?.id ?? null;
  const ids = token ? await getCartItemIds(token, bagSeller).catch(() => [] as string[]) : [];
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
  // THE CART PAGE IS VYA'S, on every store and every theme.
  //
  // It used to be the theme's own cart markup with the visitor's lines injected into it, which meant
  // knowing where each theme puts a row, a price, a total and an empty state. Three browser sweeps
  // and a day of per-theme fixes later that path still mis-rendered — it cloned a table header as a
  // product on one theme, leaked the captured product on another, and showed two carts on a third.
  //
  // buildFallbackCartPage reproduces nothing: it keeps the store's own header, footer, fonts and
  // colours, and renders the bag in VYA's own markup inside them. It is the one cart surface that
  // has never needed a per-store fix, and it now serves them all.
  html = buildFallbackCartPage(html, lines, `/checkout?cart=1${onStoreOrigin ? "" : `&store=${encodeURIComponent(slug)}`}`, { interactive: onStoreOrigin });

  // The cart page just resolved the visitor's real lines — reuse that count for the header badge
  // rather than resolving the same items a second time.
  cartCount = lines.length;
 }
 // Plan B keeps the seller's scripts, but the denylist is re-applied at SERVE time (inside
 // cleanShopifyChrome) so captures taken under an older, shorter list stop running trackers we've
 // since learned to recognise — no re-crawl of 45 stores required. See stripVendorScripts.
 // Applied to `base`, before the section fragment is cut out of it, so a facet click that re-renders
 // the header section gets the same number a full page load would.
 // The badge counts THIS store's bag: a shopper carrying pieces from another store must not see
 // them totalled in this store's header.
 if (cartCount === null) {
  const badgeSeller = (await getSellerBySlug(slug).catch(() => null))?.id ?? null;
  cartCount = await cartItemCount(req.cookies.get("via_cart")?.value || "", badgeSeller);
 }
 let base = applyCartBadge(cleanShopifyChrome(onStoreOrigin ? html : stripScripts(html)), cartCount);

 // THE THEME'S OWN ASSETS, made same-origin. A browser sweep of all 22 storefronts found most of
 // them serving the theme's scripts from the SELLER's domain — 35 ES modules on one store — every
 // one refused by Chrome for want of CORS headers. That takes down the menus, carousels, galleries
 // and cart together: the storefront renders and nothing works. Routing them through VYA's own /cdn
 // proxy removes the cross-origin question entirely. See same-origin-assets.ts.
 if (onStoreOrigin) {
  const captureOrigin = await getCaptureOrigin(slug).catch(() => null);
  base = sameOriginAssets(base, captureOrigin, detectMyshopifyDomain(base));
 }

 // THE THEME'S OWN CART, hidden. Its JavaScript is alive on a store origin, so pressing Add opened
 // VYA's drawer AND the theme's, one over the other — a browser sweep caught it as "2 cart panels
 // visible at once". We hide rather than remove, so the theme's cart code still finds every element
 // it queries and runs to completion against something nobody sees. See suppress-theme-cart.ts.
 if (onStoreOrigin) base = suppressThemeCart(base);

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

 // A PRODUCT'S BUY BUTTONS, made to match each other. One store's "Enquire" renders at twice the
 // size of the "Add to cart" beside it — same classes, same parent, matched on her own site. See
 // button-parity.ts; it only acts when the sizes disagree widely, and takes the smaller.
 base = normaliseBuyButtons(base);

 // HER FAVOURITES LINK, wearing a heart rather than a person. One theme's saved-pieces link uses
 // the account glyph, which sat inches from our account button meaning something else entirely.
 // Only the glyph changes; her link, classes, sizing and words are hers. See favourites-icon.ts.
 base = retagFavourites(base);

 // THE SELLER'S OWN PERSON ICON, bound to our sign-in. Store-origin only: a VYA origin strips the
 // theme's scripts, so a panel served there could never be opened. Deliberately after the section
 // fragment is returned above — the panel belongs to a document, not to a fragment. Stores with no
 // account control (the three that aren't on Shopify) are left untouched. See account-panel.ts.
 if (onStoreOrigin) {
  const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  const cookie = req.cookies.get(SHOPPER_COOKIE)?.value || "";
  const session = authSecret && cookie ? readShopperToken(cookie, slug, authSecret) : null;
  const shopName = (await getSellerBySlug(slug).catch(() => null))?.name || slug;
  base = injectAccountPanel(base, { signedInAs: session?.email ?? null, shopName });
 }

 // VYA OWNS COMMERCE ON EVERY STORE.
 //
 // Three browser sweeps of all 22 storefronts settled this. Making the theme's own cart work meant
 // reproducing, per theme, a contract that never bottoms out: cross-origin modules, then import
 // maps, then module shims, then web pixels. Two real fixes later, 20 of 22 stores still could not
 // complete a purchase. Meanwhile VYA's own cart (CART_UI) reproduces nothing — it binds its own
 // Add buttons, intercepts cart links and talks to /api/storefront/cart — and needs no theme
 // knowledge at all.
 //
 // The theme still owns everything else: its domain, its markup, its fonts, and its own JavaScript
 // for menus, carousels and galleries. Only the buy path is ours, so whether a theme's bundle boots
 // affects how polished browsing feels — never whether a shopper can pay.
 //
 // injectShim stays Plan-A-only: on a store origin the theme's own scripts are alive and the shim
 // would fight them for the same carousels and dropdowns.
 const withCommerce = onStoreOrigin ? injectCart(base) : injectShim(injectCart(base));
 const page = injectPoweredBy(injectSeo(injectCss(withCommerce, css), { canonicalUrl }));
 return new Response(ownerNotice ? page.replace(/<\/body>/i, `${ownerNotice}</body>`) : page, { headers });
}
