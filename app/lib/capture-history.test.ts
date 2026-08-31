import { test } from "node:test";
import assert from "node:assert/strict";
import { planCaptureWrite, planCaptureUndo } from "./capture-history.ts";

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

test("undo restores the stored previous version", () => {
 const u = planCaptureUndo({ html: "v2", previousHtml: "v1" });
 assert.equal(u.restore, true);
 assert.equal(u.restore === true && u.html, "v1");
});

test("undo with nothing stored is refused, not a silent blank page", () => {
 assert.equal(planCaptureUndo({ html: "v2", previousHtml: null }).restore, false);
 assert.equal(planCaptureUndo({ html: "v2", previousHtml: "" }).restore, false);
});

test("undo is one step only — after restoring there is nothing left to undo", () => {
 const u = planCaptureUndo({ html: "v2", previousHtml: "v1" });
 assert.equal(u.restore === true && u.html, "v1");
 assert.equal(planCaptureUndo({ html: "v1", previousHtml: null }).restore, false);
});
