import { NextRequest } from "next/server";
import * as cheerio from "cheerio";
import { getCapturePage, getCaptureOrigin, saveCapturePage, getSiteCss, listCapturePaths } from "@/app/lib/site-capture-db";
import { captureSite, rewireCommerce, injectCart, injectCss, stripScripts, stripVendorScripts, applyCartState, renderNativeProduct } from "@/app/lib/site-capture";
import { getItem } from "@/app/lib/db/inventory";
import { getCartItemIds } from "@/app/lib/storefront-cart-db";
import { applyCartBadge } from "@/app/lib/plan-b/cart-badge";
import { cartItemCount } from "@/app/lib/plan-b/cart-session";
import { listItemsBySource } from "@/app/lib/db/inventory";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { isStoreHost, storeHostSuffix } from "@/app/lib/plan-b/store-host";
import { matchItemId } from "@/app/lib/capture-commerce";
import { captureStorefrontEntry } from "@/app/lib/store-visits-db";
import { recordProductView } from "@/app/lib/store-favorites-db";

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
 if (!html && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handle)) {
  const item = await getItem(handle).catch(() => null);
  const seller = item ? await getSellerBySlug(slug).catch(() => null) : null;
  if (item && seller && item.sellerId === seller.id) {
   const template = await productTemplateFor(slug, planB).catch(() => null);
   if (template) {
    const out = renderNativeProduct(template, {
     id: item.id, title: item.title, priceCents: item.priceCents, currency: item.currency,
     images: (item.images || []) as string[], description: item.description, size: item.size,
     available: item.status === "active",
    });
    const css0 = await getSiteCss(slug).catch(() => "");
    const withState = applyCartState(out, { inCart: false, soldOut: item.status === "sold" });
    const badged = applyCartBadge(withState, await cartItemCount(req.cookies.get("via_cart")?.value || ""));
    const body = injectCss(onStoreOrigin ? stripVendorScripts(badged) : injectCart(stripScripts(badged)), css0);
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
 html = rewireCommerce(cap.html, buyHref, { keepThemeButtons: planB });
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
   const mine = (await listItemsBySource(seller.id, "captured")).find((i) => i.sourceId === handle);
   if (mine) {
    const token = req.cookies.get("via_cart")?.value || "";
    const ids = token ? await getCartItemIds(token) : [];
    html = applyCartState(html, { inCart: ids.includes(mine.id), soldOut: mine.status === "sold" });
   }
  }
 } catch { /* allow-swallow: cart state is a display nicety — never fail the product page for it */ }

 // The header badge, from the same count /cart.js reports. A product page is where a shopper adds
 // a piece, so a header still frozen at the crawler's cart is the most confusing place to leave it.
 html = applyCartBadge(html, await cartItemCount(req.cookies.get("via_cart")?.value || ""));

 const css = await getSiteCss(slug).catch(() => "");
 // The stored page may contain the seller's scripts (Plan B). They may only ever run on the store's
 // own origin — on a VYA origin they would execute with VYA's privileges. Same boundary as the
 // captured-page route.
 // On a store origin the seller's scripts run, but the DENYLIST is re-applied here so a capture
 // taken under an older list stops loading trackers we've since learned to recognise (Shopify's
 // perf-kit was exactly that). See stripVendorScripts.
 const safeHtml = onStoreOrigin ? stripVendorScripts(html) : stripScripts(html);
 // The theme's own cart drives VYA on a store origin, so our injected drawer would only duplicate it.
 let out = injectCss(onStoreOrigin ? safeHtml : injectCart(safeHtml), css);
 // The VYA item behind this page is encoded in its buy link — use it to add a Save
 // (favorite) button and record a product view for the store's analytics.
 const itemId = (out.match(/\/checkout\?item=([a-zA-Z0-9-]+)/) || [])[1] || null;
 if (itemId) {
 out = injectFavoriteButton(out, slug, itemId);
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
   html = rewireCommerce(cap.html, buyHref, { keepThemeButtons: true });
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
    const ids = token ? await getCartItemIds(token) : [];
    html = applyCartState(html, { inCart: ids.includes(mine.id), soldOut: mine.status === "sold" });
   }
  }
 } catch { /* allow-swallow: cart state is a display nicety — never fail the quick-shop view for it */ }

 const css = await getSiteCss(slug).catch(() => "");
 const out = injectCss(html, css);
 return new Response(out, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

// A floating "Save" button injected into the storefront product page. Talks to the
// favorite API (credentialed, so it works on the seller's own domain too).
function injectFavoriteButton(html: string, slug: string, itemId: string): string {
 const widget = `
<div style="position:fixed;bottom:18px;left:18px;z-index:2147483000;display:flex;gap:8px;align-items:center;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<button id="via-fav-btn" style="display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #e5e0da;border-radius:999px;padding:9px 15px;font-size:13px;color:#1c1917;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,0.10);">
<span id="via-fav-heart" style="font-size:15px;line-height:1;">♡</span><span id="via-fav-label">Save</span>
</button>
<a href="/site/${slug}/favorites" style="background:#fff;border:1px solid #e5e0da;border-radius:999px;padding:9px 15px;font-size:13px;color:#1c1917;text-decoration:none;box-shadow:0 2px 10px rgba(0,0,0,0.10);">Saved</a>
</div>
<script>(function(){var A="https://vyaplatform.com/api/storefront/favorite",S=${JSON.stringify(slug)},I=${JSON.stringify(itemId)};
var b=document.getElementById('via-fav-btn'),h=document.getElementById('via-fav-heart'),l=document.getElementById('via-fav-label');
function r(f){h.textContent=f?'♥':'♡';h.style.color=f?'#e0245e':'#1c1917';l.textContent=f?'Saved':'Save';}
fetch(A+'?slug='+encodeURIComponent(S)+'&item='+encodeURIComponent(I),{credentials:'include'}).then(function(x){return x.json()}).then(function(d){r(!!d.favorited)}).catch(function(){});
b.addEventListener('click',function(){b.disabled=true;fetch(A,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:S,item:I})}).then(function(x){return x.json()}).then(function(d){r(!!d.favorited)}).catch(function(){}).then(function(){b.disabled=false});});})();</script>`;
 return html.includes("</body>") ? html.replace("</body>", widget + "</body>") : html + widget;
}

/**
 * Any captured product page from this store, to use as a layout template for a portal-created
 * listing. Prefers one we already have; otherwise captures a single imported product on demand.
 * Returns null when the store has no imported products at all to learn a layout from.
 */
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
 const cap = await captureSite(`${origin}/products/${withSource.sourceId}`, { keepScripts: planB }).catch(() => null);
 if (!cap || !usable(cap.html)) return null;
 await saveCapturePage(slug, `/products/${withSource.sourceId}`, rewireCommerce(cap.html, null, { keepThemeButtons: planB }), `${origin}/products/${withSource.sourceId}`).catch(() => {}); /* allow-swallow: caching the template is an optimisation, not the request */
 return cap.html;
}
