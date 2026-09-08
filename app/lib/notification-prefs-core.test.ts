import { test } from "node:test";
import assert from "node:assert/strict";
import { PUSH_EVENTS, EMAIL_EVENTS, DEFAULT_PREFS, normalizePrefs, mergePrefs, pushEnabled } from "./notification-prefs-core.ts";

// Which pushes and emails a store wants. The defaults mirror the phone's Notifications screen —
// a piece sold and a buyer message ON, the rest opt-in — because a phone that buzzes for nothing
// gets silenced, and then the two that matter are lost with it.

test("the events, and the defaults the phone screen has always shown", () => {
 assert.deepEqual(PUSH_EVENTS, ["sold", "message", "offer", "payout"]);
 assert.deepEqual(EMAIL_EVENTS, ["daily", "weekly", "needs"]);
 assert.deepEqual(DEFAULT_PREFS, {
  push: { sold: true, message: true, offer: true, payout: false },
  email: { daily: false, weekly: true, needs: true },
 });
});

test("anything stored is read back over the defaults, and junk is ignored", () => {
 assert.deepEqual(normalizePrefs(null), DEFAULT_PREFS);
 assert.deepEqual(normalizePrefs({ push: { sold: false }, email: { daily: true } }), {
  push: { sold: false, message: true, offer: true, payout: false },
  email: { daily: true, weekly: true, needs: true },
 });
 assert.deepEqual(normalizePrefs({ push: { sold: "no", bogus: true }, email: "x" }), DEFAULT_PREFS);
 // Never the same object as the defaults — a caller mutating its copy must not change them.
 assert.notEqual(normalizePrefs(null), DEFAULT_PREFS);
 assert.notEqual(normalizePrefs(null).push, DEFAULT_PREFS.push);
});

test("a patch changes only what it names — one toggle is one key", () => {
 const next = mergePrefs(DEFAULT_PREFS, { push: { payout: true } });
 assert.deepEqual(next, { push: { sold: true, message: true, offer: true, payout: true }, email: { daily: false, weekly: true, needs: true } });
 assert.deepEqual(mergePrefs(next, { email: { weekly: false } }).email, { daily: false, weekly: false, needs: true });
 assert.deepEqual(mergePrefs(next, {}), next);
 assert.deepEqual(mergePrefs(next, { push: { nope: false } as never }), next);
});

test("pushEnabled is the gate every sender asks", () => {
 assert.equal(pushEnabled(DEFAULT_PREFS, "sold"), true);
 assert.equal(pushEnabled(DEFAULT_PREFS, "payout"), false);
 assert.equal(pushEnabled(mergePrefs(DEFAULT_PREFS, { push: { sold: false } }), "sold"), false);
});
