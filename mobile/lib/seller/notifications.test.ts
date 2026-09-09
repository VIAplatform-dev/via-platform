import { test } from "node:test";
import assert from "node:assert/strict";
import { PREF_ROWS, DEFAULT_PREFS, toggled, applyPatch, normalizePrefs } from "./notifications.ts";

// The Notifications screen's rows and the PUT it sends. One toggle is one key — the server merges,
// so a patch never carries the other six and never overwrites a change made on another device.

test("the rows, grouped and worded as the screen has always shown them", () => {
  assert.deepEqual(PREF_ROWS.map((r) => [r.group, r.key, r.label]), [
    ["push", "sold", "A piece sells"],
    ["push", "message", "A buyer messages"],
    ["push", "offer", "An offer comes in"],
    ["push", "payout", "A payout lands"],
    ["email", "daily", "Daily summary"],
    ["email", "weekly", "Weekly numbers"],
    ["email", "needs", "Something needs you"],
  ]);
  assert.deepEqual(DEFAULT_PREFS, { push: { sold: true, message: true, offer: true, payout: false }, email: { daily: false, weekly: true, needs: true } });
});

test("toggling one row produces a patch naming only that key", () => {
  assert.deepEqual(toggled(DEFAULT_PREFS, "push", "sold"), { push: { sold: false } });
  assert.deepEqual(toggled(DEFAULT_PREFS, "email", "daily"), { email: { daily: true } });
});

test("the optimistic state is the patch applied locally, and can be reverted by re-applying the old value", () => {
  const next = applyPatch(DEFAULT_PREFS, { push: { sold: false } });
  assert.equal(next.push.sold, false);
  assert.equal(next.push.message, true);
  assert.deepEqual(applyPatch(next, toggled(next, "push", "sold")), DEFAULT_PREFS);
});

test("whatever the server sends is read over the defaults", () => {
  assert.deepEqual(normalizePrefs(undefined), DEFAULT_PREFS);
  assert.deepEqual(normalizePrefs({ push: { payout: true } }).push, { sold: true, message: true, offer: true, payout: true });
  assert.deepEqual(normalizePrefs({ push: { sold: "yes" }, email: null }), DEFAULT_PREFS);
});
