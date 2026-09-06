import { test } from "node:test";
import assert from "node:assert/strict";
import { mayOpenStore, chooseStoreSlug, normaliseEmail, isEmail } from "./seller-access.ts";

test("no invite, no store — the gate fails closed", () => {
 assert.deepEqual(mayOpenStore({ email: "someone@example.com", invited: false }), { ok: false, reason: "not-invited" });
});

test("an invited email may open a store", () => {
 assert.equal(mayOpenStore({ email: "t@tesselizabeth.com", invited: true }).ok, true);
});

test("someone who already has a store keeps it, invite or not", () => {
 // Revoking an invite must never lock a seller out of a shop she's been running.
 const d = mayOpenStore({ email: "her@shop.com", invited: false, hasStoreAlready: true });
 assert.equal(d.ok, true);
 assert.equal(d.reason, "already-has-a-store");
});

test("the VYA owner can always set a shop up alongside someone", () => {
 assert.equal(mayOpenStore({ email: "hana@vya.com", invited: false, isVyaOwner: true }).ok, true);
});

test("a missing or malformed address is refused before anything else", () => {
 assert.deepEqual(mayOpenStore({ email: "", invited: true }), { ok: false, reason: "no-email" });
 assert.deepEqual(mayOpenStore({ email: null, invited: true }), { ok: false, reason: "no-email" });
 assert.deepEqual(mayOpenStore({ email: "not-an-email", invited: true }), { ok: false, reason: "no-email" });
});

test("addresses are compared in one normalised form", () => {
 // An invite for T@Tesselizabeth.com must match a sign-in as t@tesselizabeth.com.
 assert.equal(normaliseEmail("  T@Tesselizabeth.COM "), "t@tesselizabeth.com");
 assert.equal(isEmail("t@tesselizabeth.com"), true);
 assert.equal(isEmail("nope"), false);
});

test("a reserved store is handed over instead of a '-2' slug", () => {
 // The trap: her site was imported ahead of time under the very slug her name generates, so
 // generateUniqueSlug returns "…-2" and she lands in an empty shop with 142 pieces one row away.
 const r = chooseStoreSlug({ reserved: "tesselizabethvintage", generated: "tesselizabethvintage-2", hasWebsite: true });
 assert.equal(r.slug, "tesselizabethvintage");
 assert.equal(r.seeded, true);
});

test("choosing to start fresh is respected, seed or no seed", () => {
 // She answered the question. Handing her a pre-filled shop anyway would be overruling her.
 for (const hasWebsite of [false, null]) {
  const r = chooseStoreSlug({ reserved: "tesselizabethvintage", generated: "tess-vintage", hasWebsite });
  assert.equal(r.slug, "tess-vintage", `hasWebsite=${hasWebsite}`);
  assert.equal(r.seeded, false);
 }
});

test("with nothing reserved, the generated slug is used as before", () => {
 const r = chooseStoreSlug({ reserved: null, generated: "new-shop", hasWebsite: true });
 assert.equal(r.slug, "new-shop");
 assert.equal(r.seeded, false);
});
