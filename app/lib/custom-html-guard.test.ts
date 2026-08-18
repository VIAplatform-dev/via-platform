import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCustomHtml } from "./custom-html-guard.ts";
import { sanitizeBlocks, blockDef } from "./storefront-blocks.ts";

// The failure that made the seller QA us: the assistant "builds" an FAQ accordion as custom HTML, it
// looks done, but the click-to-expand silently dies on save. These lock the guard + native faq path.

test("rejects a click-driven accordion built with onclick (JS gets stripped)", () => {
 const html = `<div class="faq"><div class="q" onclick="toggle(this)">Q1</div><div class="a">A1</div></div>`;
 const v = checkCustomHtml(html);
 assert.equal(v.ok, false);
 assert.match((v as { reason: string }).reason, /faq/i);
});

test("rejects an accordion that isn't native <details>", () => {
 const html = `<div class="accordion"><button>Question one</button><p>Answer one</p></div>`;
 const v = checkCustomHtml(html);
 assert.equal(v.ok, false);
});

test("rejects inline <script>", () => {
 assert.equal(checkCustomHtml(`<div>hi</div><script>x()</script>`).ok, false);
});

test("allows a real native <details> accordion", () => {
 const html = `<details><summary>Q1</summary><div>A1</div></details>`;
 assert.equal(checkCustomHtml(html).ok, true);
});

test("allows interactive content when js is provided (runs sandboxed)", () => {
 const html = `<div id="calc"></div>`;
 assert.equal(checkCustomHtml(html, "document.getElementById('calc')").ok, true);
});

test("allows ordinary static markup (a comparison table)", () => {
 const html = `<table><tr><th>Plan</th><th>Price</th></tr><tr><td>Basic</td><td>$10</td></tr></table>`;
 assert.equal(checkCustomHtml(html).ok, true);
});

test("faq is a real block type and sanitizeBlocks preserves its Q&A pairs", () => {
 assert.ok(blockDef("faq"), "faq block type is registered");
 const [b] = sanitizeBlocks([{ id: "b1", type: "faq", props: { heading: "FAQ", q0: "Q0", a0: "A0", q1: "Q1", a1: "A1" } }]);
 assert.equal(b.type, "faq");
 assert.equal(b.props.q0, "Q0");
 assert.equal(b.props.a1, "A1");
});
