/* eslint-disable @typescript-eslint/no-explicit-any */
// High-fidelity site capture (the "keep their exact design" engine). We fetch a
// store's real page, inline its stylesheets (absolutizing every url() to the source
// CDN), point images/fonts at their real source, and rewrite same-origin LINKS to
// the VYA-hosted copy — so the whole site can be navigated on VYA, pixel-faithful.
// (JS is stripped for v1: looks identical; interactivity + cart + AI editing next.)
import * as cheerio from "cheerio";
import { unavailableLabel } from "./unavailable-label.ts";
// domhandler's Element, not the DOM one — these helpers operate on cheerio nodes.
import type { Element as DomElement } from "domhandler";
// Relative, not the "@/app" alias: Node's native TS test runner doesn't read tsconfig paths
// (this file's own test — site-capture.test.ts — otherwise fails to load under `node --test`).
import { assertPublicUrl, safeFetch } from "./safe-url.ts";
import { CAPTURE_SHIM } from "./capture-shim.ts";
import { looksLikeBotChallenge } from "./import-engine/detect.ts";
import { classifyScript, rewriteInlineJsUrls, ownOrigins, detectMyshopifyDomain, stripShopifyCommerceUrls, isDeniedScriptUrl, isDeniedInlineScript } from "./plan-b/scripts.ts";
import { rehostPageAssets } from "./rehost-theme-assets.ts";
import { deriveCartTemplate, type CartTemplate, type KnownItem } from "./plan-b/derive-cart-template.ts";
import { renderCartRows } from "./plan-b/render-cart.ts";
import { saveCartTemplate } from "./plan-b/cart-template-store.ts";
// The imported-site builder: pure modules, imported here only by the few hooks that need them.
import { gridMarkerHtml, isGridId, newGridId, parseGridConfig, type GridConfig } from "./site-builder/grid-config.ts";
import { EDITOR_NUMBERING } from "./site-builder/numbering.ts";
import { SITE_BUILDER_EDITOR_JS } from "./site-builder/editor-additions.ts";

/** What a cart-template capture yields: the /cart page to store, and the layout derived from it. */
export type CartTemplateCapture = { capture: Capture | null; template: CartTemplate | null };
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
/**
 * The URL relative references in this document resolve against.
 *
 * Almost always the page's own URL — but a document may declare `<base href>`, and when it does the
 * HTML spec says EVERY relative reference resolves against that instead. 2ndstreetusa.com's CMS puts
 * `<base href="https://2ndstreetusa.com/">` in every page's head and then writes its links and assets
 * purely relative to the site root (`href="about"`, `href="assets/styles/main.css"`). Resolved against
 * the page URL, an article four levels deep asked for /article/26/07/07/assets/styles/main.css and got
 * a 404 — the page was stored with no stylesheet, no logo, and a nav pointing at paths that never
 * existed. Capture strips <base> at the end precisely because it claims to have absolutized everything
 * already; that claim is only true if the base was honoured first.
 *
 * A relative `<base href>` is itself resolved against the page URL, only the first one counts, and a
 * malformed one is ignored — all three per the spec.
 */
export function documentBase($: cheerio.CheerioAPI, sourceUrl: string): string {
 const declared = $("base[href]").first().attr("href");
 if (!declared || !declared.trim()) return sourceUrl;
 try { return new URL(declared.trim(), sourceUrl).href; } catch { return sourceUrl; }
}

function absSrcset(v: string | undefined, base: string): string {
 if (!v) return "";
 const t = v.trim();
 // A `data:` URI candidate — Shopify themes' own lazy-load placeholder (`data:image/svg+xml;utf8,
 // <svg …></svg>`) — carries its OWN comma as part of the `data:[mediatype],<payload>` syntax.
 // Splitting the whole srcset on "," broke that single candidate into two pieces; the back half
 // (raw, unencoded SVG markup) doesn't look like a URL, so it fell into abs()'s relative-URL branch
 // and got absolutized AND percent-encoded into "data:image/svg+xml;utf8, https://origin/%3Csvg…" —
 // a src the browser can't decode, rendering as a broken image with its alt text showing. A
 // placeholder is always the srcset's entire (single, descriptor-less) value, so hand it to abs() as
 // one atomic candidate — the same data:-passthrough rule abs() already applies everywhere else.
 if (t.startsWith("data:")) return abs(t, base);
 return t.split(",").map((part) => { const [u, d] = part.trim().split(/\s+/); return abs(u, base) + (d ? " " + d : ""); }).join(", ");
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
  // …nor a container that is mostly OTHER CONTENT. Some themes wrap a whole region in the
  // localization <form> — one puts its entire footer inside `<form class="shopify-localization-form">`,
  // so removing the currency picker deleted the footer with it (3,400 characters of links, policies
  // and newsletter). If the element carries substantial content of its own, it isn't the widget:
  // take out only the picker controls and leave everything else standing.
  const links = $(el).find("a[href]").length;
  const text = ($(el).text() || "").replace(/\s+/g, " ").trim().length;
  if (links > 3 || text > 400) {
   // ONLY the form controls themselves — never a wrapper. An earlier version of this also removed
   // `[class*="disclosure-list"]`, and this theme builds its footer link lists as disclosure lists,
   // so it deleted 180 footer links while carefully preserving the form around them. A leftover
   // empty wrapper is harmless; deleting the seller's footer is not.
   $(el).find('select[name="country_code"], select[name="locale_code"], input[name="country_code"], input[name="locale_code"], [class*="localization-form__select"], [class*="localization-form__currency"]').remove();
   return;
  }
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
/** Pull `<symbol id="…">` — and anything it references by id — out of an external SVG sprite, so a
 *  captured page can carry its icons inline instead of hot-linking them (see the <use> block in
 *  captureSite for why hot-linking cannot work). A masked icon is two elements, not one: the symbol
 *  plus the <mask>/<clipPath>/gradient it points at, which sit OUTSIDE it in the sprite — so follow
 *  the ids each collected element references until nothing new turns up, or the icon inlines as a
 *  blank box. `id` is validated by the caller as [\w-]+, so it is safe to embed in this pattern. */
function collectSpriteSymbols(sprite: string, id: string, out: Map<string, string>): void {
 if (out.has(id) || !/^[\w-]+$/.test(id)) return;
 const paired = new RegExp(`<(symbol|mask|clipPath|linearGradient|radialGradient|filter|g|path)\\b[^>]*\\bid="${id}"[\\s\\S]*?</\\1>`);
 const selfClosing = new RegExp(`<(?:path|circle|rect|polygon|use|stop)\\b[^>]*\\bid="${id}"[^>]*/>`);
 const m = paired.exec(sprite) || selfClosing.exec(sprite);
 if (!m) return;
 out.set(id, m[0]);
 const refs = new Set<string>();
 for (const r of m[0].matchAll(/url\(#([\w-]+)\)/g)) refs.add(r[1]);
 for (const r of m[0].matchAll(/(?:xlink:)?href="#([\w-]+)"/g)) refs.add(r[1]);
 for (const r of refs) collectSpriteSymbols(sprite, r, out);
}

/**
 * A `<use>` reference split into the sprite file to fetch and the symbol id to pull out of it —
 * or null when there is nothing to inline (an already-local `#id`, no fragment, not an SVG, or an
 * id that isn't a plain token we can safely put in a regex).
 *
 * The extension is tested against the resolved PATH, not the raw reference: 2ndstreetusa.com writes
 * `assets/images/sprite.svg?v=1785931200855#logo-type`, and a tail-anchored /\.svg$/ on the raw
 * string fails on the cache-buster. That skipped the <use> altogether and left it RELATIVE, so on a
 * VYA origin it resolved against ours, 404'd, and the store's wordmark rendered as blank space.
 */
export function spriteRef(raw: string, sourceUrl: string): { url: string; id: string } | null {
 const hash = raw.indexOf("#");
 if (hash <= 0) return null;                          // already a local "#id", or no fragment at all
 const id = raw.slice(hash + 1);
 if (!/^[\w-]+$/.test(id)) return null;
 const url = abs(raw.slice(0, hash), sourceUrl);
 let path = raw.slice(0, hash);
 try { path = new URL(url).pathname; } catch { /* not absolutizable — fall back to the raw ref */ }
 if (!/\.svg$/i.test(path)) return null;
 return { url, id };
}

/**
 * Inline the SVG sprite symbols a page's <use> elements point at, in place.
 *
 * Squarespace draws every social icon as
 * `<use xlink:href="/universal/svg/social-accounts.svg#instagram-unauth-icon">` — a ROOT-RELATIVE
 * href, so re-hosted on VYA it resolves against OUR origin, 404s, and the footer's icons render as
 * blank space. Absolutizing it back to the source is NOT enough: browsers refuse a cross-origin
 * <use>, so the icons would still be blank. Inlining the referenced symbols (2KB, not the sprite's
 * 119KB) makes them local — and, like the stylesheets captureSite() inlines the same way, immune to
 * the source CDN later moving or blocking the file.
 *
 * Exported (not just inlined into captureSite) so a repair pass can re-run it against pages
 * captured before this existed, without a full re-capture — see the "no source_id, missing sprite
 * inlining" class of already-stored pages this fixes retroactively.
 */
export async function inlineSocialIconSprites($: cheerio.CheerioAPI, sourceUrl: string): Promise<void> {
 const sprites = new Map<string, string | null>();   // sprite URL -> body (null = unfetchable)
 const symbols = new Map<string, string>();          // symbol id  -> its markup
 for (const el of $("use").toArray() as DomElement[]) {
  const $u = $(el);
  // Keep the spelling the source used. Writing both `href` and `xlink:href` emitted the attribute
  // TWICE on the same element — cheerio parses this as HTML, where "xlink:href" is just a literal
  // name, so the two are separate attributes rather than one. Browsers honour either on <use>.
  const attrName = $u.attr("xlink:href") != null ? "xlink:href" : "href";
  const setRef = (v: string) => { $u.removeAttr("href"); $u.removeAttr("xlink:href"); $u.attr(attrName, v); };
  const raw = $u.attr("xlink:href") || $u.attr("href") || "";
  const ref = spriteRef(raw, sourceUrl);
  if (!ref) continue;
  const { url: spriteUrl, id } = ref;
  // Very often the page ALREADY defines this symbol inline and writes an external ref anyway —
  // Squarespace ships a 20-symbol sprite in the body and still points its social icons at the CDN
  // copy. Then there is nothing to fetch: just aim the reference at the symbol already here.
  // (Re-inlining it would define the same id twice, and a duplicate id is the browser's problem.)
  if ($(`[id="${id}"]`).length) { setRef("#" + id); continue; }
  if (!sprites.has(spriteUrl)) {
   let body: string | null = null;
   for (let attempt = 0; attempt < 2 && body === null; attempt++) {
    try { const r = await safeFetch(spriteUrl, { headers: UA, signal: AbortSignal.timeout(12000) }); if (r.ok) body = await r.text(); } catch { /* retry / give up */ }
   }
   sprites.set(spriteUrl, body);
  }
  const sprite = sprites.get(spriteUrl);
  if (!sprite) {
   // Couldn't fetch it: at least stop pointing the reference at VYA's own origin.
   setRef(spriteUrl + "#" + id);
   continue;
  }
  collectSpriteSymbols(sprite, id, symbols);
  setRef("#" + id);
 }
 if (symbols.size) {
  $("body").append(`<svg data-vya-sprite="1" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">${[...symbols.values()].join("")}</svg>`);
 }
}

/**
 * Remove every script from an already-captured page.
 *
 * SECURITY BOUNDARY. A Plan B capture deliberately KEEPS the seller's JavaScript, because it will be
 * served from their own registrable domain where the same-origin policy isolates it. The very same
 * stored HTML is still reachable at vyaplatform.com/site/{slug} — and there, that script would run
 * with VYA's privileges (stored XSS with a logged-in buyer's or admin's cookies).
 *
 * So the capture stores the seller's code and the SERVE decides. This is the function that decides,
 * and it runs on every VYA-origin response.
 */
/**
 * Undo the "hide the page until my JavaScript says so" trick, on the page root only.
 *
 * 2ndstreetusa.com serves `<body style="opacity: 0;">` and raises it on load; a script-free render
 * never runs that, so all 127 captured pages were a blank white screen while every metric read
 * healthy — 4 stylesheets, 1,426 CSS rules, 3,685px of content. Only the screenshot showed it.
 *
 * Scoped deliberately to <html> and <body>: a page root at zero opacity is never a design, it is
 * always a loading state. Anything below it may legitimately be hidden (an inactive carousel slide),
 * so it is left alone.
 */
function revealPageRoot($: cheerio.CheerioAPI): void {
 $("html, body").each((_: number, el: unknown) => {
  const $el = $(el as never);
  const style = $el.attr("style");
  if (!style || !/opacity|visibility|display/i.test(style)) return;
  const kept = style
   .split(";")
   .filter((d) => !/^\s*opacity\s*:\s*0*(\.0*[0-4]\d*)?\s*$/i.test(d))
   .filter((d) => !/^\s*visibility\s*:\s*hidden\s*$/i.test(d))
   .filter((d) => !/^\s*display\s*:\s*none\s*$/i.test(d))
   .join(";");
  if (kept.trim()) $el.attr("style", kept); else $el.removeAttr("style");
 });
}

export function stripScripts(html: string): string {
 const $ = cheerio.load(html);
 // A real browser only skips <noscript> content when it SUPPORTS scripting — a capability of the
 // visitor's browser, unrelated to how many <script> tags THIS page happens to contain. Since we're
 // the ones removing every script below, this render has no JS to resolve the theme's own
 // `[data-rimg=lazy]`/lazysizes sibling image — so without surfacing the noscript fallback here, a
 // script-free render would show NEITHER image (see surfaceNoscriptImages()'s own comment). This
 // must run at SERVE time, not only at capture time: a store captured for Plan B (scripts kept,
 // noscript correctly left wrapped-and-inert) can still be viewed here as a Plan A fallback, and that
 // render is just as script-free as a legacy Plan A capture.
 surfaceNoscriptImages($);
 // Same precondition, same reason: nothing here will run the theme's own reveal. See revealPageRoot().
 revealPageRoot($);
 $("script").remove();
 $("*").each((_: number, el: any) => {
  const attribs = el.attribs || {};
  for (const name of Object.keys(attribs)) {
   if (/^on/i.test(name)) { $(el).removeAttr(name); continue; }
   if ((name === "href" || name === "src" || name === "xlink:href") && /^\s*javascript:/i.test(attribs[name] || "")) $(el).removeAttr(name);
  }
 });
 return $.html();
}

/**
 * Serve-time enforcement of the script denylist (Plan B only).
 *
 * Capture decides what to keep; this decides what may still RUN. The two are separate on purpose:
 * a capture is frozen at the moment it was crawled, so a tracker we only learned to recognise later
 * would keep executing on the seller's domain forever otherwise. Shopify's Performance Kit was
 * exactly that case — its <script src> sits on the seller's own domain
 * (`/cdn/shopifycloud/perf-kit/…`), so capture's same-origin rule kept it, and it beaconed every
 * page view to `/api/collect` and monorail from a domain WE operate.
 *
 * Only the denylist is applied here, never the allowlist — see isDeniedScriptUrl.
 */
export function stripVendorScripts(html: string): string {
 const $ = cheerio.load(html);
 $("script[src]").each((_: number, el: any) => {
  if (isDeniedScriptUrl($(el).attr("src") || "")) $(el).remove();
 });
 // …and the app embeds that carry no src at all — see isDeniedInlineScript.
 $("script:not([src])").each((_: number, el: any) => {
  if (isDeniedInlineScript($(el).html() || "")) $(el).remove();
 });
 removeAppPopupMarkup($);
 return $.html();
}

/**
 * Popup MARKUP an app server-rendered into the page, as opposed to markup its script injects.
 *
 * Denying the script is not always enough. Omnisend's in-shop welcome modal is already in the
 * captured HTML — 19 nodes of it — and it is visible without any script running, so on one store it
 * covered the hero, the product grid and the Add-to-cart button on every page. Removing its script
 * alone left the dialog on screen with nothing left to close it.
 *
 * Deliberately a short, named list. These are dialog ROOTS belonging to specific apps, never a
 * theme's own section — and every one of these apps stops working when the seller cancels Shopify,
 * so this only brings that outcome forward.
 */
function removeAppPopupMarkup($: cheerio.CheerioAPI): void {
 $([
  ".wl-welcome",                    // Omnisend in-shop welcome
  ".ht-tms__recommendation-popup",  // Hextom market/region picker
  ".ht-tms__recommendation-popup__backdrop",
  "#bss-window-popup-container",    // BSS window popup
  "email-signup-popup",
 ].join(",")).remove();
}

export function cleanShopifyChrome(html: string): string {
 const $ = cheerio.load(html);
 deShopify($);
 // Folded in rather than run as a second pass: this parses an ~800KB document, and doing it twice
 // per product view was measurable. Always correct here — on a Plan A serve the scripts are already
 // gone, so this is a no-op; on a Plan B serve it is the enforcement described in stripVendorScripts.
 $("script[src]").each((_: number, el: any) => {
  if (isDeniedScriptUrl($(el).attr("src") || "")) $(el).remove();
 });
 $("script:not([src])").each((_: number, el: any) => {
  if (isDeniedInlineScript($(el).html() || "")) $(el).remove();
 });
 removeAppPopupMarkup($);
 return $.html();
}

// Surface <noscript><img></noscript> fallbacks — what a render with no JavaScript running is meant
// to get. Skip when a lazy <img> counterpart already precedes it (promoted separately), to avoid a
// visible duplicate.
//
// Real browsers never render <noscript> content when the browser SUPPORTS scripting — which is
// true for virtually every real visitor, regardless of how many <script> tags THIS page happens to
// contain. So a genuinely script-free render (the original no-JS capture fetch, or Plan A's stripped
// serve) is the ONLY context where unwrapping this tag is correct: it's the sole way such a render
// ever shows the image at all, since the theme's own JS — the thing that would otherwise resolve the
// sibling `[data-rimg=lazy]`/lazysizes image — never runs there either. Call this ONLY where scripts
// are genuinely absent from the render (deLazy for a Plan A capture; stripScripts for any serve).
// Unwrapping it where the theme's script IS present and running (Plan B) turns an inert fallback
// into a second, permanently visible copy stacked next to the one the theme's JS correctly loads.
function surfaceNoscriptImages($: cheerio.CheerioAPI): void {
 $("noscript").each((_: number, el: any) => {
 const $el = $(el);
 const inner = $el.html() || "";
 if (!/<img/i.test(inner)) return; // leave "please enable JS" notices hidden
 const prev = $el.prev();
 if (prev.is("img") || prev.find("img").length > 0) { $el.remove(); return; }
 $el.replaceWith(inner);
 });
}

// Make a captured page's images render WITHOUT the JS we stripped. Lazy themes (lazysizes et al.)
// hide the real image behind script: a <noscript> fallback for backgrounds, a {width}-templated
// data-src for responsive images, and a `.lazyload{opacity:0}` reveal-on-load. This undoes all
// three so heroes and product photos actually show. Exported for unit testing.
/**
 * Where a theme's lazy loader parks the real image URL while a placeholder sits in `src`.
 *
 * Every loader picks its own attribute name and there is no standard, so this is a list, not a
 * rule. We knew only lazysizes' `data-src`; 2ndstreetusa.com uses Locomotive's `data-load-src` and
 * every photograph on all 127 of its pages was lost twice over — the `src` stayed a 1x1 transparent
 * GIF for a script-free render, and the untouched relative `data-load-src` was re-based onto the
 * page's own path once capture stripped <base>, so the theme's own loader 404'd as well. Neither
 * URL ever reached the asset re-hosting pass, so none of the pictures were copied to our storage.
 *
 * Ordered: the first attribute present wins. Whatever we promote is REMOVED, so nothing relative
 * survives to be re-resolved against the wrong base later.
 */
const LAZY_SRC_ATTRS = [
 "data-src",        // lazysizes, lozad — by far the most common
 "data-lazy-src",   // Slick carousel, WP Rocket
 "data-original",   // jQuery.lazyload
 "data-load-src",   // Locomotive (2ndstreetusa.com)
 "data-echo",       // echo.js
];
const LAZY_SRCSET_ATTRS = ["data-srcset", "data-lazy-srcset", "data-load-srcset"];

export function deLazy($: cheerio.CheerioAPI, sourceUrl: string, keepScripts = false): void {
 // 1) See surfaceNoscriptImages() — only valid when THIS capture has no JS running (Plan A). Under
 //    Plan B (keepScripts) the theme's kept script resolves the lazy sibling itself; stripScripts()
 //    applies the same surfacing later, at serve time, for any script-free render regardless of how
 //    the page was originally captured.
 if (!keepScripts) surfaceNoscriptImages($);

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
 const lazySrcset = LAZY_SRCSET_ATTRS.map((a) => $el.attr(a)).find(Boolean);
 const ds = LAZY_SRC_ATTRS.map((a) => $el.attr(a)).find(Boolean) || (lazySrcset || "").split(",").pop()?.trim().split(/\s+/)[0];
 if ((!cur || /placeholder|blank|data:image|1x1|lazyload/i.test(cur)) && ds) $el.attr("src", ds);
 $el.attr("src", abs(fill($el.attr("src")), sourceUrl));
 const ss = $el.attr("srcset") || lazySrcset; if (ss) $el.attr("srcset", absSrcset(fill(ss), sourceUrl));
 $el.removeAttr("loading").removeAttr("data-widths").removeAttr("data-sizes");
 for (const a of [...LAZY_SRC_ATTRS, ...LAZY_SRCSET_ATTRS]) $el.removeAttr(a);
 // Fade-in themes leave a promoted image at opacity:0 (the JS that adds `lazyloaded` never runs).
 if (/lazyload/.test($el.attr("class") || "")) $el.removeClass("lazyload lazyloading").addClass("lazyloaded");
 });

 // 2b) Lazy VIDEOS. Themes lazy-load a hero video exactly like an image — the real URL sits in
 //     `data-src` (often protocol-relative) with `preload="none"`, and theme JS promotes it. That JS
 //     is stripped under Plan A, and under Plan B the intersection observer may never fire for an
 //     element that is already on screen, so the hero rendered as an empty box either way. Promote it
 //     here so the video is real markup that plays with no JavaScript at all.
 $("video").each((_: number, el: any) => {
 const $el = $(el);
 const ds = $el.attr("data-src") || $el.attr("data-video-src");
 if (ds && !$el.attr("src")) $el.attr("src", abs(ds, sourceUrl));
 const cur = $el.attr("src"); if (cur) $el.attr("src", abs(cur, sourceUrl));
 const dp = $el.attr("data-poster") || $el.attr("poster");
 if (dp) $el.attr("poster", abs(dp, sourceUrl));
 // `preload="none"` keeps an autoplaying hero blank until script asks for it.
 if (($el.attr("preload") || "").toLowerCase() === "none") $el.attr("preload", "auto");
 $el.removeAttr("data-src").removeAttr("data-video-src").removeAttr("data-poster");
 $el.removeClass("lazy lazyload lazyloading").addClass("lazyloaded");
 });
 // <source> inside <video>/<picture> carries the same lazy pattern.
 $("source[data-src]").each((_: number, el: any) => {
 const $el = $(el);
 const ds = $el.attr("data-src");
 if (ds) $el.attr("src", abs(ds, sourceUrl)).removeAttr("data-src");
 });
 $("video source[src]").each((_: number, el: any) => { const v = $(el).attr("src"); if (v) $(el).attr("src", abs(v, sourceUrl)); });

 // 2c) CSS held in an ATTRIBUTE. Capture absolutizes <style> elements but never looked at the
 //     `style` attribute or the data-* attributes themes use to carry a deferred background —
 //     2ndstreetusa.com paints its article images from
 //       data-load-style="background-image: url('uploads/articles/…jpg')"
 //     and its loader copies that onto the element after load. Left relative, and with <base>
 //     stripped, every one resolved against the page path and 404'd. Matched by CONTENT (does the
 //     value contain a url()?) rather than by attribute name, so the next theme's spelling is
 //     covered too.
 $("[style], [data-load-style]").each((_: number, el: any) => {
 for (const [name, value] of Object.entries((el.attribs || {}) as Record<string, string>)) {
 if ((name === "style" || name.startsWith("data-")) && /url\(/i.test(value || "")) $(el).attr(name, absCssUrls(value, sourceUrl));
 }
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

export type CaptureOpts = {
 rewriteLink?: (sameOriginUrl: string) => string | null;
 /** PLAN B: keep the seller's own JavaScript.
  *  Only safe when the capture will be served from a SEPARATE REGISTRABLE DOMAIN, where the
  *  same-origin policy isolates their code from VYA. On a vyaplatform.com origin this must stay
  *  false — their script would run with VYA's privileges (stored XSS with the visitor's cookies).
  *  Outside vendors and Shopify's checkout are stripped either way (see plan-b/scripts.ts). */
 keepScripts?: boolean;
 /** The store's `.myshopify.com` address, so hardcoded absolute URLs inside inline JS can be
  *  rewritten home instead of sending carts back to Shopify. */
 myshopifyDomain?: string | null;
 /** Extra request headers for the page fetch. Used to capture the cart page as a session that
  *  actually HAS an item in it — an empty cart renders no row markup to reuse. */
 fetchHeaders?: Record<string, string>;
 /** Copy this page's theme assets (JS, fonts, logo, hero media) onto our storage as it is captured,
  *  and point the page at the copies. `cache` is shared across a crawl. The reason it happens HERE
  *  and not afterwards: these files exist only while the seller's platform serves them, and the
  *  capture is the moment we know it does. See rehostPageAssets(). */
 rehost?: { slug: string; cache: Map<string, string> };
};
export type Capture = { html: string; origin: string; sourceUrl: string; bytes: number; inlinedSheets: number; links: string[] };

export async function captureSite(url: string, opts: CaptureOpts = {}): Promise<Capture> {
 // SSRF guard: this fetches a user-supplied URL server-side, so reject anything that isn't a plain
 // public web host (localhost, internal TLDs, bare IPs incl. cloud metadata, IPv6) before touching it.
 const safe = await assertPublicUrl(url); // DNS-resolves + rejects internal IPs (SSRF)
 if (!safe) throw new Error("That URL isn’t a valid public website.");
 const sourceUrl = safe.href;
 const origin = safe.origin;
 const res = await safeFetch(sourceUrl, { headers: { ...UA, ...(opts.fetchHeaders || {}) }, signal: AbortSignal.timeout(20000) });
 if (!res.ok) throw new Error(`Couldn't load ${sourceUrl} (${res.status})`);
 const body = await res.text();
 // `res.ok` is not enough. A bot-protection interstitial is served with a 200 for the first stretch
 // of a rate limit, so without this the crawl stores "Verifying your connection…" AS the seller's
 // page — silently, on every page, and reports success. Failing loudly is the only honest outcome.
 if (looksLikeBotChallenge(body)) throw new Error(`${new URL(sourceUrl).host} is challenging automated requests (bot protection), so we couldn't read ${sourceUrl}.`);
 const $ = cheerio.load(body);
 // What relative references in THIS document resolve against — the page URL unless it declares
 // <base href>. Everything below absolutizes against `docBase`, not `sourceUrl`. See documentBase().
 const docBase = documentBase($, sourceUrl);

 // Drop the source CSP — it blocks the cart/interactivity scripts VYA injects.
 $("meta[http-equiv]").each((_: number, el: any) => { if (/content-security-policy/i.test($(el).attr("http-equiv") || "")) $(el).remove(); });

 // How the seller's JavaScript is handled depends on WHERE this capture will be served — the single
 // decision that separates Plan A from Plan B. See CaptureOpts.keepScripts.
 if (opts.keepScripts) {
 // PLAN B. Served from the store's own registrable domain, so the same-origin policy — not script
 // removal — is what protects VYA. Keeping the theme's code is the entire reason this reaches
 // 1-to-1 fidelity: their carousels, filters, drawer and search are THEIRS, not a shim's imitation.
 // Two things still go: outside vendors (they would execute on a domain we operate) and Shopify's
 // checkout (it takes the order away).
 // Read the .myshopify.com address off the page rather than relying on a caller to pass it — it is
 // always declared inline (`Shopify.shop = "…"`), and when it went unsupplied every hardcoded
 // Shopify cart URL in the theme survived capture and pointed the shopper's cart back at Shopify.
 const shopDomain = opts.myshopifyDomain || detectMyshopifyDomain($.html());
 const origins = ownOrigins(sourceUrl, shopDomain);
 $("script").each((_: number, el: any) => {
  const $el = $(el);
  const src = $el.attr("src") || "";
  if (src) {
   if (classifyScript(src, origin) !== "keep") { $el.remove(); return; }
   $el.attr("src", abs(src, docBase));
   return;
  }
  // Inline script: bring any hardcoded absolute self-URL home, or the theme's own routes would
  // point back at Shopify and the cart would leave VYA entirely.
  const code = $el.html() || "";
  if (code) $el.text(rewriteInlineJsUrls(code, origins));
 });
 } else {
 // PLAN A (vyaplatform.com/site/{slug}). SECURITY: strip ALL scripts. Re-hosting a third party's JS
 // on the VYA origin would let it act as any logged-in buyer/admin who opens the page (stored XSS
 // with the victim's cookies). VYA re-adds its own cart/editor JS at SERVE time, and capture-shim.ts
 // rebuilds the interactivity this costs.
 $("script").remove();
 $("*").each((_: number, el: any) => {
 const attribs = el.attribs || {};
 for (const name of Object.keys(attribs)) {
 if (/^on/i.test(name)) { $(el).removeAttr(name); continue; }
 if ((name === "href" || name === "src" || name === "xlink:href") && /^\s*javascript:/i.test(attribs[name] || "")) $(el).removeAttr(name);
 }
 });
 }

 // Inline stylesheets, absolutizing their url()/imports to the source CDN. Retry once
 // on a transient failure so more sheets end up self-contained (truer to the original,
 // and immune to the source CDN later changing/blocking) rather than left hot-linked.
 let inlinedSheets = 0;
 for (const el of $('link[rel="stylesheet"], link[as="style"]').toArray()) {
 const href = $(el).attr("href"); if (!href) continue;
 const cssUrl = abs(href, docBase);
 let css = "";
 for (let attempt = 0; attempt < 2 && !css; attempt++) {
 try { const r = await safeFetch(cssUrl, { headers: UA, signal: AbortSignal.timeout(12000) }); if (r.ok) css = await r.text(); } catch { /* retry / fall through */ }
 }
 if (css) { $(el).replaceWith(`<style data-vya-src="${cssUrl}">${absCssUrls(css, cssUrl).replace(/<\//g, "<\\/")}</style>`); inlinedSheets++; }
 else $(el).attr("href", cssUrl);
 }
 // Absolutize any inline <style> url()s too.
 $("style").each((_: number, el: any) => { const c = $(el).html(); if (c && /url\(/.test(c)) $(el).text(absCssUrls(c, docBase)); });

 // Inline the SVG sprite symbols the page's <use> elements point at — see inlineSocialIconSprites().
 await inlineSocialIconSprites($, docBase);

 // Images → eager, real source; undo lazy-load (noscript fallbacks, {width} templates, opacity:0).
 // The noscript-unwrap step is Plan-A only — see deLazy()'s own comment.
 deLazy($, docBase, opts.keepScripts);
 $("source[srcset], source[data-srcset]").each((_: number, el: any) => { const ss = $(el).attr("srcset") || $(el).attr("data-srcset"); if (ss) $(el).attr("srcset", absSrcset(ss, docBase)).removeAttr("data-srcset"); });
 // Other asset links (favicons, preloaded fonts/images).
 $('link[href]:not([rel="canonical"]):not([rel="alternate"])').each((_: number, el: any) => { const h = $(el).attr("href"); if (h) $(el).attr("href", abs(h, docBase)); });

 // Rewrite anchors: same-origin → the VYA-hosted copy; external → absolute (open out).
 const links = new Set<string>();
 $("a[href]").each((_: number, el: any) => {
 const raw = $(el).attr("href"); if (!raw) return;
 const full = abs(raw, docBase);
 if (!/^https?:/i.test(full)) return;
 if (sameSite(full, origin)) {
 links.add(full);
 const rewritten = opts.rewriteLink ? opts.rewriteLink(full) : null;
 // A link the rewriter DECLINES (a path we don't host, e.g. /search) would otherwise keep its
 // absolute URL — which on a Plan B origin walks the shopper off VYA and back into the seller's
 // old Shopify funnel, checkout and all. Root-relative keeps them here; a 404 on our own domain is
 // far better than handing the sale back to the source platform.
 const fallback = opts.keepScripts ? (new URL(full).pathname + new URL(full).search) : full;
 $(el).attr("href", rewritten ?? fallback);
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

 // Backstop: any absolute Shopify commerce URL that survived the passes above (a `*.myshopify.com`
 // cart/checkout endpoint, or Shop Pay) is neutralised here. Those don't belong to the seller's
 // origin, so the origin-based rewriting can't reach them — and every one of them is a route out of
 // VYA's checkout.
 let html = $.html();
 if (opts.keepScripts) html = stripShopifyCommerceUrls(html);
 // Last, on the final markup: everything above may add or rewrite an asset reference.
 if (opts.rehost) html = await rehostPageAssets(html, origin, opts.rehost.slug, opts.rehost.cache);
 return { html, origin, sourceUrl, bytes: html.length, inlinedSheets, links: [...links] };
}

// ── Crawl an entire site and store every page on VYA ─────────────────────────
// Sitemap-seeded + link-crawl, blacklist filter (skip products/cart/checkout/assets).
// Internal links are rewritten to /site/{slug}/… so the whole site navigates on VYA.
/** See the refusal in crawlAndStore. Bare hosts, no `www.`. */
const DISCARDED_HOSTS = new Set(["unique-vintage.com"]);

function includePath(p: string): boolean {
 // The cart PAGE is captured (unlike /cart/add etc.): the theme navigates to it after an add, and
 // without it the shopper lands on "Page not found" at the exact moment they're trying to buy.
 // Its contents are per-visitor, so they're re-rendered live at serve time — only the theme's
 // surrounding chrome comes from the capture.
 if (/^\/cart\/?$/.test(p)) return true;
 if (/\/(cart|account|search|checkout|login|orders|wishlist)\b/.test(p)) return false;
 if (/\/products\//.test(p)) return false; // individual products → templated + VYA checkout later
 if (/\.(json|xml|pdf|jpe?g|png|gif|webp|svg|css|js|ico)$/i.test(p)) return false;
 if (/\/cdn\//.test(p)) return false;
 return true;
}

/** What a crawl has done so far — enough to resume it in a different process.
 *  `queue` is what's left, `done` is every path already attempted (so a resume never re-fetches),
 *  `paths` is what actually stored. */
export type CrawlState = { queue: string[]; done: string[]; paths: string[] };

export type CrawlOpts = {
 /** Continue a previous crawl instead of starting over (skips the destructive reset). */
 resume?: CrawlState | null;
 /** Own the theme's assets as pages are captured (see CaptureOpts.rehost). Defaults to on whenever
  *  Blob storage is configured; a crawl-wide cache is created here so a shared asset uploads once. */
 rehostAssets?: boolean;
 /** Called as pages land, so the caller can persist progress. Throttled — not once per page. */
 onProgress?: (state: CrawlState) => Promise<void> | void;
 /** Stop cleanly after this long and report `complete: false`, rather than being killed mid-page by
  *  the platform's function timeout. Progress is preserved either way, but a clean stop also
  *  flushes the final state and lets the caller mark the job resumable straight away. */
 budgetMs?: number;
 /** PLAN B: keep the seller's own JavaScript in the stored capture (see CaptureOpts.keepScripts).
  *  Safe to store regardless — the SERVE path strips it on any VYA origin. */
 keepScripts?: boolean;
 myshopifyDomain?: string | null;
};

export type CrawlResult = {
 pages: number;
 paths: string[];
 /** False when the budget ran out with work still queued — the caller should resume. */
 complete: boolean;
 state: CrawlState;
 /** Pages that wouldn't load. Previously swallowed silently; now reported so an import can warn. */
 failed: { path: string; error: string }[];
 /** Non-fatal problems with the crawl itself (e.g. custom CSS that couldn't be preserved). */
 warnings: string[];
};

export async function crawlAndStore(slug: string, startUrl: string, maxPages = 80, opts: CrawlOpts = {}): Promise<CrawlResult> {
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
 // Stores the owner has discarded outright. unique-vintage.com was 784 pages and 1 GB of stored
 // HTML — a third of the entire capture footprint for one store — and was dropped on 2026-08-28.
 // Refused here rather than merely removed from the corpus, so nobody re-imports it by accident.
 if (DISCARDED_HOSTS.has(host)) {
 throw new Error(host + " has been discarded as a store and can't be imported.");
 }
 // Where this capture's internal links should point. Plan A serves the store under a path prefix
 // (vyaplatform.com/site/{slug}); Plan B serves it at the ROOT of its own domain, so links must stay
 // root-relative — anything else would both 404 and show the shopper a VYA-shaped URL.
 //
 // Root-relative links are only CORRECT if this store will actually be served at a root — which
 // today means Shopify only: Plan B's /cart, /search bridge speaks Shopify's own route shapes, and
 // no other platform has one. `opts.keepScripts` reflects whether Plan B is configured AT ALL (a
 // global env check), not whether THIS capture will ever be served that way — baking root-relative
 // links into, say, a Squarespace capture broke its only serving path (Plan A) for nothing: every
 // nav link and collection tile 404'd because the store was quietly assuming a root it will never
 // be served from. Detect live rather than trust a directory — stores migrate, same reasoning as
 // detectPlatform's own doc comment.
 let planBEligible = false;
 if (opts.keepScripts) {
  try {
   const homepageHtml = await safeFetch(start, { headers: UA, signal: AbortSignal.timeout(15000) }).then((r) => r.text());
   const { detectPlatform } = await import("./import-engine/detect.ts");
   planBEligible = detectPlatform(homepageHtml, start).platform === "shopify";
  } catch { /* detection failed — fall back to Plan A's prefixed links, always the safe default */ }
 }
 const linkBase = planBEligible ? "" : `/site/${slug}`;
 const rewriteLink = (full: string) => {
 const u = new URL(full);
 const p = u.pathname;
 // The QUERY STRING has to survive. Dropping it collapsed every "?page=2", "?sort_by=" and
 // "?variant=" link onto the bare path — so the theme's own pagination pointed five links at the
 // same page, and clicking them went nowhere.
 const q = u.search;
 // Shopify serves products under a collection-scoped url too (/collections/x/products/y). Normalise
 // both forms to the same page — otherwise half a theme's product links 404.
 const scoped = p.match(/^\/collections\/[^/]+(\/products\/[^/]+)\/?$/i);
 if (scoped) return linkBase + scoped[1] + q;
 if (/^\/products\//.test(p)) return linkBase + p + q; // product pages stay on VYA, served on-demand
 // Account/login/orders → VYA's saved-items page, never the seller's old Shopify account.
 if (/^\/(account|login|orders|customer)(\/|$|\?)/.test(p)) return `${linkBase}/favorites`;
 if (/^\/cart(\/|$|\?)/.test(p)) return `${linkBase}/cart`; // the injected cart drawer intercepts /cart links
 return includePath(p) ? (linkBase + (p === "/" ? "" : p) + q) || "/" : null;
 };

 // Resuming? The previous invocation already reset the store and captured some pages — seed from
 // where it stopped and DON'T delete what it stored (that's the whole point of resuming).
 const resume = opts.resume && opts.resume.queue.length ? opts.resume : null;
 if (resume) return await runCrawl(resume, { slug, origin, maxPages, rewriteLink, saveCapturePage, opts });

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
 // Deliberately NOT caught: a failed read used to fall through to `deleteCaptures` and destroy the
 // seller's custom CSS on the strength of a transient error. Failing here costs an import attempt;
 // swallowing it costs their work.
 const keepCss = await getSiteCss(slug);
 await deleteCaptures(slug);
 const warnings: string[] = [];
 if (keepCss) {
  try {
   await setSiteCss(slug, keepCss);
  } catch (e) {
   // The pages are already gone, so we can't abort — but the seller must be told their custom
   // styling didn't survive rather than discovering it on their live site.
   warnings.push(`Your site-wide custom CSS couldn’t be carried over (${e instanceof Error ? e.message : String(e)}) — you may need to re-apply it.`);
  }
 }
 return await runCrawl({ queue: [...seed], done: [], paths: [] }, { slug, origin, maxPages, rewriteLink, saveCapturePage, opts }, warnings);
}

/** The crawl loop, shared by a fresh start and a resume. Progress is reported as it goes so an
 *  interrupted run can be picked up by the next invocation. */
async function runCrawl(
 start: CrawlState,
 ctx: {
  slug: string; origin: string; maxPages: number;
  rewriteLink: (full: string) => string | null;
  saveCapturePage: (slug: string, path: string, html: string, sourceUrl: string) => Promise<void>;
  opts: CrawlOpts;
 },
 warnings: string[] = [],
): Promise<CrawlResult> {
 const { slug, origin, maxPages, rewriteLink, saveCapturePage, opts } = ctx;
 // One cache for the whole crawl. A resume in a later invocation starts fresh; rehostAsset's
 // existence check keeps that from re-downloading what an earlier invocation already took.
 const rehost = (opts.rehostAssets ?? Boolean(process.env.BLOB_READ_WRITE_TOKEN)) ? { slug, cache: new Map<string, string>() } : undefined;
 const queue = [...start.queue];
 const done = new Set(start.done);
 const paths = [...start.paths];
 const failed: { path: string; error: string }[] = [];
 const startedAt = Date.now();
 const outOfTime = () => Boolean(opts.budgetMs && Date.now() - startedAt > opts.budgetMs);

 const state = (): CrawlState => ({ queue: [...queue], done: [...done], paths: [...paths] });
 // Persisting after every page would double the write volume of a crawl for no benefit; every few
 // pages bounds how much work a crash can cost (a handful of re-fetched pages) at a fraction of it.
 let sinceFlush = 0;
 const flush = async (force = false) => {
  sinceFlush++;
  if (!opts.onProgress) return;
  if (!force && sinceFlush < 3) return;
  sinceFlush = 0;
  await opts.onProgress(state());
 };

 while (queue.length && paths.length < maxPages) {
  if (outOfTime()) { await flush(true); return { pages: paths.length, paths, complete: false, state: state(), failed, warnings }; }
  const path = queue.shift()!;
  if (done.has(path)) continue;
  done.add(path);
  try {
   const cap = await captureSite(origin + path, { rewriteLink, keepScripts: opts.keepScripts, myshopifyDomain: opts.myshopifyDomain, rehost });
   await saveCapturePage(slug, path, cap.html, origin + path);
   paths.push(path);
   for (const l of cap.links) { const p = new URL(l).pathname; if (includePath(p) && !done.has(p) && !queue.includes(p)) queue.push(p); }
  } catch (e) {
   // A page that won't load is no longer silent: it's collected and surfaces as an import warning.
   failed.push({ path, error: e instanceof Error ? e.message : String(e) });
  }
  await flush();
 }
 await flush(true);

 // Re-capture the cart page as a session that HAS an item. Crawled anonymously it renders Shopify's
 // empty state — correct chrome, but no line-item markup — and a hand-built substitute never matches
 // the theme. With a real row captured, the serve path clones it per VYA cart line.
 //
 // ALWAYS attempted — never gated on whether the plain crawl happened to reach /cart on its own.
 // It almost never does: /cart is reached through a JS cart icon, not a plain <a href="/cart">, on
 // most modern themes (confirmed live: 0 of 2 broken stores had one, 2 of 2 working stores did).
 // Gating on `paths.includes("/cart")` skipped this ENTIRE block — no capture attempt, no warning,
 // nothing — for every theme that doesn't happen to link it statically. `/cart` then 404'd for the
 // shopper with no indication anything had gone wrong. captureCartTemplate is self-contained (its
 // own products.json → add → cart-with-cookie sequence) and already degrades safely on its own
 // (try/catch, returns null) for a store that isn't Shopify at all — the gate bought nothing.
 // The cart page owns its assets like every other page; its own cache is fine (see rehostAsset's
 // existence check — anything the crawl already took is found, not re-downloaded).
 const rehostCart = (opts.rehostAssets ?? Boolean(process.env.BLOB_READ_WRITE_TOKEN)) ? { slug, cache: new Map<string, string>() } : undefined;
 const tpl = await captureCartTemplate(origin, { rewriteLink, keepScripts: opts.keepScripts, myshopifyDomain: opts.myshopifyDomain, rehost: rehostCart });
 if (tpl?.capture) await saveCapturePage(slug, "/cart", tpl.capture.html, `${origin}/cart`);
 else warnings.push("We couldn’t read your cart page layout, so your cart will use a simpler design.");
 // The DERIVED layout — which element is a line, where the title, price and picture go — worked out
 // by putting two known products in the store's own cart and reading where they landed. It is what
 // lets one renderer serve every theme instead of a selector list per theme. A miss is not fatal:
 // the cart falls back to VYA's own markup inside the store's chrome, which is a working page.
 if (tpl?.template && tpl.template.confidence >= 0.6) await saveCartTemplate(slug, tpl.template);
 else warnings.push("We couldn’t work out your cart's layout, so your cart will use a simpler design.");
 return { pages: paths.length, paths, complete: true, state: state(), failed, warnings };
}

// ── On-demand product pages with VYA commerce wired in ───────────────────────
// Captures a product page live, then replaces the Shopify add-to-cart form with a
// VYA "Buy" button pointing at VYA's checkout (the Stripe flow we already built).
// Plan A serves a store under /site/{slug}; Plan B serves it at the root of its own domain, so
// links must stay root-relative there (see crawlAndStore's linkBase for the same rule).
const linkRewriteFor = (slug: string, planB = false) => (full: string) => {
 const base = planB ? "" : `/site/${slug}`;
 const u = new URL(full);
 const p = u.pathname;
 const q = u.search; // keep ?page= / ?variant= — same reason as rewriteLink above
 const scoped = p.match(/^\/collections\/[^/]+(\/products\/[^/]+)\/?$/i);
 if (scoped) return `${base}${scoped[1]}${q}`;
 if (/^\/products\//.test(p)) return `${base}${p}${q}`;
 if (/^\/(account|login|orders|customer)(\/|$|\?)/.test(p)) return `${base}/favorites`; // → VYA, not Shopify account
 if (/^\/cart(\/|$|\?)/.test(p)) return `${base}/cart`; // injected cart drawer intercepts /cart links
 if (/\/(cart|account|search|checkout|login)\b/.test(p) || /\.(json|xml|css|js|jpe?g|png|webp|svg)$/i.test(p) || /\/cdn\//.test(p)) return null;
 return `${base}${p === "/" ? "" : p}${q}` || "/";
};

/** Rewire the captured product page's buy area for VYA's (invisible) backend:
 * remove Shopify's Shop-Pay/dynamic checkout, and keep the store's native
 * "Add to cart" + "Buy now" — they run through VYA's Stripe checkout. The buyer
 * never sees "VYA" or "Shop"; they're buying from the store. */
export type RewireOpts = {
 /** PLAN B: leave the theme's own Add-to-cart / Buy-now buttons in place. Their JavaScript posts to
  *  the relative `/cart/add.js`, which on a VYA-served origin is OUR route — so the seller's real
  *  button drives VYA's cart. Replacing it with our own would throw away the fidelity Plan B exists
  *  for. Shopify's checkout is stripped either way: it takes the order off VYA. */
 keepThemeButtons?: boolean;
 /** Why the piece is unbuyable, for the wording on the disabled control. */
 unavailableReason?: string | null;
};

export function rewireCommerce(html: string, buyHref: string | null, opts: RewireOpts = {}): string {
 const $ = cheerio.load(html);
 // Strip Shopify's dynamic/Shop-Pay checkout + installments — VYA is the checkout now.
 $('.shopify-payment-button, [data-shopify="payment-button"], .additional-checkout-buttons, shopify-payment-terms, .shopify-payment-terms, shop-pay-wallet-button, [class*="installment"], [class*="shop-pay"], [class*="shop_pay"], .shop-login-button').remove();
 // And keep them gone even if the kept theme JS tries to re-inject them.
 $("head").append('<style data-vya-commerce="1">.shopify-payment-button,shopify-payment-terms,.shopify-payment-terms,shop-pay-wallet-button,.additional-checkout-buttons,[class*="installment"],[class*="shop-pay"],[class*="shop_pay"]{display:none!important;}</style>');

 // Plan B: Shop Pay is gone (above) and the theme's own buttons stay — nothing else to do.
 if (opts.keepThemeButtons) return $.html();

 const sold = !buyHref;
 const itemId = (buyHref || "").match(/item=([\w-]+)/)?.[1] || "";
 const escAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
 const base = "display:block;width:100%;box-sizing:border-box;text-align:center;padding:15px;margin-top:10px;text-transform:uppercase;letter-spacing:.1em;font-size:13px;text-decoration:none;cursor:pointer;";
 // `data-vya-proto` carries the tag and classes of the button we are replacing. The colours a theme
 // gives that button live in ITS stylesheet, which we cannot evaluate server-side — so the browser
 // rebuilds a hidden copy of the original on load, reads what the theme actually paints it, and
 // applies that to ours. See the styleFromTheme block in CART_UI. Without it every store got the
 // same black button regardless of its palette.
 const proto = (tag: string, cls: string) => `data-vya-proto="${escAttr(`${tag}|${cls}`)}"`;
 // THE THEME'S OWN NAME FOR THIS BUTTON, carried across the swap.
 //
 // Horizon-family themes register web components that look their children up by a `ref` attribute:
 // `add-to-cart-component` and `sticky-add-to-cart` both call #updateRefs on connectedCallback and
 // THROW if `ref="addToCartButton"` is missing. Replacing the button without its ref meant both
 // components threw on every product page — and every line of their startup after that never ran.
 //
 // Nothing looked broken, because our own control handles the click. That is what makes it worth
 // fixing: a theme's script dying early is how the last round of faults hid (see the /variants
 // section 404 that took out a whole theme's boot).
 //
 // Only the PRIMARY control inherits it. Two elements answering to one ref is its own bug.
 const refAttr = (ref: string) => (ref ? ` ref="${escAttr(ref)}"` : "");
 // …AND ITS REF-BEARING CHILDREN, which live INSIDE the button we are throwing away:
 //
 //   <button ref="addToCartButton">
 //     <span class="add-to-cart-text">
 //       <span ref="quantityDisplay" style="display:none"> (<span ref="quantityNumber">1</span>)</span>
 //
 // Replacing the button discards its contents, so `sticky-add-to-cart` lost quantityDisplay and
 // threw on connect even once the button's own ref was carried across. Keep those subtrees, hidden:
 // the theme resolves them with querySelector inside itself, which does not care whether they are
 // painted, and they carry no text a shopper can read.
 const carryRefs = ($btn: cheerio.Cheerio<DomElement>): string => {
  const inner = $btn.find("[ref]").toArray() as DomElement[];
  // Only the OUTERMOST ones: keeping a nested ref as well would duplicate it, and two elements
  // answering to one ref is the bug this is fixing, in mirror image.
  const tops = inner.filter((e) => !inner.some((o) => o !== e && $.contains(o, e)));
  if (!tops.length) return "";
  return `<span data-vya-theme-refs="1" hidden style="display:none">${tops.map((e) => $.html(e)).join("")}</span>`;
 };
 const buttons = (cls: string, tag = "button", ref = "", keep = "") => sold
 ? `<a href="#" class="${cls}"${refAttr(ref)} ${proto(tag, cls)} style="${base}background:#111;color:#fff;border:1px solid #111;opacity:.4;pointer-events:none;">${escHtml(unavailableLabel(opts.unavailableReason))}${keep}</a>`
 : `<a href="#" data-vya-add="${itemId}" class="${cls}"${refAttr(ref)} ${proto(tag, cls)} style="${base}background:#111;color:#fff;border:1px solid #111;">Add to cart${keep}</a><a href="${buyHref}" class="${cls}" ${proto(tag, cls)} data-vya-secondary="1" style="${base}background:#fff;color:#111;border:1px solid #111;">Buy now</a>`;

 let done = false;
 $('form[action*="/cart"]').each((_: number, el: any) => {
 const $btn = $(el).find('[name="add"], button[type="submit"], .product-form__submit, .add-to-cart, .product__add-to-cart').first();
 const cls = $btn.attr("class") || "";
 if ($btn.length) $btn.replaceWith(buttons(cls, ($btn.get(0) as { tagName?: string } | undefined)?.tagName || "button", $btn.attr("ref") || "", carryRefs($btn))); else $(el).append(buttons(cls));
 $(el).find(".shopify-payment-button").remove();
 $(el).removeAttr("action").attr("onsubmit", "return false");
 done = true;
 });
 if (!done) { const $b = $('button:contains("Add to cart"), button:contains("Add to Cart"), [name="add"]').first(); if ($b.length) $b.replaceWith(buttons($b.attr("class") || "", "button", $b.attr("ref") || "", carryRefs($b))); }
 return $.html();
}


/**
 * Reflect the visitor's cart back onto a captured product page.
 *
 * A captured page is frozen in the state the crawler saw — always "0 in cart", never the
 * out-of-stock notice. On a real Shopify storefront the server re-renders this per visitor, so
 * without it a shopper can hammer Add to cart on a piece already in their bag and get no feedback.
 *
 * VYA inventory is ONE-OF-ONE, so "in the cart" and "maximum reached" are the same condition — which
 * makes this simpler than Shopify's version, not harder.
 *
 * Everything is expressed through the theme's OWN elements (its quantity label, its error wrapper,
 * its button) so it looks native rather than like a notice we bolted on.
 */
export function applyCartState(html: string, opts: { inCart: boolean; soldOut?: boolean; unavailableReason?: string | null }): string {
 const $ = cheerio.load(html);
 const count = opts.inCart ? 1 : 0;

 // "Quantity (N in cart)" — the theme prints this next to the quantity stepper on products that
 // have one. Only the number is ours to change. The text sits in a NESTED span (Dawn wraps it with a
 // loading spinner), so every descendant text node is checked, not just direct children.
 $("[class*='quantity__rules-cart'], [class*='quantity__label'], label").each((_: number, el: any) => {
  $(el).find("*").addBack().contents().each((__: number, node: any) => {
   if (node.type !== "text" || !node.data || !/\(\s*\d+\s+in cart\s*\)/i.test(node.data)) return;
   node.data = node.data.replace(/\(\s*\d+\s+in cart\s*\)/i, `(${count} in cart)`);
  });
 });
 // …and the number is usually its OWN element, with the surrounding text split around it:
 //   <span>(<span class="quantity-cart">0</span> in cart)</span>
 // so no single text node ever reads "(0 in cart)" and the regex above can't see it.
 $(".quantity-cart, [data-cart-quantity]").text(String(count));
 $("[data-cart-quantity]").attr("data-cart-quantity", String(count));
 // The theme hides the whole span (class + aria) while the count is zero.
 if (opts.inCart) $("[class*='quantity__rules-cart']").removeClass("hidden").removeAttr("aria-hidden");

 if (opts.inCart || opts.soldOut) {
  // A held piece has not sold — it is back on sale when the hold lapses — so the note says so.
  const message = opts.soldOut
   ? (opts.unavailableReason === "on_hold" ? "This piece is on hold for someone." : "This piece has sold.")
   : "The maximum quantity of this item is already in your cart.";
  // The theme ships this wrapper hidden and empty; fill and reveal it rather than inventing one.
  const $wrap = $("[class*='product-form__error-message-wrapper']").first();
  if ($wrap.length) {
   $wrap.removeAttr("hidden").attr("role", "alert");
   const $msg = $wrap.find("[class*='product-form__error-message']").first();
   if ($msg.length) $msg.text(message);
   else $wrap.append(`<span class="product-form__error-message">${escHtml(message)}</span>`);
  } else {
   // No theme wrapper (not every theme has one) — a minimal notice that still inherits type/colour.
   $("[name='add']").first().before(`<p data-vya-cart-note style="font:inherit;color:inherit;opacity:.85;margin:0 0 12px">${escHtml(message)}</p>`);
  }
  // A one-of-one piece already in the bag can't be added again.
  $("[name='add'], [class*='product-form__submit']").attr("disabled", "disabled").attr("aria-disabled", "true");
 }
 if (opts.soldOut) {
  // …and neutralise VYA'S OWN buy controls, which the line above cannot touch. rewireCommerce
  // replaces the theme's <button> with an <a>, and `disabled` means nothing on an anchor — so a
  // sold piece kept a working "Add to cart" and a live /checkout link. This runs per request off
  // the item's real status, which is what makes it right even for a capture stored while the piece
  // was still available.
  $("[data-vya-secondary]").remove(); // the "Buy now" half — one sold control, not two
  $("[data-vya-add]")
   .removeAttr("data-vya-add")
   .removeAttr("href")
   .attr("aria-disabled", "true")
   .css({ opacity: ".4", "pointer-events": "none" })
   // Same rule as the grid badge: only claim a sale the seller's platform actually reported.
   .text(unavailableLabel(opts.unavailableReason));
 }
 return $.html();
}


/** A VYA-native listing (created in the portal, no page on the source store) to render. */
export type NativeItem = {
 id: string; title: string; priceCents: number; currency: string;
 images: string[]; description?: string | null; size?: string | null; available?: boolean;
};

/**
 * Render a listing the seller created in the portal into the theme's own product page.
 *
 * Imported products have a real page on the source store, which we capture. A listing added in the
 * portal has none — so the product route was fetching `{source}/products/{vya-uuid}`, getting a 404,
 * and telling the shopper "Couldn't load that product". The seller's newest piece was unreachable.
 *
 * Rather than render a VYA-shaped page (foreign type, foreign layout), this substitutes the listing
 * into a captured product page from the same store — the same reuse-their-markup principle as the
 * live grids and the cart.
 */
export function renderNativeProduct(templateHtml: string, item: NativeItem): string {
 const $ = cheerio.load(templateHtml);

 const oldTitle = ($("h1").first().text() || "").replace(/\s+/g, " ").trim();
 $("h1").first().text(item.title);
 $("title").text(item.title);
 $('meta[property="og:title"], meta[name="twitter:title"]').attr("content", item.title);

 // Money, in the theme's own price elements and format.
 const price = cartMoney(item.priceCents, item.currency);
 $("[class*='price-item'], [class*='price__regular'], .price").each((_: number, el: any) => {
  $(el).find("*").addBack().contents().each((__: number, node: any) => {
   if (node.type !== "text" || !node.data) return;
   node.data = (node.data as string).replace(/[^\d\s]{0,3}[\d,]+\.\d{2}/, price);
  });
 });
 // A captured page may carry a sale/compare-at price that isn't ours to claim.
 $("[class*='price__sale'], [class*='compare-at'], s, del").remove();

 // Gallery: one media slot per image the listing actually has.
 const media = $("[class*='product__media-item'], [class*='product-media-item'], [class*='media-item']").toArray() as DomElement[];
 const imgs = item.images.filter(Boolean);
 if (media.length && imgs.length) {
  media.forEach((el, i) => {
   if (i >= imgs.length) { $(el).remove(); return; }
   $(el).find("img").each((__: number, im: any) => {
    $(im).attr("src", imgs[i]).attr("alt", item.title).removeAttr("srcset").removeAttr("data-srcset").removeAttr("sizes");
   });
  });
 } else {
  $("[class*='product__media'] img, [class*='product-media'] img").each((i: number, im: any) => {
   if (imgs[0]) $(im).attr("src", imgs[i] || imgs[0]).attr("alt", item.title).removeAttr("srcset").removeAttr("data-srcset").removeAttr("sizes");
  });
 }

 // The THUMBNAIL strip is a separate list from the media slides — leaving it alone showed the
 // template product's six photos underneath the listing's one.
 const thumbs = $("[class*='thumbnail-list'] > li, [class*='thumbnail-slider'] > li, li[class*='thumbnail']").toArray() as DomElement[];
 if (thumbs.length) {
  thumbs.forEach((el, i) => {
   if (i >= imgs.length) { $(el).remove(); return; }
   $(el).find("img").each((__: number, im: any) => {
    $(im).attr("src", imgs[i]).attr("alt", item.title).removeAttr("srcset").removeAttr("data-srcset").removeAttr("sizes");
   });
  });
  // A single image needs no thumbnail rail at all.
  if (imgs.length <= 1) $("[class*='thumbnail-list'], [class*='thumbnail-slider']").remove();
 }

 // Structured data and social meta still described the TEMPLATE's product — wrong thing to hand a
 // search engine or a link preview.
 const plain = (item.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
 $('meta[property="og:description"], meta[name="description"], meta[name="twitter:description"]').attr("content", plain.slice(0, 300));
 $('meta[property="og:image"], meta[name="twitter:image"]').attr("content", imgs[0] || "");
 $('meta[property="og:url"], link[rel="canonical"]').each((_: number, el: any) => {
  const a = $(el).attr("content") ? "content" : "href";
  const v = $(el).attr(a) || "";
  $(el).attr(a, v.replace(/\/products\/[^"'?#]+/, `/products/${item.id}`));
 });
 $('script[type="application/ld+json"]').each((_: number, el: any) => {
  const raw = $(el).html() || "";
  if (!/"@type"\s*:\s*"Product"/.test(raw)) return;
  try {
   const node = JSON.parse(raw);
   const apply = (o: any) => {
    if (!o || typeof o !== "object") return;
    if (o["@type"] === "Product") {
     o.name = item.title; o.description = plain; o.image = imgs;
     if (o.offers) { const offers = Array.isArray(o.offers) ? o.offers : [o.offers];
      offers.forEach((of: any) => { of.price = (item.priceCents / 100).toFixed(2); of.priceCurrency = item.currency; }); }
    }
    Object.values(o).forEach(apply);
   };
   apply(node);
   $(el).text(JSON.stringify(node));
  } catch { $(el).remove(); } // unparseable and stale is worse than absent
 });

 // Description.
 const $desc = $("[class*='product__description'], [class*='rte']").first();
 if ($desc.length) $desc.html(item.description ? escHtml(item.description).replace(/\n+/g, "<br>") : "");

 // The buy form posts THIS listing's id. /cart/add.js resolves a VYA uuid as readily as a source
 // variant id, so the theme's own button keeps working untouched.
 $("input[name='id'], input[name='variant-id']").attr("value", item.id).attr("data-vya-native", "1");
 $("[name='add']").removeAttr("disabled");
 // One-of-one: no variant run to choose from.
 $("variant-selects, variant-radios, [class*='product-form__input--dropdown'], [class*='product-form__input--pill']").remove();

 // Inline analytics payloads carry the TEMPLATE product's name, id and price as JSON. They aren't
 // rendered, but any script that survives would report the wrong piece. A literal string swap is
 // bounded and safe; parsing arbitrary inline JS is not.
 if (oldTitle) {
  $("script:not([src])").each((_: number, el: any) => {
   const code = $(el).html() || "";
   if (!code.includes(oldTitle)) return;
   $(el).text(code.split(oldTitle).join(item.title));
  });
 }

 // Anything still repeating the template product's name is stale.
 if (oldTitle) {
  $("*").contents().each((_: number, node: any) => {
   if (node.type !== "text" || !node.data) return;
   if (node.data.replace(/\s+/g, " ").trim() !== oldTitle) return;
   node.data = item.title;
  });
  $("img[alt]").each((_: number, el: any) => {
   if (($(el).attr("alt") || "").replace(/\s+/g, " ").trim() === oldTitle) $(el).attr("alt", item.title);
  });
 }
 return $.html();
}

export async function captureProductPage(
 slug: string, handle: string, origin: string, buyHref: string | null,
 opts: { planB?: boolean } = {},
): Promise<string> {
 const cap = await captureSite(`${origin}/products/${handle}`, {
  rewriteLink: linkRewriteFor(slug, opts.planB),
  // A product page captured on demand owns its assets the same way a crawled one does.
  rehost: process.env.BLOB_READ_WRITE_TOKEN ? { slug, cache: new Map<string, string>() } : undefined,
  keepScripts: opts.planB,
 });
 return rewireCommerce(cap.html, buyHref, { keepThemeButtons: opts.planB });
}



/**
 * Capture the store's cart page **with something in it**.
 *
 * A cart page captured while empty renders no line-item markup at all — so there is nothing to
 * reuse, and a hand-built substitute never matches the theme (wrong fonts, wrong column headers,
 * wrong button). Instead: put one real product into a throwaway cart ON THE SOURCE, then capture
 * what the theme renders for it. That gives the theme's own row markup, its own column headings and
 * its own checkout button, which the serve path then clones per VYA cart line — the same principle
 * the product grids already use.
 *
 * Best-effort: any failure returns null and the caller falls back to the empty cart page.
 */
export async function captureCartTemplate(origin: string, opts: CaptureOpts = {}): Promise<CartTemplateCapture | null> {
 const empty: CartTemplateCapture = { capture: null, template: null };
 try {
  // Two DISTINCT products, because the derivation works by finding what differs between them: if
  // both rows said the same thing there would be nothing to tell a row apart from the table.
  const feed = await safeFetch(`${origin}/products.json?limit=12`, { headers: UA, signal: AbortSignal.timeout(12000) });
  if (!feed.ok) return empty;
  const parsed = JSON.parse(await feed.text()) as {
   products?: { title?: string; handle?: string; images?: { src?: string }[]; variants?: { id?: number; price?: string; available?: boolean }[] }[];
  };
  const picks: { id: number; known: KnownItem }[] = [];
  for (const p of parsed.products || []) {
   if (picks.length === 2) break;
   const v = (p.variants || []).find((x) => x?.id && x.available !== false) || (p.variants || [])[0];
   if (!v?.id || !p.title) continue;
   // Distinct titles only — a duplicate title makes "the row holding A but not B" meaningless.
   if (picks.some((q) => q.known.title === p.title)) continue;
   picks.push({ id: v.id, known: { title: p.title, priceText: String(v.price ?? ""), imageUrl: p.images?.[0]?.src, href: p.handle ? `/products/${p.handle}` : undefined } });
  }
  if (!picks.length) return empty;

  // The empty cart first, so its markup can be diffed against a full one to find the empty state.
  const emptyCap = await captureSite(`${origin}/cart`, opts).catch(() => null);

  const add = async (id: number, cookie?: string) => safeFetch(`${origin}/cart/add.js`, {
   method: "POST",
   headers: { ...UA, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
   body: JSON.stringify({ id, quantity: 1 }),
   signal: AbortSignal.timeout(12000),
  });
  const cookieFrom = (r: Response) => (r.headers.get("set-cookie") || "").split(/,(?=[^;]+=)/)
   .map((c) => c.split(";")[0].trim()).filter((c) => /^cart(_sig)?=/.test(c)).join("; ");

  const first = await add(picks[0].id);
  // The cart cookie IS the session; without it the cart page renders empty again.
  const cookie = cookieFrom(first);
  if (!cookie) return empty;

  // ONE item: the row template the existing serve path clones, and the /cart page we store.
  const capture = await captureSite(`${origin}/cart`, { ...opts, fetchHeaders: { Cookie: cookie } });

  // TWO items: what the derivation reads. Best-effort — a store with a single product still gets a
  // usable /cart capture above, it just gets no derived template.
  let template: CartTemplate | null = null;
  if (picks.length === 2) {
   await add(picks[1].id, cookie).catch(() => null);
   const two = await captureSite(`${origin}/cart`, { ...opts, fetchHeaders: { Cookie: cookie } }).catch(() => null);
   if (two) {
    template = deriveCartTemplate({
     twoItemHtml: two.html,
     emptyHtml: emptyCap?.html,
     items: [picks[0].known, picks[1].known],
    });
   }
  }
  return { capture, template };
 } catch {
  return empty; // never let a template miss fail the import — the empty cart page still works
 }
}

// ── The cart page, rendered live inside the theme's own chrome ───────────────────────────────────
// A captured cart page is a frozen snapshot of somebody's empty cart, so its CONTENTS can never be
// reused — but its header, footer, fonts and colours can. This swaps the theme's cart form for the
// visitor's real VYA cart, styled to inherit, so the page looks native without needing a per-theme
// template.

/** Cart money keeps two decimals — the theme prints "$575.00", and the grid's 0-decimal format
 *  ("$575") looks wrong next to it. */
function cartMoney(cents: number, currency: string | null): string {
 try { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(cents / 100); }
 catch { return `$${(cents / 100).toFixed(2)}`; }
}

export type CartPageLine = { id: string; title: string; priceCents: number; currency: string; image: string | null; href: string };


/** Anything a theme might call a cart line — broad on purpose, and never trusted without the
 *  header check that goes with it. */
const CART_ROW_CANDIDATES = "[class*='cart-item'], [class*='cart_item'], [class*='cart__item'], [class*='line-item'], [class*='line_item']";

/** Totals, empty-state and the checkout button — shared by both the derived and the selector-based
 *  cart-page paths so they can never disagree about what a full cart looks like. */
function applyCartChrome($: cheerio.CheerioAPI, lines: CartPageLine[], checkoutHref: string): void {
 const subtotal = lines.reduce((n, l) => n + l.priceCents, 0);
 const cur = lines[0]?.currency || "USD";
 $("[class*='totals__total-value'], [class*='totals__subtotal-value'], [class*='cart__subtotal']").each((_: number, el: DomElement) => {
  const t = ($(el).text() || "");
  $(el).text(t.includes("USD") || t.includes(cur) ? `${cartMoney(subtotal, cur)} ${cur}` : cartMoney(subtotal, cur));
 });
 $("[name='checkout'], [class*='cart__checkout-button']").each((_: number, el: DomElement) => {
  $(el).removeAttr("disabled").attr("data-vya-checkout", checkoutHref);
 });
 if (lines.length) {
  $(".is-empty").removeClass("is-empty");
  $("[class*='cart__empty'], [class*='cart__login'], [class*='drawer__inner-empty']").remove();
  $(".critical-hidden").removeClass("critical-hidden");
 }
 $("body").append(`<script>
 document.addEventListener("click",function(e){
  var c=e.target.closest&&e.target.closest("[data-vya-checkout]");
  if(c){e.preventDefault();location.href=c.getAttribute("data-vya-checkout");return}
  var r=e.target.closest&&e.target.closest("[data-vya-cart-remove]");
  if(r){e.preventDefault();
   fetch("/api/storefront/cart",{method:"DELETE",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({itemId:r.getAttribute("data-vya-cart-remove")})}).then(function(){location.reload()});}
 });
 </script>`);
}

export function injectCartPage(html: string, lines: CartPageLine[], checkoutHref: string, template?: CartTemplate | null): string {
 const $ = cheerio.load(html);

 // An EMPTY bag. Whatever the capture happened to hold must go: a cart page captured mid-crawl can
 // carry the CRAWLER's own cart, and leaving it there showed a shopper a stranger's product sitting
 // beside the words "Your cart is empty". The blocks below only replace rows when there are lines to
 // put in their place, so an empty cart needs its own pass.
 if (!lines.length) {
  for (const el of $(CART_ROW_CANDIDATES).toArray() as DomElement[]) {
   const $el = $(el);
   if ($el.find("th").length || $el.closest("thead").length) continue;
   $el.remove();
  }
  $("table[class*='cart-item'], table.cart-items").each((_i: number, el: DomElement) => { if (!$(el).find("tr").length) $(el).remove(); });
  // Say so where the lines used to be. Without this the cart region is simply blank — and a blank
  // region beside a "Cart (0)" heading reads as a broken page rather than an empty bag.
  const $where = $("#main-cart-items .js-contents, #main-cart-items, .cart__items, cart-items").first();
  if ($where.length) $where.html(`<p style="opacity:.7;padding:32px 0">Your cart is empty.</p>`);
  applyCartChrome($, lines, checkoutHref);
  return $.html();
 }

 // A DERIVED layout, when this store has one: the rows come from renderCartRows, which needs no
 // class names at all. The selector-based path below is Dawn's and mis-fires on other themes — a
 // Horizon store rendered its table HEADER as a product line. See derive-cart-template.ts.
 if (template && lines.length) {
  // Locate the theme's row in THIS page by the derived row's own tag and classes, then replace its
  // parent's children. The parent is the items container whatever the theme calls it.
  const probe = cheerio.load(template.rowHtml, null, false).root().children().first();
  const tag = probe.get(0)?.tagName;
  const cls = (probe.attr("class") || "").trim().split(/\s+/).filter(Boolean);
  const sel = tag ? `${tag}${cls.length ? "." + cls.map((c) => c.replace(/[^\w-]/g, "")).filter(Boolean).join(".") : ""}` : "";
  // EVERY container that holds a row, not the first.
  //
  // A captured /cart page carries TWO carts: the drawer (which lives in the site header, so it is on
  // every page) and the cart page itself. Replacing only the first match filled the DRAWER and left
  // the actual cart page showing the template's product — a shopper saw their own item and a
  // stranger's side by side. Both are the visitor's cart and both must be rendered.
  const parents: DomElement[] = [];
  if (sel) {
   for (const el of $(sel).toArray() as DomElement[]) {
    const $el = $(el);
    // Header rows carry the same class as product rows on some themes; emptying <thead> would put
    // every cart line inside the table header.
    if ($el.find("th").length || $el.closest("thead").length) continue;
    const parent = el.parent as DomElement | null;
    if (parent && !parents.includes(parent)) parents.push(parent);
   }
  }
  if (!parents.length) {
   const $fallback = $("#main-cart-items .js-contents, #main-cart-items, .cart__items, cart-items").first();
   const el = $fallback.get(0) as DomElement | undefined;
   if (el) parents.push(el);
  }
  if (parents.length) {
   const rows = renderCartRows(template, lines);
   for (const parent of parents) $(parent).empty().append(rows);
   applyCartChrome($, lines, checkoutHref);
   return $.html();
  }
 }


 // The theme's own line-item row, captured from a cart that actually had something in it. Cloning it
 // is the same principle the product grids use: the store's markup already knows its own fonts,
 // column layout, price format and spacing, and nothing we hand-build will match it.
 const $rowTemplate = $(".cart-item, tr.cart-item, [class*='cart-item']:not([class*='cart-items'])").first();
 const $items = $("#main-cart-items .js-contents, #main-cart-items, .cart__items, cart-items").first();

 const subtotal = lines.reduce((n, l) => n + l.priceCents, 0);
 const cur = lines[0]?.currency || "USD";

 if (lines.length && $rowTemplate.length) {
  // Hoist the row out before cloning: a <style> caught inside the template would be duplicated per
  // line (that's how one page reached 6.4 MB).
  const $parent = $rowTemplate.parent();
  const rows = lines.map((l) => {
   const $r = $rowTemplate.clone();
   $r.find("style, link, script").remove();
   $r.find("[id]").removeAttr("id");

   const $img = defaultVisibleImg($, $r as cheerio.Cheerio<DomElement>);
   if (l.image && $img.length) $img.attr("src", l.image).attr("alt", l.title).removeAttr("srcset").removeAttr("data-srcset").removeAttr("sizes");
   else if (!l.image) $img.remove();
   // Same hover-swap "alternate" image as the product grids (see defaultVisibleImg) — a second
   // <img> left in a cart row shows through when the row is hovered, half-covering the real photo.
   const $keepCartImg = $img.get(0);
   $r.find("img").each((_i: number, el: DomElement) => { if (el !== $keepCartImg) $(el).remove(); });

   // Title: the theme's own name element, else the longest text-bearing link in the row.
   let $name = $r.find("[class*='cart-item__name'], [class*='item__name'], [class*='product-title']").first();
   if (!$name.length) {
    const links = $r.find("a[href]").toArray() as DomElement[];
    const best = links.map((a) => $(a)).filter(($a) => ($a.text() || "").trim().length > 1)
     .sort((a, b) => (b.text() || "").trim().length - (a.text() || "").trim().length)[0];
    if (best) $name = best;
   }
   const oldName = ($name.text() || "").replace(/\s+/g, " ").trim();
   if ($name.length) $name.text(l.title);
   $r.find("a[href]").attr("href", l.href);
   if (oldName) replaceLeftoverText($, $r as cheerio.Cheerio<DomElement>, oldName, l.title);

   // Every money-shaped string in the row is this line's price (unit and line total are equal —
   // VYA stock is one-of-one, so quantity is always 1).
   $r.find("*").addBack().contents().each((_: number, node: any) => {
    if (node.type !== "text" || !node.data) return;
    if (!/^\s*[^\d]{0,3}[\d,]+(\.\d{2})?\s*[A-Z]{0,3}\s*$/.test(node.data)) return;
    if (!/[\d]/.test(node.data)) return;
    if (/^\s*\d+\s*$/.test(node.data)) return; // a bare quantity, not money
    node.data = node.data.replace(/[^\d]{0,3}[\d,]+(\.\d{2})?/, cartMoney(l.priceCents, l.currency));
   });

   // Variant/size lines describe the template's product, not this one — drop what we can't restate.
   $r.find("[class*='product-option']").remove();
   // The quantity stepper would let a shopper ask for two of a one-of-one piece.
   $r.find("[class*='quantity'] input, quantity-input input").attr("value", "1").attr("readonly", "readonly").attr("min", "1").attr("max", "1");
   $r.find("[class*='quantity__button'], [name='minus'], [name='plus']").remove();
   // Point the theme's own remove control at our cart.
   $r.find("[class*='cart-remove'], cart-remove-button, a[href*='/cart/change']").attr("href", "#").attr("data-vya-cart-remove", l.id);
   return $r;
  });
  $parent.empty();
  for (const r of rows) $parent.append(r);
 } else if ($items.length) {
  // No row to clone (or an empty cart): keep the theme's chrome, say plainly that it's empty.
  $items.html(lines.length
   ? lines.map((l) => `<div style="display:flex;gap:16px;align-items:center;padding:18px 0"><div style="flex:1">${escHtml(l.title)}</div><div>${cartMoney(l.priceCents, l.currency)}</div></div>`).join("")
   : `<p style="opacity:.7;padding:32px 0">Your cart is empty.</p>`);
 }

 // Totals, in the theme's own elements.
 $("[class*='totals__total-value'], [class*='totals__subtotal-value'], [class*='cart__subtotal']").each((_: number, el: any) => {
  const t = ($(el).text() || "");
  $(el).text(t.includes("USD") || t.includes(cur) ? `${cartMoney(subtotal, cur)} ${cur}` : cartMoney(subtotal, cur));
 });

 // The theme's OWN checkout button, repointed at VYA. Replacing it with our own markup is what
 // produced a bright blue button on a burgundy storefront.
 $("[name='checkout'], [class*='cart__checkout-button']").each((_: number, el: any) => {
  $(el).removeAttr("disabled").attr("data-vya-checkout", checkoutHref);
 });

 // Empty-cart state must not sit above a full cart.
 if (lines.length) {
  $(".is-empty").removeClass("is-empty");
  $("[class*='cart__empty'], [class*='cart__login']").remove();
  $(".critical-hidden").removeClass("critical-hidden");
 }

 $("body").append(`<script>
 document.addEventListener("click",function(e){
  var c=e.target.closest&&e.target.closest("[data-vya-checkout]");
  if(c){e.preventDefault();location.href=c.getAttribute("data-vya-checkout");return}
  var r=e.target.closest&&e.target.closest("[data-vya-cart-remove]");
  if(r){e.preventDefault();
   fetch("/cart/change.js",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({id:r.getAttribute("data-vya-cart-remove"),quantity:0})}).then(function(){location.reload()});}
 });
 </script>`);
 return $.html();
}

/**
 * Squarespace's `/cart` page, replaced with a plain, VYA-rendered listing.
 *
 * Unlike Shopify's cart page (injectCartPage, above), Squarespace's renders NOTHING server-side —
 * the whole thing, heading included, is mounted client-side by their own React commerce app into
 * an initially-empty `#sqs-cart-container`. That app turned out to have undocumented validation
 * requirements on the data it's handed (see sqs-cart-json.ts) — real, correct inventory data,
 * proven correct at every layer (the fetch, the cookie, the response body), still rendered as an
 * empty cart, repeatedly, even after fixing the one contract violation we could find by reading
 * their bundle. Rather than keep debugging an opaque, minified React app with no way to run it
 * ourselves and see what it's actually doing, this bypasses it: the seller's page, header, nav and
 * footer stay exactly as captured, but the cart LISTING itself is server-rendered by us from the
 * same real inventory data, guaranteed to display because nothing client-side has to agree to show
 * it. No-ops (returns html unchanged) on any page that isn't Squarespace's cart page.
 */
export function injectSqsCartPage(html: string, lines: CartPageLine[], checkoutHref: string): string {
 const $ = cheerio.load(html);
 const $root = $("#sqs-cart-root");
 if (!$root.length) return html;

 // Disarm Squarespace's own cart app rather than leave it running alongside ours: it looks its
 // mount point up by these exact ids, so renaming them is enough for its bootstrap to find nothing
 // and quietly no-op — the same thing it does on any page with no cart block at all — instead of
 // mounting on top of what we render and re-introducing the bug this exists to route around.
 $root.attr("id", "vya-sqs-cart-root");
 $root.find("#sqs-cart-container").attr("id", "vya-sqs-cart-container");

 const subtotal = lines.reduce((n, l) => n + l.priceCents, 0);
 const cur = lines[0]?.currency || "USD";
 const rows = lines.length
  ? lines.map((l) => `
    <div style="display:flex;gap:16px;align-items:center;padding:18px 0;border-bottom:1px solid rgba(0,0,0,.08)">
     ${l.image ? `<img src="${escHtml(l.image)}" alt="${escHtml(l.title)}" style="width:64px;height:84px;object-fit:cover;background:#f2f0eb;flex-shrink:0">` : ""}
     <div style="flex:1"><a href="${escHtml(l.href)}" style="color:inherit;text-decoration:none">${escHtml(l.title)}</a></div>
     <div>${cartMoney(l.priceCents, l.currency)}</div>
     <span data-vya-cart-remove="${escHtml(l.id)}" style="cursor:pointer;opacity:.5;padding:0 6px;font-size:1.2em">&times;</span>
    </div>`).join("")
  : `<p style="opacity:.6;padding:32px 0">You have nothing in your shopping cart.</p>`;

 $root.after(`
  <div style="max-width:640px;margin:0 auto;padding:32px 24px;font-family:inherit;color:inherit">
   <h1 style="font-size:1.6em;margin:0 0 24px">Shopping Cart</h1>
   ${rows}
   ${lines.length ? `
    <div style="display:flex;justify-content:space-between;padding:20px 0;font-size:1.1em">
     <span>Subtotal</span><b>${cartMoney(subtotal, cur)}</b>
    </div>
    <a href="${escHtml(checkoutHref)}" style="display:block;text-align:center;padding:15px;background:#111;color:#fff;text-decoration:none;text-transform:uppercase;letter-spacing:.08em;font-size:13px">Checkout</a>
   ` : ""}
  </div>
  <script>
   document.addEventListener("click",function(e){
    var r=e.target.closest&&e.target.closest("[data-vya-cart-remove]");
    if(r){e.preventDefault();
     fetch("/api/storefront/cart",{method:"DELETE",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({itemId:r.getAttribute("data-vya-cart-remove")})}).then(function(){location.reload()});}
   });
  </script>`);
 return $.html();
}

// ── Injected VYA cart (drawer + script) for captured pages ───────────────────
// "Add to cart" buttons carry data-vya-add="{itemId}"; this wires them to VYA's
// cart API, shows a slide-in bag, and checks out via the multi-item Stripe flow.
const CART_UI = `
<style>
/* VYA's own buy buttons wear the THEME's classes so they look native — which also inherits any
   decorative layer that class draws. One theme's .push-btn paints a fully-rounded pill via ::after,
   offset 3px down and -3px left; behind our square button it poked out at every corner and read as
   a rendering fault. The decoration is the theme's, sized for the theme's own button shape, so it
   has no business framing ours. */
[data-vya-add]::before,[data-vya-add]::after,a[href*="/checkout?item="]::before,a[href*="/checkout?item="]::after{content:none!important;display:none!important;background:none!important;box-shadow:none!important}
/* Hidden when the theme has a cart control of its own — that one opens the drawer instead. Kept as
   the fallback for a theme where nothing else can, or the bag becomes unreachable. */
body[data-vya-has-cart-control] #vya-cart-btn{display:none}
#vya-cart-btn{position:fixed;bottom:64px;right:20px;z-index:99997;background:var(--vya-btn-bg,#111);color:var(--vya-btn-fg,#fff);border:none;border-radius:var(--vya-radius,30px);padding:13px 20px;font:600 12px/1 var(--vya-font,system-ui);letter-spacing:.08em;cursor:pointer;text-transform:uppercase}
#vya-cart-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:99998;display:none}
#vya-cart-drawer{position:fixed;top:0;right:-420px;width:380px;max-width:90vw;height:100%;background:var(--vya-surface,#fff);color:var(--vya-ink,#111);z-index:99999;transition:right .25s;display:flex;flex-direction:column;box-shadow:-4px 0 30px rgba(0,0,0,.18);font-family:var(--vya-font,system-ui)}
#vya-cart-drawer.open{right:0}
#vya-cart-drawer .vya-ch{padding:18px;border-bottom:1px solid var(--vya-hair,#eee);display:flex;justify-content:space-between;align-items:center}
#vya-cart-drawer .vya-items{flex:1;overflow:auto;padding:6px 18px}
#vya-cart-drawer .vya-it{display:flex;gap:12px;padding:14px 0;border-bottom:1px solid var(--vya-hair,#f2f2f2);align-items:center}
#vya-cart-drawer .vya-it img{width:54px;height:70px;object-fit:cover;background:#f4f4f4}
#vya-cart-drawer .vya-cf{padding:18px;border-top:1px solid var(--vya-hair,#eee)}
#vya-cart-drawer .vya-co{display:block;width:100%;text-align:center;padding:15px;background:var(--vya-btn-bg,#111);color:var(--vya-btn-fg,#fff);border:none;text-transform:uppercase;letter-spacing:.1em;font-size:13px;cursor:pointer}
#vya-added{position:fixed;top:80px;right:20px;z-index:100000;width:360px;max-width:calc(100vw - 40px);background:var(--vya-surface,#fff);color:var(--vya-ink,#111);border-radius:14px;box-shadow:0 20px 60px -12px rgba(0,0,0,.35);padding:22px;font-family:var(--vya-font,system-ui);display:none}
#vya-added.open{display:block}
#vya-added .vya-added-h{display:flex;align-items:center;justify-content:space-between;font-size:15px;font-weight:600;margin-bottom:16px}
#vya-added .vya-added-h span{display:flex;align-items:center;gap:8px}
#vya-added .vya-added-h button{background:none;border:none;font-size:20px;line-height:1;cursor:pointer;color:var(--vya-ink,#111);padding:2px}
#vya-added .vya-added-row{display:flex;gap:14px;margin-bottom:18px}
#vya-added .vya-added-row img{width:56px;height:74px;object-fit:cover;background:#f4f4f4;flex-shrink:0}
#vya-added .vya-added-title{font-size:15px;line-height:1.35}
#vya-added button.vya-added-view{display:block;width:100%;text-align:center;padding:13px;margin-bottom:10px;background:#fff;color:#111;border:1.5px solid #111;border-radius:30px;font-size:13.5px;cursor:pointer}
#vya-added button.vya-added-checkout{display:block;width:100%;text-align:center;padding:13px;margin-bottom:12px;background:#111;color:#fff;border:none;border-radius:30px;font-size:13.5px;cursor:pointer}
#vya-added button.vya-added-continue{display:block;width:100%;text-align:center;background:none;border:none;text-decoration:underline;font-size:13px;cursor:pointer;color:#111}
</style>
<button id="vya-cart-btn" onclick="VYACart.open()">Bag &middot; <span id="vya-cart-count">0</span></button>
<script>/* The theme's OWN cart icon opens our drawer — see bindCartControls. Every hosted store used
to show two ways to reach the bag (their icon, and our pill) and a shopper could not tell which was
real. Delegated, so it survives a theme re-rendering its header. */
document.addEventListener("click",function(e){var c=e.target.closest&&e.target.closest("[data-vya-cart-open]");
if(!c)return;e.preventDefault();e.stopPropagation();if(window.VYACart)VYACart.open();},true);

/* CAN SHE ACTUALLY REACH HER BAG?
   The server finds a cart control, binds it, and stamps the body — which hides our floating pill,
   because two ways to reach the bag confused everybody. On one store the theme then rebuilt its
   header in JavaScript and the bound control ended up 0x0: no icon of hers a shopper could click,
   and no pill of ours, because the stamp said she had one. A piece could go into the bag and never
   come out.
   So the stamp is re-decided in the browser, where the truth is. Same measurement the account panel
   uses: size, position, and what is actually at those coordinates — never class names. */
function vyaCartReachable(){
 var els=document.querySelectorAll("[data-vya-cart-open]");
 for(var i=0;i<els.length;i++){
  var el=els[i],r=el.getBoundingClientRect();
  if(r.width<4||r.height<4)continue;
  if(r.bottom<0||r.right<0||r.top>innerHeight||r.left>innerWidth)continue;
  var st=getComputedStyle(el);
  if(st.visibility==="hidden"||st.display==="none"||Number(st.opacity)<=0.05)continue;
  var x=Math.min(Math.max(r.left+r.width/2,1),innerWidth-1);
  var y=Math.min(Math.max(r.top+r.height/2,1),innerHeight-1);
  var hit=document.elementFromPoint(x,y);
  if(hit&&(hit===el||el.contains(hit)||hit.contains(el)))return true;
 }
 return false;
}
function vyaCartStamp(){
 if(vyaCartReachable())document.body.setAttribute("data-vya-has-cart-control","1");
 else document.body.removeAttribute("data-vya-has-cart-control");
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",vyaCartStamp);else vyaCartStamp();
addEventListener("load",vyaCartStamp);addEventListener("resize",vyaCartStamp);
/* A header can arrive late — one theme swaps its whole header in on hydration. */
setTimeout(vyaCartStamp,1500);setTimeout(vyaCartStamp,4000);
if(window.MutationObserver){var vyaCartPending=0;
 new MutationObserver(function(){if(vyaCartPending)return;
  vyaCartPending=setTimeout(function(){vyaCartPending=0;vyaCartStamp()},400);
 }).observe(document.documentElement,{childList:true,subtree:true});}
</script>
<div id="vya-cart-overlay" onclick="VYACart.close()"></div>
<div id="vya-cart-drawer">
<div class="vya-ch"><b style="text-transform:uppercase;letter-spacing:.1em;font-size:13px">Your bag</b><span onclick="VYACart.close()" style="cursor:pointer">&times;</span></div>
<div class="vya-items" id="vya-cart-items"></div>
<div class="vya-cf"><div style="display:flex;justify-content:space-between;margin-bottom:12px;font-size:14px"><span>Subtotal</span><b id="vya-cart-sub">&mdash;</b></div><button class="vya-co" onclick="VYACart.checkout()">Checkout</button></div>
</div>
<div id="vya-added" role="status" aria-live="polite">
<div class="vya-added-h"><span>&#10003; Item added to your cart</span><button onclick="VYACart.closeAdded()" aria-label="Close">&times;</button></div>
<div class="vya-added-row"><img id="vya-added-img" alt=""><div class="vya-added-title" id="vya-added-title"></div></div>
<button class="vya-added-view" onclick="VYACart.open();VYACart.closeAdded()">View cart (<span id="vya-added-count">0</span>)</button>
<button class="vya-added-checkout" onclick="VYACart.checkout()">Check out</button>
<button class="vya-added-continue" onclick="VYACart.closeAdded()">Continue shopping</button>
</div>
<script>
window.VYACart={
 fmt:function(c,cur){return new Intl.NumberFormat("en-US",{style:"currency",currency:cur||"USD"}).format((c||0)/100)},
 /* WHICH STORE'S BAG. A shopper has one bag per store. On the seller's own domain the host says
    which; on VYA's (/site/{slug}/…) there is no host to read, so the page names the store from its
    own URL. Empty elsewhere, which reads the whole bag exactly as before. */
 store:function(){var p=location.pathname.split("/");return p[1]==="site"&&p[2]?p[2]:""},
 q:function(sep){var t=this.store();return t?sep+"store="+encodeURIComponent(t):""},
 add:function(id){if(!id)return;var s=this;fetch("/api/storefront/cart"+s.q("?"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({itemId:id})}).then(function(r){return r.json()}).then(function(d){s.paint(d);s.showAdded(id,d)})},
 refresh:function(){var s=this;fetch("/api/storefront/cart"+s.q("?")).then(function(r){return r.json()}).then(function(d){s.paint(d)}).catch(function(){})},
 remove:function(id){var s=this;fetch("/api/storefront/cart"+s.q("?"),{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({itemId:id})}).then(function(r){return r.json()}).then(function(d){s.paint(d)})},
 paint:function(d){document.getElementById("vya-cart-count").textContent=d.count||0;var box=document.getElementById("vya-cart-items");var it=d.items||[];box.innerHTML=it.length?it.map(function(i){return '<div class="vya-it"><img src="'+(i.image||"")+'"><div style="flex:1"><div style="font-size:13px">'+i.title+'</div><div style="font-size:13px;opacity:.6">'+VYACart.fmt(i.priceCents,i.currency)+'</div></div><span data-vya-remove="'+i.id+'" style="cursor:pointer;opacity:.4">&times;</span></div>'}).join(""):'<p style="opacity:.5;padding:40px 0;text-align:center">Your bag is empty</p>';document.getElementById("vya-cart-sub").textContent=VYACart.fmt(d.subtotalCents,(it[0]&&it[0].currency)||"USD");var ids={};it.forEach(function(i){ids[i.id]=1});document.querySelectorAll("[data-vya-add]").forEach(function(b){if(ids[b.getAttribute("data-vya-add")]){b.textContent="In bag ✓";b.setAttribute("data-inbag","1")}else{b.textContent="Add to cart";b.removeAttribute("data-inbag")}})},
 // A confirmation popup, styled like the theme's own — this is Plan A (scripts stripped, so it's
 // VYA's own bag/checkout UI throughout), where a bare "count went up" is easy to miss and left the
 // shopper wondering whether their tap actually did anything.
 showAdded:function(id,d){var it=(d.items||[]).filter(function(i){return String(i.id)===String(id)})[0];if(!it)return;document.getElementById("vya-added-img").src=it.image||"";document.getElementById("vya-added-title").textContent=it.title;document.getElementById("vya-added-count").textContent=d.count||0;document.getElementById("vya-added").classList.add("open")},
 closeAdded:function(){document.getElementById("vya-added").classList.remove("open")},
 open:function(){document.getElementById("vya-cart-drawer").classList.add("open");document.getElementById("vya-cart-overlay").style.display="block";VYACart.closeAdded()},
 close:function(){document.getElementById("vya-cart-drawer").classList.remove("open");document.getElementById("vya-cart-overlay").style.display="none"},
 checkout:function(){location.href="/checkout?cart=1"+this.q("&")}
};
document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("[data-vya-add]");if(a){e.preventDefault();if(a.getAttribute("data-inbag")){VYACart.open()}else{VYACart.add(a.getAttribute("data-vya-add"))}}var r=e.target.closest&&e.target.closest("[data-vya-remove]");if(r){e.preventDefault();VYACart.remove(r.getAttribute("data-vya-remove"))}});
window.addEventListener("load",function(){VYACart.refresh();
/* THEME COLOURS FOR VYA'S BUY BUTTONS.
   The theme paints its own Add-to-cart from its stylesheet, which we cannot evaluate on the server —
   so rebuild a hidden copy of the button we replaced (tag + classes, in data-vya-proto), read what
   the browser actually paints it, and wear that. Every store used to get the same black button no
   matter its palette. Falls back silently to the inline default if the theme paints nothing. */
(function(){
 /* THE DRAWER WEARS THE STORE'S OWN SKIN.
    The page itself is the reference: <body> carries the theme's surface colour, ink and typeface,
    and a heading carries its display face. Read them and hand them to the drawer as CSS variables —
    every value falls back to what the drawer used before, so a page we cannot read is unchanged. */
 try{
  var bs=getComputedStyle(document.body),root=document.documentElement.style,clear2="rgba(0, 0, 0, 0)";
  var surface=bs.backgroundColor;
  if(surface===clear2||!surface) surface=getComputedStyle(document.documentElement).backgroundColor;
  if(surface&&surface!==clear2) root.setProperty("--vya-surface",surface);
  if(bs.color) root.setProperty("--vya-ink",bs.color);
  if(bs.fontFamily) root.setProperty("--vya-font",bs.fontFamily);
  /* A hairline in the page's own ink rather than a fixed grey, so it reads on a dark storefront. */
  root.setProperty("--vya-hair","color-mix(in srgb, "+(bs.color||"#111")+" 14%, transparent)");
 }catch(e){}

 var protos={};
 document.querySelectorAll("[data-vya-proto]").forEach(function(el){
  var spec=el.getAttribute("data-vya-proto")||"";
  if(!protos[spec]){
   var bits=spec.split("|"),ghost=document.createElement(bits[0]||"button");
   ghost.className=bits.slice(1).join("|");
   ghost.style.cssText="position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none";
   (el.parentNode||document.body).appendChild(ghost);
   var c=getComputedStyle(ghost);
   protos[spec]={bg:c.backgroundColor,fg:c.color,radius:c.borderRadius,border:c.border,font:c.fontFamily,weight:c.fontWeight,tt:c.textTransform,ls:c.letterSpacing};
   ghost.remove();
  }
  var t=protos[spec],clear="rgba(0, 0, 0, 0)";
  /* rgb(239, 239, 239) is Chrome's UA default for a bare <button>: it means the theme's classes did
     not style our ghost at all (they often need a parent context to apply). Wearing it would give
     five stores an unstyled grey button — worse than the black default we started from. */
  var unstyled=t&&(t.bg===clear||t.bg==="rgb(239, 239, 239)"||t.bg==="buttonface");
  if(!t||unstyled||!t.bg) return;                  /* theme paints nothing — keep our default */
  if(el.hasAttribute("data-vya-secondary")){
   /* Buy now: the same shape, inverted, so the pair reads as primary + secondary in their palette */
   el.style.setProperty("background",t.fg,"important");
   el.style.setProperty("color",t.bg,"important");
   el.style.setProperty("border","1px solid "+t.fg,"important");
  }else{
   el.style.setProperty("background",t.bg,"important");
   el.style.setProperty("color",t.fg,"important");
   el.style.setProperty("border",t.border&&t.border!=="0px none "+t.fg?t.border:"1px solid "+t.bg,"important");
  }
  /* The drawer's Checkout button and floating bag use the same pair, so the whole cart reads as
     part of the store rather than as a VYA panel dropped on top of it. */
  if(!el.hasAttribute("data-vya-secondary")){
   document.documentElement.style.setProperty("--vya-btn-bg",t.bg);
   document.documentElement.style.setProperty("--vya-btn-fg",t.fg);
   if(t.radius&&t.radius!=="0px") document.documentElement.style.setProperty("--vya-radius",t.radius);
  }
  if(t.radius&&t.radius!=="0px") el.style.setProperty("border-radius",t.radius,"important");
  if(t.font) el.style.setProperty("font-family",t.font,"important");
  if(t.weight) el.style.setProperty("font-weight",t.weight,"important");
  if(t.tt&&t.tt!=="none") el.style.setProperty("text-transform",t.tt,"important");
  if(t.ls&&t.ls!=="normal") el.style.setProperty("letter-spacing",t.ls,"important");
 });
})();
/* Hide the theme's OWN buy controls wherever VYA has placed one. rewireCommerce replaces the button
   it can find, but themes carry spares — a sticky bar, a second form, a payment button — and those
   were left sitting behind ours, peeking out at the edges and looking broken. Scoped to the block
   that actually contains a VYA button, so a page we did not rewire keeps its own controls. */
document.querySelectorAll("[data-vya-add]").forEach(function(v){
 var scope=v.closest("form,[class*='product-form'],[class*='product__info'],[class*='product-info']")||v.parentElement;
 if(!scope)return;
 scope.querySelectorAll('[name="add"],button[type="submit"],[class*="payment-button"],[class*="shopify-payment"],[class*="dynamic-checkout"],[class*="additional-checkout"]').forEach(function(b){
  if(b.hasAttribute("data-vya-add")||b.closest("[data-vya-add]"))return;
  b.style.setProperty("display","none","important");
 });
});document.querySelectorAll('a[href$="/cart"],a[href*="/cart?"]').forEach(function(a){a.addEventListener("click",function(e){e.preventDefault();VYACart.open()})});document.querySelectorAll('form[action*="/cart"]').forEach(function(f){var card=f.closest('li,[class*="card"],[class*="product"],.grid__item');var link=card&&card.querySelector('a[href*="/products/"]');if(link){f.querySelectorAll('button,[name="add"]').forEach(function(b){b.addEventListener("click",function(e){e.preventDefault();location.href=link.getAttribute("href")})})}})});
</script>`;

// ── Live VYA inventory on captured collection pages ──────────────────────────
// Captured /collections/{handle} pages are frozen Shopify HTML showing stale
// products. This replaces that static grid with a live grid of the store's VYA
// items assigned to the collection — styled to inherit the theme (transparent,
// inherited font/colour) so it looks native. Cards add to the injected VYA cart.
export type CollectionCardItem = {
 id: string; title: string; priceCents: number | null; currency: string | null; images: unknown;
 sourceId?: string | null;
 /** False for a piece that has sold. A vintage store keeps its archive on the shelf with a badge —
  *  hiding sold pieces made a 52-product store look like a 15-product one. */
 available?: boolean;
 /** Why it cannot be bought, which decides the wording. See app/lib/unavailable-label.ts. */
 unavailableReason?: string | null;
 /** What it was before the seller marked it down, when a markdown is running. */
 compareAtCents?: number | null;
};
// Common Shopify/theme selectors for the collection product grid.
const GRID_SELECTORS = "#product-grid,ul#product-grid,ul.product-grid,.product-grid,ul.grid--view-items,.grid--view-items,.collection ul.grid,ul.collection__products,.product-list,.collection-products,[class*='product-grid'],[id*='ProductGridContainer'] ul";

function money(cents: number | null, currency: string | null): string {
 // 0 is this codebase's own convention for "no real price on record" (worthImporting keeps a sold
 // archive piece even at 0, on purpose — see capture-commerce-core.ts), never a genuine free price.
 // Formatting it as "$0" implied Venus Vintage's sold-out Jimmy Choo heels once cost nothing.
 if (cents == null || cents === 0) return "";
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
 * Does this element look like a PRODUCT card, specifically — not just any tile-shaped thing.
 *
 * A marketing slide ("Build a Niche Charms Bracelet", one big photo, a headline, a "Shop now"
 * button linking to a real product) satisfies looksLikeCard() exactly as well as a real product
 * does — image, link, non-empty text, all present. That's what let a homepage's promotional hero
 * carousel get structurally mistaken for a product grid and have its curated slides overwritten
 * with random live inventory. A product tile, unlike a marketing one, reliably shows its price
 * somewhere; a hero banner never does. Used only for productGrids()'s own detection — fillGrid()
 * and friends still use the looser looksLikeCard() to count slots WITHIN a grid already confirmed
 * to be one, where requiring a visible price would be redundant at best.
 */
function looksLikeProductCard($: cheerio.CheerioAPI, el: DomElement): boolean {
 if (!looksLikeCard($, el)) return false;
 return MONEY_RE.test($(el).text() || "");
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
 // Horizon-generation themes build grids and carousels out of CUSTOM ELEMENTS — <slideshow-slides>,
 // <resource-list>, <product-grid> — which a scan of ul/ol/div/section never reaches. Custom
 // elements always contain a hyphen, which is what makes them cheap to add. Kept as a `.each()` over
 // a merged list rather than a rewritten loop, so the early-`return` guards below are untouched.
 const scanned = ($("ul, ol, div, section").toArray() as DomElement[]).concat(
  ($("*").toArray() as DomElement[]).filter((el) => typeof el.tagName === "string" && el.tagName.includes("-")),
 );
 $(scanned).each((_, el) => {
  const $el = $(el);
  const cls = `${$el.attr("class") || ""} ${$el.attr("id") || ""}`.toLowerCase();
  // Navigation, pagination and social rows are lists of links-with-icons — structurally very close
  // to a product grid, so they're excluded by name AND by where they sit. Checking only the
  // element's own class missed a bare <ul> inside <nav>, which would have had the store's menu
  // replaced with products.
  if (/pagination|breadcrumb|menu|nav|social|footer|header|announcement/.test(cls)) return;
  if ($el.closest("nav, header, footer, [role='navigation']").length > 0) return;
  // A COLLECTION LIST is structurally identical to a product grid — tiles with an image, a link and
  // a caption — but its links point at /collections/, not /products/. Without this check a homepage
  // "shop by collection" row was replaced with individual items, so the shopper saw products where
  // the seller had put category tiles.
  const hrefs = $el.find("a[href]").map((_i, a) => $(a).attr("href") || "").get();
  const toCollections = hrefs.filter((h) => /\/collections\/[^/?#]+/.test(h) && !/\/products\//.test(h)).length;
  const toProducts = hrefs.filter((h) => /\/products\//.test(h)).length;
  // Only when the row links to collections and to NO products at all. A looser rule ("more
  // collection links than product ones") cost two stores their theme-matched grid in the harness:
  // plenty of real product grids also carry collection links — a section heading, a "view all", a
  // tag filter — and they must still be treated as product grids.
  if (toProducts === 0 && toCollections >= 2) return;
  const kids = $el.children().toArray() as DomElement[];
  const named = $el.is(GRID_SELECTORS);
  // An unnamed container needs at least two children before it can plausibly be a grid; a
  // container that literally calls itself a product grid is trusted with one, so a collection
  // holding a single piece — normal for one-of-one vintage — still renders in the theme's layout.
  if (kids.length < (named ? 1 : 2)) return;
  const cards = kids.filter((k) => looksLikeProductCard($, k)).length;
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

/**
 * The product handles a captured collection page actually listed, in the order it listed them.
 *
 * For a manually-curated Shopify collection ("collection-1", a seller dragged specific pieces into
 * it with no category or brand pattern behind the choice) VYA has no way to know what belongs on
 * it — there's no matching VYA collection, and nothing to match by category/brand either. Falling
 * back to the seller's WHOLE catalogue there (the previous behaviour) turned a hand-picked 6-piece
 * edit into a dump of everything they've ever listed. The captured page itself still knows the
 * right answer: it's the exact set of `/products/{handle}` links inside the grid we captured. This
 * reads those handles back out so the caller can ask for those items LIVE — correct AND current,
 * not the frozen capture.
 */
/** The `/products/{handle}` links inside ONE grid element, in document order, deduplicated. */
function handlesInGrid($: cheerio.CheerioAPI, grid: DomElement): string[] {
 const seen = new Set<string>();
 const handles: string[] = [];
 $(grid).find('a[href*="/products/"]').each((_, a) => {
  const href = $(a).attr("href") || "";
  const m = href.match(/\/products\/([^/?#]+)/);
  const handle = m?.[1];
  if (handle && !seen.has(handle)) { seen.add(handle); handles.push(handle); }
 });
 return handles;
}

export function capturedGridProductHandles(html: string): string[] {
 const $ = cheerio.load(html);
 const grids = productGrids($);
 // A dedicated /collections/{handle} page has exactly one real product grid; a homepage can have
 // several, and this reader isn't the right tool for that case (see capturedGridProductHandlesPerGrid
 // instead) — pick the biggest so a small "you may also like" strip elsewhere on the page can't
 // outrank it.
 const grid = grids.sort((a, b) => $(b).find('a[href*="/products/"]').length - $(a).find('a[href*="/products/"]').length)[0];
 return grid ? handlesInGrid($, grid) : [];
}

/**
 * The same reader as capturedGridProductHandles(), but for EVERY grid on the page, in the SAME
 * document order productGrids() (and so detectGridHandles()) finds them in — so the two arrays can
 * be zipped together index-for-index.
 *
 * Built for a homepage carousel whose collection detectGridHandles() can't name: a modern
 * "collection focus carousel" section picks its products via Liquid (`collections['x'].products`),
 * which compiles away to plain `/products/{handle}` links with no `/collections/{handle}` link left
 * anywhere nearby for detectGridHandles() to find — "Shop Designer Bags" rendered nine real bags,
 * and there was still nothing in the HTML naming which collection they came from. The captured grid
 * still knows exactly which products it showed, same as a dedicated collection page does; this
 * reads those back out per-grid so the caller can ask for THOSE, live, before falling back further.
 */
export function capturedGridProductHandlesPerGrid(html: string): string[][] {
 const $ = cheerio.load(html);
 return productGrids($).map((grid) => handlesInGrid($, grid));
}

/** Replace EVERY product grid on the page, each with its own list of live items (index-matched to
 *  detectGridHandles). Grids whose list is empty are left alone rather than emptied. */
export function injectLiveGrids(html: string, perGrid: CollectionCardItem[][], hrefFor: HrefFor, opts: { keepQuickAdd?: boolean; uncapped?: boolean[] } = {}): string {
 if (!perGrid.some((g) => g.length)) return html;
 const $ = cheerio.load(html);
 const grids = productGrids($);
 grids.forEach((el, i) => {
  const items = perGrid[i] || [];
  if (!items.length) return;
  // Show as many pieces as the THEME showed in THIS strip — the same rule collection pagination
  // uses. A homepage "featured" rail is designed for a handful; handing it the whole catalogue
  // turned a 3-product strip into 251 cards, blew the page to 1.2 MB, and left a carousel with 251
  // slides unable to render at all — the page looked empty below the hero.
  //
  // …EXCEPT where the grid IS a collection, which the caller tells us. Then the crawl-day card
  // count is not a design decision, it is an accident of when we photographed the page: awoke's
  // denim page was captured holding 36 cards and she has since filed 41 pieces, so the five newest
  // — active, priced, photographed — could never appear. A rail has a shape the theme chose; a
  // collection has whatever the seller has put in it.
  const slots = ($(el).children().toArray() as DomElement[]).filter((k) => looksLikeCard($, k)).length;
  const cap = opts.uncapped?.[i] ? 0 : slots;
  fillGrid($, el, cap > 0 ? items.slice(0, cap) : items, hrefFor, opts.keepQuickAdd);
 });
 return $.html();
}

/**
 * Refill ONE captured product grid, keeping every scrap of markup around it.
 *
 * injectLiveGrids() above works on a whole captured PAGE; this works on a FRAGMENT the theme
 * rendered for itself — a "You may also like" strip fetched from the source store's own
 * `/recommendations/products` (see app/api/plan-b/recommendations). The fragment carries the
 * section wrapper, its colour scheme, its heading and its grid, all in the theme's own classes, so
 * cloning it and swapping in live pieces is the only way that strip can look like the rest of the
 * store instead of like markup we invented.
 *
 * Parsed as a FRAGMENT (cheerio's third argument), so nothing is wrapped in an <html>/<body> that
 * would then have to be unwrapped from the response the theme morphs into its page.
 *
 * Returns null when the fragment holds no grid we recognise — the caller then has to render its
 * own cards, which is the situation this function exists to avoid but never a reason to serve a
 * broken strip.
 */
export function fillCapturedGrid(fragmentHtml: string, items: CollectionCardItem[], hrefFor: HrefFor, opts: { keepQuickAdd?: boolean } = {}): string | null {
 if (!items.length) return null;
 const $ = cheerio.load(fragmentHtml, null, false);
 const grid = productGrids($)[0];
 if (!grid) return null;
 fillGrid($, grid, items, hrefFor, opts.keepQuickAdd);
 return $.html();
}

// ── Grid kit hooks for the imported-site builder (app/lib/site-builder/grid-kit.ts) ──────────────
// A product grid she adds to her site is filled with HER theme's own card. These two hooks let the
// builder read a captured grid apart and render a new one through the private machinery above
// (productGrids, fillGrid, renderThemeCard) without exporting any of it. Which page, which grid and
// whether the result is trustworthy is decided in the builder; nothing here writes anything.

/** One wrapper of a grid kit: its tag and attributes, with no children. */
export type KitNode = { tag: string; attrs: Record<string, string> };
/** What it takes to rebuild a grid: one card, the grid container and the wrappers around it. */
export type KitParts = { cardHtml: string; gridEl: KitNode; shell: KitNode[]; labels?: { add?: string; sold?: string } };
export type GridKitCandidate = KitParts & {
 cards: number;
 /** The template card's own product name and price, before any substitution — see the F8 check. */
 templateTitle: string;
 templatePrice: string;
 /** Each slot styled on its own (Squarespace Fluid Engine): a clone of one would land in the wrong place. */
 individuallyStyled: boolean;
 /** A carousel: forcing columns on it fights its own layout and script. */
 slider: boolean;
};

const KIT_SLIDER_RE = /slider|slideshow|swiper|flickity|carousel|splide|glide/i;
// The wrapper that owns a grid's width and colour scheme: a Shopify section, a Squarespace
// page-section, else any <section>.
const KIT_SHELL_ROOT = ".shopify-section, section.page-section, section";

function kitNode(el: DomElement): KitNode {
 const attrs: Record<string, string> = {};
 for (const [k, v] of Object.entries(el.attribs || {})) {
  // Ids would duplicate the source page's; ours and event handlers are never carried.
  if (k === "id" || /^data-vya-/i.test(k) || /^on/i.test(k)) continue;
  attrs[k] = String(v);
 }
 return { tag: String(el.tagName || "div").toLowerCase(), attrs };
}

/** Every product grid on a captured page, largest first, taken apart into a kit and the facts needed
 *  to judge it. */
export function gridKitCandidates(html: string): GridKitCandidate[] {
 const $ = cheerio.load(html);
 // Horizon-family themes print an EMPTY <style data-shopify> in every card. It styles nothing, but
 // slotsAreIndividuallyStyled() counts any <style> in a slot, so every Horizon grid read as Fluid Engine
 // and no kit was ever offered. Dropped from this private parse only — the live fill is unchanged.
 $("style").filter((_: number, s: any) => !($(s).html() || "").trim()).remove();
 const out: GridKitCandidate[] = [];
 for (const grid of productGrids($)) {
  const $grid = $(grid);
  const cards = ($grid.children().toArray() as DomElement[]).filter((k) => looksLikeCard($, k));
  const tpl = pickTemplateCard($, cards);
  if (!tpl) continue;
  const $tpl = $(tpl).clone() as cheerio.Cheerio<DomElement>;
  // Same rule as fillGrid's clone source: a card never carries a stylesheet or the source's scripts.
  $tpl.find("style, link, script, noscript").remove();
  const ancestors = ($grid.parents().toArray() as DomElement[]).filter((a) => !["html", "body", "main"].includes(a.tagName));
  const rootAt = ancestors.findIndex((a) => $(a).is(KIT_SHELL_ROOT));
  const chain = (rootAt >= 0 ? ancestors.slice(0, rootAt + 1) : ancestors.slice(0, 1)).slice(0, 10);
  const sliderText = [grid, ...chain].map((n) => `${n.tagName} ${$(n).attr("class") || ""} ${$(n).attr("id") || ""}`).join(" ");
  out.push({
   cardHtml: $.html($tpl),
   gridEl: kitNode(grid),
   shell: chain.reverse().map(kitNode),
   labels: quickAddLabels($, cards),
   cards: cards.length,
   templateTitle: (cardTitleEl($, $(tpl) as cheerio.Cheerio<DomElement>).text() || "").replace(/\s+/g, " ").trim(),
   templatePrice: findPriceText($, $(tpl) as cheerio.Cheerio<DomElement>),
   individuallyStyled: slotsAreIndividuallyStyled($, cards),
   slider: KIT_SLIDER_RE.test(sliderText),
  });
 }
 return out.sort((a, b) => b.cards - a.cards);
}

const KIT_REFUSED_TAGS = new Set(["script", "style", "iframe", "object", "embed", "link", "meta", "base", "form", "template", "noscript", "html", "head", "body"]);
/** A wrapper tag safe to write back. Custom elements become <div>: on a store origin the theme's own
 *  script would boot a <results-list> or <slider-component> wrapper as the real thing. */
function kitTag(tag: string): string {
 const t = String(tag || "").toLowerCase();
 if (!/^[a-z][a-z0-9]*$/.test(t) || KIT_REFUSED_TAGS.has(t)) return "div";
 return t;
}
function kitAttrs(attrs: Record<string, string>): string {
 return Object.entries(attrs || {})
  .filter(([k, v]) => /^[a-z_:][-a-z0-9_:.]*$/i.test(k) && !/^on/i.test(k) && !/^data-vya-/i.test(k) && !/^\s*javascript:/i.test(String(v)))
  .map(([k, v]) => ` ${k}="${escHtml(String(v))}"`).join("");
}

/**
 * A grid of live pieces in the store's own card, from a kit.
 *
 * The kit's card is placed in its grid and wrappers and then filled exactly the way a captured grid
 * is (fillGrid), so a card here and a card on her collection page are the same markup. The grid
 * element carries `data-vya-kit-grid` for the builder's scoped column rules. `markRatioHost` tags
 * each card's photo wrapper so an image shape can be set on it.
 */
export function renderKitGrid(kit: KitParts, items: CollectionCardItem[], hrefFor: HrefFor, opts: { keepQuickAdd?: boolean; markRatioHost?: boolean } = {}): string {
 if (!kit || typeof kit.cardHtml !== "string" || !kit.cardHtml.trim()) return "";
 const shell = Array.isArray(kit.shell) ? kit.shell.slice(0, 12) : [];
 const open = shell.map((n) => `<${kitTag(n.tag)}${kitAttrs(n.attrs)}>`).join("");
 const close = shell.slice().reverse().map((n) => `</${kitTag(n.tag)}>`).join("");
 const gtag = kitTag(kit.gridEl?.tag || "div");
 const $ = cheerio.load(`${open}<${gtag}${kitAttrs(kit.gridEl?.attrs || {})} data-vya-kit-grid="1">${kit.cardHtml}</${gtag}>${close}`, null, false);
 // The kit is stored data; nothing in it may run, whatever was written there.
 $("script, iframe, object, embed").remove();
 $("*").each((_: number, el: any) => { for (const a of Object.keys(el.attribs || {})) if (/^on/i.test(a)) $(el).removeAttr(a); });
 const grid = $("[data-vya-kit-grid]").get(0) as DomElement | undefined;
 if (!grid) return "";
 fillGrid($, grid, items, hrefFor, !!opts.keepQuickAdd, kit.labels);
 if (opts.markRatioHost) {
  $("[data-vya-item]").each((_: number, card: any) => {
   const img = defaultVisibleImg($, $(card) as cheerio.Cheerio<DomElement>).get(0) as DomElement | undefined;
   let host = img?.parent as DomElement | null | undefined;
   if (host && host.tagName === "picture") host = host.parent as DomElement | null;
   if (host && host.type === "tag") $(host).attr("data-vya-ratio-host", "1");
  });
 }
 return $.html();
}

/** A card's add-to-cart control, whatever the theme calls it. */
function quickAddButton($: cheerio.CheerioAPI, $card: cheerio.Cheerio<DomElement>): cheerio.Cheerio<DomElement> {
 return $card.find("button[name='add'], [class*='quick-add__submit'], form button[type='submit']").first() as cheerio.Cheerio<DomElement>;
}

/** Where a button's visible wording lives — never its spinner, its screen-reader copy, or the
 *  hidden "sold out" span themes keep beside the label to swap in later. */
function buttonLabelEl($: cheerio.CheerioAPI, $btn: cheerio.Cheerio<DomElement>): cheerio.Cheerio<DomElement> {
 const hiddenish = /hidden|sold-out-message|spinner|visually-hidden|sr-only|icon|svg/i;
 const leaf = ($btn.find("span, div").toArray() as DomElement[]).find((el) => {
  if (hiddenish.test($(el).attr("class") || "")) return false;
  return $(el).children().length === 0 && ($(el).text() || "").trim().length > 0;
 });
 return (leaf ? $(leaf) : $btn.children().length === 0 ? $btn : $()) as cheerio.Cheerio<DomElement>;
}

/** Write a button's visible wording without disturbing the spinner, icon or screen-reader copy
 *  the theme keeps beside it. */
function setButtonLabel($: cheerio.CheerioAPI, $btn: cheerio.Cheerio<DomElement>, text: string): void {
 const $label = buttonLabelEl($, $btn);
 if ($label.length) $label.text(text);
 else if ($btn.children().length === 0) $btn.text(text);
}

/**
 * The two words THIS theme puts on a card's add button, read off the captured grid itself.
 *
 * Never invented. A clone can only carry the state of the ONE card it was made from, so on a store
 * whose archive is mostly sold (106 of 109, on the store this was found on) every buyable piece
 * offered a dead "Sold out" button. The grid prints both states itself — one card is disabled and
 * one is not — and Dawn-family themes even ship the sold wording hidden inside every button, ready
 * to swap in. Reading them keeps a French store's buttons in French.
 */
function quickAddLabels($: cheerio.CheerioAPI, cards: DomElement[]): { add?: string; sold?: string } {
 const labels: { add?: string; sold?: string } = {};
 for (const card of cards) {
  const $btn = quickAddButton($, $(card) as cheerio.Cheerio<DomElement>);
  if (!$btn.length) continue;
  const text = (buttonLabelEl($, $btn).text() || "").replace(/\s+/g, " ").trim();
  const disabled = $btn.attr("disabled") !== undefined || $btn.attr("aria-disabled") === "true";
  if (text && !(disabled ? labels.sold : labels.add)) {
   if (disabled) labels.sold = text; else labels.add = text;
  }
  // The wording a theme hides inside the button for its own JS to reveal — a second source for the
  // sold state, and the only one on a grid where nothing happens to be sold.
  if (!labels.sold) {
   const hidden = ($btn.find("[class*='sold-out-message']").first().text() || "").replace(/\s+/g, " ").trim();
   if (hidden) labels.sold = hidden;
  }
 }
 return labels;
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
/**
 * The card to clone for every item. Prefer one that has the theme's own hover-swap slot (a second
 * image classed alternate/secondary/hover — see alternateImgSlot()): the FIRST card in the grid
 * happens to belong to whichever product was captured there, and if THAT one only has a single
 * photo, picking it blindly means no card on the page could ever show a second image on hover, even
 * for items that have one. Any card with the slot serves equally well as a template; falls back to
 * the first card-like child (some grids lead with a promo tile) when none has it.
 */
function pickTemplateCard($: cheerio.CheerioAPI, cardChildren: DomElement[]): DomElement | undefined {
 const hasAlternateSlot = (el: DomElement) => $(el).find("img").toArray()
  .some((img) => /\b(alt(?:ernate)?|secondary|hover)[-_]?(?:image)?\b/i.test($(img).attr("class") || ""));
 return cardChildren.find(hasAlternateSlot) || cardChildren[0];
}

function fillGrid($: cheerio.CheerioAPI, gridEl: DomElement, items: CollectionCardItem[], hrefFor: HrefFor, keepQuickAdd = false,
 /** The theme's add/sold wording read off a whole captured grid earlier — a grid kit holds one card,
  *  which can only show one of the two states. See quickAddLabels(). */
 labelsOverride?: { add?: string; sold?: string }): number {
 const $grid = $(gridEl);
 // How many cards the THEME itself put on this page — that IS the store's page size. Reading it
 // here means we follow whatever each site does instead of hardcoding a number per store.
 const cardChildren = ($grid.children().toArray() as DomElement[]).filter((k) => looksLikeCard($, k));
 const themePageSize = cardChildren.length;
 const templateEl = pickTemplateCard($, cardChildren);
 const $template = (templateEl ? $(templateEl) : $grid.children(CARD_CHILD_SELECTOR).first()) as cheerio.Cheerio<DomElement>;
 if (!$template.length) {
  $grid.replaceWith(liveGridHtml(items, hrefFor));
  return themePageSize;
 }
 // Both states of the theme's own add button, taken from the grid BEFORE it is refilled.
 const labels = labelsOverride ?? quickAddLabels($, cardChildren);
 // Mirror the theme's own price formatting (e.g. "$550.00 USD" vs "$550") rather than imposing ours.
 const samplePrice = findPriceText($, $template);
 const decimals = /[.,]\d{2}\b/.test(samplePrice) ? 2 : 0;
 const showCode = /\b[A-Z]{3}\b/.test(samplePrice);
 // The clone source, taken BEFORE the slots below are filled — the template is usually one of them,
 // and cloning it afterwards would copy a card already carrying a live item.
 const $cloneSource = $template.clone() as cheerio.Cheerio<DomElement>;
 // Capture inlines each stylesheet where its <link> was — sometimes INSIDE a product card. Cloning
 // the card would then duplicate a whole stylesheet per product (314 cards turned one page into
 // 6MB). Strip them from the clone source; the real slots keep their own (see below).
 $cloneSource.find("style, link").remove();
 // See identityIdsIn(): collected once, BEFORE cloning, so every clone gets its own substitutes
 // instead of all 11 cards claiming to be the SAME product to the theme's own JS.
 const identityIds = identityIdsIn($, $cloneSource);

 $grid.attr("data-vya-collection", "1"); // marker: this grid is live, not captured
 // A grid whose slots are styled INDIVIDUALLY (see slotsAreIndividuallyStyled) is filled IN PLACE:
 // each captured slot keeps its own id, classes and inlined <style>, and only takes on the live
 // piece's photo, name, price and link. Everything else is refilled the way it always was — one
 // clone of the theme's best card per item.
 const inPlace = slotsAreIndividuallyStyled($, cardChildren);
 items.forEach((it, i) => {
  const slot = inPlace ? cardChildren[i] : undefined;
  if (slot) renderThemeCard($, $(slot), it, decimals, showCode, hrefFor, [], keepQuickAdd, true, labels);
  else $grid.append(renderThemeCard($, $cloneSource, it, decimals, showCode, hrefFor, identityIds, keepQuickAdd, false, labels));
 });
 // Captured cards nothing live was written into are frozen products — quite possibly sold ones.
 // They go, but their inlined stylesheets are hoisted out first: a capture inlines each stylesheet
 // where its <link> was, which is sometimes inside a card, and taking a whole theme's CSS off the
 // page with the card it happened to sit in is how a grid loses its layout.
 for (const leftover of cardChildren.slice(inPlace ? items.length : 0)) {
  const $hoisted = $(leftover).find("style, link").remove();
  if ($hoisted.length) $grid.before($hoisted);
  $(leftover).remove();
 }
 return themePageSize;
}

/**
 * Does this grid style each slot INDIVIDUALLY, rather than every card through shared classes?
 *
 * Squarespace's Fluid Engine does: every block carries its own id, its own wrapper class and its
 * own <style> — `grid-area` (where in the section the block sits) and `--product-block-display-*`
 * (which of the product's fields it shows at all). Refilling such a section the usual way — empty
 * it, append N clones of one card — throws all of that away. On the seller's homepage the three
 * clones carried the SAME wrapper class, so all three landed in one grid cell, and with their ids
 * stripped the rules hiding the title, price and description stopped matching: three full product
 * pages, stacked on top of each other, where the source shows three photos side by side.
 *
 * Deliberately narrow, because cloning is the better fill everywhere else (it gives every card the
 * theme's best template — see the hover-swap slot in fillGrid). Only the slot's OWN root element
 * counts, so a class every card shares (`.grid__item`) can never qualify, and an id the theme uses
 * from JS but never styles (`#Slide-1`) can't either.
 */
function slotsAreIndividuallyStyled($: cheerio.CheerioAPI, slots: DomElement[]): boolean {
 if (slots.length < 2) return false;
 // A slot carrying its own <style> is styling itself, by definition.
 if (slots.filter((el) => $(el).find("style").length > 0).length >= 2) return true;
 const css = $("style").map((_: number, el: DomElement) => $(el).html() || "").get().join("\n");
 if (!css) return false;
 // Selector tokens on each slot's root, and how many slots carry each one.
 const tokens = slots.map((el) => {
  const t = new Set<string>();
  const id = $(el).attr("id");
  if (id) t.add(`#${id}`);
  for (const c of ($(el).attr("class") || "").split(/\s+/)) if (c) t.add(`.${c}`);
  return t;
 });
 const shared = new Map<string, number>();
 for (const t of tokens) for (const k of t) shared.set(k, (shared.get(k) || 0) + 1);
 const styledAlone = (t: Set<string>) => [...t].some((k) => shared.get(k) === 1 && css.includes(k));
 return tokens.filter(styledAlone).length >= 2;
}


/** The image a theme shows BY DEFAULT, from a card/row that may hold more than one <img> — a
 *  hover-swap "alternate" photo plus the one actually visible before any interaction. NEVER trust
 *  DOM position for this: some themes put the default-visible image first, but Editions' product-
 *  grid cards put the hover-only image first instead (absolutely positioned, `visibility:hidden`
 *  until `:hover`) — the SAME theme even orders it differently between its collection grid and its
 *  homepage featured-product blocks. Blindly keeping `img:first` kept the hover-only photo on some
 *  cards and threw away the one that's actually visible, so cards rendered blank until hovered —
 *  which is what a hover-swap-to-a-blank-image looks like to a shopper. A class hint (alternate /
 *  secondary / hover) identifies the one to SKIP; nothing here needs the theme's CSS or a browser. */
function defaultVisibleImg($: cheerio.CheerioAPI, $scope: cheerio.Cheerio<DomElement>): cheerio.Cheerio<DomElement> {
 const $imgs = $scope.find("img");
 const isAlternate = (el: DomElement) => /\b(alt(?:ernate)?|secondary|hover)[-_]?(?:image)?\b/i.test($(el).attr("class") || "");
 const $primary = $imgs.filter((_: number, el: DomElement) => !isAlternate(el));
 return ($primary.length ? $primary : $imgs).first() as cheerio.Cheerio<DomElement>;
}

/** The complement of defaultVisibleImg(): the theme's own hover-swap "alternate" image SLOT in a
 *  card, identified the same way (a class hint), if the theme declares one at all. Themes without
 *  a hover-swap feature (no second image element in their card markup) return an empty selection —
 *  there is no slot to put a second photo into, and inventing one would fight the theme's own CSS,
 *  which is written for a specific class/structure it controls (see the CSS on the real site:
 *  `.product-item__image:hover .product-item__image-alternate{visibility:visible}` etc). Excludes
 *  whatever element was already chosen as the primary, so the two never collide on one node. */
function alternateImgSlot($: cheerio.CheerioAPI, $scope: cheerio.Cheerio<DomElement>, primaryEl: DomElement | undefined): cheerio.Cheerio<DomElement> {
 const $imgs = $scope.find("img");
 const isAlternate = (el: DomElement) => /\b(alt(?:ernate)?|secondary|hover)[-_]?(?:image)?\b/i.test($(el).attr("class") || "");
 const $classHinted = $imgs.filter((_: number, el: DomElement) => el !== primaryEl && isAlternate(el));
 if ($classHinted.length) return $classHinted.first() as cheerio.Cheerio<DomElement>;
 // No theme in the corpus classes its hover image at all (Dawn's own stylesheet is
 // `.media--hover-effect>img+img{opacity:0}` — a bare adjacent-sibling rule, no "alternate" class
 // anywhere): position IS the theme's own signal there, not a guess. Safe specifically because NO
 // image anywhere in scope has an alternate-ish class — the moment one does (Editions), the branch
 // above wins instead, so this never overrides a theme that actually told us which one to skip.
 const $unhinted = $imgs.filter((_: number, el: DomElement) => !isAlternate(el));
 if ($unhinted.length === $imgs.length) {
  const $rest = $imgs.filter((_: number, el: DomElement) => el !== primaryEl);
  return $rest.first() as cheerio.Cheerio<DomElement>;
 }
 return $() as cheerio.Cheerio<DomElement>;
}

/** Numeric platform ids (Shopify's own product/variant ids) a theme's card repeats across many
 *  attributes — id=, data-product-id=, data-variant-id=, data-media-id= — to key its OWN JS
 *  behavior: a gallery, quick-add, a variant picker. Newer "Horizon"-style Shopify themes (custom
 *  elements like <product-card>, <slideshow-component>) lean on this far more than older ones.
 *  Collected once from the template, before cloning starts. */
function identityIdsIn($: cheerio.CheerioAPI, $el: cheerio.Cheerio<DomElement>): string[] {
 const vals = new Set<string>();
 const attrs = ["id", "data-product-id", "data-variant-id", "data-media-id"];
 $el.find(attrs.map((a) => `[${a}]`).join(",")).addBack().each((_: number, el: any) => {
  for (const a of attrs) {
   const v = $(el).attr(a);
   if (v && /^\d{6,}$/.test(v)) vals.add(v);
  }
 });
 return [...vals];
}

/** A stable, numeric-LOOKING substitute for one of the template's identity ids, unique per VYA item.
 *  Never a real platform id — VYA tracks its own item uuid, not Shopify's numeric one — but a theme
 *  that keys JS behavior off these values (see identityIdsIn()) only needs each CARD's copies to be
 *  internally consistent and distinct from every OTHER card's, not to resolve to anything real. */
function syntheticIdentityId(itemId: string, templateValue: string): string {
 let h = 0;
 const seed = `${itemId}:${templateValue}`;
 for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
 return `9${String(h).padStart(10, "0")}`;
}

/** The element holding a theme card's product name: the theme's heading if it has one, else the
 *  longest text-bearing link — themes that render the name as a bare <a> (Prestige, Exhibit,
 *  Vessel) have no heading at all. */
function cardTitleEl($: cheerio.CheerioAPI, $card: cheerio.Cheerio<DomElement>): cheerio.Cheerio<DomElement> {
 const $h = $card.find("[class*='card__heading'], [class*='card-title'], [class*='product-title'], h2, h3, h4").first();
 if ($h.length) return $h as cheerio.Cheerio<DomElement>;
 // Some component-library themes (Tailwind/Alpine "tile" patterns, seen live on a real store) skip
 // a heading tag entirely: the name sits in a bare, unclassed LEAF element marked aria-hidden="true"
 // — shown visually, hidden from screen readers because the real accessible name is wired up
 // elsewhere via aria-labelledby (often on an otherwise-empty click-through link, which is why the
 // link-text fallback below finds nothing either). Without this tier, cardTitleEl returns nothing,
 // the title is never substituted OR flagged as stale, and the template's own product name survives
 // untouched on every single cloned card. `.children().length === 0` keeps this to true leaves —
 // never a wrapper that happens to carry aria-hidden on an unrelated chunk of the card.
 const $ariaHidden = $card.find("[aria-hidden='true']").filter((_: number, el: any) => {
  const $el = $(el);
  return $el.children().length === 0 && ($el.text() || "").trim().length > 3;
 }).first();
 if ($ariaHidden.length) return $ariaHidden as cheerio.Cheerio<DomElement>;
 const links = $card.find("a[href]").toArray() as DomElement[];
 const candidates = links.map((a) => $(a)).filter(($a) => ($a.text() || "").trim().length > 1);
 // A link that WRAPS THE CARD'S PHOTO is never the title element — even when it carries the exact
 // same text. Palo Alto puts a visually-hidden copy of the product name inside the image link for
 // screen readers, so both links measured the same length (66 chars), the sort tie broke toward
 // document order, and the image link won. Writing the name into it with .text() then replaced
 // `<deferred-loading><figure><img>` with a bare string — and the leftover-image sweep removed
 // what was left, so every card on every collection page rendered as a text link with no photo.
 // Text-only links are preferred; a media link is still allowed if the card offers nothing else.
 const holdsMedia = ($a: cheerio.Cheerio<DomElement>) => $a.find("img, picture, svg, figure, video").length > 0;
 const textOnly = candidates.filter(($a) => !holdsMedia($a));
 const pool = textOnly.length ? textOnly : candidates;
 const best = pool.sort((a, b) => (b.text() || "").trim().length - (a.text() || "").trim().length)[0];
 if (!best) return $card.find("__none__") as cheerio.Cheerio<DomElement>;
 // Prestige-family themes wrap the photo, the name AND the price in ONE link, so there is no
 // text-only link to prefer. The name is a LEAF inside it — descend to that leaf instead of
 // returning the link, or the caller writes the title over the whole thing and the photo goes with
 // it. A class hint picks the name over the price; length only breaks a tie between unhinted leaves.
 if (!holdsMedia(best)) return best;
 const leaves = (best.find("*").toArray() as DomElement[]).map((e) => $(e)).filter(($e) =>
  $e.children().length === 0 && !holdsMedia($e) && ($e.text() || "").trim().length > 1);
 if (!leaves.length) return best;
 const hinted = leaves.filter(($e) => /title|name|heading/i.test($e.attr("class") || ""));
 const inner = (hinted.length ? hinted : leaves)
  .sort((a, b) => (b.text() || "").trim().length - (a.text() || "").trim().length)[0];
 return (inner || best) as cheerio.Cheerio<DomElement>;
}

/** Replace every remaining text node equal to some stale value (the template's product name or
 *  price) with the real one. Operates on TEXT NODES so it can't disturb the card's markup, classes
 *  or layout — only the stale words. Themes routinely repeat a card's name/price more than once —
 *  a visible element plus a screen-reader or hover/quick-view copy — and replacing only the ONE
 *  element a selector finds leaves every clone displaying the template's stale value alongside the
 *  right one. */
function replaceLeftoverText($: cheerio.CheerioAPI, $card: cheerio.Cheerio<DomElement>, oldText: string, newText: string): void {
 const want = oldText.replace(/\s+/g, " ").trim();
 if (!want) return;
 $card.find("*").addBack().contents().each((_: number, node: any) => {
  if (node.type !== "text" || !node.data) return;
  const text = node.data.replace(/\s+/g, " ").trim();
  if (text === want) { node.data = newText; return; }
  // The same value with nothing but punctuation around it — a theme's screen-reader suffix reads
  // ", Versailles Tank Top" after its button label. Not an exact match, so the test above misses it,
  // and every cloned card then ANNOUNCES the template's product no matter which piece it shows.
  // Deliberately narrow: anything left over besides punctuation means this is prose, not a label.
  if (text.includes(want) && !text.split(want).join("").replace(/[\s,.;:·|—–-]/g, "")) {
   node.data = text.split(want).join(newText);
  }
 });
 // Alt text on the theme's image is the same story.
 $card.find("img[alt]").each((_: number, el: any) => {
  if (($(el).attr("alt") || "").replace(/\s+/g, " ").trim() === want) $(el).attr("alt", newText);
 });
}

/** Clone one theme card and substitute a live item's content into it. */
/**
 * Recompute — or remove — any discount the theme's card template asserts.
 *
 * Only claims that are arithmetic about a piece: "50% off", "-30%", "Save $40". Anything else the
 * card says is the seller's own wording and is none of our business.
 */
export function restateDiscountClaims(
 $: cheerio.CheerioAPI,
 $card: cheerio.Cheerio<DomElement>,
 it: CollectionCardItem,
): void {
 // A piece with no price of its own can back no claim at all.
 const price = it.priceCents ?? 0;
 const was = it.compareAtCents ?? 0;
 const off = price > 0 && was > price ? Math.round(((was - price) / was) * 100) : 0;
 const PERCENT = /(?:-\s*)?\d{1,3}\s*%\s*(?:off|discount)?/i;
 const SAVE = /save\s*[$£€]\s?\d[\d,]*(?:\.\d{2})?/i;

 for (const el of $card.find("*").toArray() as DomElement[]) {
  const $el = $(el);
  if ($el.children().length) continue; // only the leaf that holds the words
  const text = ($el.text() || "").trim();
  if (!text) continue;
  const isPercent = PERCENT.test(text) && /%/.test(text);
  const isSave = SAVE.test(text);
  if (!isPercent && !isSave) continue;
  if (!off) {
   // Nothing behind the claim. Remove the badge itself where the whole element is the claim, so a
   // theme that styles it as a coloured pill does not leave an empty pill behind.
   const $target = ($el.parent().children().length === 1 && ($el.parent().text() || "").trim() === text)
    ? $el.parent() : $el;
   $target.remove();
   continue;
  }
  // Genuinely reduced: keep her design, restate the number. The surrounding words are hers.
  $el.text(isSave ? text.replace(/[$£€]\s?\d[\d,]*(?:\.\d{2})?/, money(was - price, it.currency))
   : text.replace(/\d{1,3}\s*%/, `${off}%`));
 }
}

function renderThemeCard(
 $: cheerio.CheerioAPI,
 $template: cheerio.Cheerio<DomElement>,
 it: CollectionCardItem,
 decimals: number,
 showCode: boolean,
 hrefFor: HrefFor,
 identityIds: string[] = [],
 keepQuickAdd = false,
 /** Fill THIS element rather than a copy of it — see fillGrid(). A slot that is already on the page
  *  keeps its own id, wrapper class and inlined <style>, which is what any per-slot CSS is written
  *  against; nothing about it is duplicated, so none of the de-duplication below applies. */
 inPlace = false,
 /** The theme's own wording for each state of the add button — see quickAddLabels(). */
 labels: { add?: string; sold?: string } = {},
): cheerio.Cheerio<DomElement> {
 const $card = (inPlace ? $template : $template.clone()) as cheerio.Cheerio<DomElement>;
 // Never duplicate a stylesheet per card. The card's own <style> survives an in-place fill (it may
 // be the only thing positioning that slot); its <script> never does — it carries the captured
 // product's data, which the theme's own JS would happily render back over the live piece.
 if (inPlace) $card.find("script").remove();
 else $card.find("style, link, script").remove();
 // Which piece of the seller's inventory this card IS. The editor reads it back off the DOM to tell
 // her that a name or price here is not hers to type — it is regenerated from Inventory on every
 // page load — and to offer her the piece itself instead. See the panel in app/store/storefront.
 $card.attr("data-vya-item", it.id).attr("data-vya-item-title", it.title || "");
 // THE THEME'S ARITHMETIC ABOUT A DIFFERENT PIECE.
 //
 // chill-boutique's homepage carried eight "50% OFF" badges on our copy. Her sale rail is a
 // filtered view of genuinely half-price pieces; we fill the same template with OUR items and left
 // her badge sitting on top of them. One card read "50% OFF · Derek Lam Navy Shirt · $100 · $495"
 // — eighty percent off. We were inventing a price claim on somebody else's storefront.
 //
 // A badge that makes no numeric claim ("New in", "Last one", "Sale") is her language about the
 // rail and is left exactly as it is. Only arithmetic is restated: recomputed from THIS piece when
 // it is genuinely reduced, and removed when it is not.
 restateDiscountClaims($, $card, it);
 // Give this clone its OWN copy of every identity id the template repeats (data-product-id etc. —
 // see identityIdsIn()), BEFORE anything else touches the card. Left as the template's own values,
 // every cloned card claims to BE the template's product to any theme whose JS keys behavior off
 // them — the newer Shopify "Horizon"-style themes lean on this heavily (a gallery/quick-add/variant
 // picker per card), and 11 cards all announcing the same id is exactly the kind of collision that
 // JS can't tell apart; the grid rendered as one broken card instead of the theme's real layout.
 if (identityIds.length) {
  const attrs = ["id", "data-product-id", "data-variant-id", "data-media-id"];
  const subst = new Map(identityIds.map((v) => [v, syntheticIdentityId(it.id, v)]));
  $card.find(attrs.map((a) => `[${a}]`).join(",")).addBack().each((_: number, el: any) => {
   for (const a of attrs) {
    const v = $(el).attr(a);
    if (v && subst.has(v)) $(el).attr(a, subst.get(v)!);
   }
  });
 }
 // The TEMPLATE's own product name and price, read before anything is substituted. Theme cards
 // routinely carry each more than once — a visible heading plus a screen-reader or hover-overlay
 // copy, or (seen live on a real "Vessel"-family theme) an entire duplicate hover/quick-view panel
 // with its own name and price — and replacing only the first element a selector finds left every
 // cloned card also showing the template product's stale name and price. Any text still equal to
 // these strings after substitution is stale by definition, which is a far safer test than guessing
 // which elements are "the title" or "the price".
 const templateTitle = (cardTitleEl($, $card).text() || "").trim();
 const templatePriceText = findPriceText($, $card).trim();
 const imgs = Array.isArray(it.images) ? (it.images as unknown[]) : [];
 const img = typeof imgs[0] === "string" ? (imgs[0] as string) : "";
 const href = hrefFor(it);

 // ids would be duplicated across every cloned card, and the theme's own animation hooks would
 // re-run per card; strip both. An in-place slot owns its id already — stripping it there is what
 // detached every per-slot CSS rule the capture came with.
 if (!inPlace) {
  // Every id on the clone becomes a UNIQUE synthetic id, and every attribute that pointed at the old
  // id is rewritten to the new one — never merely dropped. Dropping the reference was this
  // morning's fix, and it was wrong for Palo Alto: that theme's reveal is not AOS's own observer
  // but its own, keyed on `data-aos-anchor="#<card id>"` — it watches the card and reveals the
  // children anchored to it. With the id gone and the anchor gone, the link is gone, and the media
  // wrapper (`hover-slideshow`, the element that actually holds the photo) sat at opacity 0.001
  // on every card of every theme-matched grid while the CARD measured visible. Found by a full-tree
  // computed-style diff against the live source; the same rewrite keeps ARIA relationships intact.
  const idMap = new Map<string, string>();
  // Selector-safe: keep the theme's own prefix and append a per-item suffix. A purely numeric id
  // (what the product-id substitute produces) is not a valid `#selector`, and the theme's observer
  // resolves anchors with querySelector — so it would throw on the very id meant to reveal the card.
  const suffix = String(it.id).replace(/[^a-z0-9]/gi, "").slice(0, 10) || "x";
  const renameId = (el: any) => {
   const v = $(el).attr("id"); if (!v) return;
   const next = `${v}--vya-${suffix}`; idMap.set(v, next); $(el).attr("id", next);
  };
  renameId($card.get(0));
  $card.find("[id]").each((_: number, el: any) => renameId(el));
  $card.removeAttr("data-cascade").removeAttr("style");
  for (const attr of ["data-aos-anchor", "aria-controls", "aria-labelledby", "aria-describedby", "for"]) {
   $card.find(`[${attr}]`).addBack(`[${attr}]`).each((_: number, el: any) => {
    const raw = $(el).attr(attr) || "";
    const next = raw.split(/\s+/).filter(Boolean).map((tok) => {
     const hash = tok.startsWith("#"); const key = hash ? tok.slice(1) : tok; const to = idMap.get(key);
     return to ? (hash ? "#" + to : to) : tok;
    }).join(" ");
    if (next !== raw) $(el).attr(attr, next);
   });
  }
 }

 // Image: keep the theme's <img> (and its classes/sizing), just point it at the live photo.
 const $img = defaultVisibleImg($, $card);
 if ($img.length && img) {
  $img.attr("src", img).attr("alt", it.title || "").removeAttr("srcset").removeAttr("data-srcset").removeAttr("sizes").removeAttr("loading");
  // Hand the theme's own image library nothing to reprocess. We've already set a final, concrete
  // src; leaving its hooks in place lets it recompute one from a srcset we removed — and its CSS
  // hides an image it considers unloaded (`[data-rimg=lazy]{opacity:0}`). Only the hooks go; the
  // class the theme styles against stays.
  for (const a of Object.keys($img.get(0)?.attribs || {})) {
   if (/^data-(rimg|srcset|sizes|widths|media|image|src)/i.test(a)) $img.removeAttr(a);
  }
  $card.find("[data-rimg-canvas], [data-rimg-noscript]").remove();
 } else if (!img) {
  $img.remove();
 }
 // A second real photo (this item's own, not the template's) DOES have a live equivalent — the
 // theme's own hover-swap slot, filled with imgs[1]. That's the feature the real store's grid uses
 // (hover to see the second angle); only drop the slot when this listing has no second photo to
 // put there, or the theme doesn't have one to begin with.
 const img2 = typeof imgs[1] === "string" ? (imgs[1] as string) : "";
 const $keepImg = $img.get(0);
 const $altSlot = (img2 ? alternateImgSlot($, $card, $keepImg) : $()) as cheerio.Cheerio<DomElement>;
 if ($altSlot.length) {
  $altSlot.attr("src", img2).attr("alt", it.title || "").removeAttr("srcset").removeAttr("data-srcset").removeAttr("sizes").removeAttr("loading");
  for (const a of Object.keys($altSlot.get(0)?.attribs || {})) {
   if (/^data-(rimg|srcset|sizes|widths|media|image|src)/i.test(a)) $altSlot.removeAttr(a);
  }
 }
 // Everything else — by ELEMENT, not index/order (see defaultVisibleImg()) — is dropped so hover
 // doesn't reveal a stale/wrong photo from the template.
 const $keepAlt = $altSlot.get(0);
 $card.find("img").each((_: number, el: DomElement) => { if (el !== $keepImg && el !== $keepAlt) $(el).remove(); });

 // Title + link.
 const $title = cardTitleEl($, $card);
 if ($title.length) {
  const $link = $title.find("a").first();
  const $target = ($link.length ? $link : $title) as cheerio.Cheerio<DomElement>;
  if ($link.length) $link.attr("href", href);
  // .text() REPLACES every child, so it must never be aimed at an element holding the card's
  // media. cardTitleEl() now avoids picking one, but a theme can still nest an image inside the
  // heading itself — so the write is guarded here too rather than trusting the selector. The
  // element's stale name is still corrected: replaceLeftoverText() runs just below and swaps text
  // nodes only, which is the non-destructive way to relabel markup we don't own.
  if ($target.find("img, picture, svg, figure, video").length) {
   replaceLeftoverText($, $target, templateTitle, it.title || "");
  } else {
   $target.text(it.title || "");
  }
 }
 // Sweep up any OTHER copy of the template's title still sitting in the card (Dawn keeps a second,
 // visually-hidden heading; other themes duplicate it for a hover overlay). Without this every card
 // showed the right product plus the template product's name.
 if (templateTitle) replaceLeftoverText($, $card, templateTitle, it.title || "");
 // Every other link in the card should also go to the live product, not the frozen source page.
 // Their aria-label still named the TEMPLATE's product, so a screen reader announced every card as
 // the same piece.
 $card.find("a[href]").attr("href", href).each((_: number, a: any) => {
  if ($(a).attr("aria-label") !== undefined) $(a).attr("aria-label", it.title || "");
 });
 // Quick-shop hooks carry the TEMPLATE product's id AND url; point them at this piece instead, or
 // every card's quick-shop panel would open the same (wrong) product. `data-product-quickshop-url`
 // is the one AsyncView actually fetches (`el.dataset.productQuickshopUrl`) — the id-only attributes
 // just label the panel, so fixing those alone left every card's Quick Shop opening the template
 // product while showing the right id in the DOM.
 const qsId = it.sourceId || it.id;
 $card.find("[data-product-quickshop]").attr("data-product-quickshop", qsId).attr("data-product-quickshop-url", href);
 $card.find("[data-quickshop-handle], [data-product-handle], [data-handle]").each((_: number, el: any) => {
  for (const a of ["data-quickshop-handle", "data-product-handle", "data-handle"]) if ($(el).attr(a) !== undefined) $(el).attr(a, qsId);
 });
 $card.find("[data-product-quickshop-url]").attr("data-product-quickshop-url", href);

 // Price.
 // Price: a class hint if the theme gives one, otherwise the deepest element whose text actually
 // reads as money. Class names differ per theme; a currency amount looks the same everywhere.
 const $price = findPriceEl($, $card);
 const priceText = moneyLike(it.priceCents, it.currency, decimals, showCode);
 if ($price.length) {
  $price.text(priceText);
  // A THEME WITH TWO PRICE BLOCKS HIDES THE ONE THAT DOESN'T APPLY — to the CAPTURED product.
  //
  // Horizon-family themes ship both a regular and a sale block and hide whichever is wrong for the
  // product being rendered: `<div class="price__regular price__hidden">`. When the card we cloned
  // happened to be a marked-down piece, the regular block is the hidden one — so we wrote this
  // item's real price into an element the theme's own CSS keeps invisible, and the shopper saw
  // nothing but the struck-through was-price beside it. A piece with no visible price to pay.
  //
  // Every check passed it: the correct number IS in the DOM, so a text comparison finds it. Only
  // looking at the page shows it isn't on screen.
  //
  // Unhide ONLY the element we just wrote into, and only its price-block ancestors, so a theme's
  // screen-reader copy elsewhere in the card is left exactly as it is.
  const unhide = (el: DomElement) => {
   const cls = $(el).attr("class");
   if (!cls) return;
   const kept = cls.split(/\s+/).filter((c) => c && !/(?:^|[-_]{1,2})hidden$/i.test(c));
   if (kept.length !== cls.split(/\s+/).filter(Boolean).length) $(el).attr("class", kept.join(" "));
  };
  unhide($price.get(0) as DomElement);
  for (const anc of ($price.parents().toArray() as DomElement[])) {
   if (!/price/i.test($(anc).attr("class") || "") && !/price/i.test(anc.tagName || "")) continue;
   unhide(anc);
  }
 } else $card.append(`<div class="vya-price">${escHtml(priceText)}</div>`);
 // Sweep up any OTHER copy of the template's price still sitting in the card — same reasoning as
 // the title sweep above. Seen live: a hidden quick-view panel duplicating the card's price, left
 // showing the template product's price on every single card regardless of which real item it held.
 if (templatePriceText) replaceLeftoverText($, $card, templatePriceText, priceText);
 // The captured card's own sale markup describes the TEMPLATE product, so it goes — a discount we
 // cannot vouch for is a phantom one.
 $card.find("[class*='price__sale'], [class*='compare-at'], s, del").remove();
 // …and the markdown THIS piece is actually running goes back in. The seller's grid shows "$645"
 // struck from "$675"; ours showed a flat $645, so a shopper never saw the markdown at all. Taken
 // from the same feed read as the price, so unlike a compare-at frozen at capture time it is a
 // discount we can stand behind. bag-crush alone has 73 pieces on sale.
 if (it.compareAtCents != null && it.priceCents != null && it.compareAtCents > it.priceCents) {
  const was = moneyLike(it.compareAtCents, it.currency, decimals, showCode);
  const $target = $price.length ? $price : $card.find(".vya-price").first();
  const pill = `<s data-vya-compare-at="1" style="opacity:.55;margin-left:.5em;font:inherit">${escHtml(was)}</s>`;
  if ($target.length) $target.after(pill); else $card.append(pill);
 }

 // Quick-add forms POST directly to /cart/add — a real, classic Shopify form, server-rendered right
 // into the card (NOT fetched lazily on hover as an earlier version of this comment assumed — that
 // was a misreading of a SEPARATE hover mechanism that only swaps the preview image). On Plan A
 // there's no bridge for that POST, so the card links to the product page instead. On Plan B the
 // bridge exists (/api/plan-b/cart/add) and resolves an item by sourceId, then variants[].
 // sourceVariantId, then its own VYA uuid (see findItemByVariantId) — so the form's hidden variant
 // field just needs THIS item's own identity, not a real platform variant id we don't track.
 const $submit = quickAddButton($, $card);
 // A SOLD piece keeps the theme's own sold-out button — disabled, in the theme's own words — which
 // is exactly what the source store shows. Deleting the form instead (what this used to do) left
 // half the grid with a button and half without, ragged and unlike the shop it mirrors. Only when
 // the theme never told us its sold wording does the control go rather than lie about the state.
 const soldButton = keepQuickAdd && it.available === false && Boolean(labels.sold) && $submit.length > 0;
 const showQuickAdd = keepQuickAdd && it.available !== false; // never offer to ADD a sold piece
 if (soldButton) {
  setButtonLabel($, $submit, labels.sold as string);
  $submit.attr("disabled", "disabled").attr("aria-disabled", "true");
  // Belt and braces: a disabled control cannot submit, and the bridge refuses a sold item anyway,
  // but the form must not be one stray click from posting either.
  $card.find("form").attr("onsubmit", "return false");
  $card.find("input[name='id'], [ref='variantId']").attr("value", it.sourceId || it.id);
 } else if (!showQuickAdd) {
  $card.find("form").remove();
  $card.find("[class*='quick-add'], quick-add-modal").remove();
 } else {
  // captureSite() blanket-neutralizes every `form[action*="/cart"]` with onsubmit="return false" —
  // right for Plan A (nothing should ever POST there) but counterproductive here: the form's own
  // action="/cart/add" is already a plain relative URL that correctly reaches our bridge through
  // middleware, so this is a working NATIVE fallback if the theme's JS submit handler doesn't fire.
  // Restore it for the one card of forms we're deliberately keeping.
  $card.find("form").removeAttr("onsubmit");
  // Point the form at THIS item, not the template's frozen one. Shopify's classic hidden field is
  // name="id"; newer themes add a `ref="variantId"` hook on the same input — cover both.
  const liveId = it.sourceId || it.id;
  $card.find("input[name='id'], [ref='variantId']").attr("value", liveId);
  // The quick-add root carries the TEMPLATE's own product name (for its "Added {title}" ARIA
  // announcement) — stale otherwise, like every other leftover-title case in this function.
  $card.find("[data-product-title]").attr("data-product-title", it.title || "");
  // The template's own availability (its button/input `disabled`, if that product happened to be
  // sold) belongs to THAT product — this one is confirmed available (showQuickAdd), so nothing here
  // should still say otherwise.
  $card.find("input[name='id'], button[type='submit']").removeAttr("disabled");
  $submit.removeAttr("disabled").removeAttr("aria-disabled");
  // …including what it SAYS. The template's product decided that wording, and on an archive store
  // the card cloned is nearly always a sold one — which is how every buyable piece came to offer a
  // "Sold out" button.
  if (labels.add) setButtonLabel($, $submit, labels.add);
  // The button's default ("Add") state has a text span but no icon in the CAPTURED markup on either
  // the real site or ours — this theme sources it from somewhere neither a static fetch nor its own
  // CSS/JS bundles reveal (likely stamped in at their build step, not shipped as a runtime asset).
  // Its "Added ✓" state DOES ship its icon inline (`.svg-wrapper.add-to-cart-icon--added`), so match
  // that pattern for the default state too, rather than leave the button icon-less.
  const $addText = $card.find(".add-to-cart-text__content").first();
  if ($addText.length && !$addText.siblings(".svg-wrapper").length) {
   $addText.before(
    '<span class="svg-wrapper add-to-cart-icon--add"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-bag-add">' +
    '<path d="M6.5 6.5h7l.6 8.2c.07.98-.7 1.8-1.68 1.8H7.58c-.98 0-1.75-.82-1.68-1.8l.6-8.2z" stroke="currentColor" stroke-width="var(--icon-stroke-width)" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M8 6.5V5a2 2 0 014 0v1.5" stroke="currentColor" stroke-width="var(--icon-stroke-width)" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M10 10.8v3.2M8.4 12.4h3.2" stroke="currentColor" stroke-width="var(--icon-stroke-width)" stroke-linecap="round"/>' +
    "</svg></span>",
   );
  }
  // Newer Shopify themes gate the quick-add button's visibility with a CSS custom property set
  // inline per-card (--quick-add-display), driven by the THEME's own per-product logic (e.g.
  // single- vs multi-variant). Cloning the template freezes it at whichever product was captured
  // there — every clone showed "none" when the template happened to. We don't have insight into
  // that per-product logic, so force it visible on hover rather than leave it silently hidden on
  // every card.
  $card.find("[style*='--quick-add-display']").each((_: number, el: any) => {
   const s = $(el).attr("style") || "";
   $(el).attr("style", s.replace(/--quick-add-display:\s*[a-z]+/gi, "--quick-add-display: flex")
    .replace(/--quick-add-mobile-display:\s*[a-z]+/gi, "--quick-add-mobile-display: flex"));
  });
 }
 // The price wrapper carries the TEMPLATE product's availability too (Dawn-family themes grey a
 // sold price with `price--sold-out`). Only ever removed, never added: the class is the theme's to
 // invent, and a card cloned from an available product never showed us what it is called.
 if (it.available !== false) $card.find("[class*='price--sold-out']").removeClass("price--sold-out");

 // The template's own badge belongs to the TEMPLATE's product, so it goes — unless this item is
 // sold, in which case the badge is exactly what we want to reuse (handled just below).
 //
 // NEVER remove an element that holds a photograph. `[class*='badge']` is a SUBSTRING match, and a
 // theme is free to put that substring on something that is not a badge: Tess Elizabeth Vintage's
 // theme marks a card's IMAGE GALLERY as badge-bearing —
 //   <div class="card-gallery … card-gallery--badge-top-right">  ← holds all three photos
 // — so this selector matched the gallery and deleted every picture in the card. On her Accessories
 // page that was 15 of 37 pieces showing a title and a price over blank space, and it hit exactly
 // the pieces her own theme badges (Sold out, Sale), because only those carry the modifier.
 //
 // A badge is a small label. It never contains the product's own photograph, and that — not a list
 // of per-theme class names — is what tells the two apart in any theme.
 if (it.available !== false) {
  $card.find("[class*='badge']").filter((_: number, el: DomElement) => $(el).find("img").length === 0).remove();
 }

 // Sold pieces stay on the shelf, badged — that's what the source store does, and a vintage
 // archive is part of how people browse. Reuse the theme's own badge if the card has one so it
 // looks native; otherwise add a plain one that inherits type and colour.
 if (it.available === false) {
  // "Sold out" only when the seller's platform said so; a piece that merely vanished from their
  // feed says "No longer available", because we cannot evidence a sale. See unavailableLabel.
  const goneLabel = unavailableLabel(it.unavailableReason);
  // The theme nests a STYLED PILL inside a positioning wrapper:
  //   <div class="card__badge bottom left"><span class="badge badge--bottom-left …">Sold out</span></div>
  // Both match `[class*='badge']`, and writing text into the outer one destroys the inner span —
  // which is where the rounded corners, padding and colour scheme live. Always target the innermost.
  // Same substring hazard as above: an element matching `[class*='badge']` that holds photographs
  // is a gallery, not a badge, and writing "Sold out" into it would replace the pictures with text.
  const badges = ($card.find("[class*='badge']").toArray() as DomElement[]).filter((b) => $(b).find("img").length === 0);
  const innermost = badges.find((b) => $(b).find("[class*='badge']").length === 0);
  const $badge = innermost ? $(innermost) : $();
  if ($badge.length) $badge.text(goneLabel).removeClass("hidden").css("display", "");
  else if (badges.length) {
   // A wrapper with no pill inside (the template's product wasn't sold). Borrow a real badge from
   // elsewhere on the page so it carries the theme's own styling rather than ours.
   const donor = $("[class*='badge']").toArray().find((b) => $(b).find("[class*='badge']").length === 0 && ($(b).text() || "").trim().length > 0);
   const $pill = donor
    ? ($(donor).clone() as cheerio.Cheerio<DomElement>).text(goneLabel).removeClass("hidden")
    : $(`<span class="badge">${escHtml(goneLabel)}</span>`);
   $(badges[badges.length - 1]).empty().append($pill).removeClass("hidden").css("display", "");
  } else {
   // The PRIMARY image specifically, not "the first img in the card" — the alternate hover-swap
   // slot (see alternateImgSlot()) can sit before it in DOM order, and this badge belongs on the
   // one the shopper actually sees by default.
   const $media = $img.length ? $img.parent() : $card.find("img").first().parent();
   // APPENDED, not prepended. Slipping the badge in before the <img> made themes that manage their
   // own responsive images (Editions marks them `data-rimg`) drop the photo entirely — every sold
   // card rendered as an empty tile with a badge floating above it. Position is CSS's job anyway.
   ($media.length ? $media : $card).append(
    `<span data-vya-sold style="position:absolute;bottom:10px;left:10px;z-index:2;font:inherit;font-size:12px;letter-spacing:.06em;border-radius:999px;background:rgba(0,0,0,.75);color:#fff;padding:6px 14px;line-height:1">${escHtml(goneLabel)}</span>`,
   );
   // Anchor the badge WITHOUT an inline `position:relative` on the host. An inline style beats the
   // theme's stylesheet, and Editions positions this very element `absolute` to fill a
   // `height:0;padding-bottom:100%` square — overriding that collapsed the link to 0px, the
   // absolutely-positioned <img> inside took 100% of nothing, and every sold tile rendered blank
   // while the image itself loaded fine. A single attribute selector (specificity 0,1,0) only
   // applies where the theme has left the host static, and loses to any rule of its own.
   if ($media.length) {
    $media.attr("data-vya-sold-host", "1");
    if (!$("style[data-vya-sold]").length) {
     $("head").first().append('<style data-vya-sold="1">[data-vya-sold-host]{position:relative}</style>');
    }
   }
  }
 }


 return $card;
}

/** Fallback grid for pages where the theme gives us no card to clone — plain, inherits the store's
 *  font and colour so it still reads as part of the site. */
/** Where a live product card should link. Captured sites keep the shopper on the mirrored site
 *  (/site/{slug}/products/{handle}); elsewhere we fall back to VYA's own product page. */
export type HrefFor = (it: CollectionCardItem) => string;

export function liveGridHtml(items: CollectionCardItem[], hrefFor: HrefFor): string {
 const cards = items.map((it) => {
  const imgs = Array.isArray(it.images) ? (it.images as unknown[]) : [];
  const img = typeof imgs[0] === "string" ? (imgs[0] as string) : "";
  // A real <img>, NOT an empty div with a background image. Dawn (and other themes) ship
  // `div:empty,section:empty,…{display:none}`, which silently hid the childless div we used to
  // render — the cards showed a title and price with a blank space where the photo belonged.
  const media = img
   ? `<img src="${escHtml(img)}" alt="${escHtml(it.title || "")}" loading="lazy" style="display:block;width:100%;aspect-ratio:3/4;object-fit:cover;background:#f2f0eb">`
   : `<div style="aspect-ratio:3/4;background:#f2f0eb">&nbsp;</div>`;
  // Sold pieces are badged HERE too, not just in the theme-card path. This grid renders whenever a
  // theme's own card can't be matched — three stores in the corpus, and individual collections on
  // stores that otherwise match — and it ignored `available` entirely, so those pages showed a sold
  // archive as if every piece were still buyable. A vintage archive is part of browsing; the badge
  // is what makes it honest.
  const soldBadge = it.available === false
   ? `<span data-vya-sold style="position:absolute;bottom:10px;left:10px;z-index:2;font:inherit;font-size:12px;letter-spacing:.06em;border-radius:999px;background:rgba(0,0,0,.75);color:#fff;padding:6px 14px;line-height:1">${escHtml(unavailableLabel(it.unavailableReason))}</span>`
   : "";
  const wasPrice = it.compareAtCents != null && it.priceCents != null && it.compareAtCents > it.priceCents
   ? `<s data-vya-compare-at="1" style="opacity:.55;margin-left:.5em">${escHtml(money(it.compareAtCents, it.currency))}</s>`
   : "";
  return `<div style="font-family:inherit;color:inherit"><a href="${escHtml(hrefFor(it))}" style="text-decoration:none;color:inherit"><span style="display:block;position:relative">${media}${soldBadge}</span><div style="font-size:14px;margin-top:9px;line-height:1.3">${escHtml(it.title || "")}</div><div style="font-size:14px;opacity:.7;margin:2px 0 9px">${money(it.priceCents, it.currency)}${wasPrice}</div></a></div>`;
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
 if (hinted.length) {
  // A class hint can land on a WRAPPER that holds the piece's NAME as well as its price — Squarespace's
  // `.product-list-title-price` does — and writing the price into it wiped the name off every card on
  // the shop page. Only in that case, step down to the price leaf inside it, outside the name.
  const $names = hinted.find("[class*='title'], [class*='name'], [class*='heading'], h1, h2, h3, h4");
  if (!$names.length) return hinted as cheerio.Cheerio<DomElement>;
  const names = new Set($names.toArray() as DomElement[]);
  const leaves = (hinted.find("*").not("style, script, link, img").toArray() as DomElement[]).filter((el) =>
   !names.has(el) && !($(el).parents().toArray() as DomElement[]).some((p) => names.has(p))
   && $(el).children().length === 0 && MONEY_RE.test(($(el).text() || "").trim()));
  return (leaves.length ? $(leaves[leaves.length - 1]) : hinted) as cheerio.Cheerio<DomElement>;
 }
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
 // Same convention as money() above: 0 means no real price on record, not a genuine free price.
 if (cents == null || cents === 0) return "";
 const code = currency || "USD";
 let out: string;
 try {
  out = new Intl.NumberFormat("en-US", { style: "currency", currency: code, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(cents / 100);
 } catch {
  out = `$${(cents / 100).toFixed(decimals)}`;
 }
 return showCode ? `${out} ${code}` : out;
}


/**
 * The theme's pagination control — the element that IS the pager, not merely one that mentions it.
 *
 * `[class*='pagination']` alone is a trap. Bag Crush's collection template wraps its entire page in
 * `<section class="collection-page has-pagination infinite_scroll">`, which matches, comes first in
 * document order, and CONTAINS the product grid. applyPagination removes its nav whenever everything
 * fits on one page — so any collection (or search) with a single page of live items had the whole
 * section deleted and rendered as a blank page. Anything containing a product grid is the page, not
 * its pager.
 */
function paginationNav($: cheerio.CheerioAPI, grids?: DomElement[]): cheerio.Cheerio<DomElement> {
 // "Contains a product grid" is decided by productGrids(), NOT by GRID_SELECTORS: this very theme
 // names its grid `collection-page__product-list`, which no selector in that list matches (a class
 // selector needs the whole token). productGrids finds it the way it finds every other grid — by
 // counting the product cards inside it.
 const gridAncestors = new Set<DomElement>();
 for (const g of grids ?? productGrids($)) {
  for (const a of $(g).parents().toArray() as DomElement[]) gridAncestors.add(a);
 }
 return $("[class*='pagination']").filter((_: number, el: DomElement) => {
  if (gridAncestors.has(el)) return false;
  return $(el).find("a, li").length > 0;
 }).first() as cheerio.Cheerio<DomElement>;
}

/**
 * Re-point the theme's own pagination at OUR item count.
 *
 * The captured markup is the source's pagination frozen at crawl time — its page numbers describe
 * the source's catalogue, and (before this) its links had lost their query string, so all five
 * pointed at the same page. Rather than invent a pagination widget, this reuses the theme's own
 * elements and rewrites them: same markup, same styling, our numbers.
 *
 * Removed entirely when everything fits on one page — a lone "1" is noise.
 */
function applyPagination($: cheerio.CheerioAPI, opts: { page: number; totalPages: number; path: string; grids?: DomElement[] }): void {
 const { page, totalPages, path } = opts;
 const $nav = paginationNav($, opts.grids);
 if (!$nav.length) return;
 if (totalPages <= 1) { $nav.remove(); return; }

 const $list = ($nav.is("ul, ol") ? $nav : $nav.find("ul, ol").first()) as cheerio.Cheerio<DomElement>;
 if (!$list.length) return;

 // Templates taken from the theme: a numbered link, and the item marking the current page.
 const kids = $list.children().toArray() as DomElement[];
 const isNum = (el: DomElement) => /^\d+$/.test(($(el).text() || "").trim());
 const $linkTpl = $(kids.find((k) => isNum(k) && $(k).find("a[href]").length > 0) || kids.find((k) => $(k).find("a[href]").length > 0) || kids[0]);
 const $currentTpl = $(kids.find((k) => isNum(k) && $(k).find("a[href]").length === 0) || kids[0]);
 const $ellipsisTpl = kids.find((k) => /^[.…]+$/.test(($(k).text() || "").trim()));

 // `path` may already carry a query — the search results page is `/search?q=…`, and appending a
 // second "?" there produced links that dropped the query and re-ran the search for nothing.
 const href = (n: number) => (n > 1 ? `${path}${path.includes("?") ? "&" : "?"}page=${n}` : path);
 // Same shape a theme uses: first, last, and a window around the current page.
 const nums: (number | "…")[] = [];
 for (let n = 1; n <= totalPages; n++) {
  if (n === 1 || n === totalPages || Math.abs(n - page) <= 1) nums.push(n);
  else if (nums[nums.length - 1] !== "…") nums.push("…");
 }

 const out: cheerio.Cheerio<DomElement>[] = [];
 for (const n of nums) {
  if (n === "…") {
   if ($ellipsisTpl) out.push($($ellipsisTpl).clone() as cheerio.Cheerio<DomElement>);
   continue;
  }
  const $el = (n === page ? $currentTpl : $linkTpl).clone() as cheerio.Cheerio<DomElement>;
  const $a = $el.find("a").first();
  if (n === page) { $el.find("a").each((_: number, a: any) => { $(a).removeAttr("href"); }); }
  else if ($a.length) $a.attr("href", href(n));
  else $el.attr("href", href(n));
  // Replace only the number, leaving any screen-reader text the theme includes.
  let replaced = false;
  $el.find("*").addBack().contents().each((_: number, node: any) => {
   if (replaced || node.type !== "text" || !/\d/.test(node.data || "")) return;
   node.data = (node.data as string).replace(/\d+/, String(n));
   replaced = true;
  });
  out.push($el);
 }
 $list.empty();
 for (const el of out) $list.append(el);

 // Prev/next arrows sit outside the number list in most themes.
 $nav.find("a[rel='prev'], [class*='pagination__item--prev']").each((_: number, el: any) => {
  if (page <= 1) $(el).remove(); else $(el).attr("href", href(page - 1));
 });
 $nav.find("a[rel='next'], [class*='pagination__item--next']").each((_: number, el: any) => {
  if (page >= totalPages) $(el).remove(); else $(el).attr("href", href(page + 1));
 });
}

export function injectCollectionItems(
 html: string,
 items: CollectionCardItem[],
 hrefFor: HrefFor = (it) => `/products/${it.id}`,
 opts: { page?: number; path?: string; keepQuickAdd?: boolean; renderEmpty?: boolean; source?: CollectionSource } = {},
): string {
 // An empty list means one of two OPPOSITE things, and conflating them shows shoppers false stock.
 //   • no live data for this collection  → leave the captured grid alone (the default)
 //   • the shopper filtered and nothing matched → render an empty grid (`renderEmpty`)
 // Falling back to the capture in the second case answered "no pieces match your filters" with a
 // page full of pieces that don't — worse than useless on one-of-one vintage, because every one of
 // them is a dead end the shopper clicks anyway.
 if (!items.length) {
  if (!opts.renderEmpty) return html;
  const $empty = cheerio.load(html);
  // Stamped before the early return below: "this collection is empty" is a decision we made, and it
  // is just as true on a page that never had a grid to clear.
  stampCollectionSize($empty, 0, "empty");
  const gridsE = productGrids($empty);
  if (!gridsE.length) return $empty.html();
  const cardCountE = (el: DomElement) => ($empty(el).children().toArray() as DomElement[]).filter((k) => looksLikeCard($empty, k)).length;
  const mainE = gridsE.reduce((best, g) => (cardCountE(g) > cardCountE(best) ? g : best), gridsE[0]);
  // The CARDS go, not the container's contents wholesale: a grid can hold more than cards (a
  // section's own <style>, a "Shop now" button between the blocks), and emptying it took those with
  // it. Any stylesheet the capture inlined inside a card is hoisted out first — same as fillGrid.
  for (const cardE of ($empty(mainE).children().toArray() as DomElement[]).filter((k) => looksLikeCard($empty, k))) {
   const $hoistedE = $empty(cardE).find("style, link").remove();
   if ($hoistedE.length) $empty(mainE).before($hoistedE);
   $empty(cardE).remove();
  }
  return $empty.html();
 }
 const $ = cheerio.load(html);
 // The collection's MAIN grid is the one holding the most product cards — not simply the first one
 // in document order. A themed page often has a smaller named container earlier in the markup (a
 // promo rail, a "recently viewed" strip), and picking it both rendered the collection into the
 // wrong place and — once pagination read its size — reduced the page to a single card.
 const grids = productGrids($);
 const cardCount = (el: DomElement) => ($(el).children().toArray() as DomElement[]).filter((k) => looksLikeCard($, k)).length;
 const grid = grids.length ? grids.reduce((best, g) => (cardCount(g) > cardCount(best) ? g : best), grids[0]) : undefined;
 if (grid) {
  // Same treatment as the homepage grids: keep the theme's grid container and clone its own card,
  // so a collection page renders four across in the store's own type rather than in ours.
  //
  // PAGINATION follows the store's own pattern rather than a number we picked: fillGrid reports how
  // many cards the theme itself rendered, and that's the page size. Sites that show 12 get 12; sites
  // that show 24 get 24; a site with no pagination shows everything.
  // Counted BEFORE filling — fillGrid clears the captured cards, which would destroy the very
  // template we're measuring (and then clone our own card instead of the theme's).
  const rendered = ($(grid).children().toArray() as DomElement[]).filter((k) => looksLikeCard($, k)).length;
  // Only paginate if the SOURCE page does. A collection the store shows on a single scroll (no
  // pagination control) must keep showing everything — otherwise a grid that happened to render
  // three cards would start splitting the collection into pages of three.
  const paginates = paginationNav($, grids).length > 0;
  const pageSize = paginates && rendered > 0 ? rendered : items.length;
  const page = Math.max(1, Math.floor(opts.page || 1));
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const start = (Math.min(page, totalPages) - 1) * pageSize;
  fillGrid($, grid, items.slice(start, start + pageSize), hrefFor, opts.keepQuickAdd);
  applyPagination($, { page: Math.min(page, totalPages), totalPages, path: opts.path || "", grids });
  // The theme prints its own catalogue size ("52 products"); restate it with ours.
  $("*").contents().each((_: number, node: any) => {
   if (node.type !== "text" || !node.data) return;
   if (!/^\s*\d+\s+products?\s*$/i.test(node.data)) return;
   node.data = node.data.replace(/\d+/, String(items.length));
  });
  stampCollectionSize($, items.length, opts.source ?? "unknown");
 } else {
  const fallback = liveGridHtml(items, hrefFor);
  // Fallback: remove any static product grids, drop the live grid after the page heading.
  $(GRID_SELECTORS).remove();
  const $host = $("main").first().length ? $("main").first() : $("body").first();
  // The FIRST h1/h2, but never one that isn't really the page's own title: a screen-reader-only
  // label (a country picker's accessibility heading, say) or a dialog/drawer's own title ("Filter")
  // routinely sit earlier in the DOM than the real content, for keyboard-nav or animation reasons —
  // and Venus Vintage's real collection title isn't a heading tag at all, so both of those "won" on
  // its "girls night out" page. Climbing up FROM one of them anchored the live grid inside the
  // filter dialog, right at the top of <main> — before the header, nav and hero — which read as the
  // whole site having crashed rather than one collection missing a proper heading.
  const looksLikeDecoy = (el: DomElement) => {
   const $el = $(el);
   if (/\b(visually-hidden|sr-only|screen-reader-text|hidden)\b/.test($el.attr("class") || "")) return true;
   return $el.closest("dialog, [role='dialog'], [class*='drawer'], [class*='modal']").length > 0;
  };
  const $h = $host.find("h1,h2").filter((_, el) => !looksLikeDecoy(el)).first();
  // AFTER THE HEADING'S BLOCK, not after the heading. hachi-archive's /collections/prada rendered
  // one product per row and 36,000px tall: its theme puts the title in a narrow `col-span-section-
  // title` column, our grid became that column's second child, and `auto-fill minmax(240px,1fr)`
  // in a narrow column is one column. The heading tells us WHERE, not what to sit inside — so we
  // climb out to the section it belongs to and place the grid after that, at the page's own width.
  // Prefer the theme's own page-width wrapper: dropping the grid after the whole SECTION works but
  // leaves it flush to the window edge, without the gutter every other row on the page has.
  const $wrap = $h.length ? ($h.closest(".wrapper, .page-width, .container, .site-width") as cheerio.Cheerio<DomElement>) : $h;
  const $block = $h.length ? ($h.closest("section, .shopify-section, [id^='shopify-section']") as cheerio.Cheerio<DomElement>) : $h;
  if ($wrap.length) $wrap.append(fallback);
  else if ($block.length) $block.after(fallback);
  else if ($h.length) $h.after(fallback);
  // No usable heading anywhere on the page: a shopper still sees a plain, unstyled grid either way,
  // but appending it AFTER whatever the page already has keeps the header, nav and hero visible above
  // it — prepending put it before literally everything, which is what read as the site having crashed.
  else $host.append(fallback);
  stampCollectionSize($, items.length, opts.source ?? "unknown");
 }
 return $.html();
}

/**
 * Where a collection page's contents came from. A page serving the seller's own filing must match
 * that filing exactly; one serving what the captured page showed (because we could not read the
 * collection from their store) legitimately differs from it, and must not be reported as a fault.
 */
export type CollectionSource = "filed" | "captured" | "empty" | "unknown";

/**
 * State, in the page itself, how many pieces this rail holds.
 *
 * The theme's own "N products" text cannot be a check's ground truth: we rewrite it, plenty of
 * themes never print it (shop-vintage-charm prints nothing), and a label reading 401 on a 94-piece
 * rail is honestly reporting a page that is wrong. Until this existed, every check compared our
 * DATABASE with the seller's site and nothing compared the PAGE we actually serve — which is how a
 * Dresses rail went out holding 401 pieces against the seller's 81 while the store graded clean.
 * scripts/parity-check.mts reads this and fails the store when it disagrees with what we filed.
 */
function stampCollectionSize($: cheerio.CheerioAPI, size: number, source: CollectionSource = "unknown"): void {
 $('meta[name="vya:collection-size"], meta[name="vya:collection-source"]').remove();
 const tag = `<meta name="vya:collection-size" content="${size}"><meta name="vya:collection-source" content="${source}">`;
 const $head = $("head").first();
 if ($head.length) $head.append(tag); else $("body").first().prepend(tag);
}

/** Inject a store's site-wide custom CSS (seller edits applied over time) so it
 * wins over the captured theme. No-op when there's no custom CSS. */
export function injectCss(html: string, css: string): string {
 // A section she HID in the builder stays on her page (so Show can bring it back) and is simply not
 // shown to shoppers. Every hosted page type calls this, so the rule reaches all of them; the editor
 // never does, which is why she still sees the section there, greyed out.
 const hidden = html.indexOf("data-vya-hidden") !== -1 && html.indexOf("data-vya-hidden-rule") === -1
  ? `<style data-vya-hidden-rule="1">[data-vya-hidden]{display:none!important}</style>` : "";
 const hasCss = !!css && !!css.trim();
 if (!hasCss && !hidden) return html;
 // Neutralize any "</style><script>" breakout in store-authored CSS (CSS never needs "</").
 const tag = hidden + (hasCss ? `<style data-vya-custom="1">${css.replace(/<\//g, "<\\/")}</style>` : "");
 // A function replacer, so a "$&" in her CSS is never read as a replacement pattern.
 return html.indexOf("</body>") !== -1 ? html.replace("</body>", () => tag + "</body>") : html + tag;
}

/** Inject the VYA cart drawer + script into a captured page before serving.
 * Also strips the source CSP meta — it would block our inline cart script. */
export function injectCart(html: string): string {
 html = html.replace(/<meta[^>]*http-equiv=["']?content-security-policy["']?[^>]*>/gi, "");
 // Look for the ELEMENT, not any mention of the name. A plain substring check matched the
 // suppress-theme-cart stylesheet (which names #vya-cart-drawer in a :not() selector), so this
 // returned early and the cart was never injected at all — on every page that had been suppressed.
 if (html.indexOf('id="vya-cart-drawer"') !== -1) return html;
 return html.indexOf("</body>") !== -1 ? html.replace("</body>", CART_UI + "</body>") : html + CART_UI;
}

/** Re-hydrate the interactivity that stripping the source's JS took away (slideshow/slider
 * carousels, dropdown nav) — a small VYA-authored script + CSS fallback, never the seller's own
 * JS. See capture-shim.ts for exactly what it targets and why. Idempotent, like injectCart. */
export function injectShim(html: string): string {
 if (html.indexOf("vya-shim") !== -1) return html;
 return html.indexOf("</body>") !== -1 ? html.replace("</body>", CAPTURE_SHIM + "</body>") : html + CAPTURE_SHIM;
}

/**
 * A quiet "Powered by VYA" line at the bottom of the seller's own footer.
 *
 * It used to be a dark pill pinned bottom-right, riding over her layout and over everything else we
 * float in that corner. A powered-by line belongs where every other one does — set in her own
 * typeface, muted, above a hairline, at the end of the page.
 *
 * Idempotent, and never more than one. Where a theme carries several footers (some keep a hidden
 * mobile copy) the LAST one in the document is the real one.
 */
export function injectPoweredBy(html: string): string {
 // Guarded on a marker ATTRIBUTE, not on the class name. The account panel's own script mentions
 // `.vya-powered` (it measures anything of ours pinned in the corner), and a substring guard on the
 // class read that as "already injected" — so the badge silently disappeared from every store.
 if (html.indexOf('data-vya-powered="1"') !== -1) return html;
 const badge = `<div data-vya-powered="1" class="vya-powered-row" style="width:100%;padding:26px 20px 30px;text-align:center;border-top:1px solid rgba(128,128,128,.18);box-sizing:border-box"><a href="https://getvya.ai" target="_blank" rel="noopener" class="vya-powered" style="font-family:inherit;font-size:11px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:inherit;opacity:.62;text-decoration:none">Powered by VYA</a></div>`;
 const close = html.lastIndexOf("</footer>");
 if (close !== -1) return html.slice(0, close) + badge + html.slice(close);
 // No footer of her own — end of the page is still the right place for it, just not floating.
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
/**
 * NUMBERING V2 (imported-site builder): the header and footer are not sections.
 *
 * They used to be — a Shopify theme's header and footer groups are `.shopify-section`s like any other,
 * and a Squarespace footer is a `section.page-section` — so she could move or delete her header as if
 * it were a band of her homepage. The editor numbers the stored page with this same function, so the
 * rule stays one rule; an editor tab counted under the old one is refused by the save (see
 * app/lib/site-builder/numbering.ts).
 */
const CHROME_REGION = ".shopify-section-group-header-group, .shopify-section-group-footer-group, #shopify-section-header, #shopify-section-footer, [id$='__header'], [id$='__footer'], header#header, #footer-sections";
function inChromeRegion($: any, el: any): boolean {
 const $el = $(el);
 if ($el.closest(CHROME_REGION).length) return true;
 // The page's own <header>/<footer> — not one that sits inside its content (an article's header).
 const $hf = $el.closest("header, footer");
 return $hf.length > 0 && $hf.closest("main, article, [role='main']").length === 0;
}
function eachSection($: any, cb: (el: any, id: number) => void) {
 // Prefer the theme's own section wrappers; fall back to top-level <section>s; and
 // if a theme uses neither (many don't), treat the top-level structural blocks under
 // <main> (or <body>) as sections — so reorder/duplicate/delete work on any site.
 const body = (_: number, el: any) => !inChromeRegion($, el);
 let base: any[] = $(".shopify-section").filter(body).toArray();
 // Squarespace: its real bands are the .page-sections inside #sections. Without this the whole
 // homepage body (`section.region`) was ONE section, so nothing in it could be reordered.
 if (!base.length) base = $("#sections .page-section, .region .page-section").filter((_: number, el: any) => body(_, el) && $(el).parents(".page-section").length === 0).toArray();
 if (!base.length) base = $("section").filter((_: number, el: any) => $(el).parents("section").length === 0 && body(_, el)).toArray();
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
/**
 * One of the seller's OWN captured sections, saved with the content it now holds.
 *
 * A plain index means "this captured section, untouched" — the server takes it from its own copy of
 * the page. That is right until she changes something INSIDE it that isn't a text or image edit:
 * a text box added to the section, a photo moved above the words. Those live only in her browser's
 * DOM, and an index sends none of it, so the box she added vanished on save. This carries the
 * section's markup back so it can be written down.
 */
export type EditedSection = {
 sec: number;
 /** Her section's markup, when she changed something inside it. Absent: the stored copy is kept. */
 html?: string;
 /** Hide (true) or show (false) this section for shoppers — never deletes it. See injectCss. */
 hidden?: boolean;
 /** New settings for a product grid she added (validated by the route). Ignored on anything else. */
 grid?: GridConfig;
};
export type NewBlock = {
 new: "text" | "image" | "button" | "divider" | "faq" | "gallery" | "newsletter" | "testimonials" | "statement" | "columns" | "hero" | "announcement" | "split" | "blog" | "contact" | "products";
 text?: string; href?: string; html?: string;
 /** "products" only: validated settings and the grid's id. Its markup is always rebuilt from these. */
 grid?: GridConfig; gridId?: string;
};
// A seller-inserted block can carry its OWN edited HTML (so their inline edits survive the save instead of
// being regenerated to the default template). Sanitised hard: no scripts, styles, iframes, or event handlers.
/**
 * The sanitiser for a captured section coming back from the editor.
 *
 * Deliberately gentler than sanitizeInsertedHtml() below, which is written for markup a seller
 * pasted or a block we generated. This is the page's OWN content making a round trip: it was
 * captured from her site, we already serve it, and running the strict pass over it would quietly
 * degrade her section every time she nudged something in it — Dawn inlines a <style> inside a card,
 * and her newsletter section is a real <form>. So scripts and event handlers go, and her markup stays.
 */
/**
 * Every link in the editor is "#", with its real address parked in data-vya-href (see prepareEditMode).
 * A section sent back from the editor arrives in that state, so without this every link in a section
 * she had added something to was saved as "#" — and the next editor load parked that "#" as the
 * address, losing the real one for good. Runs before the javascript: check below, which still applies.
 */
function restoreParkedHrefs($: any): void {
 $("a[data-vya-href]").each((_: number, el: any) => {
  const $el = $(el);
  const real = $el.attr("data-vya-href") || "";
  const cur = $el.attr("href");
  if (real && (cur === undefined || cur === "#")) $el.attr("href", real);
  $el.removeAttr("data-vya-href");
 });
}

function sanitizeCapturedSection(raw: string): string {
 try {
  const $ = cheerio.load(String(raw).slice(0, 400000), undefined, false);
  restoreParkedHrefs($);
  $("script, iframe, object, embed").remove();
  $("*").each((_: number, el: any) => {
   for (const a of Object.keys(el.attribs || {})) {
    // A product grid's settings only ever reach a page through a grid save (applySectionEdits), from
    // validated values — never inside markup the editor sends back.
    if (/^data-vya-grid/i.test(a)) $(el).removeAttr(a);
    else if (/^on/i.test(a)) $(el).removeAttr(a);
    else if (/^(href|src|action|formaction)$/i.test(a) && /^\s*javascript:/i.test(el.attribs[a] || "")) $(el).removeAttr(a);
   }
  });
  return $.html();
 } catch { return ""; }
}

function sanitizeInsertedHtml(raw: string): string {
 try {
  const $ = cheerio.load(String(raw).slice(0, 40000), undefined, false);
  restoreParkedHrefs($);
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
 // A product grid is stored as its marker alone, from validated settings. Whatever markup came with it
 // is the editor's live preview — storing that would freeze today's pieces into her page.
 if (b.new === "products") return b.grid ? gridMarkerHtml(isGridId(b.gridId) ? b.gridId : newGridId(), b.grid) : "";
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

/**
 * SECTION COLOURS HAVE TO REACH WHAT SHE SEES.
 *
 * A section's background and text colour used to be written on the theme's section WRAPPER only, and on
 * a real theme nothing changed on screen. Measured on thenicheshop-2's "Our Story" (Dawn): the wrapper
 * did take the colour, but its one child — the colour-scheme container — paints its own white over the
 * whole band, and the heading and the button label kept their theme colours, because a theme rule on an
 * element beats anything it would inherit.
 *
 * The rule, the same in the editor (EDITOR_JS) and in the save (applySectionEdits):
 *  · The PAINT CHAIN is the run of wrappers that each hold the section's content alone — the wrapper's
 *    only child, that element's only child, and so on, ending at the first element with two or more
 *    children or at media. <style>/<script>-type siblings and our own powered-by row don't count. Their
 *    box is the section's box: they ARE the band.
 *  · A section BACKGROUND makes the chain transparent (colour and image) so the section's own colour
 *    shows. Anything smaller than the band — a card, a button, a photograph — keeps its own fill.
 *  · A section TEXT COLOUR goes on the chain too, so text that inherits follows it. Text the theme colours
 *    directly (headings, button labels) is recoloured piece by piece by the editor and saved as ordinary
 *    text styles — except text sitting on a fill of its own (a filled button, a badge) where the new colour
 *    would not be readable on that fill (contrast under MIN_LABEL_CONTRAST). That label keeps its colour;
 *    the text toolbar's colour still changes it deliberately.
 * Structural on both sides, never measured, so what the preview shows is what the save writes.
 */
const PAINT_CHAIN_SKIP = ["style", "script", "link", "noscript", "template", "meta"];
const PAINT_CHAIN_STOP = ["img", "picture", "video", "svg", "iframe", "canvas"];
const PAINT_CHAIN_MAX = 12;
const MIN_LABEL_CONTRAST = 3;
function paintChain($: any, sec: any): any[] {
 const out: any[] = [];
 let n = sec;
 for (let i = 0; i < PAINT_CHAIN_MAX; i++) {
  const kids = $(n).children().toArray().filter((k: any) => !PAINT_CHAIN_SKIP.includes(String(k.tagName || "").toLowerCase()) && $(k).attr("data-vya-powered") === undefined && $(k).attr("data-vya-ui") === undefined);
  if (kids.length !== 1 || PAINT_CHAIN_STOP.includes(String(kids[0].tagName || "").toLowerCase())) break;
  n = kids[0];
  out.push(n);
 }
 return out;
}
/** What a section's (already sanitised) style puts on its paint chain; "" when it carries nothing down. */
function paintChainStyle(sectionStyle: string): string {
 const decl = new Map<string, string>();
 sectionStyle.split(";").forEach((d) => { const i = d.indexOf(":"); if (i > 0) decl.set(d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()); });
 const out: string[] = [];
 if (decl.get("background-color")) out.push("background-color:transparent !important", "background-image:none !important");
 const color = decl.get("color");
 if (color) out.push(`color:${color}`);
 return out.join(";");
}

const EDITOR_JS = `(function(){/* ── Nothing in this document may navigate. ─────────────────────────────────────────────────────
   Registered first, on window, in the CAPTURE phase, so it runs before every other handler here and
   before the browser's default action — no ordering, no early exit in a later handler, and no
   leftover theme script can get past it. The bug it closes: clicking a price inside a product card
   followed /products/{handle}?variant=… and the editor iframe landed on a 404, with the seller's
   only way back a reload. Middle-click and form submits go the same way, for the same reason.
   Selection still happens: these listeners stop the NAVIGATION, never the click. */
window.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(a)e.preventDefault()},true);
window.addEventListener("auxclick",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(a)e.preventDefault()},true);
window.addEventListener("submit",function(e){e.preventDefault()},true);
/* store-aware save URLs: verbatim ES5 copy of withStoreParam in app/lib/capture-edit-url-core.ts (the script cannot import); the page is /site/<slug>/…, and only an admin's ?store= is honoured server-side */function vyaStore(u){var m=/^\\/site\\/([^/?#]+)/.exec(location.pathname||"");if(!m||!m[1])return u;return u+(u.indexOf("?")>=0?"&":"?")+"store="+encodeURIComponent(m[1])}var td={},dimg={},dlink={},dstyle={},dsecstyle={},dimgstyle={},struct=0;/* WHAT EACH EDIT REPLACES. Sent with the save, which checks it before writing, so a number that no longer means the same element on the stored page can never write over something else. Refreshed after each save. */var o0={t:{},i:{},l:{}};[].slice.call(document.querySelectorAll("[data-vya-eid]")).forEach(function(n){o0.t[n.getAttribute("data-vya-eid")]=n.textContent||""});[].slice.call(document.querySelectorAll("[data-vya-img]")).forEach(function(n){o0.i[n.getAttribute("data-vya-img")]=n.getAttribute("src")||""});[].slice.call(document.querySelectorAll("[data-vya-link]")).forEach(function(n){o0.l[n.getAttribute("data-vya-link")]=n.getAttribute("data-vya-href")||""});function vyaWarn(n){var w=document.createElement("div");w.style.cssText="position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483647;max-width:90vw;background:#5D0F17;color:#fff;font:600 13px/1.4 system-ui,sans-serif;padding:10px 16px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25)";w.textContent=n+(n>1?" changes":" change")+" couldn’t be saved because the page changed. Reload and try again.";edUi(w);setTimeout(function(){if(w.parentNode)w.parentNode.removeChild(w)},8000)}var uS=[],rS=[],cur=null,histType=0,histBusy=0,HMAX=15;/* THE EDITOR'S OWN FURNITURE — toolbars, the colour inputs, the file picker — lives in <body>
   alongside her page. Undo works by restoring an innerHTML snapshot, so both of these have to be
   true: the snapshot must not CONTAIN the furniture (restoring would duplicate it), and restoring
   must not DESTROY it (the editor would go dead). Detaching it around both operations does both. */
var EDUI=[];function edUi(n){n.setAttribute&&n.setAttribute("data-vya-ui","1");EDUI.push(n);document.body.appendChild(n);return n}
function withoutUi(fn){var det=[];for(var i=0;i<EDUI.length;i++){var n=EDUI[i];if(n&&n.parentNode){det.push([n,n.parentNode]);n.parentNode.removeChild(n)}}
try{return fn()}finally{for(var j=0;j<det.length;j++)det[j][1].appendChild(det[j][0])}}
/* WHERE UNDO REACHES. This used to be the parent of the FIRST tagged section, which is only the
   right answer when every section shares one parent. On a real theme they do not — header sections
   sit in <header>, the page's in <main>, the footer's in <footer> — so a snapshot covered one branch
   of the page and deleting a section in another branch could not be undone: the section came back
   nowhere, because it was never in the snapshot. This is the lowest ancestor that contains ALL of
   them, which is the smallest subtree an undo can be honest about. */
var _sr=null;
function secRoot(){if(_sr&&_sr.parentNode)return _sr;
var ns=[].slice.call(document.querySelectorAll("[data-vya-sec],[data-vya-block]"));
if(!ns.length)return null;
var a=ns[0];
for(var k=1;k<ns.length;k++){var b=ns[k];while(a&&a!==b&&!(a.contains&&a.contains(b)))a=a.parentNode}
if(a&&a.getAttribute&&(a.getAttribute("data-vya-sec")!==null||a.getAttribute("data-vya-block")!==null))a=a.parentNode;
_sr=a||document.body;return _sr}function takeSnap(){var r=secRoot();if(!r)return null;return{h:withoutUi(function(){return r.innerHTML}),td:JSON.stringify(td),ds:JSON.stringify(dstyle),dss:JSON.stringify(dsecstyle),di:JSON.stringify(dimg),dl:JSON.stringify(dlink)}}function pushHist(){if(histBusy)return;if(!cur){cur=takeSnap();return}if(!(histType&&uS.length&&uS[uS.length-1].t)){var e0=cur;e0.t=histType?1:0;uS.push(e0);if(uS.length>HMAX)uS.shift();rS.length=0}cur=takeSnap()}function restore(sn){var r=secRoot();if(!r||!sn)return;histBusy=1;withoutUi(function(){r.innerHTML=sn.h});td=JSON.parse(sn.td);dstyle=JSON.parse(sn.ds);dsecstyle=JSON.parse(sn.dss);dimg=JSON.parse(sn.di);dlink=JSON.parse(sn.dl);window.__vyaSel=null;curSec=null;hovSec=null;curTxt=null;try{sb.style.display="none";tb.style.display="none"}catch(e1){}struct=1;if(window.parent!==window)window.parent.postMessage({vya:"deselect"},"*");st("Unsaved changes");histBusy=0}function doUndo(){if(!uS.length)return;var sn=uS.pop();rS.push(cur);cur=sn;restore(sn)}function doRedo(){if(!rS.length)return;var sn=rS.pop();uS.push(cur);cur=sn;restore(sn)}/* The text being edited is marked by its OUTLINE only. It also had a faint tint as its background, and that rule outranks a theme's .button, so selecting a filled button wiped its fill: the white label sat on a near-white box and "the text in those buttons" looked like it would not change. */var style=document.createElement("style");style.textContent='[data-vya-eid]{cursor:text}[data-vya-eid]:hover{outline:1px dashed rgba(93,15,23,.55);outline-offset:2px}[data-vya-eid].vya-ed{outline:2px solid #5D0F17}[data-vya-img]{cursor:pointer}[data-vya-img]:hover{outline:2px dashed #5D0F17;outline-offset:2px}[data-vya-sec].vya-hi,[data-vya-block].vya-hi{outline:2px solid rgba(93,15,23,.4);outline-offset:-2px}[data-vya-sec].vya-sel,[data-vya-block].vya-sel{outline:2px solid #5D0F17!important;outline-offset:-2px}.vya-del{display:none!important}#vya-eb{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#fff;color:#57534e;border:1px solid rgba(0,0,0,.08);border-radius:30px;padding:8px 10px 8px 18px;display:flex;align-items:center;gap:12px;font:13px -apple-system,BlinkMacSystemFont,system-ui,sans-serif;box-shadow:0 14px 38px -12px rgba(43,36,29,.42)}#vya-eb button{background:#5D0F17;color:#fff;border:none;border-radius:20px;padding:8px 16px;font:600 12px -apple-system,system-ui,sans-serif;cursor:pointer}#vya-eb button:hover{background:#4a0c12}#vya-eb button:disabled{opacity:.5}#vya-sb{position:fixed;z-index:2147483647;display:none;align-items:center;gap:2px;background:rgba(255,255,255,.92);border-radius:6px;padding:2px;box-shadow:0 1px 3px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}#vya-sb button{display:grid;place-items:center;width:24px;height:24px;padding:0;background:transparent;color:#5D0F17;border:none;border-radius:4px;cursor:pointer}#vya-sb button:hover{background:rgba(93,15,23,.1)}#vya-sb button[data-a=drag]{cursor:grab}';document.head.appendChild(style);var bar=document.createElement("div");bar.id="vya-eb";bar.style.display="none";bar.innerHTML='<span id="vya-es"></span><button id="vya-save">Save changes</button>';edUi(bar);var autoT=null;function st(t){if(t==="Unsaved changes")pushHist();var es=document.getElementById("vya-es");if(es)es.textContent=t;if(window.parent!==window)window.parent.postMessage({vya:"status",text:t},"*");if(t==="Unsaved changes"&&!struct){if(autoT)clearTimeout(autoT);autoT=setTimeout(function(){var sv=document.getElementById("vya-save");if(sv)sv.click()},1200)}}var IMG_PH='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221200%22 height=%22600%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23eee%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%23999%22 font-family=%22sans-serif%22 font-size=%2226%22 text-anchor=%22middle%22%3EClick to add an image%3C/text%3E%3C/svg%3E';var sb=document.createElement("div");sb.id="vya-sb";var svS='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';sb.innerHTML='<button data-a="up" title="Move up">'+svS+'<polyline points="18 15 12 9 6 15"/></svg></button><button data-a="down" title="Move down">'+svS+'<polyline points="6 9 12 15 18 9"/></svg></button><button data-a="rm" title="Remove this" style="display:none">'+svS+'<polyline points="3 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></button><button data-a="drag" title="Drag to reorder"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="9" cy="19" r="1.4"/><circle cx="15" cy="5" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="15" cy="19" r="1.4"/></svg></button>';edUi(sb);var secbg=document.createElement("input");secbg.type="color";secbg.style.display="none";edUi(secbg);secbg.addEventListener("input",function(){if(!curSec)return;curSec.style.setProperty("background-color",this.value,"important");var si=curSec.getAttribute("data-vya-sec");if(si!==null){dsecstyle[si]=dsecstyle[si]||{};dsecstyle[si]["background-color"]=this.value+" !important"}st("Unsaved changes")});var am=document.createElement("div");am.id="vya-am";am.style.cssText="position:fixed;z-index:2147483647;display:none;flex-direction:column;background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:12px;padding:6px;box-shadow:0 16px 38px -12px rgba(43,36,29,.42)";am.innerHTML='<button data-b="text">Text block</button><button data-b="image">Image</button><button data-b="button">Button</button><button data-b="divider">Divider</button>';[].slice.call(am.children).forEach(function(b){b.style.cssText="background:transparent;color:#44403c;border:none;text-align:left;padding:7px 14px;font:600 12px -apple-system,system-ui,sans-serif;cursor:pointer;border-radius:7px";b.onmouseenter=function(){b.style.background="#f5f4f2"};b.onmouseleave=function(){b.style.background="transparent"}});edUi(am);var curSec=null,hovSec=null,curImg=null;/* A text box she added sits INSIDE a section, so it is not a section and the section bar would not    have moved it — "i cant move it around its fixed in the space". curInline is that box, and the    same up/down/drag reorder it among its own neighbours instead of among the page bands. */var curInline=null;/* A change INSIDE a captured section has to travel back as markup: the save sends an index for    an untouched section, and an index carries nothing about a text box she put in it. *//* THE TILE A PICTURE SITS IN. A "shop by collection" box is one child of a row of them, so the    thing to remove is that child — not the picture (which leaves an empty box) and not the row    (which takes every collection with it). Found by shape: the first ancestor that is one of two or    more siblings which each hold a link. */function tileOf(el){var n=el;for(var i=0;i<6&&n&&n.parentNode;i++){var pn=n.parentNode;if(pn.children&&pn.children.length>=2){var sib=[].slice.call(pn.children).filter(function(k){return k.nodeType===1&&(k.tagName==="A"||(k.querySelector&&k.querySelector("a[href]")))});if(sib.length>=2&&sib.indexOf(n)>=0)return n}n=pn}return null}function dirty(n){var sc=n&&n.closest&&n.closest("[data-vya-sec]");if(sc)sc.setAttribute("data-vya-dirty","1");struct=1}function inlineSibs(n){return [].slice.call((n.parentNode||document).children).filter(function(k){return k.nodeType===1&&!k.classList.contains("vya-del")})}function showInlineBar(n){curInline=n;showRz(n.querySelector("[data-vya-img]")||n.querySelector("[data-vya-eid]")||n);/* The panel still says EDIT SECTION, so its Delete removed the whole band — "if i click on those    and press delete it deletes the whole section". Tell it what is really selected. */if(window.parent!==window)window.parent.postMessage({vya:"inline",kind:(n.querySelector("img")?"image":n.querySelector("a")?"button":"text")},"*");placeInlineBar(n);var rm=sb.querySelector('[data-a="rm"]');if(rm)rm.style.display=""}function clearInline(){if(curInline)hideRz();if(curInline&&window.parent!==window)window.parent.postMessage({vya:"inline",kind:null},"*");curInline=null;var rm=sb.querySelector('[data-a="rm"]');if(rm)rm.style.display="none"}function isSec(n){return n&&n.getAttribute&&(n.getAttribute("data-vya-sec")!==null||n.getAttribute("data-vya-block")!==null)}function secSibs(s){return [].slice.call((s.parentNode||document).children).filter(isSec)}/* A text box INSIDE a section, as opposed to a new band of its own.
   newBlockEl() below builds a [data-vya-block] with 44px of padding — a full-width section, which is
   what the editor treats it as and what it looks like on the page. Appending one inside her section
   still read as "it made a new section". This makes an ordinary element instead: no block marker, no
   band padding, so it sits in the section's own flow the way the theme's own paragraphs do. Wrapped
   in a bare div only because instrumentNew() tags DESCENDANTS, not the node it is handed. */
function newInlineEl(t){var d=document.createElement("div");d.setAttribute("data-vya-inline","1");d.style.cssText="margin:16px 0";
if(t==="image"){d.innerHTML='<img src="'+IMG_PH+'" style="display:block;max-width:100%;height:auto">'}
else if(t==="button"){d.innerHTML='<a href="#" style="display:inline-block;padding:11px 26px;border:1px solid currentColor;color:inherit;text-decoration:none;letter-spacing:.05em">Shop now</a>'}
else{d.innerHTML='<p style="margin:0;line-height:1.6">Add your text here.</p>'}
return d}
function newBlockEl(t){var d=document.createElement("div");d.setAttribute("data-vya-block","1");d.setAttribute("data-vya-newtype",t);var star='<div style="color:#e0b23c;letter-spacing:.2em;margin-bottom:10px">★★★★★</div>';if(t==="text"){d.style.cssText="padding:44px 24px";d.innerHTML='<h2 style="margin:0 0 12px">New heading</h2><p style="margin:0;line-height:1.6">Add your text here.</p>'}else if(t==="image"){d.style.cssText="padding:0";d.innerHTML='<img src="'+IMG_PH+'" style="display:block;width:100%;height:auto">'}else if(t==="button"){d.style.cssText="padding:44px 24px";d.innerHTML='<div style="text-align:center"><a href="#" style="display:inline-block;padding:13px 30px;border:1px solid currentColor;color:inherit;text-decoration:none;letter-spacing:.05em">Shop now</a></div>'}else if(t==="hero"){d.style.cssText="padding:120px 24px;text-align:center";d.innerHTML='<h1 style="font-size:44px;line-height:1.1;margin:0 0 14px">New Arrivals</h1><p style="margin:0 0 26px;opacity:.72;font-size:17px">Curated vintage, one of one.</p><a href="#" style="display:inline-block;padding:14px 34px;border:1px solid currentColor;color:inherit;text-decoration:none;letter-spacing:.08em;text-transform:uppercase;font-size:13px">Shop now</a>'}else if(t==="statement"){d.style.cssText="padding:88px 24px;text-align:center";d.innerHTML='<p style="font-size:32px;line-height:1.3;max-width:820px;margin:0 auto">When it&#39;s gone, it&#39;s gone.</p>'}else if(t==="faq"){d.style.cssText="max-width:780px;margin:0 auto;padding:64px 24px";var fr=function(q,a){return '<details style="border-top:1px solid rgba(128,128,128,.25);padding:18px 0"><summary style="cursor:pointer;font-weight:600;list-style:none">'+q+'</summary><p style="margin:12px 0 0;line-height:1.65;opacity:.75">'+a+'</p></details>'};d.innerHTML='<h2 style="text-align:center;margin:0 0 28px;font-size:30px">Frequently asked</h2>'+fr("How are pieces sourced?","Every piece is hand-selected for quality and authenticity.")+fr("What condition are items in?","Condition is noted on each listing.")+fr("Do you accept returns?","See our Shipping &amp; Returns page.")}else if(t==="gallery"){d.style.cssText="padding:56px 24px";var im='<img src="'+IMG_PH+'" style="width:100%;aspect-ratio:4/5;object-fit:cover;display:block">';d.innerHTML='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:1120px;margin:0 auto">'+im+im+im+'</div>'}else if(t==="testimonials"){d.style.cssText="padding:64px 24px";var tc=function(q,n){return '<div style="text-align:center">'+star+'<p style="line-height:1.6">"'+q+'"</p><p style="margin-top:12px;font-size:12px;text-transform:uppercase;letter-spacing:.12em;opacity:.6">'+n+'</p></div>'};d.innerHTML='<h2 style="text-align:center;margin:0 0 36px;font-size:28px">Loved by our customers</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:28px;max-width:1080px;margin:0 auto">'+tc("Exactly as described and the quality is incredible.","Maya R.")+tc("My new favourite shop.","Priya S.")+tc("Shipped fast and beautifully packaged.","Jordan T.")+'</div>'}else if(t==="columns"){d.style.cssText="padding:64px 24px";var cc=function(h,b){return '<div><h3 style="margin:0 0 8px;font-size:19px">'+h+'</h3><p style="margin:0;line-height:1.6;opacity:.75">'+b+'</p></div>'};d.innerHTML='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:36px;max-width:1080px;margin:0 auto">'+cc("Sourced with care","Every piece is hand-selected.")+cc("One of one","No restocks — when it&#39;s gone, it&#39;s gone.")+cc("Shipped fast","On its way within a day.")+'</div>'}else if(t==="newsletter"){d.style.cssText="padding:72px 24px;text-align:center";d.innerHTML='<h2 style="margin:0 0 8px;font-size:28px">Join the list</h2><p style="margin:0 0 22px;opacity:.72">First access to new arrivals.</p><form onsubmit="return false" style="display:flex;gap:8px;max-width:440px;margin:0 auto"><input type="email" placeholder="Email address" style="flex:1;padding:13px 15px;border:1px solid rgba(128,128,128,.4)"><button type="submit" style="padding:13px 26px;background:#1a1a1a;color:#fff;border:none;cursor:pointer;letter-spacing:.06em;text-transform:uppercase;font-size:12px">Subscribe</button></form>'}else if(t==="announcement"){d.style.cssText="padding:11px 24px;text-align:center;background:#1a1a1a;color:#fff";d.innerHTML='<p style="margin:0;font-size:13px;letter-spacing:.06em">Free shipping on orders over $150</p>'}else if(t==="split"){d.style.cssText="display:grid;grid-template-columns:1fr 1fr;align-items:center";d.innerHTML='<img src="'+IMG_PH+'" style="width:100%;height:100%;min-height:340px;object-fit:cover;display:block"><div style="padding:56px 44px"><h2 style="margin:0 0 14px;font-size:30px">Every piece, one of one</h2><p style="margin:0 0 22px;line-height:1.65;opacity:.75">Tell the story behind your edit — what you source, how you find it, why it matters.</p><a href="#" style="display:inline-block;padding:13px 30px;border:1px solid currentColor;color:inherit;text-decoration:none;letter-spacing:.06em;text-transform:uppercase;font-size:12px">Learn more</a></div>'}else if(t==="blog"){d.style.cssText="padding:64px 24px";var bp=function(ti,ex){return '<a href="#" style="text-decoration:none;color:inherit"><div style="aspect-ratio:3/2;background:#eee;overflow:hidden"><img src="'+IMG_PH+'" style="width:100%;height:100%;object-fit:cover;display:block"></div><h3 style="margin:14px 0 6px;font-size:19px">'+ti+'</h3><p style="margin:0;line-height:1.6;opacity:.7;font-size:14px">'+ex+'</p></a>'};d.innerHTML='<h2 style="text-align:center;margin:0 0 36px;font-size:28px">The Journal</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:28px;max-width:1120px;margin:0 auto">'+bp("Caring for vintage leather","Keep your finds looking their best.")+bp("Vintage icons: the Lady bag","The story behind a classic.")+bp("Styling denim three ways","From day to night.")+'</div>'}else if(t==="contact"){d.style.cssText="max-width:620px;margin:0 auto;padding:64px 24px";d.innerHTML='<h2 style="text-align:center;margin:0 0 8px;font-size:30px">Get in touch</h2><p style="text-align:center;margin:0 0 28px;opacity:.72">Questions about a piece, sizing, or an order? Send us a note.</p><form onsubmit="return false" style="display:flex;flex-direction:column;gap:12px"><input placeholder="Your name" style="padding:13px 15px;border:1px solid rgba(128,128,128,.4)"><input type="email" placeholder="Email address" style="padding:13px 15px;border:1px solid rgba(128,128,128,.4)"><textarea placeholder="Your message" rows="5" style="padding:13px 15px;border:1px solid rgba(128,128,128,.4);resize:vertical"></textarea><button type="submit" style="padding:14px;background:#1a1a1a;color:#fff;border:none;cursor:pointer;letter-spacing:.06em;text-transform:uppercase;font-size:12px">Send</button></form>'}else{d.style.cssText="padding:10px 24px";d.innerHTML='<hr style="border:none;border-top:1px solid currentColor;opacity:.18;margin:0">'}return d}var neid=900000;function instrumentNew(el){[].slice.call(el.querySelectorAll("h1,h2,h3,h4,h5,h6,p,summary,li,a,blockquote")).forEach(function(n){if(!n.getAttribute("data-vya-eid")&&!n.querySelector("*")&&(n.textContent||"").trim())n.setAttribute("data-vya-eid",String(neid++))});[].slice.call(el.querySelectorAll("img")).forEach(function(n){if(!n.getAttribute("data-vya-img"))n.setAttribute("data-vya-img",String(neid++))});[].slice.call(el.querySelectorAll("details")).forEach(function(dd){dd.setAttribute("open","")})}function cleanHtml(el){var c=el.cloneNode(true);c.removeAttribute&&c.removeAttribute("data-vya-dirty");[].slice.call(c.querySelectorAll("[data-vya-dirty]")).forEach(function(n){n.removeAttribute("data-vya-dirty")});[].slice.call(c.querySelectorAll("[data-vya-eid],[data-vya-img],[data-vya-link],[contenteditable]")).forEach(function(n){n.removeAttribute("data-vya-eid");n.removeAttribute("data-vya-img");n.removeAttribute("data-vya-link");n.removeAttribute("contenteditable");if(n.classList)n.classList.remove("vya-ed","vya-sel","vya-hi")});[].slice.call(c.querySelectorAll("details")).forEach(function(dd){dd.removeAttribute("open")});if(c.classList)c.classList.remove("vya-hi","vya-sel","vya-ed");/* Every link here is "#" with its real address parked in data-vya-href. Put it back, or the section saves with dead links (the server repeats this for a tab opened before the fix). */[].slice.call(c.querySelectorAll("a[data-vya-href]")).forEach(function(a){var h=a.getAttribute("data-vya-href");if(h)a.setAttribute("href",h);a.removeAttribute("data-vya-href")});return c.outerHTML}function rgbHex(c){if(!c)return"";var m=c.match(/\\d+/g);if(!m)return"";if(m.length>=4&&Number(m[3])===0)return"";return"#"+m.slice(0,3).map(function(x){return("0"+parseInt(x,10).toString(16)).slice(-2)}).join("")}document.addEventListener("mouseover",function(e){var s=e.target.closest&&e.target.closest("[data-vya-sec],[data-vya-block]");if(s&&!s.classList.contains("vya-del")){if(hovSec&&hovSec!==s)hovSec.classList.remove("vya-hi");hovSec=s;s.classList.add("vya-hi")}});am.addEventListener("click",function(e){var bb=e.target.closest&&e.target.closest("[data-b]");var t=bb&&bb.getAttribute("data-b");if(!t||!curSec)return;var el=newBlockEl(t);curSec.parentNode.insertBefore(el,curSec.nextSibling);instrumentNew(el);am.style.display="none";struct=1;st("Unsaved changes")});sb.addEventListener("click",function(e){var bt=e.target.closest&&e.target.closest("[data-a]");var a=bt&&bt.getAttribute("data-a");if(!a)return;if(curInline){if(a==="rm"){dirty(curInline);curInline.parentNode.removeChild(curInline);clearInline();sb.style.display="none";st("Unsaved changes");return}if(a!=="up"&&a!=="down")return;var mvTo=stepSpot(curInline,a==="up");if(mvTo){mvTo.ref.parentNode.insertBefore(curInline,mvTo.before?mvTo.ref:mvTo.ref.nextSibling);placeInlineBar(curInline);showRz(curInline.querySelector("[data-vya-img]")||curInline.querySelector("[data-vya-eid]")||curInline);dirty(curInline);st("Unsaved changes")}return}if(!curSec||(a!=="up"&&a!=="down"))return;var p=curSec.parentNode;var sibs=secSibs(curSec).filter(function(n){return !n.classList.contains("vya-del")});var i=sibs.indexOf(curSec);var sw=a==="up"?sibs[i-1]:sibs[i+1];if(sw){if(a==="up")p.insertBefore(curSec,sw);else p.insertBefore(sw,curSec);var r2=curSec.getBoundingClientRect();sb.style.top=(Math.max(r2.top,4)+8)+"px";struct=1;st("Unsaved changes")}});sb.addEventListener("pointerdown",function(e){var bt=e.target.closest&&e.target.closest('[data-a="drag"]');if(!bt||!(curInline||curSec))return;e.preventDefault();var dragging=curInline||curSec;var op=dragging.style.opacity;dragging.style.opacity="0.4";sb.style.display="none";var pend=null;function mv(ev){if(curInline){var sec=dragging.closest&&dragging.closest("[data-vya-sec],[data-vya-block]");var els=document.elementsFromPoint?document.elementsFromPoint(ev.clientX,ev.clientY):[document.elementFromPoint(ev.clientX,ev.clientY)];var ref=null;for(var q=0;q<els.length&&!ref;q++)ref=dropRef(sec,dragging,els[q],ev.clientX,ev.clientY);if(!ref){pend=null;dropLine(null);return}var rr=ref.getBoundingClientRect(),pst=getComputedStyle(ref.parentElement),hz=pst.display.indexOf("flex")>=0&&pst.flexDirection.indexOf("row")===0&&ref.parentElement.children.length>1;var bf=hz?ev.clientX<rr.left+rr.width/2:ev.clientY<rr.top+rr.height/2;pend={ref:ref,before:bf};dropLine(rr,hz,bf);return}var el=document.elementFromPoint(ev.clientX,ev.clientY);var t=el&&el.closest&&el.closest("[data-vya-sec],[data-vya-block]");if(t&&t!==dragging&&t.parentNode===dragging.parentNode){var rs=t.getBoundingClientRect();if(ev.clientY<rs.top+rs.height/2)t.parentNode.insertBefore(dragging,t);else t.parentNode.insertBefore(dragging,t.nextSibling)}}var done=0;function up(){if(done)return;done=1;if(curInline&&pend&&pend.ref&&pend.ref.parentNode&&!dragging.contains(pend.ref)){pend.ref.parentNode.insertBefore(dragging,pend.before?pend.ref:pend.ref.nextSibling)}dropLine(null);if(curInline)dirty(dragging);dragging.style.opacity=op;document.removeEventListener("pointermove",mv);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);document.removeEventListener("keydown",esc);window.removeEventListener("blur",up);struct=1;st("Unsaved changes")}function esc(ev){if(ev.key==="Escape"||ev.key==="Esc")up()}try{if(bt.setPointerCapture)bt.setPointerCapture(e.pointerId)}catch(e9){}document.addEventListener("pointermove",mv);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);document.addEventListener("keydown",esc);window.addEventListener("blur",up)});var lk=document.createElement("button");lk.id="vya-lk";lk.textContent="🔗 link";lk.style.cssText="position:fixed;z-index:2147483647;display:none;background:#5D0F17;color:#fff;border:none;border-radius:8px;padding:5px 9px;font:600 11px -apple-system,system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 20px -8px rgba(43,36,29,.4)";edUi(lk);/* DRAG TO RESIZE. Everything on the page could be re-worded, re-coloured and moved, and nothing
   could be made bigger or smaller — "i should be able to resize the text, button, images like the
   way we can move it around". This is one handle, parked at the bottom-right of whatever is
   selected; dragging it sets a WIDTH IN PER CENT of the element's own container, so the result
   still behaves on a phone. Width only: a captured layout sets its own heights, and overriding one
   squashes the photograph inside it. Text is sized by A- / A+ on its toolbar, which already works. */
var rz=document.createElement("div");rz.id="vya-rz";rz.title="Drag to resize";
rz.style.cssText="position:fixed;z-index:2147483647;display:none;width:14px;height:14px;border-radius:4px;background:#5D0F17;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:nwse-resize";
edUi(rz);
var rzEl=null;
function placeRz(){if(!rzEl||!rzEl.parentNode){rz.style.display="none";return}var r=rzEl.getBoundingClientRect();
if(r.width<8||r.bottom<0||r.top>(window.innerHeight||800)){rz.style.display="none";return}
rz.style.display="block";rz.style.left=(r.right-9)+"px";rz.style.top=(r.bottom-9)+"px"}
function showRz(el){rzEl=el;placeRz()}
function hideRz(){rzEl=null;rz.style.display="none"}
/* Where the width is written down: an <img> has its own channel (imgStyles), anything else goes
   through the text style map by eid. An element with neither cannot be recorded, so it is not
   offered — a handle that silently forgets is worse than no handle. */
function canRz(el){return !!(el&&el.getAttribute&&(el.getAttribute("data-vya-img")!==null||el.getAttribute("data-vya-eid")!==null))}
function recWidth(el,pct){var v=pct+"%";el.style.setProperty("width",v,"important");
var ii=el.getAttribute("data-vya-img");
if(ii!==null){dimgstyle[ii]=dimgstyle[ii]||{};dimgstyle[ii]["width"]=v+" !important"}
else{var ee=el.getAttribute("data-vya-eid");if(ee!==null){dstyle[ee]=dstyle[ee]||{};dstyle[ee]["width"]=v+" !important"}}
st("Unsaved changes")}
rz.addEventListener("pointerdown",function(e){if(!rzEl)return;e.preventDefault();e.stopPropagation();
var el=rzEl,host=el.parentNode&&el.parentNode.getBoundingClientRect?el.parentNode.getBoundingClientRect().width:0;
if(!host){return}var startX=e.clientX,startW=el.getBoundingClientRect().width;
function mv(ev){var w=Math.max(24,startW+(ev.clientX-startX));var pct=Math.max(5,Math.min(100,Math.round(w/host*100)));
el.style.setProperty("width",pct+"%","important");placeRz()}
var done=0;function up(){if(done)return;done=1;
var pct=Math.max(5,Math.min(100,Math.round(el.getBoundingClientRect().width/host*100)));recWidth(el,pct);
document.removeEventListener("pointermove",mv);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);placeRz()}
document.addEventListener("pointermove",mv);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up)});
var lb=document.createElement("div");lb.id="vya-lb";lb.style.cssText="position:fixed;z-index:2147483647;display:none;gap:6px;background:#fff;border:1px solid rgba(0,0,0,.08);padding:8px;border-radius:12px;box-shadow:0 16px 38px -12px rgba(43,36,29,.42);align-items:center";lb.innerHTML='<input id="vya-lb-i" placeholder="https://…  or  /page" style="width:230px;border:1px solid rgba(0,0,0,.12);border-radius:7px;padding:7px 9px;font:12px -apple-system,system-ui,sans-serif;outline:none"><button id="vya-lb-s" style="background:#5D0F17;color:#fff;border:none;border-radius:7px;padding:7px 12px;font:600 12px -apple-system,system-ui,sans-serif;cursor:pointer">Set link</button><button id="vya-lb-x" style="background:transparent;color:#78716c;border:none;font:13px system-ui;cursor:pointer">✕</button>';edUi(lb);var curLink=null;document.addEventListener("mouseover",function(e){var a=e.target.closest&&e.target.closest("[data-vya-link]");if(a){curLink=a;var r=a.getBoundingClientRect();lk.style.display="block";lk.style.top=(Math.max(r.top,4)-1)+"px";lk.style.left=(r.right+4)+"px"}else if(e.target!==lk&&lb.style.display==="none"){lk.style.display="none"}});lk.addEventListener("click",function(e){e.preventDefault();if(!curLink)return;var r=curLink.getBoundingClientRect();lb.style.display="flex";lb.style.top=(r.bottom+4)+"px";lb.style.left=Math.max(r.left,8)+"px";var i=document.getElementById("vya-lb-i");i.value=curLink.getAttribute("data-vya-href")||"";i.focus();lk.style.display="none"});lb.querySelector("#vya-lb-x").addEventListener("click",function(){lb.style.display="none"});lb.querySelector("#vya-lb-s").addEventListener("click",function(){if(!curLink)return;var v=document.getElementById("vya-lb-i").value.trim();curLink.setAttribute("data-vya-href",v);dlink[curLink.getAttribute("data-vya-link")]=v;lb.style.display="none";st("Unsaved changes")});var tb=document.createElement("div");tb.id="vya-tb";tb.style.cssText="position:fixed;z-index:2147483647;display:none;gap:3px;align-items:center;background:#fff;border:1px solid rgba(0,0,0,.08);padding:6px;border-radius:12px;box-shadow:0 16px 38px -12px rgba(43,36,29,.42)";var svA='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">',svL=svA+'<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="13" y2="12"/><line x1="4" y1="17" x2="17" y2="17"/></svg>',svC=svA+'<line x1="4" y1="7" x2="20" y2="7"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="5" y1="17" x2="19" y2="17"/></svg>',svR=svA+'<line x1="4" y1="7" x2="20" y2="7"/><line x1="11" y1="12" x2="20" y2="12"/><line x1="7" y1="17" x2="20" y2="17"/></svg>';tb.innerHTML='<label style="display:grid;place-items:center;width:30px;height:30px;border-radius:8px;cursor:pointer;overflow:hidden;flex:none"><input type="color" id="vya-tb-c" title="Text colour" style="width:44px;height:44px;border:none;background:none;padding:0;cursor:pointer"></label><button data-s="dec" title="Smaller text">A−</button><button data-s="inc" title="Bigger text">A+</button><span style="width:1px;height:18px;background:#e7e5e4;margin:0 2px"></span><button data-s="left" title="Align left">'+svL+'</button><button data-s="center" title="Align centre">'+svC+'</button><button data-s="right" title="Align right">'+svR+'</button>';[].slice.call(tb.querySelectorAll("button")).forEach(function(b){b.style.cssText="display:grid;place-items:center;min-width:32px;height:32px;background:#fff;color:#44403c;border:none;border-radius:8px;padding:0 8px;font:600 14px -apple-system,system-ui,sans-serif;cursor:pointer";b.onmouseenter=function(){b.style.background="#f5f4f2";b.style.color="#5D0F17"};b.onmouseleave=function(){b.style.background="#fff";b.style.color="#44403c"}});edUi(tb);var curTxt=null;function clearEd(keep){[].slice.call(document.querySelectorAll("[data-vya-eid].vya-ed")).forEach(function(n){if(n===keep)return;n.classList.remove("vya-ed");n.removeAttribute("contenteditable")});if(curTxt&&curTxt!==keep)curTxt=null}/* THE BUTTON A PIECE OF TEXT BELONGS TO, or null. Its label could always be recoloured, but nothing could reach its fill, so no existing button ever changed colour. A theme button is a link or <button> named like one, or one that paints a fill or an outline; a plain text link is not. */function btnOf(el){var b=el&&el.closest&&el.closest("a,button,[role=button]");if(!b)return null;if(typeof b.className==="string"&&/(^|[ _-])(btn|button)([ _-]|$)/i.test(b.className))return b;try{var cs=getComputedStyle(b);var m=cs.backgroundColor.match(/[0-9.]+/g);if(m&&m.length>=3&&!(m.length>3&&+m[3]===0))return b;if(parseFloat(cs.borderTopWidth)>0&&cs.borderTopStyle!=="none")return b}catch(e){}return b.tagName==="BUTTON"?b:null}
/* A SECTION'S BUTTONS. Its Background and Text colour recoloured the section and its words, but a button keeps its own fill, so the section's buttons never changed with it. These are the buttons she owns in the section — not a live product card's quick-add, which Inventory drives. */function secButtonEls(sec){var out=[];[].slice.call(sec.querySelectorAll("[data-vya-eid]")).forEach(function(l){if(l.closest("[data-vya-item]"))return;var b=btnOf(l);if(b&&sec.contains(b)&&out.indexOf(b)<0)out.push(b)});return out}
/* One style on one element, recorded for the save when the element has a text number of its own; false when it hasn't (its section must then be saved with its markup). */function styleEl(el,prop,val){if(val)el.style.setProperty(prop,val,"important");else el.style.removeProperty(prop);var k=el.getAttribute("data-vya-eid");if(k===null)return false;dstyle[k]=dstyle[k]||{};if(val)dstyle[k][prop]=val+" !important";else delete dstyle[k][prop];return true}
/* Buttons colour for a whole section: each button's fill and outline, and a label that stays readable on it (dark on a light fill, white on a dark one). Reset ("") takes all three off again; the section is saved with its markup so the removal is written too. */function secButtons(sec,val){var lab="";if(val){var c=rgbOf(val);lab=c&&lumOf(c)>0.4?"#111111":"#ffffff"}secButtonEls(sec).forEach(function(b){var ok=styleEl(b,"background-color",val);ok=styleEl(b,"border-color",val)&&ok;var lbls=b.hasAttribute("data-vya-eid")?[b]:[].slice.call(b.querySelectorAll("[data-vya-eid]"));lbls.forEach(function(l){ok=styleEl(l,"color",lab)&&ok});if(!val||!ok)dirty(b)});st("Unsaved changes")}
/* A BOX SHE ADDED GOES ANYWHERE IN ITS SECTION. It used to be appended to the section's outer wrapper and could only be dragged among that wrapper's own children — "above everything" or "below everything" — so a line of text could never sit under a heading or beside a photo. A drop lands BESIDE the element under the pointer: never inside a heading, a link, a photo or a live product card, and never outside the section. */var DROP_TEXTY=["P","H1","H2","H3","H4","H5","H6","A","SPAN","STRONG","EM","B","I","SMALL","LABEL","BUTTON","SUMMARY","LI","FIGCAPTION","BLOCKQUOTE","IMG","PICTURE","SVG","VIDEO","INPUT","TEXTAREA","SELECT"];
function dropOk(sec,dragging,n){return !!(n&&n.nodeType===1&&sec.contains(n)&&!dragging.contains(n)&&!n.closest("[data-vya-ui]")&&!n.closest("[data-vya-item]")&&["SCRIPT","STYLE","LINK","NOSCRIPT","TEMPLATE"].indexOf(n.tagName)<0)}
function dropRef(sec,dragging,el,x,y){if(!sec||!dropOk(sec,dragging,el))return null;var t=el;for(var n=el;n&&n!==sec;n=n.parentElement){if(DROP_TEXTY.indexOf(n.tagName)>=0)t=n}for(var d=0;d<8&&DROP_TEXTY.indexOf(t.tagName)<0;d++){var kids=[].slice.call(t.children).filter(function(k){return dropOk(sec,dragging,k)&&k.getBoundingClientRect().height>0});if(!kids.length)break;var best=null,bd=1/0;kids.forEach(function(k){var r=k.getBoundingClientRect();var dy=y<r.top?r.top-y:y>r.bottom?y-r.bottom:0;var dx=x<r.left?r.left-x:x>r.right?x-r.right:0;if(dy*4+dx<bd){bd=dy*4+dx;best=k}});t=best}return t===sec?null:t}
function dropLine(r,hz,bf){var dl=document.getElementById("vya-drop");if(!r){if(dl)dl.style.display="none";return}if(!dl){dl=document.createElement("div");dl.id="vya-drop";dl.style.cssText="position:fixed;z-index:2147483646;background:#5D0F17;border-radius:2px;pointer-events:none;display:none";edUi(dl)}if(hz){dl.style.left=((bf?r.left:r.right)-1)+"px";dl.style.top=r.top+"px";dl.style.width="3px";dl.style.height=r.height+"px"}else{dl.style.left=r.left+"px";dl.style.top=((bf?r.top:r.bottom)-1)+"px";dl.style.width=r.width+"px";dl.style.height="3px"}dl.style.display="block"}
/* Where a new box first appears: right after the section's own last words (under the heading, paragraph or button she can see), not after the whole band. */function placeInSection(sec,nb){var own=[].slice.call(sec.querySelectorAll("[data-vya-eid]")).filter(function(l){return !l.closest("[data-vya-item]")&&!l.closest("[data-vya-ui]")&&(l.textContent||"").trim()&&l.getBoundingClientRect().height>0});var last=own[own.length-1];if(!last){sec.appendChild(nb);return}var at=last;for(var n=last;n&&n!==sec;n=n.parentElement){if(DROP_TEXTY.indexOf(n.tagName)>=0)at=n}at.parentNode.insertBefore(nb,at.nextSibling)}
/* A BOX'S TOOLBAR SITS ABOVE THE BOX, not on it. Placed inside the box's top edge it covered the words of a one-line box, and its drag handle landed beside the box's resize handle, so a press meant to move the box resized it instead ("it isn't moving"). Below the box when there is no room above. */function placeInlineBar(n){var r=n.getBoundingClientRect();var tp=r.top-48;if(tp<4)tp=r.bottom+8;sb.style.display="flex";sb.style.top=tp+"px";sb.style.left=Math.max(4,r.right-116)+"px"}
/* ▲▼ MOVE A BOX IN READING ORDER through its whole section: past the next heading, paragraph, button or photo, across columns. They used to swap it only with its own container's children, so a box on its own beside a paragraph could not move at all. */function stepSpot(box,up){var sec=box.closest&&box.closest("[data-vya-sec],[data-vya-block]");if(!sec)return null;var spots=[];[].slice.call(sec.querySelectorAll("*")).forEach(function(n){if(!dropOk(sec,box,n)||n.getBoundingClientRect().height===0)return;if(DROP_TEXTY.indexOf(n.tagName)<0&&!n.hasAttribute("data-vya-inline"))return;for(var p=n.parentElement;p&&p!==sec;p=p.parentElement){if(DROP_TEXTY.indexOf(p.tagName)>=0||p.hasAttribute("data-vya-inline"))return}spots.push(n)});var prev=null,next=null;spots.forEach(function(n){if(box.compareDocumentPosition(n)&2)prev=n;else if(!next)next=n});return up?(prev?{ref:prev,before:true}:null):(next?{ref:next,before:false}:null)}
function recTxt(css,val){if(!curTxt)return;curTxt.style.setProperty(css,val,"important");var eid=curTxt.getAttribute("data-vya-eid");dstyle[eid]=dstyle[eid]||{};dstyle[eid][css]=val+" !important";st("Unsaved changes")}function showTb(el,caret){tb.style.display="none";var col="",al="";try{var cs9=getComputedStyle(el);var m9=cs9.color.match(/\\d+/g);if(m9)col="#"+m9.slice(0,3).map(function(x){return("0"+parseInt(x,10).toString(16)).slice(-2)}).join("");al=cs9.textAlign||""}catch(e){}var r9=el.getBoundingClientRect();/* A live product card regenerates its own name, price and photo from Inventory on every load, so    anything typed over them here is thrown away on the next render. Say which piece it is and let    the panel send her there instead of handing her a text box that lies. */var pc=el.closest&&el.closest("[data-vya-item]");/* If this text is a button's label, tell the panel the button's fill so it can offer Button colour. "" = a button with no fill (an outline button). */var bf=null;try{var bb=btnOf(el);if(bb){var mb=getComputedStyle(bb).backgroundColor.match(/[0-9.]+/g);bf=(mb&&mb.length>=3&&!(mb.length>3&&+mb[3]===0))?"#"+mb.slice(0,3).map(function(x){return("0"+parseInt(x,10).toString(16)).slice(-2)}).join(""):""}}catch(e){}if(window.parent!==window)window.parent.postMessage({vya:"textsel",btn:bf,eid:parseInt(el.getAttribute("data-vya-eid"),10),color:col,align:al,top:r9.top,caret:(typeof caret==="number"?caret:null),item:pc?pc.getAttribute("data-vya-item"):null,itemTitle:pc?pc.getAttribute("data-vya-item-title"):null},"*")}document.getElementById("vya-tb-c").addEventListener("input",function(){recTxt("color",this.value)});tb.addEventListener("click",function(e){var sbt=e.target.closest&&e.target.closest("[data-s]");var s=sbt&&sbt.getAttribute("data-s");if(!s||!curTxt)return;if(s==="inc"||s==="dec"){var cur=parseFloat(getComputedStyle(curTxt).fontSize)||16;var nx=Math.max(10,Math.min(96,cur+(s==="inc"?2:-2)));recTxt("font-size",nx+"px")}else{recTxt("text-align",s)}});var fi=document.createElement("input");fi.type="file";fi.accept="image/*";fi.style.display="none";edUi(fi);var pend=null;fi.addEventListener("change",function(){var f=fi.files[0];if(!f||!pend)return;st("Uploading…");var fd=new FormData();fd.append("file",f);fetch(vyaStore("/api/store/assets"),{method:"POST",body:fd}).then(function(r){return r.json()}).then(function(d){if(d.url){pend.setAttribute("src",d.url);pend.removeAttribute("srcset");dimg[pend.getAttribute("data-vya-img")]=d.url;st("Unsaved changes")}else st(d.error||"Upload failed");pend=null;fi.value=""}).catch(function(){st("Upload failed")})});document.addEventListener("click",function(e){if(e.target.closest&&e.target.closest("#vya-tb,#vya-sb,#vya-am,#vya-lb,#vya-eb,#vya-lk"))return;var lnk=e.target.closest&&e.target.closest("a");if(lnk){/* NOTHING follows a link while editing. Only /site/{slug} links used to be intercepted, so a product URL, a collection tile or an external site fell through and navigated the iframe — the editor landed on a 404 and the page had to be reloaded to get back. Editing is not browsing: a click selects the link so its text and address open in the panel, and the panel offers the way there (app/lib/link-target.ts). */e.preventDefault()}var sec=e.target.closest&&e.target.closest("[data-vya-sec],[data-vya-block]");if(sec)selectSection(sec);/* AFTER the section, so a box she added wins over the band it sits in: selecting the section is    how she styles the whole band, but clicking the box itself has to hand her the box. */var inl=e.target.closest&&e.target.closest("[data-vya-inline]");if(inl)showInlineBar(inl);var im=e.target.closest&&e.target.closest("[data-vya-img]");/* Clicking a tile ANYWHERE selects that tile — a "shop by collection" box is mostly padding, and    landing a pixel off its photograph dropped her into the whole section instead, which is the row    of five "Image / Replace" with no way to tell which box she had. Words still win over the box    they sit in, so a caption is still a caption. */if(!im&&!(e.target.closest&&e.target.closest("[data-vya-eid]"))){var tl0=tileOf(e.target);if(tl0&&tl0.querySelector)im=tl0.querySelector("[data-vya-img]")}if(im){e.preventDefault();if(window.parent!==window)curImg=im;showRz(canRz(im)?im:(tileOf(im)||im));var pc9=im.closest&&im.closest("[data-vya-item]");/* A collection tile is a PICTURE wrapped in a link, so clicking it reported an image and nothing    else — the panel showed "replace this photo" and no sign of where the tile goes. A footer link    is text, which is why that one always worked. Carry the enclosing link so the panel can show its    address and the way there, exactly as it does for a link made of words. */var la=im.closest&&im.closest("a[data-vya-link]");window.parent.postMessage({vya:"imgsel",id:parseInt(im.getAttribute("data-vya-img"),10),src:im.getAttribute("src")||"",item:pc9?pc9.getAttribute("data-vya-item"):null,itemTitle:pc9?pc9.getAttribute("data-vya-item-title"):null,linkId:la?parseInt(la.getAttribute("data-vya-link"),10):null,href:la?(la.getAttribute("data-vya-href")||""):null,linkLabel:la?(la.textContent||"").trim().slice(0,50):null,tile:!!tileOf(im)},"*");return}var ed=e.target.closest&&e.target.closest("[data-vya-eid]");/* A button whose words sit in a child of it: a click on its padding means those words. */if(!ed){var bw=e.target.closest&&e.target.closest("a,button");var bl=bw&&bw.querySelectorAll("[data-vya-eid]");if(bl&&bl.length===1)ed=bl[0]}if(ed){e.preventDefault();/* The caret goes where she clicked. The element only becomes editable during this click, after the mousedown that would have placed it, and focus() alone leaves it at the start in some browsers. */var cr=caretAt(e.clientX,e.clientY,ed);showRz(canRz(ed)?ed:null);clearEd(ed);ed.setAttribute("contenteditable","true");ed.classList.add("vya-ed");ed.focus();if(cr){try{var sl=window.getSelection();if(sl&&(sl.isCollapsed||!ed.contains(sl.anchorNode))){sl.removeAllRanges();sl.addRange(cr)}}catch(e8){}}curTxt=ed;showTb(ed,cr?caretOff(ed,cr):null);return}/* Anything else clears the text selection, a link included. A link whose words can't be edited here (a live product card's name) used to return early and leave the LAST text selected, so A+/A- and the text colour quietly changed something else: clicking a product name and then A+ grew the footer's "Shoe Hospice" from 22.8px to 26.8px. */hideRz();clearEd(null);curTxt=null;tb.style.display="none";if(window.parent!==window)window.parent.postMessage({vya:"textsel",eid:-1},"*")});document.addEventListener("input",function(e){var ed=e.target.closest&&e.target.closest("[data-vya-eid]");if(ed){td[ed.getAttribute("data-vya-eid")]=ed.textContent;histType=1;st("Unsaved changes");histType=0}});document.getElementById("vya-save").addEventListener("click",function(){var edits=Object.keys(td).map(function(k){return{eid:parseInt(k,10),text:td[k],was:o0.t[k]}});var images=Object.keys(dimg).map(function(k){return{id:parseInt(k,10),src:dimg[k],was:o0.i[k]}});var links=Object.keys(dlink).map(function(k){return{id:parseInt(k,10),href:dlink[k],was:o0.l[k]}});var styles=Object.keys(dstyle).map(function(k){var o=dstyle[k],s="";for(var pk in o)s+=pk+":"+o[pk]+";";return{eid:parseInt(k,10),style:s,was:o0.t[k]}});var imgStyles=Object.keys(dimgstyle).map(function(k){var o=dimgstyle[k],s="";for(var pk in o)s+=pk+":"+o[pk]+";";return{id:parseInt(k,10),style:s,was:o0.i[k]}});var secStyles=Object.keys(dsecstyle).map(function(k){var o=dsecstyle[k],s="";for(var pk in o)s+=pk+":"+o[pk]+";";return{sec:parseInt(k,10),style:s}});var sections=null;if(struct){sections=[].slice.call(document.querySelectorAll("[data-vya-sec],[data-vya-block]")).filter(function(el){return !el.classList.contains("vya-del")}).map(function(el){var si=el.getAttribute("data-vya-sec");if(si!==null){return el.getAttribute("data-vya-dirty")?{"sec":parseInt(si,10),"html":cleanHtml(el)}:parseInt(si,10)}var t=el.getAttribute("data-vya-newtype")||"text";var o={"new":t,"html":cleanHtml(el)};return o})}if(!edits.length&&!images.length&&!links.length&&!styles.length&&!imgStyles.length&&!secStyles.length&&!sections){st("No changes yet");return}var b=this;b.disabled=true;st("Saving…");fetch(vyaStore("/api/store/capture/edit"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify((window.__vyaShapeSave||function(x){return x})({path:window.__VYA_EDIT.path,edits:edits,images:images,links:links,styles:styles,imgStyles:imgStyles,secStyles:secStyles,sections:sections}))}).then(function(r){return r.json()}).then(function(d){b.disabled=false;if(d.ok){if(window.parent!==window)window.parent.postMessage({vya:"saved"},"*");if(d.skipped)vyaWarn(d.skipped);if(struct){st("Saving…");setTimeout(function(){location.reload()},d.skipped?4000:650)}else{for(var k1 in td)o0.t[k1]=td[k1];for(var k2 in dimg)o0.i[k2]=dimg[k2];for(var k3 in dlink)o0.l[k3]=dlink[k3];td={};dimg={};dlink={};dstyle={};dsecstyle={};dimgstyle={};st("Saved ✓")}}else st(d.error||"Save failed")}).catch(function(){b.disabled=false;st("Save failed")})});/* SECTION COLOURS HAVE TO REACH WHAT SHE SEES: the editor's half of paintChain() in site-capture.ts, where the rule and the measurement behind it are written down. The lists are that file's own constants, so the preview and the save cannot drift apart. Text inside a live product card is left alone: its words are rebuilt from Inventory, so a colour recorded on them has nothing stable to land on. */var PCSKIP=${JSON.stringify(PAINT_CHAIN_SKIP)},PCSTOP=${JSON.stringify(PAINT_CHAIN_STOP)},PCMAX=${PAINT_CHAIN_MAX},MINCON=${MIN_LABEL_CONTRAST};
function paintChain(sec){var out=[],n=sec;for(var i=0;i<PCMAX;i++){var kids=[].slice.call(n.children||[]).filter(function(k){return PCSKIP.indexOf(k.tagName.toLowerCase())<0&&!k.hasAttribute("data-vya-powered")&&!k.hasAttribute("data-vya-ui")});if(kids.length!==1||PCSTOP.indexOf(kids[0].tagName.toLowerCase())>=0)break;n=kids[0];out.push(n)}return out}
function rgbOf(c){var h=/^#([0-9a-f]{6})$/i.exec(c||"");if(h){var v=parseInt(h[1],16);return[v>>16&255,v>>8&255,v&255,1]}var m=String(c||"").match(/[0-9.]+/g);if(!m||m.length<3)return null;return[+m[0],+m[1],+m[2],m.length>3?+m[3]:1]}
function lumOf(c){var a=[c[0],c[1],c[2]].map(function(x){x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4)});return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2]}
function readableOnFill(leaf,sec,chain,col){var c=rgbOf(col);if(!c)return true;for(var n=leaf;n&&n!==sec;n=n.parentElement){if(chain.indexOf(n)>=0)break;var cs=getComputedStyle(n);if(cs.backgroundImage&&cs.backgroundImage!=="none")return false;var b=rgbOf(cs.backgroundColor);if(b&&b[3]>=0.5){var x=lumOf(c),y=lumOf(b);return(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)>=MINCON}}return true}
function secCarry(sec,prop,val){var chain=paintChain(sec);
if(prop==="background-color"){chain.forEach(function(n){if(val){n.style.setProperty("background-color","transparent","important");n.style.setProperty("background-image","none","important")}else if(n.style.getPropertyValue("background-color")==="transparent"){n.style.removeProperty("background-color");n.style.removeProperty("background-image")}})}
else if(prop==="color"){chain.forEach(function(n){if(val)n.style.setProperty("color",val,"important");else n.style.removeProperty("color")});
[].slice.call(sec.querySelectorAll("[data-vya-eid]")).forEach(function(l){if(l.closest("[data-vya-item]"))return;var k=l.getAttribute("data-vya-eid");if(!val){if(dstyle[k]&&dstyle[k].color){l.style.removeProperty("color");delete dstyle[k].color}return}if(!readableOnFill(l,sec,chain,val))return;l.style.setProperty("color",val,"important");dstyle[k]=dstyle[k]||{};dstyle[k].color=val+" !important"})}}
/* WHERE SHE CLICKED, as a caret: the point under the pointer, and the same place as an offset into the words with their surrounding whitespace trimmed (how the panel's box holds them). */
function caretAt(x,y,ed){var r=null;try{if(document.caretRangeFromPoint)r=document.caretRangeFromPoint(x,y);else if(document.caretPositionFromPoint){var p=document.caretPositionFromPoint(x,y);if(p){r=document.createRange();r.setStart(p.offsetNode,p.offset);r.collapse(true)}}}catch(e){r=null}return r&&ed.contains(r.startContainer)?r:null}
function caretOff(ed,r){try{var q=document.createRange();q.setStart(ed,0);q.setEnd(r.startContainer,r.startOffset);var raw=ed.textContent||"",lead=raw.length-raw.replace(/^\\s+/,"").length;return Math.max(0,Math.min(raw.trim().length,q.toString().length-lead))}catch(e){return null}}
function selectSection(sec){var fields=[];sec.querySelectorAll("[data-vya-eid]").forEach(function(el){if((el.textContent||"").trim())fields.push({kind:"text",eid:parseInt(el.getAttribute("data-vya-eid"),10),value:el.textContent.trim(),tag:el.tagName.toLowerCase()})});sec.querySelectorAll("[data-vya-img]").forEach(function(el){fields.push({kind:"image",id:parseInt(el.getAttribute("data-vya-img"),10),src:el.getAttribute("src")})});sec.querySelectorAll("[data-vya-link]").forEach(function(el){fields.push({kind:"link",id:parseInt(el.getAttribute("data-vya-link"),10),href:el.getAttribute("data-vya-href")||"",label:(el.textContent||"").trim().slice(0,50)})});document.querySelectorAll(".vya-sel").forEach(function(x){x.classList.remove("vya-sel")});sec.classList.add("vya-sel");window.__vyaSel=sec;curSec=sec;clearInline();var rsb=sec.getBoundingClientRect();sb.style.display="flex";sb.style.top=(Math.max(rsb.top,4)+8)+"px";sb.style.left=(rsb.right-86)+"px";var si=sec.getAttribute("data-vya-sec");var cs=getComputedStyle(sec);var stStyle={bg:rgbHex(cs.backgroundColor),color:rgbHex(cs.color),align:cs.textAlign,btn:null};/* the section's first own button, so the panel can offer a Buttons colour (null = the section has none) */try{var b0=secButtonEls(sec)[0];if(b0)stStyle.btn=rgbHex(getComputedStyle(b0).backgroundColor)||""}catch(e){}var rb=sec.getBoundingClientRect();if(window.parent!==window)window.parent.postMessage({vya:"section",index:si!==null?parseInt(si,10):-1,fields:fields,style:stStyle,rect:{top:rb.top,cx:rb.left+rb.width/2}},"*")}function reportRect(){if(!window.__vyaSel)return;var rr=window.__vyaSel.getBoundingClientRect();if(sb.style.display!=="none"){if(curInline)placeInlineBar(curInline);else{sb.style.top=(Math.max(rr.top,4)+8)+"px";sb.style.left=(rr.right-86)+"px"}}if(window.parent!==window)window.parent.postMessage({vya:"secrect",top:rr.top,cx:rr.left+rr.width/2},"*")}document.addEventListener("keydown",function(e){if(e.key!=="Escape"&&e.key!=="Esc")return;clearEd(null);curTxt=null;tb.style.display="none";var s0=window.__vyaSel;if(s0){s0.classList.remove("vya-sel")}window.__vyaSel=null;curSec=null;sb.style.display="none";if(window.parent!==window)window.parent.postMessage({vya:"deselect"},"*")});window.addEventListener("scroll",function(){reportRect();placeRz()},true);window.addEventListener("resize",function(){reportRect();placeRz()});window.addEventListener("message",function(e){var d=e.data||{};if(!d||!d.vya)return;if(d.vya==="set"){if(d.kind==="text"){var el=document.querySelector('[data-vya-eid="'+d.eid+'"]');if(el){el.textContent=d.value;td[d.eid]=d.value}}else if(d.kind==="image"){var im=document.querySelector('[data-vya-img="'+d.id+'"]');if(im){im.setAttribute("src",d.src);im.removeAttribute("srcset");dimg[d.id]=d.src}}else if(d.kind==="link"){var a=document.querySelector('[data-vya-link="'+d.id+'"]');if(a){a.setAttribute("data-vya-href",d.href);dlink[d.id]=d.href}}st("Unsaved changes");if(window.parent!==window)window.parent.postMessage({vya:"unsaved"},"*")}else if(d.vya==="save"){document.getElementById("vya-save").click()}else if(d.vya==="scrollto"){var t=document.querySelector('[data-vya-sec="'+d.index+'"]');if(t)t.scrollIntoView({behavior:"smooth",block:"center"})}else if(d.vya==="addblock"){/* d.inside comes from the Add-to-this-section row in the section panel, which is the only place she can be sure WHICH section she means: the left rail's Text tab is reachable only after the section panel is dismissed, and dismissing it deselects. */var nb=(d.inside?newInlineEl:newBlockEl)(d.type||"text");if(d.src&&d.type==="image"){var im9=nb.querySelector("img");if(im9){im9.setAttribute("src",d.src);im9.removeAttribute("srcset")}}var anc=window.__vyaSel;if(!anc||!anc.parentNode||anc.classList.contains("vya-del")){var cds=[].slice.call(document.querySelectorAll("[data-vya-sec],[data-vya-block]")).filter(function(n){return !n.classList.contains("vya-del")});var vh=window.innerHeight||800,mid=vh/2,best=null,bd=1/0;cds.forEach(function(n){var r=n.getBoundingClientRect();if(r.bottom<=0||r.top>=vh)return;var d=Math.abs(r.top+r.height/2-mid);if(d<bd){bd=d;best=n}});anc=best||cds[cds.length-1]}/* A SELECTED SECTION TAKES THE BLOCK INSIDE IT. Adding text always made a whole new band of its own, so putting a line under a heading meant a new full-width section below the one she was in, then dragging it — she asked for a text box in the section, not another section. Selecting a section is a deliberate act, so it is read as "here". With nothing selected it lands after the section nearest the middle of the screen, which is the old behaviour and still the right one for "add a band to my page". */var inside=d.inside&&window.__vyaSel&&window.__vyaSel.parentNode&&!window.__vyaSel.classList.contains("vya-del");if(inside)anc=window.__vyaSel;if(inside){placeInSection(anc,nb);dirty(anc)}else if(anc&&anc.parentNode){anc.parentNode.insertBefore(nb,anc.nextSibling)}else{(document.querySelector("main")||document.body).appendChild(nb)}instrumentNew(nb);struct=1;st("Unsaved changes");if(window.parent!==window)window.parent.postMessage({vya:"unsaved"},"*");nb.scrollIntoView({behavior:"smooth",block:"center"})}else if(d.vya==="css"){var ls=document.getElementById("vya-live-design");if(!ls){ls=document.createElement("style");ls.id="vya-live-design";document.head.appendChild(ls)}ls.textContent=d.css||""}else if(d.vya==="undo"){doUndo();if(window.parent!==window)window.parent.postMessage({vya:"unsaved"},"*")}else if(d.vya==="redo"){doRedo();if(window.parent!==window)window.parent.postMessage({vya:"unsaved"},"*")}else if(d.vya==="dupsec"){var s2=window.__vyaSel;if(s2){var c2=s2.cloneNode(true);c2.classList.remove("vya-hi","vya-sel");s2.parentNode.insertBefore(c2,s2.nextSibling);struct=1;st("Unsaved changes")}}else if(d.vya==="delsec"){var s3=window.__vyaSel;if(s3){s3.classList.add("vya-del");s3.classList.remove("vya-sel");window.__vyaSel=null;sb.style.display="none";struct=1;st("Unsaved changes")}}else if(d.vya==="secstyle"){var s4=window.__vyaSel;if(s4&&d.prop){if(d.value)s4.style.setProperty(d.prop,d.value,"important");else s4.style.removeProperty(d.prop);var si4=s4.getAttribute("data-vya-sec");if(si4!==null){dsecstyle[si4]=dsecstyle[si4]||{};if(d.value)dsecstyle[si4][d.prop]=d.value+" !important";else delete dsecstyle[si4][d.prop]}secCarry(s4,d.prop,d.value);st("Unsaved changes")}}else if(d.vya==="txtstyle"){if(curTxt&&d.prop){if(d.prop==="font-size"){var cf=parseFloat(getComputedStyle(curTxt).fontSize)||16;recTxt("font-size",Math.max(10,Math.min(96,cf+(d.dir==="inc"?2:-2)))+"px")}else recTxt(d.prop,d.value)}}else if(d.vya==="secbtn"){var s6=window.__vyaSel;if(s6)secButtons(s6,d.value||"")}else if(d.vya==="btnstyle"){/* Button colour: fill and outline, on the button itself. When the label IS the button it saves like any text style; when the label sits inside it, the button has no text number of its own, so its section is saved with its markup. */var bt=curTxt&&btnOf(curTxt);if(bt&&d.value){if(bt===curTxt){recTxt("background-color",d.value);recTxt("border-color",d.value)}else{bt.style.setProperty("background-color",d.value,"important");bt.style.setProperty("border-color",d.value,"important");dirty(bt);st("Unsaved changes")}}}else if(d.vya==="deltile"){var tl=curImg&&tileOf(curImg);if(tl&&tl.parentNode){dirty(tl);tl.parentNode.removeChild(tl);curImg=null;if(window.parent!==window)window.parent.postMessage({vya:"deselect"},"*");st("Unsaved changes")}}else if(d.vya==="delinline"){if(curInline){dirty(curInline);curInline.parentNode.removeChild(curInline);clearInline();sb.style.display="none";st("Unsaved changes")}}else if(d.vya==="dupinline"){if(curInline){var ci=curInline.cloneNode(true);curInline.parentNode.insertBefore(ci,curInline.nextSibling);instrumentNew(ci);dirty(ci);st("Unsaved changes")}}else if(d.vya==="deselect"){hideRz();clearInline();clearEd(null);curTxt=null;tb.style.display="none";var s6=window.__vyaSel;if(s6)s6.classList.remove("vya-sel");window.__vyaSel=null;curSec=null;sb.style.display="none"}else if(d.vya==="movesec"){var s5=window.__vyaSel;if(s5){var p5=s5.parentNode;var sib=secSibs(s5).filter(function(n){return !n.classList.contains("vya-del")});var i5=sib.indexOf(s5);var sw5=d.dir==="up"?sib[i5-1]:sib[i5+1];if(sw5){if(d.dir==="up")p5.insertBefore(s5,sw5);else p5.insertBefore(sw5,s5);struct=1;st("Unsaved changes");reportRect()}}}});[].slice.call(document.querySelectorAll("[data-vya-block] details")).forEach(function(dd){dd.setAttribute("open","")});/* ── SITE BUILDER BRIDGE. The few internals the builder's own script (app/lib/site-builder/editor-additions.ts, injected right after this one) needs. Nothing in this script calls it. ── */window.__vyaEd={mark:function(){struct=1;st("Unsaved changes");if(window.parent!==window)window.parent.postMessage({vya:"unsaved"},"*")},ui:edUi,instrument:instrumentNew,canUndo:function(){return uS.length>0},undo:doUndo,sel:function(){return window.__vyaSel}};cur=takeSnap();})();`;

/** Serve a captured page in EDIT mode: tag editable text/images/sections + inject the editor. */
export function prepareEditMode(html: string, slug: string, path: string, opts: { hidden?: boolean } = {}): string {
 const $ = cheerio.load(html);
 $("meta[http-equiv]").each((_: number, el: any) => { if (/content-security-policy/i.test($(el).attr("http-equiv") || "")) $(el).remove(); });
 // Re-run the Shopify cleanup so the editor matches the live site — and so already-captured sites
 // get the stray "© Store VYA" footer artifact fixed on load (deShopify is idempotent).
 //
 // NUMBER FIRST, CLEAN UP SECOND. A save counts the STORED page, which never has the cleanup pass run
 // over it, so numbering after deShopify() left out whatever it removed — a header's country picker —
 // and shifted every number below it: on tesselizabethvintage, 228 of 255 pieces of text pointed at
 // something else, and typing into a heading wrote into a product title. A page the serve route already
 // numbered (stampEditIds, before live inventory changed it) keeps those numbers.
 if ($("html").attr("data-vya-numbered")) dropRepeatedIds($); else stampIds($);
 deShopify($);
 // THE THEME'S LOADING SCREEN, IN THE EDITOR ONLY. Palo Alto (sourcedbyscottie) keeps a fixed,
 // full-viewport <loading-overlay> over the page until its own script drops html.page-loading; on a
 // 5.8MB page that took seconds inside the editor, and every click in that time landed on the loader
 // (measured: a real click on "SHOP ALL" selected nothing). Shoppers' pages get the same flag dropped by
 // the capture shim (capture-shim.ts). This is the editor's copy of the page — never stored, never served
 // to a shopper — so the loader is simply not shown.
 $("html").removeClass("page-loading");
 $("head").append(`<style data-vya-edit-only="1">loading-overlay,.loading-overlay{display:none!important}</style>`);
 // NO LINK IN THE EDITOR IS A LINK. Its address moves to data-vya-href and the href itself becomes
 // "#", so a click, a middle-click, the Enter key on a focused link, or any script we failed to
 // strip cannot navigate this iframe — the editor could land on /products/{handle}?variant=… (a
 // route the app does not serve), show a bare 404, and leave the seller with a reload as her only
 // way back. The capture-phase guard in EDITOR_JS cancels the click as well; this is what makes the
 // worst case a no-op instead of a lost page. Every read and write of a link inside the editor goes
 // through data-vya-href, and saving posts the addresses (`dlink`) rather than the DOM, so the
 // stored page keeps real hrefs — this is a property of the VIEW, not of her site.
 $("a[href]").each((_i: number, el: DomElement) => { $(el).attr("data-vya-href", $(el).attr("href") || "").attr("href", "#"); });
 // `numbering` is the section-numbering rule this page was counted under; the save sends it back and is
 // refused when it no longer matches (app/lib/site-builder/numbering.ts). The builder's own script runs
 // after the editor's and reaches it only through window.__vyaEd.
 // `hidden` is Step 3: shoppers get "Page not found" here, but she can still open and edit it — the
 // builder's own script puts one bar at the top saying so, with the way back.
 const inject = `<script>window.__VYA_EDIT=${JSON.stringify({ slug, path, numbering: EDITOR_NUMBERING, hidden: !!opts.hidden })};</script><script>${EDITOR_JS}</script><script data-vya-builder-js="1">${SITE_BUILDER_EDITOR_JS}</script>`;
 // Always show the "Powered by VYA" badge bottom-right, even inside the editor (guarded, injects once).
 const out = injectPoweredBy($.html());
 return out.indexOf("</body>") !== -1 ? out.replace("</body>", inject + "</body>") : out + inject;
}

// Only these CSS properties may be set via the visual style controls (defense-in-depth —
// values are also scrubbed of url()/expression/etc.). Anything else is dropped.
const STYLE_ALLOW = new Set(["color", "background-color", "background", "font-size", "text-align",
 // Width, because she can now drag an image or a box wider and narrower. Height is deliberately NOT
 // here: a captured layout sets its own heights, and letting one be overridden squashes photographs.
 "width", "max-width", "font-weight", "font-style", "letter-spacing", "line-height", "padding", "padding-top", "padding-bottom", "padding-left", "padding-right", "margin-top", "margin-bottom", "text-transform", "font-family", "border-radius",
 // A button's colour is its fill AND its outline; without the outline a recoloured button kept a ring
 // of its old colour.
 "border-color"]);
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
 edits?: { eid: number; text: string; was?: string }[];
 images?: { id: number; src: string; was?: string }[];
 links?: { id: number; href: string; was?: string }[];
 styles?: { eid: number; style: string; was?: string }[];   // inline style deltas on text elements
 secStyles?: { sec: number; style: string }[]; // inline style deltas on sections (e.g. background)
 // The full desired order of sections. A NUMBER entry references the ORIGINAL section
 // index (0-based, document order): reorder = indices shuffled, duplicate = index repeated,
 // delete = index omitted. A NewBlock entry inserts a brand-new theme-inheriting section at
 // that position. Applied after text/image edits so those are kept.
 /** Inline styles on IMAGES, keyed the way images are. `styles` above is keyed by eid and applied
  *  through eachEditable(), which never reaches an <img> — so a resized photo had nowhere to be
  *  written down. */
 imgStyles?: { id: number; style: string; was?: string }[];
 sections?: (number | NewBlock | EditedSection)[];
 // Legacy (superseded by `sections`); still honored so older clients don't break.
 deleteSecs?: number[];
 dupSecs?: number[];
};

/**
 * Number what the editor can address — text, images, links, sections — on the STORED page, before the
 * serve path changes it.
 *
 * The save numbers the stored page (applyEdits below). The editor used to be numbered after the live
 * product grids, the collection tiles and the cleanup pass had rebuilt the page, so the two counts
 * disagreed wherever those changed the number of elements: sourcedbyscottie's homepage grew from 126
 * pieces of text to 5,224, and an edit to a heading below its grid saved onto nothing at all. Numbered
 * here, every element that came from her page keeps the number the save will give it; whatever the
 * serve path adds on top has no number, and is not hers to type into anyway (pieces are edited in
 * Inventory, collection tiles in Collections).
 */
export function stampEditIds(html: string): string {
 const $ = cheerio.load(html);
 stampIds($);
 $("html").attr("data-vya-numbered", "1");
 return $.html();
}

const EDIT_ID_ATTRS = ["data-vya-eid", "data-vya-img", "data-vya-link", "data-vya-sec"] as const;

function stampIds($: any): void {
 // A stored page can carry an id left by an earlier save (a section she changed comes back with its
 // data-vya-sec). Clear them first, or a stale number outlives the element it was given to.
 for (const a of EDIT_ID_ATTRS) $(`[${a}]`).removeAttr(a);
 eachEditable($, (el, eid) => $(el).attr("data-vya-eid", String(eid)));
 eachImage($, (el, id) => $(el).attr("data-vya-img", String(id)));
 eachLink($, (el, id) => $(el).attr("data-vya-link", String(id)));
 eachSection($, (el, id) => $(el).attr("data-vya-sec", String(id)));
}

/** A live grid clones a captured card for every piece, ids and all. A number several elements share
 *  cannot say which one she meant, so none of them keeps it. */
function dropRepeatedIds($: any): void {
 for (const a of EDIT_ID_ATTRS) {
  const count = new Map<string, number>();
  $(`[${a}]`).each((_: number, el: any) => { const v = $(el).attr(a); count.set(v, (count.get(v) || 0) + 1); });
  $(`[${a}]`).each((_: number, el: any) => { if ((count.get($(el).attr(a)) || 0) > 1) $(el).removeAttr(a); });
 }
}

const sameValue = (a: string | undefined, b: string | undefined) =>
 (a || "").replace(/\s+/g, " ").trim() === (b || "").replace(/\s+/g, " ").trim();

/**
 * WHERE AN EDIT BELONGS. A number is only a position, and the page it was counted on can change before
 * she saves — the serve path, another tab, a header edit carried over from a different page. So an edit
 * carries the value it replaces (`was`) and lands:
 *   · at its own position, if that element still holds that value;
 *   · otherwise on the ONE element that does;
 *   · otherwise nowhere — reported, never guessed. Writing over the wrong thing is the one outcome
 *     worse than not saving.
 * An edit with no `was` comes from an editor opened before this existed and keeps the old rule.
 */
function locateEdit(list: any[], id: number, was: string | undefined, read: (el: any) => string): number {
 if (was === undefined) return list[id] ? id : -1;
 if (list[id] && sameValue(read(list[id]), was)) return id;
 let hit = -1;
 for (let i = 0; i < list.length; i++) {
  if (!sameValue(read(list[i]), was)) continue;
  if (hit !== -1) return -1;
  hit = i;
 }
 return hit;
}

/** applyEdits, plus how many edits found nowhere to land and the edits as they actually landed (the
 *  positions header/footer and product-page copying must read the replaced values from). */
export function applyEditsWithReport(html: string, p: PageEdits): { html: string; skipped: number; resolved: PageEdits } {
 const $ = cheerio.load(html);
 const texts: any[] = [], images: any[] = [], links: any[] = [];
 eachEditable($, (el) => texts.push(el));
 eachImage($, (el) => images.push(el));
 eachLink($, (el) => links.push(el));
 const textOf = (el: any) => $(el).text(), srcOf = (el: any) => $(el).attr("src") || "", hrefOf = (el: any) => $(el).attr("href") || "";
 let skipped = 0;
 // Locate every edit before applying any, so one edit's new text can't be mistaken for another's old.
 const place = <T extends { was?: string }>(list: any[], entries: T[] | undefined, idOf: (e: T) => number, read: (el: any) => string, at: (e: T, i: number) => T): T[] =>
  (entries || []).flatMap((e) => {
   const i = locateEdit(list, idOf(e), e.was, read);
   if (i < 0) { skipped++; return []; }
   return [at(e, i)];
  });
 const edits = place(texts, p.edits, (e) => e.eid, textOf, (e, i) => ({ ...e, eid: i }));
 const styles = place(texts, p.styles, (e) => e.eid, textOf, (e, i) => ({ ...e, eid: i }));
 const imgs = place(images, p.images, (e) => e.id, srcOf, (e, i) => ({ ...e, id: i }));
 const imgStyles = place(images, p.imgStyles, (e) => e.id, srcOf, (e, i) => ({ ...e, id: i }));
 const lnks = place(links, p.links, (e) => e.id, hrefOf, (e, i) => ({ ...e, id: i }));

 for (const e of edits) $(texts[e.eid]).text(e.text);
 for (const e of styles) { const s = sanitizeStyle(e.style); if (s) $(texts[e.eid]).attr("style", mergeStyle($(texts[e.eid]).attr("style") || "", s)); }
 for (const e of imgs) $(images[e.id]).attr("src", e.src).removeAttr("srcset");
 for (const e of imgStyles) { const s = sanitizeStyle(e.style); if (s) $(images[e.id]).attr("style", mergeStyle($(images[e.id]).attr("style") || "", s)); }
 for (const e of lnks) $(links[e.id]).attr("href", e.href);

 return { html: applySectionEdits($, p), skipped, resolved: { ...p, edits, styles, images: imgs, imgStyles, links: lnks } };
}

/** Apply the seller's edits (text / images / section reorder+duplicate+delete) back into the stored HTML. */
export function applyEdits(html: string, p: PageEdits): string {
 return applyEditsWithReport(html, p).html;
}

function applySectionEdits($: any, p: PageEdits): string {
 // Section styles (e.g. background) — applied before the reorder/rebuild so they ride along.
 const ssmap = new Map((p.secStyles || []).map((e) => [e.sec, sanitizeStyle(e.style)]));
 if (ssmap.size) eachSection($, (el, id) => {
  const s = ssmap.get(id);
  if (!s) return;
  $(el).attr("style", mergeStyle($(el).attr("style") || "", s));
  // …and down the wrappers that paint over it, by the same rule the editor previewed (see paintChain).
  const carry = paintChainStyle(s);
  if (carry) for (const n of paintChain($, el)) $(n).attr("style", mergeStyle($(n).attr("style") || "", carry));
 });

 if (Array.isArray(p.sections)) {
 // Snapshot the current sections (post text/image edits) and rebuild the parent's
 // section run in the requested order — one pass handles reorder, duplicate, delete,
 // and inserting brand-new blocks.
 const secs: any[] = [];
 eachSection($, (el) => secs.push(el));
 // Which of her sections are still on the page in any form. The rest are being deleted for good.
 const kept = new Set<number>();
 for (const entry of p.sections) { if (typeof entry === "number") kept.add(entry); else if ("sec" in entry) kept.add(entry.sec); }
 const rebuilt = p.sections.map((entry) => {
  if (typeof entry === "number") return secs[entry] ? $.html(secs[entry]) : "";
  // Her own section, with whatever she has since put inside it (or hidden, or a grid's new settings).
  if ("sec" in entry) return secs[entry.sec] ? editedSectionHtml($, secs[entry.sec], entry) : "";
  return newBlockHtml(entry);
 }).join("");
 if (secs.length) {
 const $mark = $('<div id="__vya_secmark__"></div>');
 $(secs[0]).before($mark);
 secs.forEach((el, i) => { if (!kept.has(i)) hoistSectionStyles($, el, $mark); });
 secs.forEach((el) => $(el).remove());
 $mark.replaceWith(rebuilt);
 } else if (rebuilt) {
 const $host = $("main").first().length ? $("main").first() : $("body").first();
 $host.append(rebuilt);
 }
 reissueDuplicateGridIds($);
 } else {
 // Legacy path: independent duplicate/delete by index.
 const dup = new Set(p.dupSecs || []), del = new Set(p.deleteSecs || []);
 if (dup.size || del.size) {
 const secs: any[] = [];
 eachSection($, (el) => secs.push(el));
 dup.forEach((id) => { if (secs[id]) $(secs[id]).after($.html(secs[id])); });
 del.forEach((id) => { if (secs[id]) { hoistSectionStyles($, secs[id], $(secs[id])); $(secs[id]).remove(); } });
 reissueDuplicateGridIds($);
 }
 }
 return $.html();
}

/**
 * One of her sections as the save writes it back.
 *
 * A product grid she added keeps its stored marker and takes only new, validated settings — markup
 * from the editor would carry today's live cards into the page. Anything else is her stored section
 * or, when she changed something inside it, the markup she sent (sanitised). Hiding sets or clears
 * one attribute on the section itself and never removes anything.
 */
function editedSectionHtml($: any, own: any, entry: EditedSection): string {
 const $own = $(own);
 let html: string;
 if ($own.is('[data-vya-newtype="products"][data-vya-grid-id]')) {
  const $grid = $own.clone().empty();
  if (entry.grid) $grid.attr("data-vya-grid", JSON.stringify(parseGridConfig(entry.grid)));
  html = $.html($grid);
 } else {
  html = typeof entry.html === "string" ? sanitizeCapturedSection(entry.html) : $.html(own);
 }
 if (typeof entry.hidden !== "boolean") return html;
 const $f = cheerio.load(html, null, false);
 const $root = $f.root().children().first();
 if (entry.hidden) $root.attr("data-vya-hidden", "1"); else $root.removeAttr("data-vya-hidden");
 return $f.html();
}

/**
 * A section deleted for good leaves its stylesheets behind.
 *
 * A capture inlines each stylesheet where its <link> was, so the first section to use a component
 * carries that component's CSS for every section after it — deleting it made a KEPT section further
 * down lose its layout. Moved rather than dropped, to just before the section run, which keeps them
 * after the theme's own head styles and ahead of the sections that relied on them (the same cascade
 * order they had); fillGrid treats a leftover card's styles the same way.
 */
function hoistSectionStyles($: any, section: any, $before: any): void {
 const $styles = $(section).find("style, link[rel~='stylesheet']").remove();
 if ($styles.length) $before.before($styles);
}

/** Two grids on one page must never share an id — it scopes each grid's own column rules. A duplicated
 *  section is the usual way it happens. */
function reissueDuplicateGridIds($: any): void {
 const seen = new Set<string>();
 $("[data-vya-grid-id]").each((_: number, el: any) => {
  const id = $(el).attr("data-vya-grid-id");
  if (isGridId(id) && !seen.has(id)) { seen.add(id); return; }
  const fresh = newGridId();
  seen.add(fresh);
  $(el).attr("data-vya-grid-id", fresh);
 });
}

// Header/footer/nav are duplicated on every captured page, so editing them on one page leaves the others
// stale. These two functions propagate SHARED-CHROME edits across pages: extract the text/link/image
// changes that land inside header/footer/nav on the edited page, then apply them (by matching the OLD
// value) to the same chrome on every other page. Structural edits (add/move/delete) stay per-page.
const CHROME_SEL = "header, footer, nav";
export type ChromeEdits = { texts: { old: string; val: string }[]; links: { old: string; val: string; label: string }[]; images: { old: string; val: string }[] };
/**
 * Which part of a page an edit belongs to, and therefore where it travels.
 *
 * "chrome" — header, footer and nav, which every captured page carries its own copy of, so an edit
 * to one has to reach all of them.
 *
 * "body" — everything else. Used for PRODUCT pages, which have the same problem in a sharper form:
 * a store has one product page design and hundreds of copies of it, one per piece, and the seller
 * edits whichever one she happened to open. Matching on the OLD VALUE is what makes this safe — the
 * words she changed ("Add to cart", "Free shipping over $100", a size-guide heading) are identical
 * on every product page, while a piece's own title, price and description are unique to it and so
 * match nothing. The template travels; the products stay themselves.
 */
export type EditScope = "chrome" | "body";

/** The edits from one page that belong to `scope`, recorded by the value they replaced. */
export function extractScopedEdits(sourceHtml: string, p: PageEdits, scope: EditScope = "chrome"): ChromeEdits {
 const $ = cheerio.load(sourceHtml);
 eachEditable($, (el: any, eid: number) => $(el).attr("data-vya-eid", String(eid)));
 eachLink($, (el: any, id: number) => $(el).attr("data-vya-link", String(id)));
 eachImage($, (el: any, id: number) => $(el).attr("data-vya-img", String(id)));
 const inScope = (el: any) => (scope === "chrome" ? el.closest(CHROME_SEL).length > 0 : el.closest(CHROME_SEL).length === 0);
 const texts: ChromeEdits["texts"] = [], links: ChromeEdits["links"] = [], images: ChromeEdits["images"] = [];
 for (const e of p.edits || []) { const el = $(`[data-vya-eid="${e.eid}"]`); if (el.length && inScope(el)) { const old = (el.text() || "").trim(); if (old && old !== e.text.trim()) texts.push({ old, val: e.text }); } }
 for (const l of p.links || []) { const el = $(`[data-vya-link="${l.id}"]`); if (el.length && inScope(el)) { const old = el.attr("href") || ""; if (old !== l.href) links.push({ old, val: l.href, label: (el.text() || "").trim() }); } }
 for (const im of p.images || []) { const el = $(`[data-vya-img="${im.id}"]`); if (el.length && inScope(el)) { const old = el.attr("src") || ""; if (old && old !== im.src) images.push({ old, val: im.src }); } }
 return { texts, links, images };
}

export function extractChromeEdits(sourceHtml: string, p: PageEdits): ChromeEdits {
 return extractScopedEdits(sourceHtml, p, "chrome");
}

export function hasChromeEdits(c: ChromeEdits): boolean { return c.texts.length > 0 || c.links.length > 0 || c.images.length > 0; }
export function applyScopedEditsToPage(html: string, c: ChromeEdits, scope: EditScope = "chrome"): { html: string; changed: boolean } {
 if (!hasChromeEdits(c)) return { html, changed: false };
 const $ = cheerio.load(html);
 let changed = false;
 // Chrome edits are hunted inside header/footer/nav; body edits everywhere BUT there, so the two
 // passes a save makes can never both rewrite the same element.
 const scoped = (sel: string) => (scope === "chrome" ? $(CHROME_SEL).find(sel) : $(sel).filter((_: number, n: any) => $(n).closest(CHROME_SEL).length === 0));
 c.texts.forEach(({ old, val }) => { scoped("*").each((_: number, n: any) => { const $n = $(n); if ($n.children().length === 0 && ($n.text() || "").trim() === old) { $n.text(val); changed = true; } }); });
 c.links.forEach(({ old, val, label }) => { scoped("a").each((_: number, n: any) => { const $n = $(n); if ((($n.attr("href") || "") === old) && (!label || ($n.text() || "").trim() === label)) { $n.attr("href", val); changed = true; } }); });
 c.images.forEach(({ old, val }) => { scoped("img").each((_: number, n: any) => { const $n = $(n); if (($n.attr("src") || "") === old) { $n.attr("src", val); $n.removeAttr("srcset"); changed = true; } }); });
 return { html: changed ? $.html() : html, changed };
}

export function applyChromeEditsToPage(html: string, c: ChromeEdits): { html: string; changed: boolean } {
 return applyScopedEditsToPage(html, c, "chrome");
}

/** Is this captured path one of the store's product pages? */
export function isCapturedProductPath(path: string): boolean {
 return /^\/products\//.test(path || "");
}
