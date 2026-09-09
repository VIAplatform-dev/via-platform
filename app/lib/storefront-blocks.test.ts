import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeBlocks, blockDef } from "./storefront-blocks.ts";

const block = (props: Record<string, string>) => [{ id: "b1", type: "hero", props }];

test("a button link is kept when it points somewhere real", () => {
 for (const href of ["/shop", "/pages/sizing", "https://example.com/x", "mailto:hi@shop.com"]) {
  assert.equal(sanitizeBlocks(block({ cta: "Shop", ctaHref: href }))[0].props.ctaHref, href, href);
 }
});

test("a link that can execute is stripped on the way in", () => {
 // It reached the database and then the page before this: props were copied through as plain text.
 for (const href of ["javascript:alert(1)", "data:text/html,<script>", "JaVaScRiPt:alert(1)", "vbscript:x"]) {
  assert.equal(sanitizeBlocks(block({ cta: "Shop", ctaHref: href }))[0].props.ctaHref, "", href);
 }
});

test("the label beside it is left alone — only link props are filtered", () => {
 const out = sanitizeBlocks(block({ cta: "Shop the edit", ctaHref: "/shop" }))[0].props;
 assert.equal(out.cta, "Shop the edit");
});

test("the sections whose button navigates offer a link field; the others don't", () => {
 const has = (t: string) => Boolean(blockDef(t)?.fields.some((f) => f.key === "ctaHref"));
 for (const t of ["hero", "split", "spotlight", "countdown"]) assert.equal(has(t), true, t);
 // These buttons subscribe, submit and book — a link field on them would do nothing.
 for (const t of ["newsletter", "contact", "appointments"]) assert.equal(has(t), false, t);
});
