import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveIdentity } from "./store-identity-core.ts";

test("access alone is enough — the ordinary case", () => {
 assert.deepEqual(resolveIdentity({ accessSlug: "tess", accountSlug: null }), { kind: "store", slug: "tess", repair: false });
});

test("owning the account is enough, and the missing access row is flagged for repair", () => {
 // The exact drift that stranded a seller in the signup wizard for a shop she already owned.
 assert.deepEqual(resolveIdentity({ accessSlug: null, accountSlug: "tess" }), { kind: "store", slug: "tess", repair: true });
});

test("access wins when both know her — it is the record the rest of the app reads", () => {
 assert.deepEqual(resolveIdentity({ accessSlug: "tess", accountSlug: "other" }), { kind: "store", slug: "tess", repair: false });
});

test("neither knows her: that is a genuinely new seller", () => {
 assert.deepEqual(resolveIdentity({ accessSlug: null, accountSlug: null }), { kind: "onboard" });
});

test("blank and whitespace are not a shop", () => {
 assert.deepEqual(resolveIdentity({ accessSlug: "", accountSlug: "  " }), { kind: "onboard" });
});

test("whoami and onboarding cannot disagree — they answer from the same two inputs", () => {
 // onboarding says "you already have a store" when EITHER record knows her; this is that rule.
 for (const c of [
  { accessSlug: "a", accountSlug: null },
  { accessSlug: null, accountSlug: "a" },
  { accessSlug: "a", accountSlug: "a" },
 ]) {
  const r = resolveIdentity(c);
  assert.equal(r.kind, "store", JSON.stringify(c));
 }
});
