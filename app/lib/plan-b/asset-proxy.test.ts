import { test } from "node:test";
import assert from "node:assert/strict";
import { planCdnRequest } from "./asset-proxy.ts";
import { isDeniedScriptUrl } from "./scripts.ts";

const ORIGIN = "https://angearchive.com";

test("proxies a theme asset from the captured origin, fingerprint intact", () => {
 const plan = planCdnRequest("/cdn/shop/t/1/assets/component.js", "?v=7423912", ORIGIN);
 assert.deepEqual(plan, { action: "proxy", url: "https://angearchive.com/cdn/shop/t/1/assets/component.js?v=7423912" });
});

test("the whole Horizon import map resolves", () => {
 for (const p of [
  "/cdn/shop/t/1/assets/critical.js", "/cdn/shop/t/1/assets/dialog.js", "/cdn/shop/t/1/assets/morph.js",
  "/cdn/shop/t/1/assets/section-renderer.js", "/cdn/shop/t/1/assets/variant-picker.js",
  "/cdn/shop/t/1/compiled_assets/styles.css",
 ]) {
  assert.equal(planCdnRequest(p, "", ORIGIN).action, "proxy", p);
 }
});

test("Shopify telemetry is answered inert, never proxied", () => {
 // These are what filled the console with ERR_BLOCKED_BY_CLIENT and 404s.
 for (const p of ["/cdn/s/trekkie.storefront.c3de4351.min.js", "/cdn/shopifycloud/perf-kit/shopify-perf-kit-3.8.4.min.js", "/cdn/shopifycloud/storefront/assets/shop_events_listener-4e26a9ce.js"]) {
  const plan = planCdnRequest(p, "", ORIGIN);
  assert.equal(plan.action, "inert", p);
 }
});

test("Shop Pay / checkout modules resolve as EMPTY modules, so dynamic import() doesn't reject", () => {
 const plan = planCdnRequest("/cdn/shopifycloud/shop-js/modules/v2/loader.shop-login-button.en.esm.js", "", ORIGIN);
 assert.equal(plan.action, "inert");
 assert.match((plan as { contentType: string }).contentType, /javascript/);
 assert.equal((plan as { body: string }).body.trim(), "export {};");
});

test("portable-wallets css is inert css, not javascript", () => {
 const plan = planCdnRequest("/cdn/shopifycloud/portable-wallets/latest/accelerated-checkout.css", "", ORIGIN);
 assert.equal(plan.action, "inert");
 assert.match((plan as { contentType: string }).contentType, /text\/css/);
});

test("denies anything outside /cdn/, including traversal that normalises out of it", () => {
 assert.equal(planCdnRequest("/admin/sync", "", ORIGIN).action, "deny");
 assert.equal(planCdnRequest("/cdn/../admin/sync", "", ORIGIN).action, "deny");
 assert.equal(planCdnRequest("/cdn/a/../../etc/passwd", "", ORIGIN).action, "deny");
});

test("denies when the store has no captured origin", () => {
 assert.equal(planCdnRequest("/cdn/shop/t/1/assets/component.js", "", null).action, "deny");
});

test("a denied path with no known extension is refused rather than guessed at", () => {
 assert.equal(planCdnRequest("/cdn/s/trekkie.storefront.min.woff2", "", ORIGIN).action, "deny");
});

test("isDeniedScriptUrl is the denylist only — a plain theme asset is not denied", () => {
 assert.equal(isDeniedScriptUrl("https://angearchive.com/cdn/shop/t/1/assets/dialog.js"), false);
 assert.equal(isDeniedScriptUrl("https://angearchive.com/cdn/shopifycloud/perf-kit/shopify-perf-kit-3.8.4.min.js"), true);
 assert.equal(isDeniedScriptUrl(""), false);
});
