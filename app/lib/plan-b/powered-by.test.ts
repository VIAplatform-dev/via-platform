import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { injectPoweredBy } from "../site-capture.ts";

const FOOTER = `<html><body><main>x</main><footer class="footer"><nav>FAQ</nav></footer></body></html>`;

test("the badge sits in the footer, not floating over the page", () => {
 // It used to be pinned bottom-right, over the seller's own layout and on top of anything else we
 // float there. A "powered by" line belongs where every other one does: at the bottom of the page.
 const $ = cheerio.load(injectPoweredBy(FOOTER));
 assert.equal($(".vya-powered").length, 1);
 assert.equal($("footer .vya-powered").length, 1, "inside the seller's own footer");
 assert.doesNotMatch($(".vya-powered").attr("style") || "", /position\s*:\s*fixed/);
});

test("it reads as a quiet line, in the seller's own type", () => {
 const style = cheerio.load(injectPoweredBy(FOOTER))(".vya-powered").attr("style") || "";
 assert.match(style, /text-transform:\s*uppercase/);
 assert.match(style, /letter-spacing/);
 assert.match(style, /font-family:\s*inherit|font:\s*inherit/, "the theme's typeface, not ours");
 assert.doesNotMatch(style, /background:\s*rgba\(17/, "no dark pill any more");
});

test("a page with no footer still gets one, at the end", () => {
 const $ = cheerio.load(injectPoweredBy(`<html><body><main>x</main></body></html>`));
 assert.equal($(".vya-powered").length, 1);
 assert.equal($("body").children().last().find(".vya-powered").addBack(".vya-powered").length, 1);
});

test("the last footer is the one used when a theme has several", () => {
 // Some themes carry a hidden mobile footer as well. The real one is the last in the document.
 const html = `<html><body><footer id="a">1</footer><main>x</main><footer id="b">2</footer></body></html>`;
 assert.equal(cheerio.load(injectPoweredBy(html))("#b .vya-powered").length, 1);
});

test("injecting twice does not stack two badges", () => {
 const once = injectPoweredBy(FOOTER);
 assert.equal(cheerio.load(injectPoweredBy(once))(".vya-powered").length, 1);
});

test("it still links to VYA, and safely", () => {
 const $ = cheerio.load(injectPoweredBy(FOOTER))(".vya-powered");
 assert.equal($.attr("href"), "https://getvya.ai");
 assert.match($.attr("rel") || "", /noopener/);
});

test("a page that merely mentions the class still gets its badge", () => {
 // The guard used to be a substring search for "vya-powered". Our own account script mentions
 // `.vya-powered` — it measures anything of ours pinned in that corner — so every store silently
 // lost its badge. A guard must look for the thing itself, not for its name in passing.
 const html = `<html><body><script>document.querySelector(".vya-powered")</script><footer>x</footer></body></html>`;
 assert.equal(cheerio.load(injectPoweredBy(html))(".vya-powered").length, 1);
});
