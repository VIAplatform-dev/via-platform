/* eslint-disable @typescript-eslint/no-explicit-any */
// High-fidelity site capture (the "keep their exact design" engine). We fetch a
// store's real page, inline its stylesheets (absolutizing every url() to the source
// CDN), point images/fonts at their real source, and rewrite same-origin LINKS to
// the VYA-hosted copy — so the whole site can be navigated on VYA, pixel-faithful.
// (JS is stripped for v1: looks identical; interactivity + cart + AI editing next.)
import * as cheerio from "cheerio";
// domhandler's Element, not the DOM one — these helpers operate on cheerio nodes.
import type { Element as DomElement } from "domhandler";
// Relative, not the "@/app" alias: Node's native TS test runner doesn't read tsconfig paths
// (this file's own test — site-capture.test.ts — otherwise fails to load under `node --test`).
import { assertPublicUrl, safeFetch } from "./safe-url.ts";
import { CAPTURE_SHIM } from "./capture-shim.ts";
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

// Same site even across the www/apex split (a store links between tousvintage.com and
// www.tousvintage.com) — so those internal links get VYA-hosted, not opened as "external".
function sameSite(a: string, base: string): boolean {
 try { return new URL(a).host.replace(/^www\./i, "") === new URL(base).host.replace(/^www\./i, ""); }
 catch { return false; }
}

// Strip Shopify-platform chrome so a captured page reads as the store's OWN site on VYA —
// not "Powered by Shopify", the Shop Pay "Follow on shop" button, or the checkout card badges.
// (These are Shopify features, not the seller's brand; they don't belong on a VYA-hosted mirror.)
/** Remove matches of `selector`, but NEVER a page landmark or anything wrapping the site's own
 * navigation. Themes flag which features a section has with MODIFIER classes on the container
 * itself — Dawn puts `header--has-localization` on the whole <header> — so a substring selector
 * aimed at a small widget (`[class*="localization"]`) otherwise matches that flag and deletes the
 * entire header, nav and logo with it. (That was a real bug: captured Dawn stores lost their whole
 * nav row.) Widgets we actually want gone are still removed by their own precise selectors, since
 * they're descendants of the landmark rather than the landmark itself. */
function removeChrome($: cheerio.CheerioAPI, selector: string): void {
 $(selector).each((_: number, el: any) => {
  const tag = String(el.tagName || "").toLowerCase();
  // Never delete a structural landmark…
  if (tag === "html" || tag === "body" || tag === "header" || tag === "main" || tag === "footer" || tag === "nav") return;
  // …nor any wrapper that contains the store's navigation…
  if ($(el).find('nav, [class*="inline-menu"], [class*="header__menu"], [class*="menu-drawer"]').length) return;
  // …nor a SHARED container that also holds real storefront controls. Blummier's theme hangs
  // `header-localization` on the same <div class="header__icons"> that carries search, account,
  // wishlist and cart — deleting it took the whole icon bar with it. Only the currency/locale
  // widget itself should go; anything hosting other controls stays.
  // (Match real destinations — cart/account links, a search FORM — not a bare "icon-search" class:
  // Shopify's own country picker ships a search icon for filtering the country list, so a looser
  // check would protect the very widget we're trying to remove.)
  if ($(el).find('[class*="icon-cart"], [class*="icon-account"], a[href*="/cart"], a[href*="/account"], form[action*="/search"], predictive-search').length) return;
  $(el).remove();
 });
}

export function deShopify($: cheerio.CheerioAPI): void {
 // Footer payment-method badges (Visa/Amex/etc.) are KEPT: they're part of the store's own footer
 // design, and dropping them left an obviously empty strip where the source has a row of cards.
 // (They're decorative images, not a live Shopify checkout — VYA's Stripe checkout is what actually
 // runs. If the badge row ever needs to match VYA's real accepted methods, do that as a swap here
 // rather than by deleting the row.)
 // "Follow on shop" / Shop Pay follow / Shop login buttons.
 removeChrome($, 'shop-follow-button, [class*="follow-on-shop"], [class*="follow_on_shop"], .shopify-follow-on-shop, .shop-login-button, [class*="shop-follow"]');
 // Shopify "Markets" country/region + language selector — it clones onto VYA but has no
 // currency/geo backend behind it, so it's dead UI that implies a feature we don't have. Remove it.
 // Target the WIDGET classes ("localization-form__…", "localization-selector", the wrappers Dawn
 // gives the picker) — never a bare `*="localization"`, which also matches `header--has-localization`.
 removeChrome($, 'localization-form, .shopify-localization-form, form[action*="/localization"], .footer__localization, .localization-wrapper, .desktop-localization-wrapper, .header-localization, .menu-drawer__localization, [class*="localization-form"], [class*="localization-selector"], [class*="localization-toggle"], [class*="header__icons--localization"], [class*="country-selector"], [class*="currency-selector"], [class*="language-selector"], [data-disclosure]');
 // "Powered by Shopify" link — remove it entirely. We show our own fixed "Powered by VYA" badge
 // (injectPoweredBy) instead, so no inline credit is needed in the seller's footer.
 $('a[href*="shopify.com"]').each((_: number, el: any) => { const $el = $(el); if (/shopify/i.test($el.text() || "")) $el.remove(); });
 // Clean the footer/copyright text: strip any leftover "Powered by Shopify", and remove a stray
 // trailing "VYA" that older captures left behind (they swapped the powered-by link for the bare
 // word "VYA", producing "© 2026, Store VYA"). Only touch copyright-looking lines.
 $('footer, [class*="footer"], [class*="copyright"], small').contents().each((_: number, node: any) => {
 if (node.type !== "text" || !node.data) return;
 let t = node.data.replace(/\s*powered by shopify\s*/gi, " ");
 // Older captures swapped the whole "Powered by Shopify" link for the bare word "VYA", which lands
 // as its OWN text node next to the copyright ("© 2026, Store" + "VYA"). Drop a lone-VYA node, and
 // also a trailing "VYA" on the copyright line itself.
 if (/^[\s·•|,–—-]*VYA[\s·•|,–—-]*$/.test(t)) t = "";
 else if (/©|\b20\d{2}\b/.test(t)) t = t.replace(/[\s·•|,–—-]*\bVYA\b\s*$/, "");
 node.data = t.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/, "");
 });
}

// String wrapper around deShopify for the live serve path (which works on HTML strings, not a
// cheerio $). Cleans Shopify chrome on already-captured pages so the live site matches the editor.
export function cleanShopifyChrome(html: string): string {
 const $ = cheerio.load(html);
 deShopify($);
 return $.html();
}

// Make a captured page's images render WITHOUT the JS we stripped. Lazy themes (lazysizes et al.)
// hide the real image behind script: a <noscript> fallback for backgrounds, a {width}-templated
// data-src for responsive images, and a `.lazyload{opacity:0}` reveal-on-load. This undoes all
// three so heroes and product photos actually show. Exported for unit testing.
export function deLazy($: cheerio.CheerioAPI, sourceUrl: string): void {
 // 1) Surface <noscript><img></noscript> fallbacks (what a no-JS client — us — is meant to get).
 //    Skip when a lazy <img> counterpart already precedes it (promoted below), to avoid a dupe.
 $("noscript").each((_: number, el: any) => {
 const $el = $(el);
 const inner = $el.html() || "";
 if (!/<img/i.test(inner)) return; // leave "please enable JS" notices hidden
 const prev = $el.prev();
 if (prev.is("img") || prev.find("img").length > 0) { $el.remove(); return; }
 $el.replaceWith(inner);
 });

 // 2) Images → eager + real source, filling lazysizes RIAS {width} templates with a concrete
 //    size (data-widths is the ladder) so the src isn't literally "..._{width}x.jpg" (a 404).
 $("img").each((_: number, el: any) => {
 const $el = $(el);
 // Pick a real rung from the theme's declared ladder (some CDNs only serve pre-generated sizes):
 // the largest width ≤ 1200, else the smallest available, else a safe default.
 const widths = ($el.attr("data-widths") || "").match(/\d+/g)?.map(Number) || [];
 const under = widths.filter((x) => x <= 1200);
 const w = under.length ? Math.max(...under) : widths.length ? Math.min(...widths) : 900;
 const fill = (u?: string) => (u || "").replace(/\{width\}/gi, String(w));
 const cur = $el.attr("src") || "";
 const ds = $el.attr("data-src") || ($el.attr("data-srcset") || "").split(",").pop()?.trim().split(/\s+/)[0];
 if ((!cur || /placeholder|blank|data:image|1x1|lazyload/i.test(cur)) && ds) $el.attr("src", ds);
 $el.attr("src", abs(fill($el.attr("src")), sourceUrl));
 const ss = $el.attr("srcset") || $el.attr("data-srcset"); if (ss) $el.attr("srcset", absSrcset(fill(ss), sourceUrl));
 $el.removeAttr("loading").removeAttr("data-src").removeAttr("data-srcset").removeAttr("data-widths").removeAttr("data-sizes");
 // Fade-in themes leave a promoted image at opacity:0 (the JS that adds `lazyloaded` never runs).
 if (/lazyload/.test($el.attr("class") || "")) $el.removeClass("lazyload lazyloading").addClass("lazyloaded");
 });

 // 3) Lazy BACKGROUND images (bgset): a hero/promo <div data-bgset> painted by JS → apply the real
 //    image as an inline background. Skip when an unwrapped <noscript> img already covers the slot.
 $("[data-bgset], [data-bg], [data-background]").each((_: number, el: any) => {
 const $el = $(el);
 if ($el.next().is("img")) return;
 const raw = ($el.attr("data-bgset") || $el.attr("data-bg") || $el.attr("data-background") || "").trim();
 if (!raw) return;
 const cand = raw.split(",").map((c) => c.trim().split(/\s+/)[0]).filter(Boolean);
 const pick = (cand[cand.length - 1] || raw.split(/\s+/)[0] || "").replace(/\{width\}/gi, "1600");
 const url = abs(pick, sourceUrl);
 if (!url || /^data:/i.test(url)) return;
 const style = $el.attr("style") || "";
 if (!/background-image/i.test(style)) $el.attr("style", `${style}${style && !/;\s*$/.test(style) ? ";" : ""}background-image:url('${url}');background-size:cover;background-position:center;`);
 $el.removeClass("lazyload lazyloading").addClass("lazyloaded");
 });
}

export type CaptureOpts = { rewriteLink?: (sameOriginUrl: string) => string | null };
export type Capture = { html: string; origin: string; sourceUrl: string; bytes: number; inlinedSheets: number; links: string[] };

export async function captureSite(url: string, opts: CaptureOpts = {}): Promise<Capture> {
 // SSRF guard: this fetches a user-supplied URL server-side, so reject anything that isn't a plain
 // public web host (localhost, internal TLDs, bare IPs incl. cloud metadata, IPv6) before touching it.
 const safe = await assertPublicUrl(url); // DNS-resolves + rejects internal IPs (SSRF)
 if (!safe) throw new Error("That URL isn’t a valid public website.");
 const sourceUrl = safe.href;
 const origin = safe.origin;
 const res = await safeFetch(sourceUrl, { headers: UA, signal: AbortSignal.timeout(20000) });
 if (!res.ok) throw new Error(`Couldn't load ${sourceUrl} (${res.status})`);
 const $ = cheerio.load(await res.text());

 // Drop the source CSP — it blocks the cart/interactivity scripts VYA injects.
 $("meta[http-equiv]").each((_: number, el: any) => { if (/content-security-policy/i.test($(el).attr("http-equiv") || "")) $(el).remove(); });

 // SECURITY: strip ALL scripts. Re-hosting a third party's JS on the vyaplatform.com origin would
 // let it act as any logged-in buyer/admin who opens the page (stored XSS with the victim's cookies).
 // VYA re-adds its own cart/editor JS at SERVE time, so nothing of ours is lost — captured sites are
 // served static (which is the v1 intent anyway). Also drop inline event handlers + javascript: URLs,
 // the other ways captured markup can execute in our origin.
 $("script").remove();
 $("*").each((_: number, el: any) => {
 const attribs = el.attribs || {};
 for (const name of Object.keys(attribs)) {
 if (/^on/i.test(name)) { $(el).removeAttr(name); continue; }
 if ((name === "href" || name === "src" || name === "xlink:href") && /^\s*javascript:/i.test(attribs[name] || "")) $(el).removeAttr(name);
 }
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
 try { const r = await safeFetch(cssUrl, { headers: UA, signal: AbortSignal.timeout(12000) }); if (r.ok) css = await r.text(); } catch { /* retry / fall through */ }
 }
 if (css) { $(el).replaceWith(`<style data-vya-src="${cssUrl}">${absCssUrls(css, cssUrl).replace(/<\//g, "<\\/")}</style>`); inlinedSheets++; }
 else $(el).attr("href", cssUrl);
 }
 // Absolutize any inline <style> url()s too.
 $("style").each((_: number, el: any) => { const c = $(el).html(); if (c && /url\(/.test(c)) $(el).text(absCssUrls(c, sourceUrl)); });

 // Images → eager, real source; undo lazy-load (noscript fallbacks, {width} templates, opacity:0).
 deLazy($, sourceUrl);
 $("source[srcset], source[data-srcset]").each((_: number, el: any) => { const ss = $(el).attr("srcset") || $(el).attr("data-srcset"); if (ss) $(el).attr("srcset", absSrcset(ss, sourceUrl)).removeAttr("data-srcset"); });
 // Other asset links (favicons, preloaded fonts/images).
 $('link[href]:not([rel="canonical"]):not([rel="alternate"])').each((_: number, el: any) => { const h = $(el).attr("href"); if (h) $(el).attr("href", abs(h, sourceUrl)); });

 // Rewrite anchors: same-origin → the VYA-hosted copy; external → absolute (open out).
 const links = new Set<string>();
 $("a[href]").each((_: number, el: any) => {
 const raw = $(el).attr("href"); if (!raw) return;
 const full = abs(raw, sourceUrl);
 if (!/^https?:/i.test(full)) return;
 if (sameSite(full, origin)) {
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

 // Safety net: lazy themes ship `.lazyload{opacity:0}` and reveal via JS we've stripped — force
 // any element that never got flipped to visible so nothing stays invisibly transparent.
 $("head").append('<style data-vya-lazy="1">.lazyload,.lazyloading,.js-lazy-image,[data-bgset]{opacity:1!important}</style>');

 // Remove Shopify-platform chrome (payment badges, "Follow on shop", "Powered by Shopify").
 deShopify($);

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
 const safe = await assertPublicUrl(startUrl); // DNS-resolves + rejects internal IPs (SSRF)
 if (!safe) throw new Error("That URL isn’t a valid public website.");
 const { saveCapturePage, deleteCaptures, getSiteCss, setSiteCss } = await import("./site-capture-db.ts");
 const start = safe.href;
 const origin = new URL(start).origin;
 // Never mirror VYA's own app. Importing a getvya.ai / vyaplatform.com URL (including a store's own
 // VYA storefront address) would clone our marketplace/404 pages instead of the seller's real site.
 const host = new URL(start).host.toLowerCase().replace(/^www\./, "");
 if (host === "vyaplatform.com" || host.endsWith(".vyaplatform.com") || host === "getvya.ai" || host.endsWith(".getvya.ai")) {
 throw new Error("That's a VYA address — paste your store's own website (e.g. yourstore.com or your-store.myshopify.com).");
 }
 const linkBase = `/site/${slug}`;
 const rewriteLink = (full: string) => {
 const p = new URL(full).pathname;
 if (/^\/products\//.test(p)) return linkBase + p; // product pages stay on VYA, served on-demand
 // Account/login/orders → VYA's saved-items page, never the seller's old Shopify account.
 if (/^\/(account|login|orders|customer)(\/|$|\?)/.test(p)) return `${linkBase}/favorites`;
 if (/^\/cart(\/|$|\?)/.test(p)) return `${linkBase}/cart`; // the injected cart drawer intercepts /cart links
 return includePath(p) ? linkBase + (p === "/" ? "" : p) : null;
 };

 // Seed from the sitemap (authoritative page list) + the homepage.
 const seed = new Set<string>(["/"]);
 try {
 const root = await safeFetch(origin + "/sitemap.xml", { headers: UA, signal: AbortSignal.timeout(12000) }).then((r) => r.text());
 const subs = [...root.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&")).filter((u) => /sitemap_(pages|collections|blogs)/.test(u));
 for (const s of subs) {
 const xml = await safeFetch(s, { headers: UA, signal: AbortSignal.timeout(12000) }).then((r) => r.text());
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
 if (/^\/(account|login|orders|customer)(\/|$|\?)/.test(p)) return `/site/${slug}/favorites`; // → VYA, not Shopify account
 if (/^\/cart(\/|$|\?)/.test(p)) return `/site/${slug}/cart`; // injected cart drawer intercepts /cart links
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
export type CollectionCardItem = { id: string; title: string; priceCents: number | null; currency: string | null; images: unknown; sourceId?: string | null };
// Common Shopify/theme selectors for the collection product grid.
const GRID_SELECTORS = "#product-grid,ul#product-grid,ul.product-grid,.product-grid,ul.grid--view-items,.grid--view-items,.collection ul.grid,ul.collection__products,.product-list,.collection-products,[class*='product-grid'],[id*='ProductGridContainer'] ul";

function money(cents: number | null, currency: string | null): string {
 if (cents == null) return "";
 try { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(cents / 100); } catch { return `$${Math.round(cents / 100)}`; }
}

const CARD_CHILD_SELECTOR = "li, .grid__item, .card-wrapper, [class*='product-card']";

/** Does this element look like ONE product card? Structure, not class names: a card shows a
 *  picture, links somewhere, and says something. */
function looksLikeCard($: cheerio.CheerioAPI, el: DomElement): boolean {
 const $el = $(el);
 if ($el.find("img").length === 0) return false;
 if ($el.find("a[href]").length === 0) return false;
 return ($el.text() || "").trim().length > 0;
}

/**
 * The page's REAL product grids, in document order — found STRUCTURALLY.
 *
 * The first version of this matched Shopify/Dawn class names (`product-grid`, `grid--view-items`,
 * `collection__products`…). Measured against a corpus of 20 live storefronts it found a grid on
 * only 6 — every non-Dawn theme (Prestige, Editions, Exhibit, Vessel, Dwell, Squarespace,
 * BigCommerce, WooCommerce) fell through to a generic substitute grid that looked nothing like the
 * store it was mirroring. Class names are a per-theme detail; what every product grid has in common
 * is its SHAPE: a container whose children are mostly little blocks that each hold an image, a link
 * and some text. So that's what we look for, and the class list survives only as a tie-breaker.
 */
function productGrids($: cheerio.CheerioAPI): DomElement[] {
 const candidates: { el: DomElement; cards: number }[] = [];
 $("ul, ol, div, section").each((_, el) => {
  const $el = $(el);
  const cls = `${$el.attr("class") || ""} ${$el.attr("id") || ""}`.toLowerCase();
  // Navigation, pagination and social rows are lists of links-with-icons — structurally very close
  // to a product grid, so they're excluded by name AND by where they sit. Checking only the
  // element's own class missed a bare <ul> inside <nav>, which would have had the store's menu
  // replaced with products.
  if (/pagination|breadcrumb|menu|nav|social|footer|header|announcement/.test(cls)) return;
  if ($el.closest("nav, header, footer, [role='navigation']").length > 0) return;
  const kids = $el.children().toArray() as DomElement[];
  const named = $el.is(GRID_SELECTORS);
  // An unnamed container needs at least two children before it can plausibly be a grid; a
  // container that literally calls itself a product grid is trusted with one, so a collection
  // holding a single piece — normal for one-of-one vintage — still renders in the theme's layout.
  if (kids.length < (named ? 1 : 2)) return;
  const cards = kids.filter((k) => looksLikeCard($, k)).length;
  // Most of the container's children must be cards, so a page wrapper that happens to contain a
  // grid doesn't qualify on the strength of its one grid child. Three is the confident threshold;
  // two is accepted only when the container also NAMES itself a product grid, which keeps small
  // collections working without letting any two-image row qualify.
  const enough = cards >= 3 || (cards >= 1 && named);
  if (enough && cards >= kids.length * 0.6) candidates.push({ el, cards });
 });
 // Keep only the innermost matches: if one candidate contains another, the child is the real grid.
 return candidates
  .filter(({ el }) => !candidates.some((o) => o.el !== el && $(el).find(o.el).length > 0))
  .map((c) => c.el);
}

/** Which collection each product grid on a captured page belongs to, in document order.
 *
 *  A homepage typically carries several grids ("New in", "Archive", "Shop bags"), and replacing
 *  only the first would leave the rest frozen — still advertising pieces that have since sold.
 *  Shopify sections almost always sit next to a "View all" link pointing at the collection they
 *  render, so we read the handle from that. `null` means "couldn't tell" and the caller should
 *  fall back to the store's live inventory. */
export function detectGridHandles(html: string): (string | null)[] {
 const $ = cheerio.load(html);
 return productGrids($).map((el) => {
  // Look at the grid's own section wrapper for a link to /collections/{handle}.
  const $section = $(el).closest("section, .shopify-section, [id^='shopify-section']");
  const scope = $section.length ? $section : $(el).parent();
  for (const a of scope.find('a[href*="/collections/"]').toArray()) {
   const href = $(a).attr("href") || "";
   const m = href.match(/\/collections\/([^/?#]+)/);
   if (m && m[1] && m[1] !== "all") return m[1];
  }
  return null;
 });
}

/** Replace EVERY product grid on the page, each with its own list of live items (index-matched to
 *  detectGridHandles). Grids whose list is empty are left alone rather than emptied. */
export function injectLiveGrids(html: string, perGrid: CollectionCardItem[][], hrefFor: HrefFor): string {
 if (!perGrid.some((g) => g.length)) return html;
 const $ = cheerio.load(html);
 const grids = productGrids($);
 grids.forEach((el, i) => {
  const items = perGrid[i] || [];
  if (items.length) fillGrid($, el, items, hrefFor);
 });
 return $.html();
}

/**
 * Put live items into a captured grid by REUSING THE THEME'S OWN CARD as a template.
 *
 * Replacing the grid with markup of our own threw away everything the theme knew about it: the
 * source rendered four across with its own type, badges and spacing, and our substitute rendered
 * six cramped columns with a generic "Add to cart" button under each — recognisably not the same
 * shop. Cloning the theme's first product card and swapping its image, title, price and link keeps
 * every class the theme styles against, so the live grid is visually identical to the frozen one it
 * replaces. Falls back to our own simple cards only when a theme card can't be found.
 */
function fillGrid($: cheerio.CheerioAPI, gridEl: DomElement, items: CollectionCardItem[], hrefFor: HrefFor): void {
 const $grid = $(gridEl);
 // The first child that actually looks like a card (some grids lead with a promo tile).
 const templateEl = ($grid.children().toArray() as DomElement[]).find((k) => looksLikeCard($, k));
 const $template = (templateEl ? $(templateEl) : $grid.children(CARD_CHILD_SELECTOR).first()) as cheerio.Cheerio<DomElement>;
 if (!$template.length) {
  $grid.replaceWith(liveGridHtml(items, hrefFor));
  return;
 }
 // Capture inlines each stylesheet where its <link> was — sometimes INSIDE a product card. Cloning
 // the card would then duplicate a whole stylesheet per product (314 cards turned one page into
 // 6MB). Hoist those out of the card once, then strip them from every clone.
 const $hoisted = $template.find("style, link").remove();
 if ($hoisted.length) $grid.before($hoisted);
 // Mirror the theme's own price formatting (e.g. "$550.00 USD" vs "$550") rather than imposing ours.
 const samplePrice = findPriceText($, $template);
 const decimals = /[.,]\d{2}\b/.test(samplePrice) ? 2 : 0;
 const showCode = /\b[A-Z]{3}\b/.test(samplePrice);

 const cards = items.map((it) => renderThemeCard($, $template, it, decimals, showCode, hrefFor));
 $grid.empty();
 $grid.attr("data-vya-collection", "1"); // marker: this grid is live, not captured
 for (const c of cards) $grid.append(c);
}

/** Clone one theme card and substitute a live item's content into it. */
function renderThemeCard(
 $: cheerio.CheerioAPI,
 $template: cheerio.Cheerio<DomElement>,
 it: CollectionCardItem,
 decimals: number,
 showCode: boolean,
 hrefFor: HrefFor,
): cheerio.Cheerio<DomElement> {
 const $card = $template.clone() as cheerio.Cheerio<DomElement>;
 $card.find("style, link, script").remove(); // never duplicate a stylesheet per card
 const imgs = Array.isArray(it.images) ? (it.images as unknown[]) : [];
 const img = typeof imgs[0] === "string" ? (imgs[0] as string) : "";
 const href = hrefFor(it);

 // ids would be duplicated across every cloned card, and the theme's own animation hooks would
 // re-run per card; strip both.
 $card.find("[id]").removeAttr("id");
 $card.removeAttr("id").removeAttr("data-cascade").removeAttr("style");

 // Image: keep the theme's <img> (and its classes/sizing), just point it at the live photo.
 const $img = $card.find("img").first();
 if ($img.length && img) {
  $img.attr("src", img).attr("alt", it.title || "").removeAttr("srcset").removeAttr("data-srcset").removeAttr("sizes").removeAttr("loading");
 } else if (!img) {
  $img.remove();
 }
 // Any second image (the theme's hover swap) has no live equivalent — drop it so hover doesn't
 // reveal a different product's photo.
 $card.find("img").slice(1).remove();

 // Title + link.
 // Title: the theme's heading if it has one, else the longest text-bearing link in the card —
 // themes that render the product name as a bare <a> (Prestige, Exhibit, Vessel) have no heading.
 let $title = $card.find("[class*='card__heading'], [class*='card-title'], [class*='product-title'], h2, h3, h4").first();
 if (!$title.length) {
  const links = $card.find("a[href]").toArray() as DomElement[];
  const best = links.map((a) => $(a)).filter(($a) => ($a.text() || "").trim().length > 1)
   .sort((a, b) => (b.text() || "").trim().length - (a.text() || "").trim().length)[0];
  if (best) $title = best;
 }
 if ($title.length) {
  const $link = $title.find("a").first();
  if ($link.length) $link.attr("href", href).text(it.title || "");
  else $title.text(it.title || "");
 }
 // Every other link in the card should also go to the live product, not the frozen source page.
 $card.find("a[href]").attr("href", href);

 // Price.
 // Price: a class hint if the theme gives one, otherwise the deepest element whose text actually
 // reads as money. Class names differ per theme; a currency amount looks the same everywhere.
 const $price = findPriceEl($, $card);
 const priceText = moneyLike(it.priceCents, it.currency, decimals, showCode);
 if ($price.length) $price.text(priceText);
 else $card.append(`<div class="vya-price">${escHtml(priceText)}</div>`);
 // Sale/compare-at markup has no live equivalent and would show a phantom discount.
 $card.find("[class*='price__sale'], [class*='compare-at'], s, del").remove();

 // Quick-add forms would POST to the old platform; the card links to the product page instead.
 $card.find("form").remove();
 $card.find("[class*='quick-add'], quick-add-modal, [class*='badge']").remove();

 return $card;
}

/** Fallback grid for pages where the theme gives us no card to clone — plain, inherits the store's
 *  font and colour so it still reads as part of the site. */
/** Where a live product card should link. Captured sites keep the shopper on the mirrored site
 *  (/site/{slug}/products/{handle}); elsewhere we fall back to VYA's own product page. */
export type HrefFor = (it: CollectionCardItem) => string;

function liveGridHtml(items: CollectionCardItem[], hrefFor: HrefFor): string {
 const cards = items.map((it) => {
  const imgs = Array.isArray(it.images) ? (it.images as unknown[]) : [];
  const img = typeof imgs[0] === "string" ? (imgs[0] as string) : "";
  // A real <img>, NOT an empty div with a background image. Dawn (and other themes) ship
  // `div:empty,section:empty,…{display:none}`, which silently hid the childless div we used to
  // render — the cards showed a title and price with a blank space where the photo belonged.
  const media = img
   ? `<img src="${escHtml(img)}" alt="${escHtml(it.title || "")}" loading="lazy" style="display:block;width:100%;aspect-ratio:3/4;object-fit:cover;background:#f2f0eb">`
   : `<div style="aspect-ratio:3/4;background:#f2f0eb">&nbsp;</div>`;
  return `<div style="font-family:inherit;color:inherit"><a href="${escHtml(hrefFor(it))}" style="text-decoration:none;color:inherit">${media}<div style="font-size:14px;margin-top:9px;line-height:1.3">${escHtml(it.title || "")}</div><div style="font-size:14px;opacity:.7;margin:2px 0 9px">${money(it.priceCents, it.currency)}</div></a></div>`;
 }).join("");
 return `<div data-vya-collection="1" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:26px;padding:26px 0;font-family:inherit;color:inherit">${cards}</div>`;
}

/** Text that reads as a price: a currency symbol or code next to a number. */
const MONEY_RE = /(?:[$£€¥₹]|\b(?:USD|GBP|EUR|CAD|AUD|JPY)\b)\s?\d[\d.,]*|\d[\d.,]*\s?(?:USD|GBP|EUR|CAD|AUD)\b/;

/** The element inside a card that holds its price — class hint first, then the deepest node whose
 *  text actually looks like money. Themes name this element a dozen different ways; the money
 *  itself looks the same everywhere. */
function findPriceEl($: cheerio.CheerioAPI, $card: cheerio.Cheerio<DomElement>): cheerio.Cheerio<DomElement> {
 const hinted = $card.find("[class*='price']").not("style, script, link").filter((_, el) => MONEY_RE.test($(el).text() || "")).first();
 if (hinted.length) return hinted as cheerio.Cheerio<DomElement>;
 const all = $card.find("*").not("style, script, link, img").toArray() as DomElement[];
 // Deepest match wins, so we write into the <span> holding the amount rather than a wrapper.
 const matches = all.filter((el) => MONEY_RE.test(($(el).text() || "").trim()) && $(el).children().length === 0);
 return (matches.length ? $(matches[matches.length - 1]) : $()) as cheerio.Cheerio<DomElement>;
}

/** The price text of a sample card, used to copy the theme's own money formatting. */
function findPriceText($: cheerio.CheerioAPI, $card: cheerio.Cheerio<DomElement>): string {
 const $el = findPriceEl($, $card);
 return $el.length ? ($el.text() || "").trim() : "";
}

/** Money formatted the way the source theme formats it. */
function moneyLike(cents: number | null, currency: string | null, decimals: number, showCode: boolean): string {
 if (cents == null) return "";
 const code = currency || "USD";
 let out: string;
 try {
  out = new Intl.NumberFormat("en-US", { style: "currency", currency: code, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(cents / 100);
 } catch {
  out = `$${(cents / 100).toFixed(decimals)}`;
 }
 return showCode ? `${out} ${code}` : out;
}

export function injectCollectionItems(html: string, items: CollectionCardItem[], hrefFor: HrefFor = (it) => `/products/${it.id}`): string {
 if (!items.length) return html;
 const $ = cheerio.load(html);
 const grid = productGrids($)[0];
 if (grid) {
  // Same treatment as the homepage grids: keep the theme's grid container and clone its own card,
  // so a collection page renders four across in the store's own type rather than in ours.
  fillGrid($, grid, items, hrefFor);
 } else {
  const fallback = liveGridHtml(items, hrefFor);
  // Fallback: remove any static product grids, drop the live grid after the page heading.
  $(GRID_SELECTORS).remove();
  const $host = $("main").first().length ? $("main").first() : $("body").first();
  const $h = $host.find("h1,h2").first();
  if ($h.length) $h.after(fallback); else $host.prepend(fallback);
 }
 return $.html();
}

/** Inject a store's site-wide custom CSS (seller edits applied over time) so it
 * wins over the captured theme. No-op when there's no custom CSS. */
export function injectCss(html: string, css: string): string {
 if (!css || !css.trim()) return html;
 // Neutralize any "</style><script>" breakout in store-authored CSS (CSS never needs "</").
 const tag = `<style data-vya-custom="1">${css.replace(/<\//g, "<\\/")}</style>`;
 return html.indexOf("</body>") !== -1 ? html.replace("</body>", tag + "</body>") : html + tag;
}

/** Inject the VYA cart drawer + script into a captured page before serving.
 * Also strips the source CSP meta — it would block our inline cart script. */
export function injectCart(html: string): string {
 html = html.replace(/<meta[^>]*http-equiv=["']?content-security-policy["']?[^>]*>/gi, "");
 if (html.indexOf("vya-cart-drawer") !== -1) return html;
 return html.indexOf("</body>") !== -1 ? html.replace("</body>", CART_UI + "</body>") : html + CART_UI;
}

/** Re-hydrate the interactivity that stripping the source's JS took away (slideshow/slider
 * carousels, dropdown nav) — a small VYA-authored script + CSS fallback, never the seller's own
 * JS. See capture-shim.ts for exactly what it targets and why. Idempotent, like injectCart. */
export function injectShim(html: string): string {
 if (html.indexOf("vya-shim") !== -1) return html;
 return html.indexOf("</body>") !== -1 ? html.replace("</body>", CAPTURE_SHIM + "</body>") : html + CAPTURE_SHIM;
}

/** A subtle "Powered by VYA" badge, fixed bottom-right, on the buyer-facing captured site. Links to
 * getvya.ai. Injected once (guarded), before </body>, so it rides above the seller's own layout. */
export function injectPoweredBy(html: string): string {
 if (html.indexOf("vya-powered") !== -1) return html;
 const badge = `<a href="https://getvya.ai" target="_blank" rel="noopener" class="vya-powered" style="position:fixed;bottom:14px;right:14px;z-index:2147483000;display:inline-flex;align-items:center;gap:6px;background:rgba(17,17,17,.9);color:#fff;font:600 11px/1 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;letter-spacing:.02em;padding:7px 11px;border-radius:999px;text-decoration:none;box-shadow:0 4px 16px rgba(0,0,0,.22);backdrop-filter:saturate(140%) blur(2px)">Powered by <b style="font-weight:800">VYA</b></a>`;
 return html.indexOf("</body>") !== -1 ? html.replace("</body>", badge + "</body>") : html + badge;
}

/** Give a captured page the two SEO tags it usually lacks when re-hosted on VYA: a canonical URL
 * (so the page has one authoritative address) and an indexable robots directive. Both are ADDED
 * ONLY when the captured HTML doesn't already declare them — we never override the seller's own
 * canonical/robots. Injected right after <head> so crawlers read it early. */
export function injectSeo(html: string, opts: { canonicalUrl: string }): string {
 const tags: string[] = [];
 if (!/<link[^>]+rel=["']?canonical/i.test(html)) {
  tags.push(`<link rel="canonical" href="${opts.canonicalUrl.replace(/"/g, "%22")}">`);
 }
 if (!/<meta[^>]+name=["']?robots/i.test(html)) {
  tags.push(`<meta name="robots" content="index, follow">`);
 }
 if (!tags.length) return html;
 const block = tags.join("");
 if (/<head[^>]*>/i.test(html)) return html.replace(/(<head[^>]*>)/i, `$1${block}`);
 if (html.indexOf("</head>") !== -1) return html.replace("</head>", `${block}</head>`);
 return block + html;
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
export type NewBlock = { new: "text" | "image" | "button" | "divider" | "faq" | "gallery" | "newsletter" | "testimonials" | "statement" | "columns" | "hero" | "announcement" | "split" | "blog" | "contact"; text?: string; href?: string; html?: string };
// A seller-inserted block can carry its OWN edited HTML (so their inline edits survive the save instead of
// being regenerated to the default template). Sanitised hard: no scripts, styles, iframes, or event handlers.
function sanitizeInsertedHtml(raw: string): string {
 try {
  const $ = cheerio.load(String(raw).slice(0, 40000), undefined, false);
  $("script, style, link, iframe, object, embed, form").each((_: number, el: any) => {
   if (el.tagName === "form") { $(el).replaceWith(`<div>${$(el).html() || ""}</div>`); } else $(el).remove();
  });
  $("*").each((_: number, el: any) => {
   const at = el.attribs || {};
   for (const a of Object.keys(at)) {
    if (/^on/i.test(a) || /^data-vya-/i.test(a) || a === "contenteditable") $(el).removeAttr(a);
    else if ((a === "href" || a === "src") && /^\s*javascript:/i.test(at[a])) $(el).attr(a, "#");
   }
  });
  return $.html();
 } catch { return ""; }
}
// The section types a seller can drop into their captured site. Rendered server-side as self-contained
// HTML (fonts/colours inherited so it blends in); prepareEditMode re-tags every text/image on the next
// serve, so these become click-to-edit + image-replaceable like the rest of the site.
export const NEW_BLOCK_TYPES = ["text", "image", "button", "divider", "faq", "gallery", "newsletter", "testimonials", "statement", "columns", "hero", "announcement", "split", "blog", "contact"] as const;
function escHtml(s: string): string {
 return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
const NEW_BLOCK_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='700'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' fill='%23999' font-family='sans-serif' font-size='28' text-anchor='middle'%3EClick to add an image%3C/text%3E%3C/svg%3E";
export function newBlockHtml(b: NewBlock): string {
 // If the block carries its own edited HTML, use it (sanitised) so the seller's inline edits survive.
 if (b.html && b.html.trim()) { const clean = sanitizeInsertedHtml(b.html); if (clean.trim()) return clean; }
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
  case "hero":
   return `<div data-vya-block="1" style="padding:120px 24px;text-align:center;font-family:inherit;color:inherit"><h1 style="font-family:inherit;font-size:44px;line-height:1.1;margin:0 0 14px">New Arrivals</h1><p style="margin:0 0 26px;opacity:.72;font-size:17px">Curated vintage, one of one.</p><a href="#" style="display:inline-block;padding:14px 34px;border:1px solid currentColor;color:inherit;text-decoration:none;letter-spacing:.08em;text-transform:uppercase;font-size:13px">Shop now</a></div>`;
  case "statement":
   return `<div data-vya-block="1" style="padding:88px 24px;text-align:center;font-family:inherit;color:inherit"><p style="font-family:inherit;font-size:32px;line-height:1.3;max-width:820px;margin:0 auto">When it's gone, it's gone.</p></div>`;
  case "faq": {
   const row = (q: string, a: string) => `<details style="border-top:1px solid rgba(128,128,128,.25);padding:18px 0"><summary style="cursor:pointer;font-weight:600;list-style:none;font-family:inherit">${escHtml(q)}</summary><p style="margin:12px 0 0;line-height:1.65;opacity:.75">${escHtml(a)}</p></details>`;
   return `<div data-vya-block="1" style="max-width:780px;margin:0 auto;padding:64px 24px;font-family:inherit;color:inherit"><h2 style="font-family:inherit;text-align:center;margin:0 0 28px;font-size:30px">Frequently asked</h2>${row("How are pieces sourced?", "Every piece is hand-selected for quality and authenticity.")}${row("What condition are items in?", "Condition is noted on each listing — most pieces are pre-loved or vintage.")}${row("Do you accept returns?", "See our Shipping & Returns page for the details.")}</div>`;
  }
  case "gallery":
   return `<div data-vya-block="1" style="padding:56px 24px"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:1120px;margin:0 auto">${[0, 1, 2].map(() => `<img src="${NEW_BLOCK_IMG}" alt="" style="width:100%;aspect-ratio:4/5;object-fit:cover;display:block">`).join("")}</div></div>`;
  case "testimonials": {
   const card = (quote: string, name: string) => `<div style="text-align:center"><div style="color:#e0b23c;letter-spacing:.2em;margin-bottom:10px">★★★★★</div><p style="line-height:1.6;font-family:inherit">"${escHtml(quote)}"</p><p style="margin-top:12px;font-size:12px;text-transform:uppercase;letter-spacing:.12em;opacity:.6">${escHtml(name)}</p></div>`;
   return `<div data-vya-block="1" style="padding:64px 24px;font-family:inherit;color:inherit"><h2 style="font-family:inherit;text-align:center;margin:0 0 36px;font-size:28px">Loved by our customers</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:28px;max-width:1080px;margin:0 auto">${card("Exactly as described and the quality is incredible.", "Maya R.")}${card("My new favourite shop — everything is one of one.", "Priya S.")}${card("Shipped fast and beautifully packaged.", "Jordan T.")}</div></div>`;
  }
  case "columns": {
   const col = (h: string, b: string) => `<div><h3 style="font-family:inherit;margin:0 0 8px;font-size:19px">${escHtml(h)}</h3><p style="margin:0;line-height:1.6;opacity:.75">${escHtml(b)}</p></div>`;
   return `<div data-vya-block="1" style="padding:64px 24px;font-family:inherit;color:inherit"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:36px;max-width:1080px;margin:0 auto">${col("Sourced with care", "Every piece is hand-selected for quality and authenticity.")}${col("One of one", "No restocks — when it's gone, it's gone.")}${col("Shipped fast", "Carefully packaged and on its way within a day.")}</div></div>`;
  }
  case "newsletter":
   return `<div data-vya-block="1" style="padding:72px 24px;text-align:center;font-family:inherit;color:inherit"><h2 style="font-family:inherit;margin:0 0 8px;font-size:28px">Join the list</h2><p style="margin:0 0 22px;opacity:.72">First access to new arrivals.</p><form onsubmit="return false" style="display:flex;gap:8px;max-width:440px;margin:0 auto"><input type="email" placeholder="Email address" style="flex:1;padding:13px 15px;border:1px solid rgba(128,128,128,.4);font-family:inherit"><button type="submit" style="padding:13px 26px;background:#1a1a1a;color:#fff;border:none;cursor:pointer;letter-spacing:.06em;text-transform:uppercase;font-size:12px">Subscribe</button></form></div>`;
  case "announcement":
   return `<div data-vya-block="1" style="padding:11px 24px;text-align:center;background:#1a1a1a;color:#fff;font-family:inherit"><p style="margin:0;font-size:13px;letter-spacing:.06em">Free shipping on orders over $150</p></div>`;
  case "split":
   return `<div data-vya-block="1" style="display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:0;font-family:inherit;color:inherit"><img src="${NEW_BLOCK_IMG}" alt="" style="width:100%;height:100%;min-height:340px;object-fit:cover;display:block"><div style="padding:56px 44px"><h2 style="font-family:inherit;margin:0 0 14px;font-size:30px">Every piece, one of one</h2><p style="margin:0 0 22px;line-height:1.65;opacity:.75">Tell the story behind your edit — what you source, how you find it, why it matters.</p><a href="#" style="display:inline-block;padding:13px 30px;border:1px solid currentColor;color:inherit;text-decoration:none;letter-spacing:.06em;text-transform:uppercase;font-size:12px">Learn more</a></div></div>`;
  case "blog": {
   const post = (t: string, e: string) => `<a href="#" style="text-decoration:none;color:inherit"><div style="aspect-ratio:3/2;background:#eee;overflow:hidden"><img src="${NEW_BLOCK_IMG}" alt="" style="width:100%;height:100%;object-fit:cover;display:block"></div><h3 style="font-family:inherit;margin:14px 0 6px;font-size:19px">${escHtml(t)}</h3><p style="margin:0;line-height:1.6;opacity:.7;font-size:14px">${escHtml(e)}</p></a>`;
   return `<div data-vya-block="1" style="padding:64px 24px;font-family:inherit;color:inherit"><h2 style="font-family:inherit;text-align:center;margin:0 0 36px;font-size:28px">The Journal</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:28px;max-width:1120px;margin:0 auto">${post("Caring for vintage leather", "Keep your finds looking their best.")}${post("Vintage icons: the Lady bag", "The story behind a classic.")}${post("Styling denim three ways", "From day to night.")}</div></div>`;
  }
  case "contact":
   return `<div data-vya-block="1" style="max-width:620px;margin:0 auto;padding:64px 24px;font-family:inherit;color:inherit"><h2 style="font-family:inherit;text-align:center;margin:0 0 8px;font-size:30px">Get in touch</h2><p style="text-align:center;margin:0 0 28px;opacity:.72">Questions about a piece, sizing, or an order? Send us a note.</p><form onsubmit="return false" style="display:flex;flex-direction:column;gap:12px"><input placeholder="Your name" style="padding:13px 15px;border:1px solid rgba(128,128,128,.4);font-family:inherit"><input type="email" placeholder="Email address" style="padding:13px 15px;border:1px solid rgba(128,128,128,.4);font-family:inherit"><textarea placeholder="Your message" rows="5" style="padding:13px 15px;border:1px solid rgba(128,128,128,.4);font-family:inherit;resize:vertical"></textarea><button type="submit" style="padding:14px;background:#1a1a1a;color:#fff;border:none;cursor:pointer;letter-spacing:.06em;text-transform:uppercase;font-size:12px">Send</button></form></div>`;
  default:
   return "";
 }
}

const EDITOR_JS = `(function(){var td={},dimg={},dlink={},dstyle={},dsecstyle={},struct=0;var style=document.createElement("style");style.textContent='[data-vya-eid]{cursor:text}[data-vya-eid]:hover{outline:1px dashed rgba(93,15,23,.55);outline-offset:2px}[data-vya-eid].vya-ed{outline:2px solid #5D0F17;background:rgba(93,15,23,.05)}[data-vya-img]{cursor:pointer}[data-vya-img]:hover{outline:2px dashed #5D0F17;outline-offset:2px}[data-vya-sec].vya-hi,[data-vya-block].vya-hi{outline:2px solid rgba(93,15,23,.4);outline-offset:-2px}[data-vya-sec].vya-sel,[data-vya-block].vya-sel{outline:2px solid #5D0F17!important;outline-offset:-2px}.vya-del{display:none!important}#vya-eb{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#fff;color:#57534e;border:1px solid rgba(0,0,0,.08);border-radius:30px;padding:8px 10px 8px 18px;display:flex;align-items:center;gap:12px;font:13px -apple-system,BlinkMacSystemFont,system-ui,sans-serif;box-shadow:0 14px 38px -12px rgba(43,36,29,.42)}#vya-eb button{background:#5D0F17;color:#fff;border:none;border-radius:20px;padding:8px 16px;font:600 12px -apple-system,system-ui,sans-serif;cursor:pointer}#vya-eb button:hover{background:#4a0c12}#vya-eb button:disabled{opacity:.5}#vya-sb{position:fixed;z-index:2147483647;display:none;align-items:center;gap:2px;background:rgba(255,255,255,.92);border-radius:6px;padding:2px;box-shadow:0 1px 3px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}#vya-sb button{display:grid;place-items:center;width:24px;height:24px;padding:0;background:transparent;color:#5D0F17;border:none;border-radius:4px;cursor:pointer}#vya-sb button:hover{background:rgba(93,15,23,.1)}#vya-sb button[data-a=drag]{cursor:grab}';document.head.appendChild(style);var bar=document.createElement("div");bar.id="vya-eb";bar.style.display="none";bar.innerHTML='<span id="vya-es"></span><button id="vya-save">Save changes</button>';document.body.appendChild(bar);var autoT=null;function st(t){var es=document.getElementById("vya-es");if(es)es.textContent=t;if(window.parent!==window)window.parent.postMessage({vya:"status",text:t},"*");if(t==="Unsaved changes"&&!struct){if(autoT)clearTimeout(autoT);autoT=setTimeout(function(){var sv=document.getElementById("vya-save");if(sv)sv.click()},1200)}}var IMG_PH='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221200%22 height=%22600%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23eee%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%23999%22 font-family=%22sans-serif%22 font-size=%2226%22 text-anchor=%22middle%22%3EClick to add an image%3C/text%3E%3C/svg%3E';var sb=document.createElement("div");sb.id="vya-sb";var svS='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';sb.innerHTML='<button data-a="up" title="Move up">'+svS+'<polyline points="18 15 12 9 6 15"/></svg></button><button data-a="down" title="Move down">'+svS+'<polyline points="6 9 12 15 18 9"/></svg></button><button data-a="drag" title="Drag to reorder"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="9" cy="19" r="1.4"/><circle cx="15" cy="5" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="15" cy="19" r="1.4"/></svg></button>';document.body.appendChild(sb);var secbg=document.createElement("input");secbg.type="color";secbg.style.display="none";document.body.appendChild(secbg);secbg.addEventListener("input",function(){if(!curSec)return;curSec.style.setProperty("background-color",this.value,"important");var si=curSec.getAttribute("data-vya-sec");if(si!==null){dsecstyle[si]=dsecstyle[si]||{};dsecstyle[si]["background-color"]=this.value+" !important"}st("Unsaved changes")});var am=document.createElement("div");am.id="vya-am";am.style.cssText="position:fixed;z-index:2147483647;display:none;flex-direction:column;background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:12px;padding:6px;box-shadow:0 16px 38px -12px rgba(43,36,29,.42)";am.innerHTML='<button data-b="text">Text block</button><button data-b="image">Image</button><button data-b="button">Button</button><button data-b="divider">Divider</button>';[].slice.call(am.children).forEach(function(b){b.style.cssText="background:transparent;color:#44403c;border:none;text-align:left;padding:7px 14px;font:600 12px -apple-system,system-ui,sans-serif;cursor:pointer;border-radius:7px";b.onmouseenter=function(){b.style.background="#f5f4f2"};b.onmouseleave=function(){b.style.background="transparent"}});document.body.appendChild(am);var curSec=null;function isSec(n){return n&&n.getAttribute&&(n.getAttribute("data-vya-sec")!==null||n.getAttribute("data-vya-block")!==null)}function secSibs(s){return [].slice.call((s.parentNode||document).children).filter(isSec)}function newBlockEl(t){var d=document.createElement("div");d.setAttribute("data-vya-block","1");d.setAttribute("data-vya-newtype",t);var star='<div style="color:#e0b23c;letter-spacing:.2em;margin-bottom:10px">★★★★★</div>';if(t==="text"){d.style.cssText="padding:44px 24px";d.innerHTML='<h2 style="margin:0 0 12px">New heading</h2><p style="margin:0;line-height:1.6">Add your text here.</p>'}else if(t==="image"){d.style.cssText="padding:0";d.innerHTML='<img src="'+IMG_PH+'" style="display:block;width:100%;height:auto">'}else if(t==="button"){d.style.cssText="padding:44px 24px";d.innerHTML='<div style="text-align:center"><a href="#" style="display:inline-block;padding:13px 30px;border:1px solid currentColor;color:inherit;text-decoration:none;letter-spacing:.05em">Shop now</a></div>'}else if(t==="hero"){d.style.cssText="padding:120px 24px;text-align:center";d.innerHTML='<h1 style="font-size:44px;line-height:1.1;margin:0 0 14px">New Arrivals</h1><p style="margin:0 0 26px;opacity:.72;font-size:17px">Curated vintage, one of one.</p><a href="#" style="display:inline-block;padding:14px 34px;border:1px solid currentColor;color:inherit;text-decoration:none;letter-spacing:.08em;text-transform:uppercase;font-size:13px">Shop now</a>'}else if(t==="statement"){d.style.cssText="padding:88px 24px;text-align:center";d.innerHTML='<p style="font-size:32px;line-height:1.3;max-width:820px;margin:0 auto">When it&#39;s gone, it&#39;s gone.</p>'}else if(t==="faq"){d.style.cssText="max-width:780px;margin:0 auto;padding:64px 24px";var fr=function(q,a){return '<details style="border-top:1px solid rgba(128,128,128,.25);padding:18px 0"><summary style="cursor:pointer;font-weight:600;list-style:none">'+q+'</summary><p style="margin:12px 0 0;line-height:1.65;opacity:.75">'+a+'</p></details>'};d.innerHTML='<h2 style="text-align:center;margin:0 0 28px;font-size:30px">Frequently asked</h2>'+fr("How are pieces sourced?","Every piece is hand-selected for quality and authenticity.")+fr("What condition are items in?","Condition is noted on each listing.")+fr("Do you accept returns?","See our Shipping &amp; Returns page.")}else if(t==="gallery"){d.style.cssText="padding:56px 24px";var im='<img src="'+IMG_PH+'" style="width:100%;aspect-ratio:4/5;object-fit:cover;display:block">';d.innerHTML='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:1120px;margin:0 auto">'+im+im+im+'</div>'}else if(t==="testimonials"){d.style.cssText="padding:64px 24px";var tc=function(q,n){return '<div style="text-align:center">'+star+'<p style="line-height:1.6">"'+q+'"</p><p style="margin-top:12px;font-size:12px;text-transform:uppercase;letter-spacing:.12em;opacity:.6">'+n+'</p></div>'};d.innerHTML='<h2 style="text-align:center;margin:0 0 36px;font-size:28px">Loved by our customers</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:28px;max-width:1080px;margin:0 auto">'+tc("Exactly as described and the quality is incredible.","Maya R.")+tc("My new favourite shop.","Priya S.")+tc("Shipped fast and beautifully packaged.","Jordan T.")+'</div>'}else if(t==="columns"){d.style.cssText="padding:64px 24px";var cc=function(h,b){return '<div><h3 style="margin:0 0 8px;font-size:19px">'+h+'</h3><p style="margin:0;line-height:1.6;opacity:.75">'+b+'</p></div>'};d.innerHTML='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:36px;max-width:1080px;margin:0 auto">'+cc("Sourced with care","Every piece is hand-selected.")+cc("One of one","No restocks — when it&#39;s gone, it&#39;s gone.")+cc("Shipped fast","On its way within a day.")+'</div>'}else if(t==="newsletter"){d.style.cssText="padding:72px 24px;text-align:center";d.innerHTML='<h2 style="margin:0 0 8px;font-size:28px">Join the list</h2><p style="margin:0 0 22px;opacity:.72">First access to new arrivals.</p><form onsubmit="return false" style="display:flex;gap:8px;max-width:440px;margin:0 auto"><input type="email" placeholder="Email address" style="flex:1;padding:13px 15px;border:1px solid rgba(128,128,128,.4)"><button type="submit" style="padding:13px 26px;background:#1a1a1a;color:#fff;border:none;cursor:pointer;letter-spacing:.06em;text-transform:uppercase;font-size:12px">Subscribe</button></form>'}else if(t==="announcement"){d.style.cssText="padding:11px 24px;text-align:center;background:#1a1a1a;color:#fff";d.innerHTML='<p style="margin:0;font-size:13px;letter-spacing:.06em">Free shipping on orders over $150</p>'}else if(t==="split"){d.style.cssText="display:grid;grid-template-columns:1fr 1fr;align-items:center";d.innerHTML='<img src="'+IMG_PH+'" style="width:100%;height:100%;min-height:340px;object-fit:cover;display:block"><div style="padding:56px 44px"><h2 style="margin:0 0 14px;font-size:30px">Every piece, one of one</h2><p style="margin:0 0 22px;line-height:1.65;opacity:.75">Tell the story behind your edit — what you source, how you find it, why it matters.</p><a href="#" style="display:inline-block;padding:13px 30px;border:1px solid currentColor;color:inherit;text-decoration:none;letter-spacing:.06em;text-transform:uppercase;font-size:12px">Learn more</a></div>'}else if(t==="blog"){d.style.cssText="padding:64px 24px";var bp=function(ti,ex){return '<a href="#" style="text-decoration:none;color:inherit"><div style="aspect-ratio:3/2;background:#eee;overflow:hidden"><img src="'+IMG_PH+'" style="width:100%;height:100%;object-fit:cover;display:block"></div><h3 style="margin:14px 0 6px;font-size:19px">'+ti+'</h3><p style="margin:0;line-height:1.6;opacity:.7;font-size:14px">'+ex+'</p></a>'};d.innerHTML='<h2 style="text-align:center;margin:0 0 36px;font-size:28px">The Journal</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:28px;max-width:1120px;margin:0 auto">'+bp("Caring for vintage leather","Keep your finds looking their best.")+bp("Vintage icons: the Lady bag","The story behind a classic.")+bp("Styling denim three ways","From day to night.")+'</div>'}else if(t==="contact"){d.style.cssText="max-width:620px;margin:0 auto;padding:64px 24px";d.innerHTML='<h2 style="text-align:center;margin:0 0 8px;font-size:30px">Get in touch</h2><p style="text-align:center;margin:0 0 28px;opacity:.72">Questions about a piece, sizing, or an order? Send us a note.</p><form onsubmit="return false" style="display:flex;flex-direction:column;gap:12px"><input placeholder="Your name" style="padding:13px 15px;border:1px solid rgba(128,128,128,.4)"><input type="email" placeholder="Email address" style="padding:13px 15px;border:1px solid rgba(128,128,128,.4)"><textarea placeholder="Your message" rows="5" style="padding:13px 15px;border:1px solid rgba(128,128,128,.4);resize:vertical"></textarea><button type="submit" style="padding:14px;background:#1a1a1a;color:#fff;border:none;cursor:pointer;letter-spacing:.06em;text-transform:uppercase;font-size:12px">Send</button></form>'}else{d.style.cssText="padding:10px 24px";d.innerHTML='<hr style="border:none;border-top:1px solid currentColor;opacity:.18;margin:0">'}return d}var neid=900000;function instrumentNew(el){[].slice.call(el.querySelectorAll("h1,h2,h3,h4,h5,h6,p,summary,li,a,blockquote")).forEach(function(n){if(!n.getAttribute("data-vya-eid")&&!n.querySelector("*")&&(n.textContent||"").trim())n.setAttribute("data-vya-eid",String(neid++))});[].slice.call(el.querySelectorAll("img")).forEach(function(n){if(!n.getAttribute("data-vya-img"))n.setAttribute("data-vya-img",String(neid++))});[].slice.call(el.querySelectorAll("details")).forEach(function(dd){dd.setAttribute("open","")})}function cleanHtml(el){var c=el.cloneNode(true);[].slice.call(c.querySelectorAll("[data-vya-eid],[data-vya-img],[data-vya-link],[contenteditable]")).forEach(function(n){n.removeAttribute("data-vya-eid");n.removeAttribute("data-vya-img");n.removeAttribute("data-vya-link");n.removeAttribute("contenteditable");if(n.classList)n.classList.remove("vya-ed","vya-sel","vya-hi")});[].slice.call(c.querySelectorAll("details")).forEach(function(dd){dd.removeAttribute("open")});if(c.classList)c.classList.remove("vya-hi","vya-sel","vya-ed");return c.outerHTML}function rgbHex(c){if(!c)return"";var m=c.match(/\\d+/g);if(!m)return"";if(m.length>=4&&Number(m[3])===0)return"";return"#"+m.slice(0,3).map(function(x){return("0"+parseInt(x,10).toString(16)).slice(-2)}).join("")}document.addEventListener("mouseover",function(e){var s=e.target.closest&&e.target.closest("[data-vya-sec],[data-vya-block]");if(s&&!s.classList.contains("vya-del")){if(curSec&&curSec!==s)curSec.classList.remove("vya-hi");curSec=s;s.classList.add("vya-hi");var r=s.getBoundingClientRect();sb.style.display="flex";sb.style.top=(Math.max(r.top,4)+8)+"px";sb.style.left=(r.right-86)+"px"}});am.addEventListener("click",function(e){var bb=e.target.closest&&e.target.closest("[data-b]");var t=bb&&bb.getAttribute("data-b");if(!t||!curSec)return;var el=newBlockEl(t);curSec.parentNode.insertBefore(el,curSec.nextSibling);instrumentNew(el);am.style.display="none";struct=1;st("Unsaved changes")});sb.addEventListener("click",function(e){var bt=e.target.closest&&e.target.closest("[data-a]");var a=bt&&bt.getAttribute("data-a");if(!a||!curSec||(a!=="up"&&a!=="down"))return;var p=curSec.parentNode;var sibs=secSibs(curSec).filter(function(n){return !n.classList.contains("vya-del")});var i=sibs.indexOf(curSec);var sw=a==="up"?sibs[i-1]:sibs[i+1];if(sw){if(a==="up")p.insertBefore(curSec,sw);else p.insertBefore(sw,curSec);var r2=curSec.getBoundingClientRect();sb.style.top=(Math.max(r2.top,4)+8)+"px";struct=1;st("Unsaved changes")}});sb.addEventListener("pointerdown",function(e){var bt=e.target.closest&&e.target.closest('[data-a="drag"]');if(!bt||!curSec)return;e.preventDefault();var dragging=curSec;var op=dragging.style.opacity;dragging.style.opacity="0.4";sb.style.display="none";function mv(ev){var el=document.elementFromPoint(ev.clientX,ev.clientY);var t=el&&el.closest&&el.closest("[data-vya-sec],[data-vya-block]");if(t&&t!==dragging&&t.parentNode===dragging.parentNode){var rr=t.getBoundingClientRect();if(ev.clientY<rr.top+rr.height/2)t.parentNode.insertBefore(dragging,t);else t.parentNode.insertBefore(dragging,t.nextSibling)}}function up(){dragging.style.opacity=op;document.removeEventListener("pointermove",mv);document.removeEventListener("pointerup",up);struct=1;st("Unsaved changes")}document.addEventListener("pointermove",mv);document.addEventListener("pointerup",up)});var lk=document.createElement("button");lk.id="vya-lk";lk.textContent="🔗 link";lk.style.cssText="position:fixed;z-index:2147483647;display:none;background:#5D0F17;color:#fff;border:none;border-radius:8px;padding:5px 9px;font:600 11px -apple-system,system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 20px -8px rgba(43,36,29,.4)";document.body.appendChild(lk);var lb=document.createElement("div");lb.id="vya-lb";lb.style.cssText="position:fixed;z-index:2147483647;display:none;gap:6px;background:#fff;border:1px solid rgba(0,0,0,.08);padding:8px;border-radius:12px;box-shadow:0 16px 38px -12px rgba(43,36,29,.42);align-items:center";lb.innerHTML='<input id="vya-lb-i" placeholder="https://…  or  /page" style="width:230px;border:1px solid rgba(0,0,0,.12);border-radius:7px;padding:7px 9px;font:12px -apple-system,system-ui,sans-serif;outline:none"><button id="vya-lb-s" style="background:#5D0F17;color:#fff;border:none;border-radius:7px;padding:7px 12px;font:600 12px -apple-system,system-ui,sans-serif;cursor:pointer">Set link</button><button id="vya-lb-x" style="background:transparent;color:#78716c;border:none;font:13px system-ui;cursor:pointer">✕</button>';document.body.appendChild(lb);var curLink=null;document.addEventListener("mouseover",function(e){var a=e.target.closest&&e.target.closest("[data-vya-link]");if(a){curLink=a;var r=a.getBoundingClientRect();lk.style.display="block";lk.style.top=(Math.max(r.top,4)-1)+"px";lk.style.left=(r.right+4)+"px"}else if(e.target!==lk&&lb.style.display==="none"){lk.style.display="none"}});lk.addEventListener("click",function(e){e.preventDefault();if(!curLink)return;var r=curLink.getBoundingClientRect();lb.style.display="flex";lb.style.top=(r.bottom+4)+"px";lb.style.left=Math.max(r.left,8)+"px";var i=document.getElementById("vya-lb-i");i.value=curLink.getAttribute("href")||"";i.focus();lk.style.display="none"});lb.querySelector("#vya-lb-x").addEventListener("click",function(){lb.style.display="none"});lb.querySelector("#vya-lb-s").addEventListener("click",function(){if(!curLink)return;var v=document.getElementById("vya-lb-i").value.trim();curLink.setAttribute("href",v);dlink[curLink.getAttribute("data-vya-link")]=v;lb.style.display="none";st("Unsaved changes")});var tb=document.createElement("div");tb.id="vya-tb";tb.style.cssText="position:fixed;z-index:2147483647;display:none;gap:3px;align-items:center;background:#fff;border:1px solid rgba(0,0,0,.08);padding:6px;border-radius:12px;box-shadow:0 16px 38px -12px rgba(43,36,29,.42)";var svA='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">',svL=svA+'<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="13" y2="12"/><line x1="4" y1="17" x2="17" y2="17"/></svg>',svC=svA+'<line x1="4" y1="7" x2="20" y2="7"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="5" y1="17" x2="19" y2="17"/></svg>',svR=svA+'<line x1="4" y1="7" x2="20" y2="7"/><line x1="11" y1="12" x2="20" y2="12"/><line x1="7" y1="17" x2="20" y2="17"/></svg>';tb.innerHTML='<label style="display:grid;place-items:center;width:30px;height:30px;border-radius:8px;cursor:pointer;overflow:hidden;flex:none"><input type="color" id="vya-tb-c" title="Text colour" style="width:44px;height:44px;border:none;background:none;padding:0;cursor:pointer"></label><button data-s="dec" title="Smaller text">A−</button><button data-s="inc" title="Bigger text">A+</button><span style="width:1px;height:18px;background:#e7e5e4;margin:0 2px"></span><button data-s="left" title="Align left">'+svL+'</button><button data-s="center" title="Align centre">'+svC+'</button><button data-s="right" title="Align right">'+svR+'</button>';[].slice.call(tb.querySelectorAll("button")).forEach(function(b){b.style.cssText="display:grid;place-items:center;min-width:32px;height:32px;background:#fff;color:#44403c;border:none;border-radius:8px;padding:0 8px;font:600 14px -apple-system,system-ui,sans-serif;cursor:pointer";b.onmouseenter=function(){b.style.background="#f5f4f2";b.style.color="#5D0F17"};b.onmouseleave=function(){b.style.background="#fff";b.style.color="#44403c"}});document.body.appendChild(tb);var curTxt=null;function recTxt(css,val){if(!curTxt)return;curTxt.style.setProperty(css,val,"important");var eid=curTxt.getAttribute("data-vya-eid");dstyle[eid]=dstyle[eid]||{};dstyle[eid][css]=val+" !important";st("Unsaved changes")}function showTb(el){var r=el.getBoundingClientRect();var above=r.top>52;tb.style.display="flex";tb.style.top=(above?(r.top-42):(r.bottom+8))+"px";tb.style.left=Math.min(Math.max(r.left,8),(window.innerWidth||1200)-268)+"px";try{var m=getComputedStyle(el).color.match(/\\d+/g);if(m)document.getElementById("vya-tb-c").value="#"+m.slice(0,3).map(function(x){return("0"+parseInt(x,10).toString(16)).slice(-2)}).join("")}catch(e){}}document.getElementById("vya-tb-c").addEventListener("input",function(){recTxt("color",this.value)});tb.addEventListener("click",function(e){var sbt=e.target.closest&&e.target.closest("[data-s]");var s=sbt&&sbt.getAttribute("data-s");if(!s||!curTxt)return;if(s==="inc"||s==="dec"){var cur=parseFloat(getComputedStyle(curTxt).fontSize)||16;var nx=Math.max(10,Math.min(96,cur+(s==="inc"?2:-2)));recTxt("font-size",nx+"px")}else{recTxt("text-align",s)}});var fi=document.createElement("input");fi.type="file";fi.accept="image/*";fi.style.display="none";document.body.appendChild(fi);var pend=null;fi.addEventListener("change",function(){var f=fi.files[0];if(!f||!pend)return;st("Uploading…");var fd=new FormData();fd.append("file",f);fetch("/api/store/assets",{method:"POST",body:fd}).then(function(r){return r.json()}).then(function(d){if(d.url){pend.setAttribute("src",d.url);pend.removeAttribute("srcset");dimg[pend.getAttribute("data-vya-img")]=d.url;st("Unsaved changes")}else st(d.error||"Upload failed");pend=null;fi.value=""}).catch(function(){st("Upload failed")})});document.addEventListener("click",function(e){if(e.target.closest&&e.target.closest("#vya-tb,#vya-sb,#vya-am,#vya-lb,#vya-eb,#vya-lk"))return;var lnk=e.target.closest&&e.target.closest("a");if(lnk){var pfx="/site/"+(window.__VYA_EDIT&&window.__VYA_EDIT.slug||"");var lp=lnk.pathname||"";var cur=(location.pathname||"").replace(/\\/+$/,"");if(lp.indexOf(pfx)===0&&lp.replace(/\\/+$/,"")!==cur){e.preventDefault();var r2=lp.slice(pfx.length)||"/";if(window.parent!==window)window.parent.postMessage({vya:"navigate",path:r2},"*");return}}var sec=e.target.closest&&e.target.closest("[data-vya-sec],[data-vya-block]");if(sec)selectSection(sec);var im=e.target.closest&&e.target.closest("[data-vya-img]");if(im){e.preventDefault();if(window.parent!==window)window.parent.postMessage({vya:"imgsel",id:parseInt(im.getAttribute("data-vya-img"),10),src:im.getAttribute("src")||""},"*");return}var ed=e.target.closest&&e.target.closest("[data-vya-eid]");if(ed){e.preventDefault();ed.setAttribute("contenteditable","true");ed.classList.add("vya-ed");ed.focus();curTxt=ed;showTb(ed);return}if(lnk){e.preventDefault();return}tb.style.display="none"});document.addEventListener("input",function(e){var ed=e.target.closest&&e.target.closest("[data-vya-eid]");if(ed){td[ed.getAttribute("data-vya-eid")]=ed.textContent;st("Unsaved changes")}});document.getElementById("vya-save").addEventListener("click",function(){var edits=Object.keys(td).map(function(k){return{eid:parseInt(k,10),text:td[k]}});var images=Object.keys(dimg).map(function(k){return{id:parseInt(k,10),src:dimg[k]}});var links=Object.keys(dlink).map(function(k){return{id:parseInt(k,10),href:dlink[k]}});var styles=Object.keys(dstyle).map(function(k){var o=dstyle[k],s="";for(var pk in o)s+=pk+":"+o[pk]+";";return{eid:parseInt(k,10),style:s}});var secStyles=Object.keys(dsecstyle).map(function(k){var o=dsecstyle[k],s="";for(var pk in o)s+=pk+":"+o[pk]+";";return{sec:parseInt(k,10),style:s}});var sections=null;if(struct){sections=[].slice.call(document.querySelectorAll("[data-vya-sec],[data-vya-block]")).filter(function(el){return !el.classList.contains("vya-del")}).map(function(el){var si=el.getAttribute("data-vya-sec");if(si!==null)return parseInt(si,10);var t=el.getAttribute("data-vya-newtype")||"text";var o={"new":t,"html":cleanHtml(el)};return o})}if(!edits.length&&!images.length&&!links.length&&!styles.length&&!secStyles.length&&!sections){st("No changes yet");return}var b=this;b.disabled=true;st("Saving…");fetch("/api/store/capture/edit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:window.__VYA_EDIT.path,edits:edits,images:images,links:links,styles:styles,secStyles:secStyles,sections:sections})}).then(function(r){return r.json()}).then(function(d){b.disabled=false;if(d.ok){if(window.parent!==window)window.parent.postMessage({vya:"saved"},"*");if(struct){st("Saving…");setTimeout(function(){location.reload()},650)}else{td={};dimg={};dlink={};dstyle={};dsecstyle={};st("Saved ✓")}}else st(d.error||"Save failed")}).catch(function(){b.disabled=false;st("Save failed")})});function selectSection(sec){var fields=[];sec.querySelectorAll("[data-vya-eid]").forEach(function(el){if((el.textContent||"").trim())fields.push({kind:"text",eid:parseInt(el.getAttribute("data-vya-eid"),10),value:el.textContent.trim(),tag:el.tagName.toLowerCase()})});sec.querySelectorAll("[data-vya-img]").forEach(function(el){fields.push({kind:"image",id:parseInt(el.getAttribute("data-vya-img"),10),src:el.getAttribute("src")})});sec.querySelectorAll("[data-vya-link]").forEach(function(el){fields.push({kind:"link",id:parseInt(el.getAttribute("data-vya-link"),10),href:el.getAttribute("href")||"",label:(el.textContent||"").trim().slice(0,50)})});document.querySelectorAll(".vya-sel").forEach(function(x){x.classList.remove("vya-sel")});sec.classList.add("vya-sel");window.__vyaSel=sec;var si=sec.getAttribute("data-vya-sec");var cs=getComputedStyle(sec);var stStyle={bg:rgbHex(cs.backgroundColor),color:rgbHex(cs.color),align:cs.textAlign};var rb=sec.getBoundingClientRect();if(window.parent!==window)window.parent.postMessage({vya:"section",index:si!==null?parseInt(si,10):-1,fields:fields,style:stStyle,rect:{top:rb.top,cx:rb.left+rb.width/2}},"*")}function reportRect(){if(window.__vyaSel&&window.parent!==window){var rr=window.__vyaSel.getBoundingClientRect();window.parent.postMessage({vya:"secrect",top:rr.top,cx:rr.left+rr.width/2},"*")}}window.addEventListener("scroll",reportRect,true);window.addEventListener("resize",reportRect);window.addEventListener("message",function(e){var d=e.data||{};if(!d||!d.vya)return;if(d.vya==="set"){if(d.kind==="text"){var el=document.querySelector('[data-vya-eid="'+d.eid+'"]');if(el){el.textContent=d.value;td[d.eid]=d.value}}else if(d.kind==="image"){var im=document.querySelector('[data-vya-img="'+d.id+'"]');if(im){im.setAttribute("src",d.src);im.removeAttribute("srcset");dimg[d.id]=d.src}}else if(d.kind==="link"){var a=document.querySelector('[data-vya-link="'+d.id+'"]');if(a){a.setAttribute("href",d.href);dlink[d.id]=d.href}}st("Unsaved changes");if(window.parent!==window)window.parent.postMessage({vya:"unsaved"},"*")}else if(d.vya==="save"){document.getElementById("vya-save").click()}else if(d.vya==="scrollto"){var t=document.querySelector('[data-vya-sec="'+d.index+'"]');if(t)t.scrollIntoView({behavior:"smooth",block:"center"})}else if(d.vya==="addblock"){var nb=newBlockEl(d.type||"text");if(d.src&&d.type==="image"){var im9=nb.querySelector("img");if(im9){im9.setAttribute("src",d.src);im9.removeAttribute("srcset")}}var secs=document.querySelectorAll("[data-vya-sec]");if(secs.length){var last=secs[secs.length-1];last.parentNode.insertBefore(nb,last.nextSibling)}else{(document.querySelector("main")||document.body).appendChild(nb)}instrumentNew(nb);struct=1;st("Unsaved changes");if(window.parent!==window)window.parent.postMessage({vya:"unsaved"},"*");nb.scrollIntoView({behavior:"smooth",block:"center"})}else if(d.vya==="css"){var ls=document.getElementById("vya-live-design");if(!ls){ls=document.createElement("style");ls.id="vya-live-design";document.head.appendChild(ls)}ls.textContent=d.css||""}else if(d.vya==="undo"){try{document.execCommand("undo")}catch(e2){}st("Unsaved changes");if(window.parent!==window)window.parent.postMessage({vya:"unsaved"},"*")}else if(d.vya==="redo"){try{document.execCommand("redo")}catch(e3){}st("Unsaved changes");if(window.parent!==window)window.parent.postMessage({vya:"unsaved"},"*")}else if(d.vya==="dupsec"){var s2=window.__vyaSel;if(s2){var c2=s2.cloneNode(true);c2.classList.remove("vya-hi","vya-sel");s2.parentNode.insertBefore(c2,s2.nextSibling);struct=1;st("Unsaved changes")}}else if(d.vya==="delsec"){var s3=window.__vyaSel;if(s3){s3.classList.add("vya-del");s3.classList.remove("vya-sel");window.__vyaSel=null;sb.style.display="none";struct=1;st("Unsaved changes")}}else if(d.vya==="secstyle"){var s4=window.__vyaSel;if(s4&&d.prop){if(d.value)s4.style.setProperty(d.prop,d.value,"important");else s4.style.removeProperty(d.prop);var si4=s4.getAttribute("data-vya-sec");if(si4!==null){dsecstyle[si4]=dsecstyle[si4]||{};if(d.value)dsecstyle[si4][d.prop]=d.value+" !important";else delete dsecstyle[si4][d.prop]}st("Unsaved changes")}}else if(d.vya==="movesec"){var s5=window.__vyaSel;if(s5){var p5=s5.parentNode;var sib=secSibs(s5).filter(function(n){return !n.classList.contains("vya-del")});var i5=sib.indexOf(s5);var sw5=d.dir==="up"?sib[i5-1]:sib[i5+1];if(sw5){if(d.dir==="up")p5.insertBefore(s5,sw5);else p5.insertBefore(sw5,s5);struct=1;st("Unsaved changes");reportRect()}}}});[].slice.call(document.querySelectorAll("[data-vya-block] details")).forEach(function(dd){dd.setAttribute("open","")});})();`;

/** Serve a captured page in EDIT mode: tag editable text/images/sections + inject the editor. */
export function prepareEditMode(html: string, slug: string, path: string): string {
 const $ = cheerio.load(html);
 $("meta[http-equiv]").each((_: number, el: any) => { if (/content-security-policy/i.test($(el).attr("http-equiv") || "")) $(el).remove(); });
 // Re-run the Shopify cleanup so the editor matches the live site — and so already-captured sites
 // get the stray "© Store VYA" footer artifact fixed on load (deShopify is idempotent).
 deShopify($);
 eachEditable($, (el, eid) => $(el).attr("data-vya-eid", String(eid)));
 eachImage($, (el, id) => $(el).attr("data-vya-img", String(id)));
 eachLink($, (el, id) => $(el).attr("data-vya-link", String(id)));
 eachSection($, (el, id) => $(el).attr("data-vya-sec", String(id)));
 const inject = `<script>window.__VYA_EDIT=${JSON.stringify({ slug, path })};</script><script>${EDITOR_JS}</script>`;
 // Always show the "Powered by VYA" badge bottom-right, even inside the editor (guarded, injects once).
 const out = injectPoweredBy($.html());
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

// Header/footer/nav are duplicated on every captured page, so editing them on one page leaves the others
// stale. These two functions propagate SHARED-CHROME edits across pages: extract the text/link/image
// changes that land inside header/footer/nav on the edited page, then apply them (by matching the OLD
// value) to the same chrome on every other page. Structural edits (add/move/delete) stay per-page.
const CHROME_SEL = "header, footer, nav";
export type ChromeEdits = { texts: { old: string; val: string }[]; links: { old: string; val: string; label: string }[]; images: { old: string; val: string }[] };
export function extractChromeEdits(sourceHtml: string, p: PageEdits): ChromeEdits {
 const $ = cheerio.load(sourceHtml);
 eachEditable($, (el: any, eid: number) => $(el).attr("data-vya-eid", String(eid)));
 eachLink($, (el: any, id: number) => $(el).attr("data-vya-link", String(id)));
 eachImage($, (el: any, id: number) => $(el).attr("data-vya-img", String(id)));
 const texts: ChromeEdits["texts"] = [], links: ChromeEdits["links"] = [], images: ChromeEdits["images"] = [];
 for (const e of p.edits || []) { const el = $(`[data-vya-eid="${e.eid}"]`); if (el.length && el.closest(CHROME_SEL).length) { const old = (el.text() || "").trim(); if (old && old !== e.text.trim()) texts.push({ old, val: e.text }); } }
 for (const l of p.links || []) { const el = $(`[data-vya-link="${l.id}"]`); if (el.length && el.closest(CHROME_SEL).length) { const old = el.attr("href") || ""; if (old !== l.href) links.push({ old, val: l.href, label: (el.text() || "").trim() }); } }
 for (const im of p.images || []) { const el = $(`[data-vya-img="${im.id}"]`); if (el.length && el.closest(CHROME_SEL).length) { const old = el.attr("src") || ""; if (old && old !== im.src) images.push({ old, val: im.src }); } }
 return { texts, links, images };
}
export function hasChromeEdits(c: ChromeEdits): boolean { return c.texts.length > 0 || c.links.length > 0 || c.images.length > 0; }
export function applyChromeEditsToPage(html: string, c: ChromeEdits): { html: string; changed: boolean } {
 if (!hasChromeEdits(c)) return { html, changed: false };
 const $ = cheerio.load(html);
 let changed = false;
 c.texts.forEach(({ old, val }) => { $(CHROME_SEL).find("*").each((_: number, n: any) => { const $n = $(n); if ($n.children().length === 0 && ($n.text() || "").trim() === old) { $n.text(val); changed = true; } }); });
 c.links.forEach(({ old, val, label }) => { $(CHROME_SEL).find("a").each((_: number, n: any) => { const $n = $(n); if ((($n.attr("href") || "") === old) && (!label || ($n.text() || "").trim() === label)) { $n.attr("href", val); changed = true; } }); });
 c.images.forEach(({ old, val }) => { $(CHROME_SEL).find("img").each((_: number, n: any) => { const $n = $(n); if (($n.attr("src") || "") === old) { $n.attr("src", val); $n.removeAttr("srcset"); changed = true; } }); });
 return { html: changed ? $.html() : html, changed };
}
