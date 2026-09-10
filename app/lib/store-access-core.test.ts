import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseStore } from "./store-access-core.ts";

test("one shop, no question", () => {
 assert.deepEqual(chooseStore(null, null, ["tess"]), { slug: "tess", reason: "only-one", shouldAsk: false });
});

test("the shop she asked for, when it's hers", () => {
 assert.deepEqual(chooseStore("bea", null, ["tess", "bea"]), { slug: "bea", reason: "asked", shouldAsk: false });
});

test("asking for someone else's shop gets her own, not theirs", () => {
 // The whole point of the authorisation: a slug in a URL is a request, never a grant.
 const r = chooseStore("someone-else", null, ["tess"]);
 assert.equal(r.slug, "tess");
 assert.notEqual(r.reason, "asked");
});

test("a stale link doesn't lock her out", () => {
 // A bookmark from a shop she has left resolves to hers rather than to nothing.
 assert.equal(chooseStore("old-job", null, ["tess"]).slug, "tess");
});

test("what she chose last time is remembered", () => {
 assert.deepEqual(chooseStore(null, "bea", ["tess", "bea"]), { slug: "bea", reason: "remembered", shouldAsk: false });
});

test("the URL beats the memory — a link she was sent wins over where she was", () => {
 assert.equal(chooseStore("tess", "bea", ["tess", "bea"]).slug, "tess");
});

test("a remembered shop she no longer belongs to is ignored", () => {
 const r = chooseStore(null, "old-job", ["tess"]);
 assert.equal(r.slug, "tess");
 assert.equal(r.reason, "only-one");
});

test("two shops and no choice: it still resolves, and it says it is guessing", () => {
 // Returning nothing here would 401 a real seller mid-session. It picks, and admits it picked.
 const r = chooseStore(null, null, ["tess", "bea"]);
 assert.equal(r.slug, "tess");
 assert.equal(r.reason, "fallback");
 assert.equal(r.shouldAsk, true);
});

test("belonging to nothing is nothing, and nothing to ask about", () => {
 assert.deepEqual(chooseStore(null, null, []), { slug: null, reason: "none", shouldAsk: false });
 assert.deepEqual(chooseStore("tess", null, []), { slug: null, reason: "none", shouldAsk: false });
});

test("empty strings are not a shop", () => {
 assert.equal(chooseStore("", "", ["tess"]).slug, "tess");
});
