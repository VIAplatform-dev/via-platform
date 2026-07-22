/* eslint-disable @typescript-eslint/no-explicit-any */
// High-fidelity site capture (the "keep their exact design" engine). We fetch a
// store's real page, inline its stylesheets (absolutizing every url() to the source
// CDN), point images/fonts at their real source, and rewrite same-origin LINKS to
// the VYA-hosted copy — so the whole site can be navigated on VYA, pixel-faithful.
// (JS is stripped for v1: looks identical; interactivity + cart + AI editing next.)
import * as cheerio from "cheerio";
import { safeUrl } from "@/app/lib/safe-url";
// The DB helpers are imported lazily inside crawlAndStore (the only consumer) so that
// the pure HTML functions here — applyEdits/prepareEditMode/captureSite — can be used
// (and unit-tested) without pulling in the database layer.

const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };

function abs(u: string | undefined, base: string): string {
 if (!u) return "";
 const t = u.trim();
 if (!t || t.startsWith("data:") || t.startsWith("#") || t.startsWith("mailto:") || t.startsWith("tel:") || t.startsWith("javascript:")) return u || "";
 try { return new URL(t, base).href; } catch { return u; }
}
function absSrcset(v: string | undefined, base: string): string {
 if (!v) return "";
 return v.split(",").map((part) => { const [u, d] = part.trim().split(/\s+/); return abs(u, base) + (d ? " " + d : ""); }).join(", ");
}
function absCssUrls(css: string, cssUrl: string): string {
 return css
 .replace(/url\(\s*(['"]?)([^"')]+)\1\s*\)/gi, (m, q, p) => (p.startsWith("data:") || p.startsWith("#") ? m : `url(${q}${abs(p, cssUrl)}${q})`))
 .replace(/@import\s+(['"])([^"']+)\1/gi, (m, q, p) => `@import ${q}${abs(p, cssUrl)}${q}`);
}

export type CaptureOpts = { rewriteLink?: (sameOriginUrl: string) => string | null };
export type Capture = { html: string; origin: string; sourceUrl: string; bytes: number; inlinedSheets: number; links: string[] };

export async function captureSite(url: string, opts: CaptureOpts = {}): Promise<Capture> {
 // SSRF guard: this fetches a user-supplied URL server-side, so reject anything that isn't a plain
 // public web host (localhost, internal TLDs, bare IPs incl. cloud metadata, IPv6) before touching it.
 const safe = safeUrl(url);
 if (!safe) throw new Error("That URL isn’t a valid public website.");
 const sourceUrl = safe.href;
 const origin = safe.origin;
 const res = await fetch(sourceUrl, { headers: UA, signal: AbortSignal.timeout(20000) });
 if (!res.ok) throw new Error(`Couldn't load ${sourceUrl} (${res.status})`);
 const $ = cheerio.load(await res.text());

 // Drop the source CSP — it blocks the cart/interactivity scripts VYA injects.
 $("meta[http-equiv]").each((_: number, el: any) => { if (/content-security-policy/i.test($(el).attr("http-equiv") || "")) $(el).remove(); });

 // Keep the theme's own interactivity JS (accordions, dropdowns, slideshows);
 // strip tracking/analytics + Shopify's checkout/cart pings (we replace those).
 const TRACKERS = /google-analytics|googletagmanager|gtag\/js|connect\.facebook|facebook\.net|fbevents|tiktok|snap\.licdn|pinterest|klaviyo|hotjar|clarity\.ms|doubleclick|criteo|\bbat\.bing|cdn\.shopify\.com\/shopifycloud\/(trekkie|consent)|monorail|web-pixel/i;
 $("script").each((_: number, el: any) => {
 const src = $(el).attr("src") || "";
 const inline = $(el).html() || "";
 if ((src && TRACKERS.test(src)) || /gtag\(|fbq\(|dataLayer|trekkie|window\.Shopify\s*=\s*window\.Shopify.*analytics|web-pixel/i.test(inline)) { $(el).remove(); return; }
 if (src) $(el).attr("src", abs(src, sourceUrl));
 });

 // Inline stylesheets, absolutizing their url()/imports to the source CDN. Retry once
 // on a transient failure so more sheets end up self-contained (truer to the original,
 // and immune to the source CDN later changing/blocking) rather than left hot-linked.
 let inlinedSheets = 0;
 for (const el of $('link[rel="stylesheet"], link[as="style"]').toArray()) {
 const href = $(el).attr("href"); if (!href) continue;
 const cssUrl = abs(href, sourceUrl);
 let css = "";
 for (let attempt = 0; attempt < 2 && !css; attempt++) {
 try { const r = await fetch(cssUrl, { headers: UA, signal: AbortSignal.timeout(12000) }); if (r.ok) css = await r.text(); } catch { /* retry / fall through */ }
 }
 if (css) { $(el).replaceWith(`<style data-vya-src="${cssUrl}">${absCssUrls(css, cssUrl)}</style>`); inlinedSheets++; }
 else $(el).attr("href", cssUrl);
 }
 // Absolutize any inline <style> url()s too.
 $("style").each((_: number, el: any) => { const c = $(el).html(); if (c && /url\(/.test(c)) $(el).text(absCssUrls(c, sourceUrl)); });

 // Images → eager, real source.
 $("img").each((_: number, el: any) => {
 const $el = $(el);
 const cur = $el.attr("src") || "";
 const ds = $el.attr("data-src") || ($el.attr("data-srcset") || "").split(",").pop()?.trim().split(/\s+/)[0];
 if ((!cur || /placeholder|blank|data:image|1x1|lazyload/i.test(cur)) && ds) $el.attr("src", ds);
 $el.attr("src", abs($el.attr("src"), sourceUrl));
 const ss = $el.attr("srcset") || $el.attr("data-srcset"); if (ss) $el.attr("srcset", absSrcset(ss, sourceUrl));
 $el.removeAttr("loading").removeAttr("data-src").removeAttr("data-srcset");
 });
 $("source[srcset], source[data-srcset]").each((_: number, el: any) => { const ss = $(el).attr("srcset") || $(el).attr("data-srcset"); if (ss) $(el).attr("srcset", absSrcset(ss, sourceUrl)).removeAttr("data-srcset"); });
 // Other asset links (favicons, preloaded fonts/images).
 $('link[href]:not([rel="canonical"]):not([rel="alternate"])').each((_: number, el: any) => { const h = $(el).attr("href"); if (h) $(el).attr("href", abs(h, sourceUrl)); });

 // Rewrite anchors: same-origin → the VYA-hosted copy; external → absolute (open out).
 const links = new Set<string>();
 $("a[href]").each((_: number, el: any) => {
 const raw = $(el).attr("href"); if (!raw) return;
 const full = abs(raw, sourceUrl);
 if (!/^https?:/i.test(full)) return;
 if (new URL(full).origin === origin) {
 links.add(full);
 const rewritten = opts.rewriteLink ? opts.rewriteLink(full) : null;
 $(el).attr("href", rewritten ?? full);
 } else {
 $(el).attr("href", full).attr("target", "_blank").attr("rel", "noopener");
 }
 });

 // Neutralize any Shopify add-to-cart forms (e.g. collection-card quick-adds) so
 // they never POST to Shopify. (Product pages get a real VYA button via rewireCommerce.)
 $('form[action*="/cart"]').attr("onsubmit", "return false");

 // Strip <base> if the theme set one (we've absolutized everything ourselves).
 $("base").remove();

 const html = $.html();
 return { html, origin, sourceUrl, bytes: html.length, inlinedSheets, links: [...links] };
}

// ── Crawl an entire site and store every page on VYA ─────────────────────────
// Sitemap-seeded + link-crawl, blacklist filter (skip products/cart/checkout/assets).
// Internal links are rewritten to /site/{slug}/… so the whole site navigates on VYA.
function includePath(p: string): boolean {
 if (/\/(cart|account|search|checkout|login|orders|wishlist)\b/.test(p)) return false;
 if (/\/products\//.test(p)) return false; // individual products → templated + VYA checkout later
 if (/\.(json|xml|pdf|jpe?g|png|gif|webp|svg|css|js|ico)$/i.test(p)) return false;
 if (/\/cdn\//.test(p)) return false;
 return true;
}

export async function crawlAndStore(slug: string, startUrl: string, maxPages = 80): Promise<{ pages: number; paths: string[] }> {
 const safe = safeUrl(startUrl); // SSRF guard on the crawl entry (same as captureSite)
 if (!safe) throw new Error("That URL isn’t a valid public website.");
 const { saveCapturePage, deleteCaptures, getSiteCss, setSiteCss } = await import("./site-capture-db");
 const start = safe.href;
 const origin = new URL(start).origin;
 const linkBase = `/site/${slug}`;
 const rewriteLink = (full: string) => {
 const p = new URL(full).pathname;
 if (/^\/products\//.test(p)) return linkBase + p; // product pages stay on VYA, served on-demand
 return includePath(p) ? linkBase + (p === "/" ? "" : p) : null;
 };

 // Seed from the sitemap (authoritative page list) + the homepage.
 const seed = new Set<string>(["/"]);
 try {
 const root = await fetch(origin + "/sitemap.xml", { headers: UA, signal: AbortSignal.timeout(12000) }).then((r) => r.text());
 const subs = [...root.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&")).filter((u) => /sitemap_(pages|collections|blogs)/.test(u));
 for (const s of subs) {
 const xml = await fetch(s, { headers: UA, signal: AbortSignal.timeout(12000) }).then((r) => r.text());
 for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) { const p = new URL(m[1].replace(/&amp;/g, "&")).pathname; if (includePath(p)) seed.add(p); }
 }
 } catch { /* no sitemap — link crawl still covers it */ }

 // Preserve the store's site-wide custom CSS across a re-crawl (deleteCaptures would
 // otherwise drop its reserved row along with the pages).
 const keepCss = await getSiteCss(slug).catch(() => "");
 await deleteCaptures(slug);
 if (keepCss) await setSiteCss(slug, keepCss).catch(() => {});
 const queue = [...seed];
 const done = new Set<string>();
 const paths: string[] = [];
 while (queue.length && paths.length < maxPages) {
 const path = queue.shift()!;
 if (done.has(path)) continue;
 done.add(path);
 try {
 const cap = await captureSite(origin + path, { rewriteLink });
 await saveCapturePage(slug, path, cap.html, origin + path);
 paths.push(path);
 for (const l of cap.links) { const p = new URL(l).pathname; if (includePath(p) && !done.has(p) && !queue.includes(p)) queue.push(p); }
 } catch { /* skip a page that won't load */ }
 }
 return { pages: paths.length, paths };
}

// ── On-demand product pages with VYA commerce wired in ───────────────────────
// Captures a product page live, then replaces the Shopify add-to-cart form with a
// VYA "Buy" button pointing at VYA's checkout (the Stripe flow we already built).
const linkRewriteFor = (slug: string) => (full: string) => {
 const p = new URL(full).pathname;
 if (/^\/products\//.test(p)) return `/site/${slug}${p}`;
 if (/\/(cart|account|search|checkout|login)\b/.test(p) || /\.(json|xml|css|js|jpe?g|png|webp|svg)$/i.test(p) || /\/cdn\//.test(p)) return null;
 return `/site/${slug}${p === "/" ? "" : p}`;
};

/** Rewire the captured product page's buy area for VYA's (invisible) backend:
 * remove Shopify's Shop-Pay/dynamic checkout, and keep the store's native
 * "Add to cart" + "Buy now" — they run through VYA's Stripe checkout. The buyer
 * never sees "VYA" or "Shop"; they're buying from the store. */
export function rewireCommerce(html: string, buyHref: string | null): string {
 const $ = cheerio.load(html);
 // Strip Shopify's dynamic/Shop-Pay checkout + installments — VYA is the checkout now.
 $('.shopify-payment-button, [data-shopify="payment-button"], .additional-checkout-buttons, shopify-payment-terms, .shopify-payment-terms, shop-pay-wallet-button, [class*="installment"], [class*="shop-pay"], [class*="shop_pay"], .shop-login-button').remove();
 // And keep them gone even if the kept theme JS tries to re-inject them.
 $("head").append('<style data-vya-commerce="1">.shopify-payment-button,shopify-payment-terms,.shopify-payment-terms,shop-pay-wallet-button,.additional-checkout-buttons,[class*="installment"],[class*="shop-pay"],[class*="shop_pay"]{display:none!important;}</style>');

 const sold = !buyHref;
 const itemId = (buyHref || "").match(/item=([\w-]+)/)?.[1] || "";
 const base = "display:block;width:100%;box-sizing:border-box;text-align:center;padding:15px;margin-top:10px;text-transform:uppercase;letter-spacing:.1em;font-size:13px;text-decoration:none;cursor:pointer;";
 const buttons = (cls: string) => sold
 ? `<a href="#" class="${cls}" style="${base}background:#111;color:#fff;border:1px solid #111;opacity:.4;pointer-events:none;">Sold out</a>`
 : `<a href="#" data-vya-add="${itemId}" class="${cls}" style="${base}background:#111;color:#fff;border:1px solid #111;">Add to cart</a><a href="${buyHref}" class="${cls}" style="${base}background:#fff;color:#111;border:1px solid #111;">Buy now</a>`;

 let done = false;
 $('form[action*="/cart"]').each((_: number, el: any) => {
 const $btn = $(el).find('[name="add"], button[type="submit"], .product-form__submit, .add-to-cart, .product__add-to-cart').first();
 const cls = $btn.attr("class") || "";
 if ($btn.length) $btn.replaceWith(buttons(cls)); else $(el).append(buttons(cls));
 $(el).find(".shopify-payment-button").remove();
 $(el).removeAttr("action").attr("onsubmit", "return false");
 done = true;
 });
 if (!done) { const $b = $('button:contains("Add to cart"), button:contains("Add to Cart"), [name="add"]').first(); if ($b.length) $b.replaceWith(buttons($b.attr("class") || "")); }
 return $.html();
}

export async function captureProductPage(slug: string, handle: string, origin: string, buyHref: string | null): Promise<string> {
 const cap = await captureSite(`${origin}/products/${handle}`, { rewriteLink: linkRewriteFor(slug) });
 return rewireCommerce(cap.html, buyHref);
}

// ── Injected VYA cart (drawer + script) for captured pages ───────────────────
// "Add to cart" buttons carry data-vya-add="{itemId}"; this wires them to VYA's
// cart API, shows a slide-in bag, and checks out via the multi-item Stripe flow.
const CART_UI = `
<style>
#vya-cart-btn{position:fixed;bottom:20px;right:20px;z-index:99997;background:#111;color:#fff;border:none;border-radius:30px;padding:13px 20px;font:600 12px/1 system-ui;letter-spacing:.08em;cursor:pointer;text-transform:uppercase}
#vya-cart-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:99998;display:none}
#vya-cart-drawer{position:fixed;top:0;right:-420px;width:380px;max-width:90vw;height:100%;background:#fff;color:#111;z-index:99999;transition:right .25s;display:flex;flex-direction:column;box-shadow:-4px 0 30px rgba(0,0,0,.18);font-family:system-ui}
#vya-cart-drawer.open{right:0}
#vya-cart-drawer .vya-ch{padding:18px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center}
#vya-cart-drawer .vya-items{flex:1;overflow:auto;padding:6px 18px}
#vya-cart-drawer .vya-it{display:flex;gap:12px;padding:14px 0;border-bottom:1px solid #f2f2f2;align-items:center}
#vya-cart-drawer .vya-it img{width:54px;height:70px;object-fit:cover;background:#f4f4f4}
#vya-cart-drawer .vya-cf{padding:18px;border-top:1px solid #eee}
#vya-cart-drawer .vya-co{display:block;width:100%;text-align:center;padding:15px;background:#111;color:#fff;border:none;text-transform:uppercase;letter-spacing:.1em;font-size:13px;cursor:pointer}
</style>
<button id="vya-cart-btn" onclick="VYACart.open()">Bag &middot; <span id="vya-cart-count">0</span></button>
<div id="vya-cart-overlay" onclick="VYACart.close()"></div>
<div id="vya-cart-drawer">
<div class="vya-ch"><b style="text-transform:uppercase;letter-spacing:.1em;font-size:13px">Your bag</b><span onclick="VYACart.close()" style="cursor:pointer">&times;</span></div>
<div class="vya-items" id="vya-cart-items"></div>
<div class="vya-cf"><div style="display:flex;justify-content:space-between;margin-bottom:12px;font-size:14px"><span>Subtotal</span><b id="vya-cart-sub">&mdash;</b></div><button class="vya-co" onclick="VYACart.checkout()">Checkout</button></div>
</div>
<script>
window.VYACart={
 fmt:function(c,cur){return new Intl.NumberFormat("en-US",{style:"currency",currency:cur||"USD"}).format((c||0)/100)},
 add:function(id){if(!id)return;var s=this;fetch("/api/storefront/cart",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({itemId:id})}).then(function(r){return r.json()}).then(function(d){s.paint(d);s.open()})},
 refresh:function(){var s=this;fetch("/api/storefront/cart").then(function(r){return r.json()}).then(function(d){s.paint(d)}).catch(function(){})},
 remove:function(id){var s=this;fetch("/api/storefront/cart",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({itemId:id})}).then(function(r){return r.json()}).then(function(d){s.paint(d)})},
 paint:function(d){document.getElementById("vya-cart-count").textContent=d.count||0;var box=document.getElementById("vya-cart-items");var it=d.items||[];box.innerHTML=it.length?it.map(function(i){return '<div class="vya-it"><img src="'+(i.image||"")+'"><div style="flex:1"><div style="font-size:13px">'+i.title+'</div><div style="font-size:13px;opacity:.6">'+VYACart.fmt(i.priceCents,i.currency)+'</div></div><span data-vya-remove="'+i.id+'" style="cursor:pointer;opacity:.4">&times;</span></div>'}).join(""):'<p style="opacity:.5;padding:40px 0;text-align:center">Your bag is empty</p>';document.getElementById("vya-cart-sub").textContent=VYACart.fmt(d.subtotalCents,(it[0]&&it[0].currency)||"USD");var ids={};it.forEach(function(i){ids[i.id]=1});document.querySelectorAll("[data-vya-add]").forEach(function(b){if(ids[b.getAttribute("data-vya-add")]){b.textContent="In bag ✓";b.setAttribute("data-inbag","1")}else{b.textContent="Add to cart";b.removeAttribute("data-inbag")}})},
 open:function(){document.getElementById("vya-cart-drawer").classList.add("open");document.getElementById("vya-cart-overlay").style.display="block"},
 close:function(){document.getElementById("vya-cart-drawer").classList.remove("open");document.getElementById("vya-cart-overlay").style.display="none"},
 checkout:function(){location.href="/checkout?cart=1"}
};
document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("[data-vya-add]");if(a){e.preventDefault();if(a.getAttribute("data-inbag")){VYACart.open()}else{VYACart.add(a.getAttribute("data-vya-add"))}}var r=e.target.closest&&e.target.closest("[data-vya-remove]");if(r){e.preventDefault();VYACart.remove(r.getAttribute("data-vya-remove"))}});
window.addEventListener("load",function(){VYACart.refresh();document.querySelectorAll('a[href$="/cart"],a[href*="/cart?"]').forEach(function(a){a.addEventListener("click",function(e){e.preventDefault();VYACart.open()})});document.querySelectorAll('form[action*="/cart"]').forEach(function(f){var card=f.closest('li,[class*="card"],[class*="product"],.grid__item');var link=card&&card.querySelector('a[href*="/products/"]');if(link){f.querySelectorAll('button,[name="add"]').forEach(function(b){b.addEventListener("click",function(e){e.preventDefault();location.href=link.getAttribute("href")})})}})});
</script>`;

// ── Live VYA inventory on captured collection pages ──────────────────────────
// Captured /collections/{handle} pages are frozen Shopify HTML showing stale
// products. This replaces that static grid with a live grid of the store's VYA
// items assigned to the collection — styled to inherit the theme (transparent,
// inherited font/colour) so it looks native. Cards add to the injected VYA cart.
export type CollectionCardItem = { id: string; title: string; priceCents: number | null; currency: string | null; images: unknown };
// Common Shopify/theme selectors for the collection product grid.
const GRID_SELECTORS = "#product-grid,ul#product-grid,ul.product-grid,.product-grid,ul.grid--view-items,.grid--view-items,.collection ul.grid,ul.collection__products,.product-list,.collection-products,[class*='product-grid'],[id*='ProductGridContainer'] ul";

function money(cents: number | null, currency: string | null): string {
 if (cents == null) return "";
 try { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(cents / 100); } catch { return `$${Math.round(cents / 100)}`; }
}

export function injectCollectionItems(html: string, items: CollectionCardItem[]): string {
 if (!items.length) return html;
 const $ = cheerio.load(html);
 const cards = items.map((it) => {
  const imgs = Array.isArray(it.images) ? (it.images as unknown[]) : [];
  const img = typeof imgs[0] === "string" ? (imgs[0] as string) : "";
  const bg = img ? `background:#f2f0eb url('${img.replace(/'/g, "%27")}') center/cover;` : "background:#f2f0eb;";
  return `<div style="font-family:inherit;color:inherit"><div style="aspect-ratio:3/4;${bg}"></div><div style="font-size:14px;margin-top:9px;line-height:1.3">${escHtml(it.title || "")}</div><div style="font-size:14px;opacity:.7;margin:2px 0 9px">${money(it.priceCents, it.currency)}</div><a href="#" data-vya-add="${escHtml(it.id)}" style="display:inline-block;font-size:11px;text-transform:uppercase;letter-spacing:.08em;border:1px solid currentColor;padding:8px 15px;text-decoration:none;color:inherit">Add to bag</a></div>`;
 }).join("");
 const grid = `<div data-vya-collection="1" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:26px;padding:26px 0;font-family:inherit;color:inherit">${cards}</div>`;
 const $grid = $(GRID_SELECTORS).first();
 if ($grid.length) {
  $grid.replaceWith(grid);
 } else {
  // Fallback: remove any static product grids, drop the live grid after the page heading.
  $(GRID_SELECTORS).remove();
  const $host = $("main").first().length ? $("main").first() : $("body").first();
  const $h = $host.find("h1,h2").first();
  if ($h.length) $h.after(grid); else $host.prepend(grid);
 }
 return $.html();
}

/** Inject a store's site-wide custom CSS (seller edits applied over time) so it
 * wins over the captured theme. No-op when there's no custom CSS. */
export function injectCss(html: string, css: string): string {
 if (!css || !css.trim()) return html;
 const tag = `<style data-vya-custom="1">${css}</style>`;
 return html.indexOf("</body>") !== -1 ? html.replace("</body>", tag + "</body>") : html + tag;
}

/** Inject the VYA cart drawer + script into a captured page before serving.
 * Also strips the source CSP meta — it would block our inline cart script. */
export function injectCart(html: string): string {
 html = html.replace(/<meta[^>]*http-equiv=["']?content-security-policy["']?[^>]*>/gi, "");
 if (html.indexOf("vya-cart-drawer") !== -1) return html;
 return html.indexOf("</body>") !== -1 ? html.replace("</body>", CART_UI + "</body>") : html + CART_UI;
}

// ── Visual page editor: edit captured pages yourself (Shopify-style) ──────────
// "Editable" things are numbered in document order so the same id maps the same
// element on the client (in-iframe editing) and the server (save): text leaves,
// images, and top-level sections.
function eachEditable($: any, cb: (el: any, eid: number) => void) {
 let eid = 0;
 $("h1,h2,h3,h4,h5,h6,p,li,a,button,blockquote,figcaption,td,th,label,span,strong,em,b,i,small,mark,cite,dt,dd,summary").each((_: number, el: any) => {
 const $el = $(el);
 if ($el.children().length === 0 && $el.text().trim().length > 0) { cb(el, eid); eid++; }
 });
}
function eachImage($: any, cb: (el: any, id: number) => void) {
 let id = 0;
 $("img").each((_: number, el: any) => { if ($(el).attr("src")) { cb(el, id); id++; } });
}
function eachLink($: any, cb: (el: any, id: number) => void) {
 let id = 0;
 $("a[href]").each((_: number, el: any) => { cb(el, id); id++; });
}
function eachSection($: any, cb: (el: any, id: number) => void) {
 // Prefer the theme's own section wrappers; fall back to top-level <section>s; and
 // if a theme uses neither (many don't), treat the top-level structural blocks under
 // <main> (or <body>) as sections — so reorder/duplicate/delete work on any site.
 let base: any[] = $(".shopify-section").toArray();
 if (!base.length) base = $("section").filter((_: number, el: any) => $(el).parents("section").length === 0).toArray();
 if (!base.length) {
  const $host = $("main").first().length ? $("main").first() : $("body").first();
  base = $host.children("section,article,div").filter((_: number, el: any) => {
   const $el = $(el);
   if ($el.is("header,footer,nav,script,style,noscript")) return false;
   if (/^vya-/.test($el.attr("id") || "")) return false; // our injected UI
   // A real content block: carries a heading/paragraph/image/list/button, or non-trivial text.
   return $el.find("h1,h2,h3,h4,h5,h6,p,img,ul,ol,button").length > 0 || $el.text().trim().length > 24;
  }).toArray();
 }
 // Include VYA-added blocks (they may not match the theme's section convention); when any
 // exist, merge them with the theme sections in document order so ids stay stable.
 const added: any[] = $("[data-vya-block]").toArray();
 let list = base;
 if (added.length) {
  const pos = new Map<any, number>(); let n = 0;
  $("*").each((_: number, el: any) => { pos.set(el, n++); });
  const seen = new Set<any>();
  list = [...base, ...added].filter((el) => (seen.has(el) ? false : (seen.add(el), true))).sort((a, b) => (pos.get(a) ?? 0) - (pos.get(b) ?? 0));
 }
 list.forEach((el: any, i: number) => cb(el, i));
}

// A newly-added section. Kept theme-inheriting (transparent bg, inherited font/colour)
// so it blends into the imported site rather than clashing with it.
export type NewBlock = { new: "text" | "image" | "button" | "divider"; text?: string; href?: string };
function escHtml(s: string): string {
 return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
const NEW_BLOCK_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='700'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' fill='%23999' font-family='sans-serif' font-size='28' text-anchor='middle'%3EClick to add an image%3C/text%3E%3C/svg%3E";
export function newBlockHtml(b: NewBlock): string {
 const text = b.text ? String(b.text).slice(0, 2000) : "";
 const href = b.href ? String(b.href).slice(0, 2000) : "#";
 const open = `<div data-vya-block="1" style="padding:44px 24px;font-family:inherit;color:inherit">`;
 switch (b.new) {
  case "text": {
   const [head, ...body] = text.split("\n");
   return `${open}<h2 style="font-family:inherit;color:inherit;margin:0 0 12px">${escHtml(head || "New heading")}</h2><p style="font-family:inherit;color:inherit;margin:0;line-height:1.6">${escHtml(body.join("\n") || "Add your text here.")}</p></div>`;
  }
  case "image":
   return `${open.replace("44px 24px", "0")}<img src="${NEW_BLOCK_IMG}" alt="" style="display:block;width:100%;height:auto"></div>`;
  case "button":
   return `${open}<div style="text-align:center"><a href="${escHtml(href)}" style="display:inline-block;padding:13px 30px;border:1px solid currentColor;color:inherit;text-decoration:none;letter-spacing:.05em">${escHtml(text || "Shop now")}</a></div>`;
  case "divider":
   return `<div data-vya-block="1" style="padding:10px 24px"><hr style="border:none;border-top:1px solid currentColor;opacity:.18;margin:0"></div>`;
  default:
   return "";
 }
}

const EDITOR_JS = `(function(){var td={},dimg={},dlink={},dstyle={},dsecstyle={},struct=0;var style=document.createElement("style");style.textContent='[data-vya-eid]{cursor:text}[data-vya-eid]:hover{outline:1px dashed rgba(93,15,23,.55);outline-offset:2px}[data-vya-eid].vya-ed{outline:2px solid #5D0F17;background:rgba(93,15,23,.05)}[data-vya-img]{cursor:pointer}[data-vya-img]:hover{outline:2px dashed #5D0F17;outline-offset:2px}[data-vya-sec].vya-hi,[data-vya-block].vya-hi{outline:2px solid rgba(93,15,23,.4);outline-offset:-2px}[data-vya-sec].vya-sel,[data-vya-block].vya-sel{outline:2px solid #5D0F17!important;outline-offset:-2px}.vya-del{display:none!important}#vya-eb{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#111;color:#fff;border-radius:30px;padding:8px 10px 8px 18px;display:flex;align-items:center;gap:12px;font:13px system-ui;box-shadow:0 6px 28px rgba(0,0,0,.3)}#vya-eb button{background:#fff;color:#111;border:none;border-radius:20px;padding:8px 16px;font:600 12px system-ui;cursor:pointer}#vya-eb button:disabled{opacity:.5}#vya-sb{position:fixed;z-index:2147483647;display:none;gap:5px}#vya-sb button{background:#111;color:#fff;border:none;border-radius:6px;padding:5px 9px;font:600 11px system-ui;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)}';document.head.appendChild(style);var bar=document.createElement("div");bar.id="vya-eb";bar.innerHTML='<span id="vya-es">Click text to edit · click an image to replace · hover a section to move, duplicate or delete</span><button id="vya-save">Save changes</button>';document.body.appendChild(bar);function st(t){document.getElementById("vya-es").textContent=t}var IMG_PH='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221200%22 height=%22600%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23eee%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%23999%22 font-family=%22sans-serif%22 font-size=%2226%22 text-anchor=%22middle%22%3EClick to add an image%3C/text%3E%3C/svg%3E';var sb=document.createElement("div");sb.id="vya-sb";sb.innerHTML='<button data-a="add">＋ Add</button><button data-a="bg" title="Background color">🎨</button><button data-a="up" title="Move up">↑</button><button data-a="down" title="Move down">↓</button><button data-a="dup">+ Duplicate</button><button data-a="del">× Delete</button>';document.body.appendChild(sb);var secbg=document.createElement("input");secbg.type="color";secbg.style.display="none";document.body.appendChild(secbg);secbg.addEventListener("input",function(){if(!curSec)return;curSec.style.setProperty("background-color",this.value,"important");var si=curSec.getAttribute("data-vya-sec");if(si!==null){dsecstyle[si]=dsecstyle[si]||{};dsecstyle[si]["background-color"]=this.value+" !important"}st("Unsaved changes")});var am=document.createElement("div");am.id="vya-am";am.style.cssText="position:fixed;z-index:2147483647;display:none;flex-direction:column;background:#111;border-radius:8px;padding:5px;box-shadow:0 6px 24px rgba(0,0,0,.3)";am.innerHTML='<button data-b="text">Text block</button><button data-b="image">Image</button><button data-b="button">Button</button><button data-b="divider">Divider</button>';[].slice.call(am.children).forEach(function(b){b.style.cssText="background:transparent;color:#fff;border:none;text-align:left;padding:7px 14px;font:12px system-ui;cursor:pointer;border-radius:5px"});document.body.appendChild(am);var curSec=null;function isSec(n){return n&&n.getAttribute&&(n.getAttribute("data-vya-sec")!==null||n.getAttribute("data-vya-block")!==null)}function secSibs(s){return [].slice.call((s.parentNode||document).children).filter(isSec)}function newBlockEl(t){var d=document.createElement("div");d.setAttribute("data-vya-block","1");d.setAttribute("data-vya-newtype",t);if(t==="text"){d.style.cssText="padding:44px 24px";d.innerHTML='<h2 style="margin:0 0 12px">New heading</h2><p style="margin:0;line-height:1.6">Add your text here.</p>'}else if(t==="image"){d.style.cssText="padding:0";d.innerHTML='<img src="'+IMG_PH+'" style="display:block;width:100%;height:auto">'}else if(t==="button"){d.style.cssText="padding:44px 24px";d.innerHTML='<div style="text-align:center"><a href="#" style="display:inline-block;padding:13px 30px;border:1px solid currentColor;color:inherit;text-decoration:none;letter-spacing:.05em">Shop now</a></div>'}else{d.style.cssText="padding:10px 24px";d.innerHTML='<hr style="border:none;border-top:1px solid currentColor;opacity:.18;margin:0">'}return d}document.addEventListener("mouseover",function(e){var s=e.target.closest&&e.target.closest("[data-vya-sec],[data-vya-block]");if(s&&!s.classList.contains("vya-del")){if(curSec&&curSec!==s)curSec.classList.remove("vya-hi");curSec=s;s.classList.add("vya-hi");var r=s.getBoundingClientRect();sb.style.display="flex";sb.style.top=(Math.max(r.top,4)+4)+"px";sb.style.left=(r.right-290)+"px"}});am.addEventListener("click",function(e){var t=e.target.getAttribute&&e.target.getAttribute("data-b");if(!t||!curSec)return;var el=newBlockEl(t);curSec.parentNode.insertBefore(el,curSec.nextSibling);am.style.display="none";struct=1;st("Unsaved changes")});sb.addEventListener("click",function(e){var a=e.target.getAttribute&&e.target.getAttribute("data-a");if(!a||!curSec)return;var p=curSec.parentNode;if(a==="add"){var ra=curSec.getBoundingClientRect();am.style.display="flex";am.style.top=(Math.max(ra.top,4)+30)+"px";am.style.left=(ra.right-290)+"px";return}if(a==="bg"){var cb=curSec.getAttribute("data-vya-sec")!==null?(dsecstyle[curSec.getAttribute("data-vya-sec")]||{})["background-color"]:null;if(cb&&/^#[0-9a-fA-F]{6}$/.test(cb))secbg.value=cb;secbg.click();return}am.style.display="none";if(a==="del"){curSec.classList.remove("vya-hi");curSec.classList.add("vya-del");sb.style.display="none"}else if(a==="dup"){var c=curSec.cloneNode(true);c.classList.remove("vya-hi");p.insertBefore(c,curSec.nextSibling)}else if(a==="up"||a==="down"){var sibs=secSibs(curSec).filter(function(n){return !n.classList.contains("vya-del")});var i=sibs.indexOf(curSec);var sw=a==="up"?sibs[i-1]:sibs[i+1];if(sw){if(a==="up")p.insertBefore(curSec,sw);else p.insertBefore(sw,curSec);var r2=curSec.getBoundingClientRect();sb.style.top=(Math.max(r2.top,4)+4)+"px"}}struct=1;st("Unsaved changes")});var lk=document.createElement("button");lk.id="vya-lk";lk.textContent="🔗 link";lk.style.cssText="position:fixed;z-index:2147483647;display:none;background:#111;color:#fff;border:none;border-radius:6px;padding:4px 8px;font:600 11px system-ui;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)";document.body.appendChild(lk);var lb=document.createElement("div");lb.id="vya-lb";lb.style.cssText="position:fixed;z-index:2147483647;display:none;gap:6px;background:#111;padding:7px;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.3);align-items:center";lb.innerHTML='<input id="vya-lb-i" placeholder="https://…  or  /page" style="width:230px;border:none;border-radius:5px;padding:6px 8px;font:12px system-ui;outline:none"><button id="vya-lb-s" style="background:#fff;color:#111;border:none;border-radius:5px;padding:6px 11px;font:600 12px system-ui;cursor:pointer">Set link</button><button id="vya-lb-x" style="background:transparent;color:#fff;border:none;font:13px system-ui;cursor:pointer">✕</button>';document.body.appendChild(lb);var curLink=null;document.addEventListener("mouseover",function(e){var a=e.target.closest&&e.target.closest("[data-vya-link]");if(a){curLink=a;var r=a.getBoundingClientRect();lk.style.display="block";lk.style.top=(Math.max(r.top,4)-1)+"px";lk.style.left=(r.right+4)+"px"}else if(e.target!==lk&&lb.style.display==="none"){lk.style.display="none"}});lk.addEventListener("click",function(e){e.preventDefault();if(!curLink)return;var r=curLink.getBoundingClientRect();lb.style.display="flex";lb.style.top=(r.bottom+4)+"px";lb.style.left=Math.max(r.left,8)+"px";var i=document.getElementById("vya-lb-i");i.value=curLink.getAttribute("href")||"";i.focus();lk.style.display="none"});lb.querySelector("#vya-lb-x").addEventListener("click",function(){lb.style.display="none"});lb.querySelector("#vya-lb-s").addEventListener("click",function(){if(!curLink)return;var v=document.getElementById("vya-lb-i").value.trim();curLink.setAttribute("href",v);dlink[curLink.getAttribute("data-vya-link")]=v;lb.style.display="none";st("Unsaved changes")});var tb=document.createElement("div");tb.id="vya-tb";tb.style.cssText="position:fixed;z-index:2147483647;display:none;gap:4px;align-items:center;background:#111;padding:5px 7px;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.3)";tb.innerHTML='<input type="color" id="vya-tb-c" title="Text color" style="width:24px;height:24px;border:none;background:none;padding:0;cursor:pointer"><button data-s="dec" title="Smaller">A-</button><button data-s="inc" title="Larger">A+</button><span style="width:1px;height:16px;background:#555;margin:0 3px"></span><button data-s="left" title="Left">L</button><button data-s="center" title="Center">C</button><button data-s="right" title="Right">R</button>';[].slice.call(tb.querySelectorAll("button")).forEach(function(b){b.style.cssText="background:#fff;color:#111;border:none;border-radius:5px;padding:4px 8px;font:600 11px system-ui;cursor:pointer"});document.body.appendChild(tb);var curTxt=null;function recTxt(css,val){if(!curTxt)return;curTxt.style.setProperty(css,val,"important");var eid=curTxt.getAttribute("data-vya-eid");dstyle[eid]=dstyle[eid]||{};dstyle[eid][css]=val+" !important";st("Unsaved changes")}function showTb(el){var r=el.getBoundingClientRect();var above=r.top>52;tb.style.display="flex";tb.style.top=(above?(r.top-42):(r.bottom+8))+"px";tb.style.left=Math.min(Math.max(r.left,8),(window.innerWidth||1200)-268)+"px";try{var m=getComputedStyle(el).color.match(/\\d+/g);if(m)document.getElementById("vya-tb-c").value="#"+m.slice(0,3).map(function(x){return("0"+parseInt(x,10).toString(16)).slice(-2)}).join("")}catch(e){}}document.getElementById("vya-tb-c").addEventListener("input",function(){recTxt("color",this.value)});tb.addEventListener("click",function(e){var s=e.target.getAttribute&&e.target.getAttribute("data-s");if(!s||!curTxt)return;if(s==="inc"||s==="dec"){var cur=parseFloat(getComputedStyle(curTxt).fontSize)||16;var nx=Math.max(10,Math.min(96,cur+(s==="inc"?2:-2)));recTxt("font-size",nx+"px")}else{recTxt("text-align",s)}});var fi=document.createElement("input");fi.type="file";fi.accept="image/*";fi.style.display="none";document.body.appendChild(fi);var pend=null;fi.addEventListener("change",function(){var f=fi.files[0];if(!f||!pend)return;st("Uploading…");var fd=new FormData();fd.append("file",f);fetch("/api/store/assets",{method:"POST",body:fd}).then(function(r){return r.json()}).then(function(d){if(d.url){pend.setAttribute("src",d.url);pend.removeAttribute("srcset");dimg[pend.getAttribute("data-vya-img")]=d.url;st("Unsaved changes")}else st(d.error||"Upload failed");pend=null;fi.value=""}).catch(function(){st("Upload failed")})});document.addEventListener("click",function(e){if(e.target.closest&&e.target.closest("#vya-tb,#vya-sb,#vya-am,#vya-lb,#vya-eb,#vya-lk"))return;var sec=e.target.closest&&e.target.closest("[data-vya-sec],[data-vya-block]");if(sec)selectSection(sec);var im=e.target.closest&&e.target.closest("[data-vya-img]");if(im){e.preventDefault();pend=im;fi.click();return}var ed=e.target.closest&&e.target.closest("[data-vya-eid]");if(ed){e.preventDefault();ed.setAttribute("contenteditable","true");ed.classList.add("vya-ed");ed.focus();curTxt=ed;showTb(ed);return}var a=e.target.closest&&e.target.closest("a");if(a){e.preventDefault();return}tb.style.display="none"});document.addEventListener("input",function(e){var ed=e.target.closest&&e.target.closest("[data-vya-eid]");if(ed){td[ed.getAttribute("data-vya-eid")]=ed.textContent;st("Unsaved changes")}});document.getElementById("vya-save").addEventListener("click",function(){var edits=Object.keys(td).map(function(k){return{eid:parseInt(k,10),text:td[k]}});var images=Object.keys(dimg).map(function(k){return{id:parseInt(k,10),src:dimg[k]}});var links=Object.keys(dlink).map(function(k){return{id:parseInt(k,10),href:dlink[k]}});var styles=Object.keys(dstyle).map(function(k){var o=dstyle[k],s="";for(var pk in o)s+=pk+":"+o[pk]+";";return{eid:parseInt(k,10),style:s}});var secStyles=Object.keys(dsecstyle).map(function(k){var o=dsecstyle[k],s="";for(var pk in o)s+=pk+":"+o[pk]+";";return{sec:parseInt(k,10),style:s}});var sections=null;if(struct){sections=[].slice.call(document.querySelectorAll("[data-vya-sec],[data-vya-block]")).filter(function(el){return !el.classList.contains("vya-del")}).map(function(el){var si=el.getAttribute("data-vya-sec");if(si!==null)return parseInt(si,10);var t=el.getAttribute("data-vya-newtype")||"text";var o={"new":t};if(t==="text"){var h=el.querySelector("h2"),pp=el.querySelector("p");o.text=((h?h.textContent:"New heading")+"\\n"+(pp?pp.textContent:"")).replace(/\\n$/,"")}else if(t==="button"){var aa=el.querySelector("a");if(aa){o.text=aa.textContent||"Shop now";o.href=aa.getAttribute("href")||"#"}}return o})}if(!edits.length&&!images.length&&!links.length&&!styles.length&&!secStyles.length&&!sections){st("No changes yet");return}var b=this;b.disabled=true;st("Saving…");fetch("/api/store/capture/edit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:window.__VYA_EDIT.path,edits:edits,images:images,links:links,styles:styles,secStyles:secStyles,sections:sections})}).then(function(r){return r.json()}).then(function(d){b.disabled=false;if(d.ok){st("Saved ✓");if(window.parent!==window)window.parent.postMessage({vya:"saved"},"*");setTimeout(function(){location.reload()},700)}else st(d.error||"Save failed")}).catch(function(){b.disabled=false;st("Save failed")})});function selectSection(sec){var fields=[];sec.querySelectorAll("[data-vya-eid]").forEach(function(el){if((el.textContent||"").trim())fields.push({kind:"text",eid:parseInt(el.getAttribute("data-vya-eid"),10),value:el.textContent.trim(),tag:el.tagName.toLowerCase()})});sec.querySelectorAll("[data-vya-img]").forEach(function(el){fields.push({kind:"image",id:parseInt(el.getAttribute("data-vya-img"),10),src:el.getAttribute("src")})});sec.querySelectorAll("[data-vya-link]").forEach(function(el){fields.push({kind:"link",id:parseInt(el.getAttribute("data-vya-link"),10),href:el.getAttribute("href")||"",label:(el.textContent||"").trim().slice(0,50)})});document.querySelectorAll(".vya-sel").forEach(function(x){x.classList.remove("vya-sel")});sec.classList.add("vya-sel");var si=sec.getAttribute("data-vya-sec");if(window.parent!==window)window.parent.postMessage({vya:"section",index:si!==null?parseInt(si,10):-1,fields:fields},"*")}window.addEventListener("message",function(e){var d=e.data||{};if(!d||!d.vya)return;if(d.vya==="set"){if(d.kind==="text"){var el=document.querySelector('[data-vya-eid="'+d.eid+'"]');if(el){el.textContent=d.value;td[d.eid]=d.value}}else if(d.kind==="image"){var im=document.querySelector('[data-vya-img="'+d.id+'"]');if(im){im.setAttribute("src",d.src);im.removeAttribute("srcset");dimg[d.id]=d.src}}else if(d.kind==="link"){var a=document.querySelector('[data-vya-link="'+d.id+'"]');if(a){a.setAttribute("href",d.href);dlink[d.id]=d.href}}st("Unsaved changes");if(window.parent!==window)window.parent.postMessage({vya:"unsaved"},"*")}else if(d.vya==="save"){document.getElementById("vya-save").click()}else if(d.vya==="scrollto"){var t=document.querySelector('[data-vya-sec="'+d.index+'"]');if(t)t.scrollIntoView({behavior:"smooth",block:"center"})}});})();`;

/** Serve a captured page in EDIT mode: tag editable text/images/sections + inject the editor. */
export function prepareEditMode(html: string, slug: string, path: string): string {
 const $ = cheerio.load(html);
 $("meta[http-equiv]").each((_: number, el: any) => { if (/content-security-policy/i.test($(el).attr("http-equiv") || "")) $(el).remove(); });
 eachEditable($, (el, eid) => $(el).attr("data-vya-eid", String(eid)));
 eachImage($, (el, id) => $(el).attr("data-vya-img", String(id)));
 eachLink($, (el, id) => $(el).attr("data-vya-link", String(id)));
 eachSection($, (el, id) => $(el).attr("data-vya-sec", String(id)));
 const inject = `<script>window.__VYA_EDIT=${JSON.stringify({ slug, path })};</script><script>${EDITOR_JS}</script>`;
 const out = $.html();
 return out.indexOf("</body>") !== -1 ? out.replace("</body>", inject + "</body>") : out + inject;
}

// Only these CSS properties may be set via the visual style controls (defense-in-depth —
// values are also scrubbed of url()/expression/etc.). Anything else is dropped.
const STYLE_ALLOW = new Set(["color", "background-color", "background", "font-size", "text-align", "font-weight", "font-style", "letter-spacing", "line-height", "padding", "padding-top", "padding-bottom", "padding-left", "padding-right", "margin-top", "margin-bottom", "text-transform", "font-family", "border-radius"]);
export function sanitizeStyle(style: string): string {
 return String(style).split(";").map((d) => {
  const i = d.indexOf(":"); if (i < 1) return "";
  const k = d.slice(0, i).trim().toLowerCase();
  const v = d.slice(i + 1).trim();
  if (!STYLE_ALLOW.has(k)) return "";
  if (!v || /[<>{}]|url\(|expression|javascript:|@import/i.test(v)) return "";
  return `${k}:${v.slice(0, 120)}`;
 }).filter(Boolean).join(";");
}
function mergeStyle(existing: string, incoming: string): string {
 const map = new Map<string, string>();
 const parse = (s: string) => s.split(";").forEach((d) => { const i = d.indexOf(":"); if (i > 0) { const k = d.slice(0, i).trim().toLowerCase(); const v = d.slice(i + 1).trim(); if (k && v) map.set(k, v); } });
 parse(existing); parse(incoming);
 return [...map].map(([k, v]) => `${k}:${v}`).join(";");
}

export type PageEdits = {
 edits?: { eid: number; text: string }[];
 images?: { id: number; src: string }[];
 links?: { id: number; href: string }[];
 styles?: { eid: number; style: string }[];   // inline style deltas on text elements
 secStyles?: { sec: number; style: string }[]; // inline style deltas on sections (e.g. background)
 // The full desired order of sections. A NUMBER entry references the ORIGINAL section
 // index (0-based, document order): reorder = indices shuffled, duplicate = index repeated,
 // delete = index omitted. A NewBlock entry inserts a brand-new theme-inheriting section at
 // that position. Applied after text/image edits so those are kept.
 sections?: (number | NewBlock)[];
 // Legacy (superseded by `sections`); still honored so older clients don't break.
 deleteSecs?: number[];
 dupSecs?: number[];
};

/** Apply the seller's edits (text / images / section reorder+duplicate+delete) back into the stored HTML. */
export function applyEdits(html: string, p: PageEdits): string {
 const $ = cheerio.load(html);
 const tmap = new Map((p.edits || []).map((e) => [e.eid, e.text]));
 if (tmap.size) eachEditable($, (el, eid) => { if (tmap.has(eid)) $(el).text(tmap.get(eid) as string); });
 const smap = new Map((p.styles || []).map((e) => [e.eid, sanitizeStyle(e.style)]));
 if (smap.size) eachEditable($, (el, eid) => { const s = smap.get(eid); if (s) $(el).attr("style", mergeStyle($(el).attr("style") || "", s)); });
 const imap = new Map((p.images || []).map((e) => [e.id, e.src]));
 if (imap.size) eachImage($, (el, id) => { if (imap.has(id)) $(el).attr("src", imap.get(id) as string).removeAttr("srcset"); });
 const lmap = new Map((p.links || []).map((e) => [e.id, e.href]));
 if (lmap.size) eachLink($, (el, id) => { if (lmap.has(id)) $(el).attr("href", lmap.get(id) as string); });
 // Section styles (e.g. background) — applied before the reorder/rebuild so they ride along.
 const ssmap = new Map((p.secStyles || []).map((e) => [e.sec, sanitizeStyle(e.style)]));
 if (ssmap.size) eachSection($, (el, id) => { const s = ssmap.get(id); if (s) $(el).attr("style", mergeStyle($(el).attr("style") || "", s)); });

 if (Array.isArray(p.sections)) {
 // Snapshot the current sections (post text/image edits) and rebuild the parent's
 // section run in the requested order — one pass handles reorder, duplicate, delete,
 // and inserting brand-new blocks.
 const secs: any[] = [];
 eachSection($, (el) => secs.push(el));
 const rebuilt = p.sections.map((entry) => (typeof entry === "number" ? (secs[entry] ? $.html(secs[entry]) : "") : newBlockHtml(entry))).join("");
 if (secs.length) {
 const $mark = $('<div id="__vya_secmark__"></div>');
 $(secs[0]).before($mark);
 secs.forEach((el) => $(el).remove());
 $mark.replaceWith(rebuilt);
 } else if (rebuilt) {
 const $host = $("main").first().length ? $("main").first() : $("body").first();
 $host.append(rebuilt);
 }
 } else {
 // Legacy path: independent duplicate/delete by index.
 const dup = new Set(p.dupSecs || []), del = new Set(p.deleteSecs || []);
 if (dup.size || del.size) {
 const secs: any[] = [];
 eachSection($, (el) => secs.push(el));
 dup.forEach((id) => { if (secs[id]) $(secs[id]).after($.html(secs[id])); });
 del.forEach((id) => { if (secs[id]) $(secs[id]).remove(); });
 }
 }
 return $.html();
}
