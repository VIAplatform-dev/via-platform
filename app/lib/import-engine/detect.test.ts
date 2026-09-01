import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPlatform, shellScore, detectFramework, declineMessage, visibleTextLength, looksLikeBotChallenge } from "./detect.ts";

// Signatures below are the real markers taken from a corpus of 29 live storefronts (Shopify across
// Dawn/Dwell/Prestige/Editions, Squarespace, BigCommerce, Wix, WooCommerce, WordPress, and
// Remix/Next/Gatsby/SvelteKit/Vite front-ends). Kept as compact fixtures rather than 12MB of saved
// HTML so the suite stays fast and deterministic.

const page = (body: string, opts: { text?: string; images?: number } = {}) => {
 const filler = opts.text ?? "x".repeat(2000);
 const imgs = "<img src='a.jpg'>".repeat(opts.images ?? 12);
 return `<!doctype html><html><head>${body}</head><body><p>${filler}</p>${imgs}</body></html>`;
};

test("detects Shopify from its theme object, and keeps the theme name for the shim registry", () => {
 const d = detectPlatform(page(`<script>Shopify.theme = {"name":"BLUMMIER REBUILD","schema_name":"Dawn","schema_version":"14.0.0"};</script>`));
 assert.equal(d.platform, "shopify");
 assert.equal(d.theme, "Dawn");
 assert.ok(d.confidence >= 0.9);
});

test("distinguishes headless Shopify from a themed Shopify store", () => {
 // Shopify's CDN serves the images, but the page is a JS app with no Liquid sections — so
 // products.json won't exist on this domain and the seller needs to give us their myshopify one.
 const d = detectPlatform(page(`<script>window.__remixContext = {};</script><img src="https://cdn.shopify.com/x.jpg">`));
 assert.equal(d.platform, "shopify-headless");
 assert.equal(d.framework, "remix");
 assert.match(declineMessage(d) || "", /myshopify/i);
});

test("detects the other platforms in the corpus", () => {
 const cases: [string, string][] = [
  ["squarespace", `<link href="https://static1.squarespace.com/x.css">`],
  ["bigcommerce", `<link href="https://cdn11.bigcommerce.com/s-abc/x.css">`],
  ["wix", `<script src="https://static.parastorage.com/x.js"></script>`],
  ["woocommerce", `<link href="/wp-content/plugins/woocommerce/assets/x.css">`],
  ["wordpress", `<link href="/wp-content/themes/x/style.css">`],
  ["webflow", `<html data-wf-page="abc">`],
 ];
 for (const [expected, sig] of cases) {
  assert.equal(detectPlatform(page(sig)).platform, expected, `${expected} signature`);
 }
});

test("Magento detection does not fire on the substring inside 'image/'", () => {
 // A loose /mage\// probe matched `type="image/png"`, so Gatsby, Vite and Next pages were all
 // reported as Magento. Platform probes need a real boundary, not a bare substring.
 const d = detectPlatform(page(`<meta property="og:image:type" content="image/png"><link rel="icon" href="/favicon.png" type="image/png">`));
 assert.notEqual(d.platform, "magento");
 const real = detectPlatform(page(`<script>var x = 1;</script><body data-mage-init='{"x":1}'>`));
 assert.equal(real.platform, "magento");
});

test("shell scoring separates real storefronts from client-rendered shells", () => {
 // Real stores in the corpus carried 563–19,890 characters of visible text; the shells 0–234.
 const shell = shellScore(`<!doctype html><html><body><div id="root"></div><script src="/assets/index-a1b2.js"></script></body></html>`);
 assert.equal(shell.isShell, true);
 assert.match(shell.reason, /builds its content in the browser/);

 const real = shellScore(page(`<title>Vintage</title>`));
 assert.equal(real.isShell, false);
});

test("a sparse but genuine storefront is NOT declined as a shell", () => {
 // Leivintage's homepage is the thinnest real store in the corpus (~563 chars of text). Declining
 // it would be a false positive on a store we can actually import, so the threshold must clear it.
 const sparse = page(`<link href="https://static1.squarespace.com/x.css">`, { text: "a real vintage shop ".repeat(30), images: 6 });
 const d = detectPlatform(sparse);
 assert.equal(d.shell.isShell, false);
 assert.equal(declineMessage(d), null, "no decline for an importable store");
});

test("visibleTextLength ignores script and style bodies", () => {
 const html = `<html><head><style>${"a{color:red}".repeat(500)}</style><script>${"var x=1;".repeat(500)}</script></head><body>hello</body></html>`;
 assert.ok(visibleTextLength(html) < 20, "only the body copy counts");
});

test("framework fingerprints", () => {
 assert.equal(detectFramework(`<script>window.__remixContext={}</script>`), "remix");
 assert.equal(detectFramework(`<script id="__NEXT_DATA__">{}</script>`), "next");
 assert.equal(detectFramework(`<div id="___gatsby"></div><script src="/page-data.json"></script>`), "gatsby");
 assert.equal(detectFramework(`<p>plain server-rendered html</p>`), null);
});

test("declines name the platform and offer a real alternative", () => {
 const wix = detectPlatform(page(`<script src="https://static.parastorage.com/x.js"></script>`));
 const msg = declineMessage(wix) || "";
 assert.match(msg, /Wix/);
 assert.match(msg, /CSV/i, "tells the seller what they CAN do");
});

test("a bot-protection interstitial is recognised, not mistaken for the storefront", () => {
 // ec.2ndstreetusa.com sits behind Cloudflare's managed challenge. Under load it serves the
 // challenge page with **HTTP 200** for the first stretch and only switches to 429 later — and
 // captureSite's only gate is `res.ok`. So a crawl would have stored a 9KB "Verifying your
 // connection..." page AS the seller's storefront, on every page, and reported success. Measured by
 // hand: ~35 requests in 20s triggers it, and it holds for roughly 20 minutes.
 const cf = `<!DOCTYPE html><html><head><title>Verifying your connection...</title></head><body>
  <h1 data-i18n="content-title">Your connection needs to be verified before you can proceed</h1>
  <script>(function(){window._cf_chl_opt = {cRay: 'a3416b073b6ac984', cType: 'managed'};
  var a = document.createElement('script');a.src = '/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1';}());</script>
  </body></html>`;
 assert.equal(looksLikeBotChallenge(cf), true);
 assert.equal(looksLikeBotChallenge(`<html><head><title>Just a moment...</title></head><body><div id="cf-challenge-running"></div></body></html>`), true);
 // A real storefront is never flagged — not for mentioning Cloudflare, and not even if a marker
 // string appears somewhere in its own scripts: a real page carries thousands of characters of the
 // seller's own copy, and BOTH halves are required.
 assert.equal(looksLikeBotChallenge(`<html><body><h1>Vintage</h1><p>Our site is protected by Cloudflare.</p><p>${"shop ".repeat(400)}</p></body></html>`), false, "no marker");
 assert.equal(looksLikeBotChallenge(`<html><body><script>var x="cdn-cgi/challenge-platform"</script><p>${"one of one vintage ".repeat(200)}</p></body></html>`), false, "marker, but a real page's worth of copy");
 assert.equal(looksLikeBotChallenge(""), false);
});
