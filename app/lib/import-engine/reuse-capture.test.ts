import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldReuseExistingCapture } from "./reuse-capture.ts";

test("a seller's first import runs — there is nothing to protect", () => {
 assert.equal(shouldReuseExistingCapture({ captured: 0, isOwner: false }), false);
 assert.equal(shouldReuseExistingCapture({ captured: 0, isOwner: true }), false);
});

test("a seller's SECOND import never re-crawls the site she already has", () => {
 assert.equal(shouldReuseExistingCapture({ captured: 1, isOwner: false }), true);
 assert.equal(shouldReuseExistingCapture({ captured: 94, isOwner: false }), true);
});

test("the owner may still re-import — that is how a store gets repaired", () => {
 assert.equal(shouldReuseExistingCapture({ captured: 94, isOwner: true }), false);
});

test("force is the script's explicit opt-in to re-crawl", () => {
 assert.equal(shouldReuseExistingCapture({ captured: 94, isOwner: false, force: true }), false);
 assert.equal(shouldReuseExistingCapture({ captured: 94, isOwner: false, force: false }), true);
});

test("a negative or nonsense page count is treated as nothing captured, never as a reason to reuse", () => {
 assert.equal(shouldReuseExistingCapture({ captured: -1, isOwner: false }), false);
 assert.equal(shouldReuseExistingCapture({ captured: Number.NaN, isOwner: false }), false);
});
