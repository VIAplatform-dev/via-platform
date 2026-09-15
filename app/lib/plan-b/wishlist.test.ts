import { test } from "node:test";
import assert from "node:assert/strict";
import { injectWishlist } from "./wishlist.ts";
import vm from "node:vm";

const page = "<html><head></head><body><main><a href=\"/products/silk-slip\"><img src=\"a.jpg\"></a></main></body></html>";
const opts = { slug: "blummier", shopName: "Blummier" };

test("the drawer and its script go in before </body>", () => {
 const out = injectWishlist(page, opts);
 assert.match(out, /id="vya-wl"/);
 assert.match(out, /id="vya-wl-overlay"/);
 assert.match(out, /window\.VYAWish/);
 // After the shop's own markup, not instead of it.
 assert.ok(out.indexOf("<main>") < out.indexOf("vya-wl-overlay"));
 assert.match(out, /<main><a href="\/products\/silk-slip"><img src="a\.jpg"><\/a><\/main>/);
});

test("the seller's markup is otherwise untouched", () => {
 const out = injectWishlist(page, opts);
 // Everything before </body> is exactly what came in. The heart is added by the browser, so the
 // page a shopper is served has none of our markup inside her theme.
 assert.equal(out.slice(0, out.indexOf("<style>")), page.slice(0, page.indexOf("</body>")));
 assert.ok(!out.includes('class="vya-heart"'), "hearts are placed at runtime, not baked into her HTML");
});

test("a page with no body is left alone", () => {
 // Section fragments: a theme asks for one piece of markup and gets it back, with nothing appended.
 const fragment = '<div class="grid"><a href="/products/x"><img></a></div>';
 assert.equal(injectWishlist(fragment, opts), fragment);
 assert.equal(injectWishlist("", opts), "");
});

test("injecting twice does nothing the second time", () => {
 const once = injectWishlist(page, opts);
 assert.equal(injectWishlist(once, opts), once);
});

test("a shop name cannot break out of the script", () => {
 // Seller-entered, and it lands inside a <script>, where HTML entities do NOT decode, so the HTML
 // escaper is the wrong tool there and JSON.stringify alone is not enough either.
 //
 // The property that matters is that no "<" from the name reaches the HTML parser: everything after
 // it is then just characters inside a JavaScript string, however alarming they read.
 const nasty = { slug: "s", shopName: '</script><img src=x onerror=alert(1)>' };
 const out = injectWishlist(page, nasty);
 const embedded = out.slice(out.indexOf("SHOP="), out.indexOf("SHOP=") + 80);
 assert.ok(!embedded.includes("<"), "no raw < survives into the script");
 assert.match(embedded, /\\u003c\/script>\\u003cimg/, "both < are escaped");
 // And the block really is still open afterwards. The </script> that ends it is ours.
 assert.equal(out.split("</script>").length, 2);
});

test("a slug cannot break out either", () => {
 const out = injectWishlist(page, { slug: '</script><b>', shopName: "S" });
 assert.ok(!out.includes("</script><b>"));
});

test("the api base is used where the page is not on the shop's own domain", () => {
 // Served from a /site/… path on VYA, a relative /api/… would resolve against the wrong host.
 const out = injectWishlist(page, { ...opts, apiBase: "https://getvya.ai" });
 assert.match(out, /var API="https:\/\/getvya\.ai"/);
 // On her own domain it is same-origin, so there is nothing to prefix.
 assert.match(injectWishlist(page, opts), /var API=""/);
});

test("saving is sent with credentials, or the store session never arrives", () => {
 const out = injectWishlist(page, opts);
 // Both the read and the write: the vya_store_session cookie is the identity, and it is cross-site
 // when the storefront runs on the seller's own domain.
 assert.match(out, /favorite\/list\?slug="\+encodeURIComponent\(SLUG\)[\s\S]{0,120}credentials:"include"/);
 assert.match(out, /method:"POST",credentials:"include"/);
});

test("a signed-out shopper is asked to sign in, not failed silently", () => {
 const out = injectWishlist(page, opts);
 // The tap opens the seller's own sign-in panel rather than doing nothing or filling a heart in
 // that will be forgotten.
 assert.match(out, /if\(!signedIn\)\{askToSignIn\(ref\);return;\}/);
 assert.match(out, /window\.VYAAccount&&VYAAccount\.open/);
});

test("the piece they reached for is saved once they have signed in", () => {
 const out = injectWishlist(page, opts);
 // The sign-in is a link in an EMAIL, which opens in a new tab, so this must survive the hop.
 // sessionStorage is per-tab and would drop the piece silently.
 assert.match(out, /localStorage\.setItem\("vya-wl-pending"/);
 assert.match(out, /localStorage\.removeItem\("vya-wl-pending"\)/);
 // Calls, not the comment that explains why it is the wrong tool here.
 assert.doesNotMatch(out, /sessionStorage\.(get|set|remove)Item/, "sessionStorage does not survive the email hop");
 assert.match(out, /function finishPending\(\)/);
 // And not honoured forever: a link clicked days later must not save something they have forgotten.
 assert.match(out, /Date\.now\(\)-p\.at>3600000/);
});

test("a session that expires mid-browse reopens the sign-in rather than losing the tap", () => {
 const out = injectWishlist(page, opts);
 assert.match(out, /r\.status===401/);
});

test("the drawer tells signed-out from empty", () => {
 const out = injectWishlist(page, opts);
 // "Nothing saved yet" to somebody who simply has not said who they are is a dead end.
 assert.match(out, /if\(!signedIn\)\{/);
 assert.match(out, /data-vya-wishlist-signin/);
 assert.match(out, /Sign in to save/);
});

test("the heart wins the click, ahead of the theme's own handler", () => {
 const out = injectWishlist(page, opts);
 // The heart sits INSIDE the seller's product link. Without capture + stopImmediatePropagation the
 // click navigates to the product page instead of saving it.
 assert.match(out, /addEventListener\("click",[\s\S]*\},true\)/);
 assert.match(out, /stopImmediatePropagation/);
});

test("cards that arrive later still get a heart", () => {
 // Themes paginate, filter and lazy-load without reloading the page.
 assert.match(injectWishlist(page, opts), /MutationObserver/);
});

test("her own favourites link opens the drawer where she has one", () => {
 const out = injectWishlist(page, opts);
 // The same controls favourites-icon.ts puts a heart on: saved pieces belong in her header, in her
 // own type, where her shoppers already look.
 assert.match(out, /function bindHers\(\)/);
 assert.match(out, /data-vya-wishlist-open/);
 // Never the account link. Telling those two apart is the whole point of favourites-icon.ts.
 assert.match(out, /customer_authentication/, "account links are excluded");
});

test("a shop with no favourites link still gets somewhere to look", () => {
 const out = injectWishlist(page, opts);
 assert.match(out, /function mountFab\(\)/);
 assert.match(out, /if\(!hers\)mountFab\(\)/);
 // And it only appears once something is saved, no control for an empty list.
 assert.match(out, /fab\.className=n>0\?"on":""/);
});

test("the injected script is valid JavaScript", () => {
 // THE TEST THAT CAUGHT A REAL ONE. This file writes JavaScript inside a template literal, where
 // "\\/" is just "/", so a regex escaped once became `if(//account|…`, a line comment, and the
 // whole wishlist stopped parsing in every browser. Nothing else here would have noticed: the
 // markup was present, the strings all matched, and the feature was simply dead.
 const out = injectWishlist(page, opts);
 for (const m of out.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
  assert.doesNotThrow(() => new vm.Script(m[1]), "injected <script> must parse");
 }
});

test("a shop name with a quote or a newline in it still parses", () => {
 // Seller-entered, and it lands inside the script as a string.
 for (const shopName of ["Maya's Vintage", 'The "Good" Shop', "Line\nBreak", "back\\slash"]) {
  const out = injectWishlist(page, { slug: "s", shopName });
  for (const m of out.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
   assert.doesNotThrow(() => new vm.Script(m[1]), `must parse with shop name ${JSON.stringify(shopName)}`);
  }
 }
});
