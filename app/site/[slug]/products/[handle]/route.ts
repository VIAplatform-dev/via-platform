import { NextRequest } from "next/server";
import * as cheerio from "cheerio";
import { getCapturePage, getCaptureOrigin, saveCapturePage, getSiteCss, listCapturePaths } from "@/app/lib/site-capture-db";
import { captureSite, rewireCommerce, injectCart, injectCss, stripScripts, stripVendorScripts, applyCartState, renderNativeProduct } from "@/app/lib/site-capture";
import { getItem } from "@/app/lib/db/inventory";
import { getCartItemIds } from "@/app/lib/storefront-cart-db";
import { applyCartBadge } from "@/app/lib/plan-b/cart-badge";
import { cartItemCount } from "@/app/lib/plan-b/cart-session";
import { suppressThemeCart } from "@/app/lib/plan-b/suppress-theme-cart";
import { injectRecommendationAddHandler } from "@/app/lib/plan-b/recommendation-pool";
import { pageNamesProduct, pickCapturedProductPath, slugifyTitle } from "@/app/lib/plan-b/captured-product-path";
import { pickIndexedPath, productIndexFor } from "@/app/lib/plan-b/product-index";
import { sameOriginAssets } from "@/app/lib/plan-b/same-origin-assets";
import { injectAccountPanel } from "@/app/lib/plan-b/account-panel";
import { readShopperToken, SHOPPER_COOKIE } from "@/app/lib/shopper-session";
import { retagFavourites } from "@/app/lib/plan-b/favourites-icon";
import { normaliseBuyButtons } from "@/app/lib/plan-b/button-parity";
import { injectPoweredBy } from "@/app/lib/site-capture";
import { detectMyshopifyDomain } from "@/app/lib/plan-b/scripts";
import { listItemsBySource } from "@/app/lib/db/inventory";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { isStoreHost, storeHostSuffix } from "@/app/lib/plan-b/store-host";
import { matchItemId } from "@/app/lib/capture-commerce";
import { applyLivePrice } from "@/app/lib/live-price";
import { captureStorefrontEntry } from "@/app/lib/store-visits-db";
import { recordProductView } from "@/app/lib/store-favorites-db";


/**
 * The cart drawer, filled with the visitor's real bag.
 *
 * Product pages are served by THIS route, not the catch-all — so a drawer injection added only there
 * never reached the page a shopper actually adds from. Clicking the cart icon opens the drawer
 * already in the page (no request is made), and a drawer captured with an empty cart told every
 * shopper their bag was empty while the badge beside it said 1.
 */
async function withCartDrawer(html: string, slug: string, token: string, onStoreOrigin: boolean): Promise<string> {
 if (!onStoreOrigin) return html; // a VYA origin strips scripts, so the drawer cannot open there
 try {
  // Same-origin the theme's assets first — without this the theme's JavaScript never loads at all
  // (blocked as cross-origin), and no cart work downstream of it can matter. See same-origin-assets.ts.
  const captureOrigin = await getCaptureOrigin(slug).catch(() => null);
  html = sameOriginAssets(html, captureOrigin, detectMyshopifyDomain(html));
  // The "You may also like" strip's own Add-to-cart handler, which has to live on the PAGE: the
  // strip arrives later, by fetch, and is assigned with innerHTML — where a <script> would never
  // run. See recommendationAddScript(). A product page is the only page that carries the strip, and
  // (like the drawer) the bridge it posts to only exists on a store origin.
  // EVERYTHING THE CATCH-ALL ROUTE DOES, done here too. Product pages are served by THIS route, so
  // anything added only to the catch-all never reaches the page a shopper actually buys from — the
  // drawer above was exactly that bug, and the account panel, the heart and the button sizing would
  // each have repeated it.
  return normaliseBuyButtons(injectRecommendationAddHandler(suppressThemeCart(html)));
 } catch {
  return html;
 }
}

/** Her account control, bound to our sign-in — store origin only, where scripts run. */
async function withAccountPanel(html: string, slug: string, cookie: string, onStoreOrigin: boolean): Promise<string> {
 if (!onStoreOrigin) return html;
 try {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  const session = secret && cookie ? readShopperToken(cookie, slug, secret) : null;
  const shopName = (await getSellerBySlug(slug).catch(() => null))?.name || slug;
  return injectAccountPanel(html, { signedInAs: session?.email ?? null, shopName });
 } catch {
  return html;
 }
}

/** The store whose bag this page shows. A shopper has one bag per store (see
 *  storefront-cart-scope); on the seller's own domain the cookie is already theirs alone, so this
 *  changes nothing there and everything on a VYA-served page. */
async function bagSellerFor(slug: string): Promise<string | null> {
 return (await getSellerBySlug(slug).catch(() => null))?.id ?? null;
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Serves a product page on VYA. Captured on-demand the first time (then cached),
// with the Shopify add-to-cart swapped for a VYA "Buy" button matched to the
// store's imported listing → VYA checkout.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; handle: string }> }) {
 const { slug, handle } = await params;
 const path = `/products/${handle}`;

 // PLAN B: on the store's own domain the seller's theme JavaScript is safe to keep, so the product
 // page keeps its accordions, gallery and its OWN add-to-cart button (which posts to /cart/add.js —
 // our route). Under Plan A the same page is served with every script stripped.
 const planB = Boolean(storeHostSuffix());
 const onStoreOrigin = isStoreHost(req.headers.get("host"));

 // Shopify's Quick Shop fetches the SAME product URL with `?view=quickshop` appended — an alternate
 // template the theme renders as a DIFFERENT document, wrapping the bits it wants in `[data-html]`/
 // `[data-data]` marker elements that its own JS (AsyncView) parses out and drops into the modal.
 // Serving the normal product page there (the previous fix for the 404) has none of those markers,
 // so AsyncView finds zero `[data-html]` elements, resolves an empty `{}`, and the modal's
 // `container.innerHTML = html2` stringifies that object — the shopper sees the literal text
 // "[object Object]". Only reachable on a store origin, where the theme's real JS is what's asking.
 if (planB && onStoreOrigin && req.nextUrl.searchParams.get("view") === "quickshop") {
  return serveQuickshopView(slug, handle, req);
 }

 let html = await getCapturePage(slug, path).catch(() => null);

 // A listing the seller created in the PORTAL has no page on the source store — its link is the VYA
 // item id. Fetching `{source}/products/{uuid}` 404s, which is why the seller's newest piece showed
 // "Couldn't load that product". Render it into a captured page from the same store instead, so it
 // arrives in the theme's own layout rather than a VYA-shaped one.
 // The store's own page for this product, under whatever URL shape ITS platform uses. A capture of
 // a Squarespace store keeps product pages at `/shop/p/{slug}`, so the `/products/{handle}` lookup
 // above finds nothing and the re-capture below asks the source for a URL it has never had — the
 // 502 every product click on those stores ended at. See captured-product-path.ts.
 if (!html) {
  const alias = pickCapturedProductPath(await listCapturePaths(slug).catch(() => [] as string[]), [handle]);
  // The handle IS the source's own identity here, so a path ending in it is that product's page —
  // no title check needed, unlike the slugified-title guess below.
  if (alias) return redirectToCapturedPage(slug, alias, onStoreOrigin, path);
 }

 if (!html && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handle)) {
  const item = await getItem(handle).catch(() => null);
  const seller = item ? await getSellerBySlug(slug).catch(() => null) : null;
  if (item && seller && item.sellerId === seller.id) {
   // This piece may well HAVE a page on the source site — an import that didn't record source
   // identity (Squarespace's feed reader didn't until recently) is what left it addressed by uuid,
   // not the absence of a page. Look for one before rendering a substitute: the seller's real page
   // carries their own photos, copy and layout, and its Add-to-cart is already wired to this item
   // by the catch-all route that serves it.
   const captured = await capturedPageForItem(slug, item.sourceId, item.title);
   if (captured) return redirectToCapturedPage(slug, captured, onStoreOrigin, path);
   const template = await productTemplateFor(slug, planB).catch(() => null);
   if (template) {
    const out = renderNativeProduct(template, {
     id: item.id, title: item.title, priceCents: item.priceCents, currency: item.currency,
     images: (item.images || []) as string[], description: item.description, size: item.size,
     available: item.status === "active",
    });
    const css0 = await getSiteCss(slug).catch(() => "");
    const withState = applyCartState(out, { inCart: false, soldOut: item.status === "sold" });
    const badged = await withCartDrawer(applyCartBadge(withState, await cartItemCount(req.cookies.get("via_cart")?.value || "", await bagSellerFor(slug))), slug, req.cookies.get("via_cart")?.value || "", isStoreHost(req.headers.get("host")));
    // VYA's cart on every origin — see the note in the catch-all route. On a store origin the
    // theme's scripts stay (its menus and galleries need them); only commerce is ours.
    const body = injectCss(injectCart(onStoreOrigin ? stripVendorScripts(badged) : stripScripts(badged)), css0);
    return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
   }
  }
 }

 if (!html) {
 const origin = await getCaptureOrigin(slug).catch(() => null);
 if (!origin) return new Response("Store not found.", { status: 404, headers: { "Content-Type": "text/plain" } });
 try {
 const base = planB ? "" : `/site/${slug}`;
 const cap = await captureSite(`${origin}${path}`, {
  rehost: process.env.BLOB_READ_WRITE_TOKEN ? { slug, cache: new Map<string, string>() } : undefined,
 keepScripts: planB,
 rewriteLink: (full) => {
 const p = new URL(full).pathname;
 if (/^\/products\//.test(p)) return `${base}${p}`;
 if (/\/(cart|account|search|checkout|login)\b/.test(p) || /\.(json|xml|css|js)$/i.test(p) || /\/cdn\//.test(p)) return null;
 return `${base}${p === "/" ? "" : p}` || "/";
 },
 });
 // Match this product to its VYA item → buy button runs VYA's Stripe checkout.
 const title = cheerio.load(cap.html)("h1").first().text().replace(/\s+/g, " ").trim();
 // The handle IS the source's product id, so this matches exactly rather than guessing by title.
 const itemId = await matchItemId(slug, title, handle).catch(() => null);
 const buyHref = itemId ? `/checkout?item=${itemId}` : null;
 // keepThemeButtons: false, on EVERY plan. VYA owns the buy path now, so the theme's own
 // Add-to-cart is replaced rather than kept beside ours — leaving both produced a page with two Add
 // buttons, one of which quietly did nothing because its JavaScript had not booted.
 html = rewireCommerce(cap.html, buyHref, { keepThemeButtons: false });
 await saveCapturePage(slug, path, html, `${origin}${path}`);
 } catch {
 return new Response("Couldn't load that product.", { status: 502, headers: { "Content-Type": "text/plain" } });
 }
 }
 // Reflect THIS visitor's cart onto the page. A capture is frozen at "0 in cart" and never shows the
 // already-in-your-bag notice, so without this a shopper can add a one-of-one piece they already
 // hold and get no feedback at all.
 try {
  const seller = await getSellerBySlug(slug);
  if (seller) {
   // matchItemId, not listItemsBySource(…, "captured"): the import engine writes its items with a
   // different `source`, so that lookup returned nothing on every imported store — which is why the
   // "already in your bag" state has never appeared on one.
   const mineId = await matchItemId(slug, "", handle).catch(() => null);
   const mine = mineId ? await getItem(mineId).catch(() => null) : null;
   if (mine) {
    // Replace the theme's own Add-to-cart with VYA's, at SERVE time. The stored capture was written
    // before VYA owned commerce, so without this the page ships two Add buttons — ours and the
    // theme's — and the theme's is the one a shopper reaches first. Doing it here fixes every store
    // on the next request instead of after 22 re-imports.
    // A SOLD piece gets no buy href. rewireCommerce renders its own disabled "Sold out" control
    // from that, in the theme's button shape — passing a checkout link regardless is what left a
    // live "Add to cart" and a working /checkout link on every sold product page.
    html = rewireCommerce(html, mine.status === "sold" ? null : `/checkout?item=${mine.id}`, { keepThemeButtons: false, unavailableReason: mine.unavailableReason });
    // The captured page carries the price from crawl day; the cart charges the item record. On a
    // store repriced since capture (blummier, dollars → pounds) those were different numbers in
    // different currencies on the same screen. See applyLivePrice.
    html = applyLivePrice(html, { priceCents: mine.priceCents, currency: mine.currency, compareAtCents: mine.compareAtCents });
    const token = req.cookies.get("via_cart")?.value || "";
    const ids = token ? await getCartItemIds(token, await bagSellerFor(slug)) : [];
    html = applyCartState(html, { inCart: ids.includes(mine.id), soldOut: mine.status === "sold", unavailableReason: mine.unavailableReason });
   }
  }
 } catch { /* allow-swallow: cart state is a display nicety — never fail the product page for it */ }

 // The header badge, from the same count /cart.js reports. A product page is where a shopper adds
 // a piece, so a header still frozen at the crawler's cart is the most confusing place to leave it.
 html = await withCartDrawer(applyCartBadge(html, await cartItemCount(req.cookies.get("via_cart")?.value || "", await bagSellerFor(slug))), slug, req.cookies.get("via_cart")?.value || "", isStoreHost(req.headers.get("host")));

 const css = await getSiteCss(slug).catch(() => "");
 // The stored page may contain the seller's scripts (Plan B). They may only ever run on the store's
 // own origin — on a VYA origin they would execute with VYA's privileges. Same boundary as the
 // captured-page route.
 // On a store origin the seller's scripts run, but the DENYLIST is re-applied here so a capture
 // taken under an older list stops loading trackers we've since learned to recognise (Shopify's
 // perf-kit was exactly that). See stripVendorScripts.
 const safeHtml = onStoreOrigin ? stripVendorScripts(html) : stripScripts(html);
 // The theme's own cart drives VYA on a store origin, so our injected drawer would only duplicate it.
 const withPanel = await withAccountPanel(safeHtml, slug, req.cookies.get(SHOPPER_COOKIE)?.value || "", onStoreOrigin);
 const out = injectPoweredBy(retagFavourites(injectCss(injectCart(withPanel), css)));
 // The VYA item behind this page is encoded in its buy link — used to record a product view for
 // the store's analytics.
 const itemId = (out.match(/\/checkout\?item=([a-zA-Z0-9-]+)/) || [])[1] || null;
 if (itemId) {
 recordProductView(slug, itemId, req.cookies.get("via_sess")?.value || null).catch(() => {});
 }
 const setCookie = await captureStorefrontEntry(req, slug);
 const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
 if (setCookie) headers["Set-Cookie"] = setCookie;
 return new Response(out, { headers });
}

/** Reserved cache key for a product's captured `?view=quickshop` alternate template — kept out of
 *  listCapturePaths() the same way `__vya_custom_css__` is (it isn't a real page), and specifically
 *  NOT under `/products/${handle}` so it can never be picked up by productTemplateFor()'s candidate
 *  scan, which is unprepared for the extra `[data-html]`/`[data-data]` wrapper markup. */
const quickshopKey = (handle: string) => `__quickshop__/products/${handle}`;

/** Shopify's Quick Shop alternate-template response for one product. Captured, cached and rewired
 *  exactly like the normal product page — just from a different source URL and under a different
 *  cache key, since the theme renders genuinely different markup for it (see the comment above the
 *  call site). Always Plan B: the theme's own JS is what's making this request. */
async function serveQuickshopView(slug: string, handle: string, req: NextRequest): Promise<Response> {
 const key = quickshopKey(handle);
 let html = await getCapturePage(slug, key).catch(() => null);

 if (!html) {
  const origin = await getCaptureOrigin(slug).catch(() => null);
  if (!origin) return new Response("Store not found.", { status: 404, headers: { "Content-Type": "text/plain" } });
  try {
   const sourceUrl = `${origin}/products/${handle}?view=quickshop`;
   const cap = await captureSite(sourceUrl, {
    rehost: process.env.BLOB_READ_WRITE_TOKEN ? { slug, cache: new Map<string, string>() } : undefined,
    keepScripts: true,
    rewriteLink: (full) => {
     const p = new URL(full).pathname;
     if (/^\/products\//.test(p)) return p;
     if (/\/(cart|account|search|checkout|login)\b/.test(p) || /\.(json|xml|css|js)$/i.test(p) || /\/cdn\//.test(p)) return null;
     return p === "/" ? "" : p;
    },
   });
   // Same product-matching logic as the normal product page, so the theme's own buy button (kept,
   // Plan B) still lands on VYA's checkout for the right item.
   const title = cheerio.load(cap.html)("h1").first().text().replace(/\s+/g, " ").trim();
   const itemId = await matchItemId(slug, title, handle).catch(() => null);
   const buyHref = itemId ? `/checkout?item=${itemId}` : null;
   html = rewireCommerce(cap.html, buyHref, { keepThemeButtons: false });
   // A page captured just now is already stale if the piece was repriced after the crawl.
   const fresh = itemId ? await getItem(itemId).catch(() => null) : null;
   if (fresh) html = applyLivePrice(html, { priceCents: fresh.priceCents, currency: fresh.currency, compareAtCents: fresh.compareAtCents });
   await saveCapturePage(slug, key, html, sourceUrl);
  } catch {
   return new Response("Couldn't load that product.", { status: 502, headers: { "Content-Type": "text/plain" } });
  }
 }

 // Reflect this visitor's cart state the same as the normal product page — the theme's own gallery
 // and add-to-cart form live inside this markup too.
 try {
  const seller = await getSellerBySlug(slug);
  if (seller) {
   const mine = (await listItemsBySource(seller.id, "captured")).find((i) => i.sourceId === handle);
   if (mine) {
    const token = req.cookies.get("via_cart")?.value || "";
    const ids = token ? await getCartItemIds(token, await bagSellerFor(slug)) : [];
    html = applyCartState(html, { inCart: ids.includes(mine.id), soldOut: mine.status === "sold" });
   }
  }
 } catch { /* allow-swallow: cart state is a display nicety — never fail the quick-shop view for it */ }

 const css = await getSiteCss(slug).catch(() => "");
 const out = injectCss(html, css);
 return new Response(out, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/**
 * Any captured product page from this store, to use as a layout template for a portal-created
 * listing. Prefers one we already have; otherwise captures a single imported product on demand.
 * Returns null when the store has no imported products at all to learn a layout from.
 */
/**
 * The captured page for a VYA item, or null when the store hasn't got one.
 *
 * Two keys, in order of how much they can be trusted. The item's `sourceId` IS the source's own
 * handle, so a captured path ending in it is that product's page. A slugified TITLE is a guess —
 * these platforms all build their handles that way, but two one-of-one pieces can slug alike — so a
 * page found that way is only used once its own heading confirms it shows this piece. Serving a
 * shopper a different garment than the one they clicked is worse than the fallback.
 */
async function capturedPageForItem(slug: string, sourceId: string | null, title: string): Promise<string | null> {
 const paths = await listCapturePaths(slug).catch(() => [] as string[]);
 const bySource = pickCapturedProductPath(paths, [sourceId]);
 if (bySource) return bySource;

 // The store's own catalogue, which knows the page for a product whose URL its platform generated
 // rather than derived from the name (see product-index.ts). Ahead of the slug guess below because
 // it is a fact the store told us, not an inference from its naming habits.
 const indexed = pickIndexedPath(await productIndexFor(slug).catch(() => null), title);
 if (indexed && paths.includes(indexed)) return indexed;

 const byTitle = pickCapturedProductPath(paths, [slugifyTitle(title)]);
 if (!byTitle) return null;
 const html = await getCapturePage(slug, byTitle).catch(() => null);
 return html && pageNamesProduct(html, title) ? byTitle : null;
}

/** Send the shopper to the page itself rather than serving it from this URL: it is the store's real
 *  address for the piece, and the route that owns it already wires up its cart, its analytics and
 *  its identity. On a VYA origin the mirrored site lives under `/site/{slug}`. */
function redirectToCapturedPage(slug: string, path: string, onStoreOrigin: boolean, from?: string): Response {
 // Never send a page to itself. A capture row that exists but holds nothing reads as "no page" to
 // the lookup above while still being listed as a path — which would be an endless redirect for
 // every shopper who touched that product.
 if (from && path === from) return new Response("Couldn't load that product.", { status: 502, headers: { "Content-Type": "text/plain" } });
 // A RELATIVE Location, deliberately. On a store origin this request reached the route through a
 // middleware rewrite, so `req.nextUrl` carries the internal `/site/{slug}/…` URL and its host is
 // whatever the server is bound to — building an absolute URL from it sent shoppers to
 // `localhost:3333`. The browser resolves a relative Location against the address it asked for,
 // which is the store's own domain.
 const location = `${onStoreOrigin ? "" : `/site/${slug}`}${path}`;
 return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });
}

async function productTemplateFor(slug: string, planB: boolean): Promise<string | null> {
 // The page must actually CONTAIN the markup we're going to substitute into. A sold product's page
 // has no price block at all — picking one (the first alphabetically happened to be sold) rendered
 // the seller's new listing with no price anywhere. Matches an element's class attribute, not the
 // inlined stylesheet, where these class names also appear.
 const usable = (html: string) => /class="[^"]*\bprice-item\b/.test(html) || /class="[^"]*price__regular/.test(html);

 const paths = await listCapturePaths(slug).catch(() => [] as string[]);
 for (const candidate of paths.filter((p: string) => p.startsWith("/products/")).slice(0, 6)) {
  const cached = await getCapturePage(slug, candidate).catch(() => null);
  if (cached && usable(cached)) return cached;
 }

 const seller = await getSellerBySlug(slug).catch(() => null);
 if (!seller) return null;
 // Capture from an AVAILABLE product — the same reason: a sold one has no price to copy.
 const sourced = (await listItemsBySource(seller.id, "captured").catch(() => [])).filter((i) => i.sourceId);
 const withSource = sourced.find((i) => i.status === "active") || sourced[0];
 const origin = await getCaptureOrigin(slug).catch(() => null);
 if (!withSource?.sourceId || !origin) return null;
 const cap = await captureSite(`${origin}/products/${withSource.sourceId}`, { keepScripts: planB, rehost: process.env.BLOB_READ_WRITE_TOKEN ? { slug, cache: new Map<string, string>() } : undefined }).catch(() => null);
 if (!cap || !usable(cap.html)) return null;
 await saveCapturePage(slug, `/products/${withSource.sourceId}`, rewireCommerce(cap.html, null, { keepThemeButtons: planB }), `${origin}/products/${withSource.sourceId}`).catch(() => {}); /* allow-swallow: caching the template is an optimisation, not the request */
 return cap.html;
}
