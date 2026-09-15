import { test } from "node:test";
import assert from "node:assert/strict";
import { isShipFromComplete, missingForLabel, describeMissing } from "./ship-from-core.ts";

// ── what a CARRIER needs, on top of a postable address ───────────────────────

test("a phone and an email are needed for a label, and neither is for a listing", () => {
 // TWO BARS, DELIBERATELY. Publishing is gated on isShipFromComplete; a missing phone number is
 // not a reason to stop somebody listing a dress. Buying a label is a different question.
 const postable = { street1: "1 High St", city: "London", state: "LDN", zip: "N1 1AA", country: "GB" };
 assert.equal(isShipFromComplete(postable), true, "good enough to list against");
 assert.deepEqual(missingForLabel(postable, "her@shop.com"), ["phone"]);
 assert.deepEqual(missingForLabel({ ...postable, phone: "020 7123 4567" }, "her@shop.com"), []);
});

test("the missing email is named separately, because it isn't on the address", () => {
 // It comes off the seller's record, and three of the recent failures were exactly that field
 // arriving empty: "Attribute address_from.email must not be empty".
 const full = { street1: "1 High St", city: "London", state: "LDN", zip: "N1 1AA", country: "GB", phone: "020 7123 4567" };
 assert.deepEqual(missingForLabel(full, null), ["email"]);
 assert.deepEqual(missingForLabel(full, "   "), ["email"]);
 assert.deepEqual(missingForLabel({ ...full, phone: "" }, ""), ["phone", "email"]);
});

test("a seller is told which field, not that something is wrong", () => {
 const nothing = missingForLabel(null, null);
 assert.ok(nothing.includes("phone") && nothing.includes("email") && nothing.includes("street1"));
 assert.equal(describeMissing(["phone"]), "phone number");
 assert.equal(describeMissing(["phone", "email"]), "phone number and contact email");
 assert.match(describeMissing(["street1", "phone", "email"]), /street address, phone number and contact email/);
});
