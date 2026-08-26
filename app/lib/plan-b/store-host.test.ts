import { test } from "node:test";
import assert from "node:assert/strict";
import { storeSlugForHost, isStoreHost, storeHostSuffix, normalizeHost, isRefusedOnStoreHost, isAllowedStoreApi, shopifyThemeRoute, squarespaceThemeRoute, squarespaceCheckoutRedirect, isVyaOwnedPath } from "./store-host.ts";

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
