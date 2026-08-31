// Which of the seller's scripts may run, and how their URLs are rewritten.
//
// Under Plan A every script is stripped, because re-hosting a third party's JavaScript on
// vyaplatform.com would let it act as any logged-in buyer or admin who opens the page — stored XSS
// with the victim's cookies. Under Plan B the store is served from its OWN registrable domain, so
// the same-origin policy already isolates it from VYA and the theme's code can be kept. That is the
// entire reason Plan B reaches 1-to-1 fidelity where a shim cannot.
//
// "Isolated from VYA" is not "harmless", though. Two rules survive the move:
//
//   1. KEEP THE THEME'S OWN CODE, STRIP OUTSIDE VENDORS. Analytics, chat widgets and marketing
//      pixels would otherwise execute on a domain we operate, sending the seller's shoppers to third
//      parties we never chose, under our TLS certificate.
//   2. STRIP SHOPIFY'S CHECKOUT. Shop Pay and the dynamic checkout buttons take the order away to
//      Shopify — the one thing a VYA-hosted store must never do.
//
// Everything here is pure and unit tested.

/** Hosts that serve a Shopify STORE's own theme assets — the code that makes the storefront work. */
const THEME_HOSTS = [
 "cdn.shopify.com",
 "cdn.shopifycdn.net",
 "shopifycdn.com",
 // Squarespace's equivalent.
 "assets.squarespace.com",
 "static1.squarespace.com",
];

/**
 * Public package CDNs. A theme that loads Swiper, lazyload or jQuery from jsDelivr is loading its OWN
 * dependencies — that code IS the storefront, not a third party watching its visitors.
 *
 * Stripping these was a real, visible bug: this theme builds its category row with Swiper, so with
 * the library gone `new Swiper(...)` threw, the slides never got their computed widths, and the row
 * collapsed into cramped, touching circles. The lazy-loader went the same way, which is why hero
 * videos stayed blank. Neither failure shows up in a unit test or the harness — only in a browser.
 *
 * Allowing them is consistent with Plan B's actual security model: isolation is provided by serving
 * the store from its own registrable domain, not by vetting the theme's scripts. Tracker patterns
 * below are still checked FIRST, so a marketing pixel dressed up as a package doesn't sneak through.
 */
const LIBRARY_HOSTS = [
 "cdn.jsdelivr.net",
 "unpkg.com",
 "cdnjs.cloudflare.com",
 "ajax.googleapis.com", // jQuery et al. — a library mirror, not Google Analytics
 "code.jquery.com",
];

/** Third-party vendors: trackers, chat, marketing, A/B testing. Never run these on our domain. */
const VENDOR_PATTERNS = [
 /google-analytics\.com/i, /googletagmanager\.com/i, /googleadservices/i, /doubleclick\.net/i,
 /connect\.facebook\.net/i, /facebook\.com\/tr/i,
 // Matched against the WHOLE url, not just the host: a package CDN carries the vendor's name in the
 // path (`/npm/@segment/analytics.js`), so a host-only pattern would wave it straight through.
 /klaviyo/i,
 /hotjar\.com/i, /clarity\.ms/i, /(^|[/@.])segment[-/@.]/i, /mixpanel/i,
 /intercom\.(io|com)/i, /zdassets\.com/i, /zendesk\.com/i, /tawk\.to/i, /crisp\.chat/i,
 /tiktok\.com/i, /snap\.licdn\.com/i, /pinterest\.com/i, /bing\.com/i,
 /gorgias\.(com|chat)/i, /yotpo\.com/i, /judge\.me/i, /loox\.io/i, /okendo\.io/i,
 /attentivemobile\.com/i, /postscript\.io/i, /privy\.com/i, /omnisend\.com/i,
 // POPUP/BANNER APPS. These inject a full-viewport dialog over the shop, and on a hosted store they
 // fire on every visit because their "already shown" state is per-origin — measured on the sellers'
 // OWN sites with a fresh browser, none of them showed a popup, while the hosted copies were covered
 // by two stacked dialogs. They are Shopify apps, so they stop working the day the seller cancels
 // anyway; serving them inert is the same outcome, minus the blocked storefront.
 // Note omnisend ships from omnisnippet1.com / omnisendlink.com — the `omnisend.com` pattern above
 // matches neither, which is why its welcome modal was still covering one store's hero and grid.
 /omnisnippet\d*\.com/i, /omnisendlink\.com/i,
 /hextom\.com/i, /pop-convert\.com/i, /tech-arms\.io/i,
 // Shopify serves app EXTENSION bundles from its own CDN with the app's name in the PATH —
 // `cdn.shopify.com/extensions/<uuid>/omnisend-55/assets/omnisend-in-shop.js`. A host-based pattern
 // can never match those, and cdn.shopify.com is otherwise allowlisted as the theme's own CDN, so
 // one store's welcome modal kept covering its hero and grid even with `omnisend.com` denied.
 // Named apps only — a theme asset on the same CDN is untouched.
 /\/extensions\/[^/]+\/(omnisend|hextom|privy|justuno|klaviyo|pop-?convert|smsbump|bss-|wisepops|optimonk)[^/]*\//i,
 /recharge(payments)?\.com/i, /bold(apps|commerce)\.io/i,
 /hcaptcha\.com/i, /recaptcha/i,
 // Shopify's OWN telemetry ships from cdn.shopify.com, which the theme allowlist otherwise keeps —
 // so it needs naming explicitly. It reports the seller's shoppers back to Shopify from a domain we
 // operate, which is neither the theme's behaviour nor ours to hand over.
 /shopifycloud\/web-pixels-manager/i, /web-pixels-manager/i, /shopifycloud\/consent-tracking/i,
 /monorail-edge\.shopifysvc\.com/i, /trekkie/i,
 // Shopify's Performance Kit. Same story as trekkie, but it wasn't named here, so it survived
 // capture (its <script src> is on the seller's OWN domain — `/cdn/shopifycloud/perf-kit/…` — which
 // the sameSite check keeps). Once running it beacons every page view to `/api/collect` and to
 // monorail-edge; on a shopper with an ad blocker that's a dozen ERR_BLOCKED_BY_CLIENT lines in the
 // console, and on one without it, it's the seller's traffic reported to Shopify from our domain.
 /perf-kit/i,
 // The Shop app's storefront event listener — Shop-account telemetry, not theme behaviour.
 /shop_events_listener/i,
 // Shopify's OPEN-TELEMETRY collector. Reached directly by trekkie and shop_events_listener.
 /otlp-http[^/]*\.shopifysvc\.com/i,
 // `load_feature` is Shopify's storefront feature loader, and it is the reason stripping the
 // telemetry <script> tags alone wasn't enough: it runs on the page and then fetches
 // shop_events_listener and the web-pixels bundle at RUNTIME, from absolute `angearchive.com` URLs
 // that never pass through our /cdn proxy. Denying the loader is what actually stops them.
 // Cost of denying it: on Chrome <126 / Firefox <150 / Safari <27 it also would have loaded an
 // `autosizes` polyfill for CSS `sizes=auto`. That degrades to the browser's own image sizing —
 // cosmetic, on old browsers only, and a fair trade for not running Shopify's analytics stack.
 /storefront\/assets\/storefront\/load_feature/i,
 // Chrome origin-trial tokens Shopify registers for ITS domains. Meaningless on ours.
 /origin_trials/i,
];

/** Shopify's own checkout/payments surfaces — always stripped, on every plan. */
const CHECKOUT_PATTERNS = [
 /shop\.app/i, /shopifycloud\/(shop-js|payment)/i, /shop_pay/i, /shopify-pay/i,
 /portable-wallets/i, /payment-sheet/i, /checkout\.shopify/i,
 // `/checkouts/internal/preloads.js` — every Shopify theme includes this, SAME-ORIGIN (it's served
 // from the seller's own domain, not shopify.com), so the sameSite "keep" check above waved it
 // through and none of the other patterns matched a path with no host-level signal. It's Shopify's
 // checkout SPA's own preload bootstrap: kept, it initializes and starts lazy-loading its component
 // chunks (hydrate.js, PaymentButtons.js, ShippingMethodSelector.js, BillingAddressForm.js, dozens
 // more) — against OUR origin instead of Shopify's real checkout host, so every one 404s. Loud
 // console noise at best; at worst it's Shopify's checkout machinery partially initializing on a
 // domain that was never supposed to run it. Path-based, not host-based, because the host here IS
 // the seller's own — this bootstrap is checkout, regardless of which domain serves the file.
 /\/checkouts\/internal\//i,
 // Shopify's storefront "standard actions" bundle — it wires up Shopify CUSTOMER ACCOUNT actions
 // (login, account menu) against Shopify's own identity service. On a VYA-hosted storefront the
 // shopper is the seller's customer, authenticated by us, so this can only send them somewhere we
 // don't control.
 /storefront\/standard-actions/i,
];

export type ScriptVerdict = "keep" | "vendor" | "checkout" | "unknown-host";

/**
 * Should a script with this `src` survive capture?
 *
 * Same-origin scripts (the theme's own files) and known theme CDNs are kept. Anything on an
 * unrecognised third-party host is dropped: an allowlist, because a denylist would silently start
 * executing whatever vendor a seller installs next.
 */
export function classifyScript(src: string, sourceOrigin: string): ScriptVerdict {
 const s = (src || "").trim();
 if (!s) return "keep"; // inline scripts are handled separately
 if (CHECKOUT_PATTERNS.some((p) => p.test(s))) return "checkout";
 if (VENDOR_PATTERNS.some((p) => p.test(s))) return "vendor";

 let host: string;
 try {
  host = new URL(s, sourceOrigin).hostname.toLowerCase();
 } catch {
  return "vendor"; // unparseable — don't run it
 }
 let originHost = "";
 try { originHost = new URL(sourceOrigin).hostname.toLowerCase(); } catch { /* handled below */ }

 const sameSite = originHost && (host === originHost || host.replace(/^www\./, "") === originHost.replace(/^www\./, ""));
 if (sameSite) return "keep";
 if (THEME_HOSTS.some((t) => host === t || host.endsWith(`.${t}`))) return "keep";
 // Checked AFTER the vendor patterns above, so a tracker served from a package CDN is still dropped.
 if (LIBRARY_HOSTS.some((t) => host === t || host.endsWith(`.${t}`))) return "keep";
 return "unknown-host";
}

export function shouldKeepScript(src: string, sourceOrigin: string): boolean {
 return classifyScript(src, sourceOrigin) === "keep";
}

/**
 * Is this script URL denied outright — a tracker or a Shopify checkout bundle — regardless of which
 * host serves it?
 *
 * The denylist half of `classifyScript`, without the allowlist half, and without needing to know the
 * capture's origin. That makes it usable at SERVE time, which matters for two reasons:
 *
 *   1. Captures already in the database were taken under an older, shorter denylist. Re-crawling 45
 *      stores to drop one telemetry bundle isn't a fix; enforcing at serve time repairs them all on
 *      the next request.
 *   2. It fails safe in the other direction too — the allowlist deliberately isn't re-applied here,
 *      so tightening what we *keep* can never silently break a storefront that's already live.
 */
export function isDeniedScriptUrl(src: string): boolean {
 const s = (src || "").trim();
 if (!s) return false;
 return CHECKOUT_PATTERNS.some((p) => p.test(s)) || VENDOR_PATTERNS.some((p) => p.test(s));
}

/**
 * Shopify app embeds that arrive as INLINE script, not as a `<script src>`.
 *
 * Denying hosts is not enough: an app embed ships a small inline config block that fetches the app's
 * bundle itself at runtime, so there is no src attribute to match and the URL denylist never sees
 * it. Two stores were covered by dialogs from exactly this shape — a Hextom market/region picker
 * (`tmsSelectorData`), its free-shipping bar (`hextom_fsb_config`, the `div.fsb_message` that sat
 * over Add to cart), a BSS window popup, and a pop-convert loader.
 *
 * Matched on the app's OWN identifiers rather than anything generic, so this can only ever remove a
 * block that belongs to a named app. Verified against the sellers' live sites first: none of them
 * shows these popups to a fresh browser, so this is not the seller's intended storefront behaviour —
 * it is an app firing on an origin it was never configured for. They also stop working the day the
 * seller cancels Shopify, so removing them changes nothing about the store's eventual behaviour.
 */
const DENIED_INLINE_MARKERS = [
 /hextom_fsb_config|hextom_fsb_meta|tmsSelectorData|tmsAbsLinkData|cdn3\.hextom\.com/i,
 /BSS_BP\.window_popup|bss-window-popup-config/i,
 /pop-convert\.com/i,
 /omnisnippet\d*\.com|omnisendlink\.com/i,
];

export function isDeniedInlineScript(code: string): boolean {
 const s = (code || "").trim();
 if (!s) return false;
 return DENIED_INLINE_MARKERS.some((p) => p.test(s));
}

/**
 * Rewrite absolute same-origin URLs inside inline JavaScript to root-relative ones.
 *
 * This is SECURITY, not tidiness, and it's the subtle failure mode of Plan B. Themes mostly publish
 * relative routes (`/cart/add`), which resolve against whatever origin served the page — that's what
 * makes the whole approach work. But a theme or app that hardcodes
 * `https://theirstore.myshopify.com/cart/add` would send the shopper's cart straight back to Shopify,
 * where the order is no longer ours and the shopper is no longer on the seller's VYA storefront.
 * Making those root-relative brings them home.
 *
 * Only the store's OWN origins are rewritten — an outbound link to a genuinely external site is left
 * exactly as it is.
 */
export function rewriteInlineJsUrls(js: string, origins: string[]): string {
 let out = js;
 for (const origin of origins) {
  const host = originHostOf(origin);
  if (!host) continue;
  // Match http/https, optional www, the host, then keep the path. Escaped forward slashes appear in
  // JSON embedded in scripts ("https:\/\/store.com\/cart"), so both forms are handled. The scheme
  // itself is OPTIONAL: themes routinely write protocol-relative URLs for CDN assets
  // (`//store.com/cdn/...`, resolving against whatever scheme served the page) — a real one (built
  // via `document.createElement('script'); el.src = "//mybagcrush.com/cdn/.../events-listener.js"`)
  // survived here with only `https?://` required, since a bare `//` was never matched at all.
  //
  // EXCEPT /cdn/ — Shopify's universal static-asset prefix (theme JS/CSS/fonts/images), on every
  // store regardless of theme. We never mirror these files ourselves, so "bringing them home" doesn't
  // land on a working copy — it 404s on our own origin instead. For a stray analytics script that's a
  // wash (it was never going to run either way); for the theme's OWN import map — every "@theme/x"
  // entry is exactly this shape — it's catastrophic: rewritten to relative, every module 404s and the
  // theme's entire component framework never initializes (product galleries, variant pickers, cart
  // drawer, all of it). Only a hardcoded ROUTE (/cart/add, /account, /search/suggest — the ones this
  // function exists to bring home, because a bridge for them actually exists) should be rewritten.
  const plain = new RegExp(`(?:https?:)?//(?:www\\.)?${escapeRe(host)}(?!/cdn/)(?=[/"'\`\\s)]|$)`, "gi");
  out = out.replace(plain, "");
  const escaped = new RegExp(`(?:https?:)?\\\\/\\\\/(?:www\\.)?${escapeRe(host)}(?!\\\\/cdn\\\\/)`, "gi");
  out = out.replace(escaped, "");
 }
 return out;
}

function originHostOf(origin: string): string {
 try { return new URL(origin.startsWith("http") ? origin : `https://${origin}`).hostname.toLowerCase(); }
 catch { return ""; }
}

function escapeRe(s: string): string {
 return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The store's own hostnames, for URL rewriting: the custom domain AND the `.myshopify.com` address,
 * which themes and apps hardcode even on stores that never show it to a shopper.
 */
export function ownOrigins(sourceUrl: string, myshopifyDomain?: string | null): string[] {
 const out: string[] = [];
 try { out.push(new URL(sourceUrl).origin); } catch { /* ignore an unparseable source */ }
 if (myshopifyDomain) out.push(`https://${myshopifyDomain.replace(/^https?:\/\//, "")}`);
 return out;
}

/**
 * The store's own `.myshopify.com` address, read from the page itself.
 *
 * Every Shopify storefront declares `Shopify.shop = "xxx.myshopify.com"` inline. Requiring the
 * caller to supply it meant that in practice it was never supplied — and then every hardcoded
 * `https://xxx.myshopify.com/cart/add` in the theme survived capture and sent the shopper's cart
 * straight back to Shopify. Reading it from the page removes that whole class of miss.
 */
export function detectMyshopifyDomain(html: string): string | null {
 const m = html.match(/Shopify\.shop\s*=\s*["']([a-z0-9-]+\.myshopify\.com)["']/i)
  || html.match(/["']([a-z0-9-]+\.myshopify\.com)["']/i);
 return m ? m[1].toLowerCase() : null;
}

/**
 * Neutralise Shopify's own commerce endpoints wherever they survive as absolute URLs.
 *
 * `rewriteInlineJsUrls` handles the store's own origins; this is the backstop for the ones that
 * belong to Shopify rather than to the seller — any `*.myshopify.com` cart/checkout URL, and
 * `shop.app` (Shop Pay). Both take the order away from VYA, which breaks the one rule that matters.
 */
export function stripShopifyCommerceUrls(html: string): string {
 return html
  // Any shop's myshopify cart/checkout/account endpoint → root-relative, so it resolves to us.
  .replace(/https?:(\\?\/){2}[a-z0-9-]+\.myshopify\.com(?=\\?\/(cart|checkout|account|apps)\b)/gi, "")
  // Shop Pay, in every form it appears (plain and JSON-escaped).
  .replace(/https?:(\\?\/){2}shop\.app[^"'\s)]*/gi, "");
}
