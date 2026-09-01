import { test } from "node:test";
import assert from "node:assert/strict";
import { storeSlugForHost, storePublicOrigin, storeEmailLinkOrigin, isStoreHost, storeHostSuffix, normalizeHost, isRefusedOnStoreHost, isAllowedStoreApi, shopifyThemeRoute, squarespaceThemeRoute, squarespaceCheckoutRedirect, isVyaOwnedPath, shopifyCartSubmitRoute } from "./store-host.ts";

const env = { STORE_HOST_SUFFIX: "vyasites.test" };

test("a direct child of the configured suffix is a store origin", () => {
 assert.equal(storeSlugForHost("blummier.vyasites.test", env), "blummier");
 assert.equal(storeSlugForHost("BLUMMIER.VYASites.test:3000", env), "blummier", "case and port are ignored");
 assert.equal(isStoreHost("blummier.vyasites.test", env), true);
});

test("the suffix is normalised with or without a leading dot", () => {
 assert.equal(storeHostSuffix({ STORE_HOST_SUFFIX: "vyasites.com" }), ".vyasites.com");
 assert.equal(storeHostSuffix({ STORE_HOST_SUFFIX: ".vyasites.com" }), ".vyasites.com");
 assert.equal(storeHostSuffix({}), "", "unset means Plan B is off");
});

test("Plan B is inert until configured — no host is a store origin", () => {
 assert.equal(storeSlugForHost("blummier.vyasites.test", {}), null);
});

test("VYA's own hosts are never store origins", () => {
 assert.equal(storeSlugForHost("vyaplatform.com", env), null);
 assert.equal(storeSlugForHost("blummier.vyaplatform.com", env), null);
 assert.equal(storeSlugForHost("getvya.ai", env), null);
});

test("only a DIRECT child counts — a deeper name is not a store", () => {
 // A wildcard cert covers one label, and accepting deeper names would let a crafted hostname
 // masquerade as a store.
 assert.equal(storeSlugForHost("a.b.vyasites.test", env), null);
 assert.equal(storeSlugForHost("vyasites.test", env), null, "the bare apex is not a store");
});

test("reserved labels never resolve to a seller storefront", () => {
 for (const l of ["www", "admin", "api", "app", "store", "portal", "internal"]) {
  assert.equal(storeSlugForHost(`${l}.vyasites.test`, env), null, l);
 }
});

test("a look-alike suffix does not match", () => {
 assert.equal(storeSlugForHost("blummier.notvyasites.test", env), null);
 assert.equal(storeSlugForHost("evil-vyasites.test", env), null);
});

test("normalizeHost strips port, case and a trailing dot", () => {
 assert.equal(normalizeHost(" Store.Example.COM:8080. "), "store.example.com");
 assert.equal(normalizeHost(null), "");
});

// ── The security boundary ───────────────────────────────────────────────────────────────────────

test("VYA's admin and portal surfaces are refused on a store origin", () => {
 // The seller's own JavaScript runs on this origin. If these answered, that script could drive
 // them with the visitor's cookies.
 for (const p of ["/admin", "/admin/inventory", "/store/dashboard", "/onboarding", "/internal/x", "/dashboard"]) {
  assert.equal(isRefusedOnStoreHost(p), true, p);
 }
});

test("unrecognised APIs fail CLOSED on a store origin", () => {
 // A denylist would expose every future internal route on 45 seller domains by default.
 assert.equal(isRefusedOnStoreHost("/api/store/capture"), true);
 assert.equal(isRefusedOnStoreHost("/api/admin/anything"), true);
 assert.equal(isRefusedOnStoreHost("/api/some-route-invented-tomorrow"), true);
});

test("the storefront's own public surface is allowed", () => {
 for (const p of ["/api/storefront/cart", "/api/cart/add.js", "/api/search/suggest", "/api/track"]) {
  assert.equal(isRefusedOnStoreHost(p), false, p);
  assert.equal(isAllowedStoreApi(p), true, p);
 }
});

test("ordinary storefront pages are served normally", () => {
 for (const p of ["/", "/collections/new", "/products/silk-dress", "/pages/about", "/cart"]) {
  assert.equal(isRefusedOnStoreHost(p), false, p);
 }
});

// ── The theme's own route table ─────────────────────────────────────────────────────────────────

test("both the bare and .js forms of every cart route are mapped", () => {
 // Themes call one or the other depending on version; missing a form is a dead Add-to-cart button.
 assert.equal(shopifyThemeRoute("/cart/add"), "/api/plan-b/cart/add");
 assert.equal(shopifyThemeRoute("/cart/add.js"), "/api/plan-b/cart/add");
 assert.equal(shopifyThemeRoute("/cart/change.js"), "/api/plan-b/cart/change");
 assert.equal(shopifyThemeRoute("/cart/update.js"), "/api/plan-b/cart/update");
 assert.equal(shopifyThemeRoute("/cart.js"), "/api/plan-b/cart");
 assert.equal(shopifyThemeRoute("/cart.json"), "/api/plan-b/cart");
 assert.equal(shopifyThemeRoute("/search/suggest.json"), "/api/plan-b/search/suggest");
 assert.equal(shopifyThemeRoute("/CART/ADD.JS"), "/api/plan-b/cart/add", "case-insensitive");
});

test("Squarespace's cart is mapped, and reachable on a store origin", () => {
 // Its storefront bundle posts Add-to-cart here from the seller's own button.
 assert.equal(squarespaceThemeRoute("/api/commerce/shopping-cart/entries"), "/api/plan-b/sqs/cart/entries");
 assert.equal(squarespaceThemeRoute("/api/commerce/shopping-cart"), "/api/plan-b/sqs/cart");
 assert.equal(squarespaceThemeRoute("/api/commerce/shopping-cart/"), "/api/plan-b/sqs/cart", "trailing slash");
 // Unlike Shopify's /cart/* routes these live under /api, where a store origin is refused by
 // default — so the allowlist has to let exactly these through, and nothing else.
 assert.equal(isRefusedOnStoreHost("/api/commerce/shopping-cart/entries"), false);
 assert.equal(isAllowedStoreApi("/api/commerce/shopping-cart"), true);
 assert.equal(isRefusedOnStoreHost("/api/commerce/orders"), true, "the rest of their API stays refused");
 assert.equal(isRefusedOnStoreHost("/api/plan-b/sqs/cart/entries"), true, "and our own route is only reachable by rewrite");
});

test("Squarespace's Checkout button lands on VYA's checkout, with the shopper's cart", () => {
 // Its bundle hard-codes this path; unrouted it was served as a captured page and 404'd.
 assert.equal(squarespaceCheckoutRedirect("/commerce/goto-checkout"), "/checkout?cart=1");
 assert.equal(squarespaceCheckoutRedirect("/commerce/goto-checkout/"), "/checkout?cart=1");
 assert.equal(squarespaceCheckoutRedirect("/commerce/anything-else"), null);
});

test("ordinary pages are not mistaken for theme endpoints", () => {
 for (const p of ["/", "/cart", "/collections/new", "/products/x", "/search"]) {
  assert.equal(shopifyThemeRoute(p), null, p);
 }
});

test("checkout is served by VYA on a store origin, not looked up as a captured page", () => {
 // The theme's cart page links to /checkout. Rewriting that into /site/{slug}/checkout looked for a
 // page that was never captured, so the shopper hit "Page not found" one click from paying.
 assert.equal(isVyaOwnedPath("/checkout"), true);
 assert.equal(isVyaOwnedPath("/checkout/success"), true);
 assert.equal(isVyaOwnedPath("/checkout/"), true);
 assert.equal(isVyaOwnedPath("/collections/new"), false);
 assert.equal(isVyaOwnedPath("/products/x"), false);
 // …and it must still not be a way to reach anything internal.
 assert.equal(isRefusedOnStoreHost("/checkout"), false);
});

// ── The cart FORM (POST /cart) ────────────────────────────────────────────────────────────────────
// The theme's Checkout button is a submit of the /cart form, not a link. Unrouted, that POST fell
// through to Next and answered "Server action not found" — the dead button a shopper meets at the
// exact moment of buying.

test("POST /cart is the theme's cart form", () => {
 assert.equal(shopifyCartSubmitRoute("/cart", "POST"), "/api/plan-b/cart/submit");
 assert.equal(shopifyCartSubmitRoute("/cart/", "POST"), "/api/plan-b/cart/submit");
 assert.equal(shopifyCartSubmitRoute("/CART", "post"), "/api/plan-b/cart/submit");
});

// GET /cart is the cart PAGE, which the captured site serves. Swallowing it here would replace the
// shopper's cart page with a form handler.
test("GET /cart is left alone — that is the cart page", () => {
 assert.equal(shopifyCartSubmitRoute("/cart", "GET"), null);
 assert.equal(shopifyCartSubmitRoute("/cart", "HEAD"), null);
 assert.equal(shopifyCartSubmitRoute("/cart", ""), null);
});

test("only /cart itself, never the routes beneath it", () => {
 // These already belong to shopifyThemeRoute; claiming them here would shadow add/change/update.
 assert.equal(shopifyCartSubmitRoute("/cart/add", "POST"), null);
 assert.equal(shopifyCartSubmitRoute("/cart/change", "POST"), null);
 assert.equal(shopifyCartSubmitRoute("/cart/update", "POST"), null);
 assert.equal(shopifyCartSubmitRoute("/cart.js", "POST"), null);
 assert.equal(shopifyCartSubmitRoute("/carts", "POST"), null);
 assert.equal(shopifyCartSubmitRoute("/", "POST"), null);
});

test("the theme's recommendation fetch is allowed on a store origin", () => {
 // "You may also like" is fetched by the seller's own theme from the shopper's browser, so it is a
 // storefront surface — but it lives under /api/plan-b/, which the allowlist does not cover. Every
 // request from a hosted store was refused before it reached the handler, and the strip rendered
 // empty for ever. The route's own comment describes exactly this symptom, from the last time it
 // happened for a different reason.
 // `pathname` is what the caller passes, and a pathname never carries a query string — asserting
 // on "…?section_id=x" was testing a shape this function is never handed.
 assert.equal(isAllowedStoreApi("/api/plan-b/recommendations"), true);
 assert.equal(isAllowedStoreApi("/API/Plan-B/Recommendations"), true, "case is normalised");
});

test("the rest of the internal surface stays refused on a store origin", () => {
 // The allowlist exists so that adding an internal route cannot accidentally expose it on 45
 // sellers' domains, where the seller's own JavaScript runs. Widening it by one route must not
 // widen it by a prefix.
 for (const p of ["/api/plan-b/cart-admin", "/api/store/analytics", "/api/admin/anything", "/api/cron/rehost-images"]) {
  assert.equal(isAllowedStoreApi(p), false, p);
 }
});

test("a theme's section render for a variant is routed, not 404'd", () => {
 // bag-crush's theme asks for the in-store-pickup section on every product view. Unrouted it 404s
 // with plain text; the theme parses that, calls .querySelector() on nothing and THROWS — taking
 // the rest of its own startup down with it, including the image loader. 29 of 32 images on her
 // product pages never load because of this one missing route.
 assert.equal(shopifyThemeRoute("/variants/55701352350001"), "/api/plan-b/section");
 assert.equal(shopifyThemeRoute("/variants/55701352350001/"), "/api/plan-b/section");
});

test("only a numeric variant id is routed there", () => {
 // /variants/ is not a namespace we own; a page at /variants/anything-else stays a page.
 assert.equal(shopifyThemeRoute("/variants/not-a-number"), null);
 assert.equal(shopifyThemeRoute("/variants"), null);
});

test("the section route is reachable on a store's own host", () => {
 // The same trap the recommendations route fell into: allowed by NAME, never by the /api/plan-b/
 // prefix — the rest of that namespace is internal and must stay refused on sellers' domains.
 assert.equal(isAllowedStoreApi("/api/plan-b/section"), true);
 assert.equal(isAllowedStoreApi("/api/plan-b/cart/add"), false);
});

test("a store's public address is the exact host the proxy will serve it on", () => {
 assert.equal(storePublicOrigin("tesselizabethvintage", env), "https://tesselizabethvintage.vyasites.test");
 assert.equal(storePublicOrigin("Blummier", env), "https://blummier.vyasites.test", "slugs are normalised");
 assert.equal(storePublicOrigin("blummier", { STORE_HOST_SUFFIX: "vyasites.com" }), "https://blummier.vyasites.com");
});

test("no address is advertised for a store the proxy would refuse to serve", () => {
 assert.equal(storePublicOrigin("blummier", {}), null, "Plan B off — caller falls back");
 assert.equal(storePublicOrigin("", env), null);
 assert.equal(storePublicOrigin("a.b", env), null, "a dotted slug would not be a direct child");
 assert.equal(storePublicOrigin("-nope", env), null, "malformed slugs never become a URL");
 for (const reserved of ["www", "admin", "api", "app", "store", "portal", "internal"]) {
  assert.equal(storePublicOrigin(reserved, env), null, reserved);
 }
});

test("an emailed sign-in link points at the store's own canonical address in production", () => {
 const prod = { STORE_HOST_SUFFIX: "vyasites.com", NODE_ENV: "production" };
 assert.equal(storeEmailLinkOrigin("tess", "tess.vyasites.com", prod), "https://tess.vyasites.com");
 // The header is ignored in production — this is what stops a forged Host poisoning the email.
 assert.equal(storeEmailLinkOrigin("tess", "evil.example.com", prod), "https://tess.vyasites.com");
 assert.equal(storeEmailLinkOrigin("tess", "localhost:3000", prod), "https://tess.vyasites.com");
 assert.equal(storeEmailLinkOrigin("tess", null, prod), "https://tess.vyasites.com");
});

test("in development the link keeps the host and port the store is actually reachable on", () => {
 const dev = { STORE_HOST_SUFFIX: "vyasites.test", NODE_ENV: "development" };
 assert.equal(storeEmailLinkOrigin("tess", "tess.vyasites.test:3000", dev), "http://tess.vyasites.test:3000");
 // Still only this store's own host — anything else falls back to the canonical address.
 assert.equal(storeEmailLinkOrigin("tess", "other.vyasites.test:3000", dev), "https://tess.vyasites.test");
 assert.equal(storeEmailLinkOrigin("tess", "localhost:3000", dev), "https://tess.vyasites.test");
});

test("with Plan B switched off there is no store address to link to", () => {
 assert.equal(storeEmailLinkOrigin("tess", "tess.vyasites.com", { NODE_ENV: "production" }), null);
});
