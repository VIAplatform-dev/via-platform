import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { applyEdits } from "./site-capture.ts";

// Two captured sections. The seller adds a text box inside the first one.
const PAGE = `<html><body><main>
<section data-x="a"><h2>About</h2><p>Words.</p></section>
<section data-x="b"><h2>Contact</h2></section>
</main></body></html>`;

const WITH_BOX = `<section data-x="a"><h2>About</h2><p>Words.</p><div data-vya-inline="1" style="margin:16px 0"><p style="margin:0">Add your text here.</p></div></section>`;

test("a text box added inside a captured section survives the save", () => {
 const out = applyEdits(PAGE, { sections: [{ sec: 0, html: WITH_BOX }, 1] });
 const $ = cheerio.load(out);
 assert.equal($("[data-vya-inline]").length, 1);
 assert.equal($("[data-vya-inline] p").text(), "Add your text here.");
});

test("an untouched section is still taken from the stored page, not the browser", () => {
 const out = applyEdits(PAGE, { sections: [{ sec: 0, html: WITH_BOX }, 1] });
 const $ = cheerio.load(out);
 assert.equal($('section[data-x="b"] h2').text(), "Contact");
 assert.equal($("section").length, 2);
});

test("order is still the order she left them in", () => {
 const out = applyEdits(PAGE, { sections: [1, { sec: 0, html: WITH_BOX }] });
 const $ = cheerio.load(out);
 assert.deepEqual($("section").map((_i, e) => $(e).attr("data-x")).get(), ["b", "a"]);
});

test("her own markup comes home intact — a form is still a form, a style is still a style", () => {
 // The strict sanitiser we use for pasted markup unwraps forms and drops inline <style>; running it
 // over her own captured section would degrade the section every time she nudged something in it.
 const rich = `<section data-x="a"><style>.c{color:red}</style><form action="/subscribe"><input name="email"><button>Join</button></form></section>`;
 const $ = cheerio.load(applyEdits(PAGE, { sections: [{ sec: 0, html: rich }, 1] }));
 assert.equal($("form").length, 1);
 assert.equal($("form").attr("action"), "/subscribe");
 assert.equal($("style").length, 1);
});

test("a script cannot ride back in on a section", () => {
 const nasty = `<section data-x="a"><h2>About</h2><script>fetch('/steal')</script><img src=x onerror="alert(1)"></section>`;
 const $ = cheerio.load(applyEdits(PAGE, { sections: [{ sec: 0, html: nasty }, 1] }));
 assert.equal($("script").length, 0);
 assert.equal($("img").attr("onerror"), undefined);
});

test("a javascript: address cannot ride back in either", () => {
 const nasty = `<section data-x="a"><a href="javascript:alert(1)">x</a></section>`;
 const $ = cheerio.load(applyEdits(PAGE, { sections: [{ sec: 0, html: nasty }, 1] }));
 assert.equal($("a").attr("href"), undefined);
});

test("a section index that doesn't exist writes nothing", () => {
 const out = applyEdits(PAGE, { sections: [{ sec: 9, html: WITH_BOX }, 1] });
 assert.equal(cheerio.load(out)("section").length, 1);
});

test("deleting a section still deletes it", () => {
 const $ = cheerio.load(applyEdits(PAGE, { sections: [{ sec: 0, html: WITH_BOX }] }));
 assert.equal($("section").length, 1);
 assert.equal($('section[data-x="b"]').length, 0);
});
