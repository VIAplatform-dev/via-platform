import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveReturnsText, hasLegacyOnly } from "./returns-policy.ts";

test("the policies page is the record; the old column is only a fallback", () => {
 assert.equal(resolveReturnsText("Returns within 14 days.", "All sales final."), "Returns within 14 days.");
 assert.equal(resolveReturnsText("", "All sales final."), "All sales final.");
 assert.equal(resolveReturnsText(null, "All sales final."), "All sales final.");
 assert.equal(resolveReturnsText("  ", "All sales final."), "All sales final.");
 assert.equal(resolveReturnsText(null, null), "");
});

// The rule that stops the merge from editing a seller's policy for her.
test("a shortened policy is not topped up from the old copy", () => {
 // She cut a long policy down to one line. The old record still holds the long one; the short one
 // is what she meant, and the merge must not put the rest back.
 assert.equal(resolveReturnsText("All sales final.", "A very long policy from before, with conditions…"), "All sales final.");
});

test("whitespace is trimmed but the words are never touched", () => {
 assert.equal(resolveReturnsText("  Returns within 30 days.  ", null), "Returns within 30 days.");
 // No case changes, no punctuation added, nothing appended.
 const odd = "returns?? ask us. We're reasonable";
 assert.equal(resolveReturnsText(odd, null), odd);
});

test("which stores still need carrying across", () => {
 assert.equal(hasLegacyOnly("", "All sales final."), true);
 assert.equal(hasLegacyOnly(null, "All sales final."), true);
 assert.equal(hasLegacyOnly("Returns within 14 days.", "All sales final."), false);
 assert.equal(hasLegacyOnly("", ""), false);
 assert.equal(hasLegacyOnly(null, null), false);
});
