import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { prepareEditMode } from "./site-capture.ts";

// The exact shape that sent the editor to a 404: a "new arrivals" strip whose price sits inside a
// link to a product page the app does not serve.
const STRIP = `<html><body><section class="featured"><h2>New arrivals</h2>
<ul class="grid"><li class="card"><a href="/products/jumbo-black-with-poly-ribbon?variant=42581570748512">
<img src="bag.jpg"><span class="name">THE ARROW COLLAR</span><span class="price">$96.00</span></a></li></ul>
</section><nav><a href="/collections/clothing">Clothing</a><a href="https://instagram.com/x">IG</a></nav>
</body></html>`;

const edit = () => cheerio.load(prepareEditMode(STRIP, "via-admin", "/"));

test("no anchor in the editor carries a real address", () => {
 const $ = edit();
 // Everything except our own "Powered by VYA" badge, which is injected after this pass and is not
 // part of her site. The capture-phase guard cancels a click on it too, so it cannot navigate either.
 const hrefs = $("a[href]").not(".vya-powered").map((_i, e) => $(e).attr("href")).get();
 assert.ok(hrefs.length > 0, "there should still be anchors");
 assert.deepEqual([...new Set(hrefs)], ["#"]);
});

test("the price's own link cannot navigate", () => {
 const $ = edit();
 assert.equal($(".price").closest("a").attr("href"), "#");
});

test("the real address is kept, so the panel can still show and edit it", () => {
 const $ = edit();
 assert.equal($(".price").closest("a").attr("data-vya-href"), "/products/jumbo-black-with-poly-ribbon?variant=42581570748512");
 assert.equal($('a[data-vya-href="/collections/clothing"]').length, 1);
});

test("an external link is neutralised too", () => {
 const $ = edit();
 assert.equal($('a[data-vya-href="https://instagram.com/x"]').attr("href"), "#");
});

test("the capture-phase guard is on the page as well", () => {
 assert.ok(prepareEditMode(STRIP, "via-admin", "/").includes("Nothing in this document may navigate"));
});

test("the editor script still parses", () => {
 const out = prepareEditMode(STRIP, "via-admin", "/");
 for (const [, src] of [...out.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
  new Function(src[1]); // throws on a syntax error, which is the assertion
 }
});

test("editing is untouched: text, images and links are still addressable", () => {
 const $ = edit();
 assert.ok($("[data-vya-eid]").length > 0);
 assert.ok($("[data-vya-img]").length > 0);
 assert.ok($("[data-vya-link]").length > 0);
});

// ── undo ───────────────────────────────────────────────────────────────────────────────────────
// Deleting a section and pressing undo brought nothing back. Undo restores an innerHTML snapshot of
// "the sections' parent", which was read as the parent of the FIRST tagged section — true only when
// every section shares one parent. Real themes put header sections in <header> and the page's in
// <main>, so the snapshot covered one branch and a delete in another was outside it entirely.
test("undo snapshots the subtree that holds ALL the sections, not the first one's parent", () => {
 const js = prepareEditMode(STRIP, "via-admin", "/");
 assert.ok(js.includes("_sr"), "the snapshot root is resolved and cached");
 assert.ok(!js.includes('function secRoot(){var f=document.querySelector("[data-vya-sec],[data-vya-block]");return f?f.parentNode:null}'),
  "the old first-section-parent rule is gone");
});

test("a snapshot leaves the editor's own toolbars out, and restoring keeps them alive", () => {
 // Both halves matter: a snapshot containing them duplicates them on undo, and restoring over them
 // would take the toolbars off the page and leave the editor dead.
 const js = prepareEditMode(STRIP, "via-admin", "/");
 assert.ok(js.includes("withoutUi"));
 assert.ok(js.includes('return{h:withoutUi(function(){return r.innerHTML})'));
 assert.ok(js.includes("withoutUi(function(){r.innerHTML=sn.h})"));
 assert.ok(!js.includes("document.body.appendChild(tb)"), "toolbars go through edUi so they are tracked");
});
