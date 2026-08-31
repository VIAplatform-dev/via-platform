import { test } from "node:test";
import assert from "node:assert/strict";
import { planCaptureWrite } from "./capture-history.ts";

test("a real edit is written, and keeps the version it replaced", () => {
 const p = planCaptureWrite("<p>old</p>", "<p>new</p>");
 assert.equal(p.write, true);
 assert.equal(p.write === true && p.previousHtml, "<p>old</p>");
});

test("a save that changes nothing is not written — it must not burn the one undo slot", () => {
 // The chrome-propagation pass re-saves every other page of the site. If those no-op writes
 // landed, one header edit would destroy the undo point of all 780 other pages.
 const p = planCaptureWrite("<p>same</p>", "<p>same</p>");
 assert.equal(p.write, false);
});

test("saving twice preserves only the version immediately before — exactly one step back", () => {
 const first = planCaptureWrite("v1", "v2");
 assert.equal(first.write === true && first.previousHtml, "v1");
 const second = planCaptureWrite("v2", "v3");
 assert.equal(second.write === true && second.previousHtml, "v2");
});
