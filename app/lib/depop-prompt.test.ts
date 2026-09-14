import { test } from "node:test";
import assert from "node:assert/strict";
import { depopPrompt } from "./depop-prompt.ts";

const state = (over = {}) => ({
 hasCapturedSite: false, alreadyImported: false, dismissed: false, extensionInstalled: true, ...over,
});

test("a store building from scratch is asked, and can act on the answer", () => {
 assert.deepEqual(depopPrompt(state()), { show: true, action: "import" });
});

test("a store that brought its own website over is never asked", () => {
 // Her products came in with the site. Asking about Depop reads as VYA not knowing what it just did.
 assert.deepEqual(depopPrompt(state({ hasCapturedSite: true })), { show: false, why: "imported-site" });
 // And that holds however new she is — it is the first thing checked.
 assert.equal(depopPrompt(state({ hasCapturedSite: true, extensionInstalled: false })).show, false);
});

test("once something has come over from Depop, the question is answered by events", () => {
 assert.deepEqual(depopPrompt(state({ alreadyImported: true })), { show: false, why: "already-imported" });
});

test("no means no — not no for now", () => {
 // "My products aren't on Depop" is an answer. Re-asking next week is how a prompt becomes noise.
 assert.deepEqual(depopPrompt(state({ dismissed: true })), { show: false, why: "answered" });
});

test("without the extension the button says what it can actually do", () => {
 // A button reading "bring them over" that cannot bring anything over is worse than the question.
 assert.deepEqual(depopPrompt(state({ extensionInstalled: false })), { show: true, action: "install-extension" });
});

test("the reasons are ordered so the most specific one wins", () => {
 // A store that imported a site AND dismissed the prompt is not asked because of the site: that is
 // the durable fact, and it is what someone reading a log would want to know.
 assert.equal(depopPrompt(state({ hasCapturedSite: true, dismissed: true })).show, false);
 assert.equal(depopPrompt(state({ hasCapturedSite: true, dismissed: true }) as { show: false; why: string }).why, "imported-site");
});
