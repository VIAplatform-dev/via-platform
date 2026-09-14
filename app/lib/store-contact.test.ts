import { test } from "node:test";
import assert from "node:assert/strict";
import { pickStoreContact, isDeliverable } from "./store-contact.ts";

test("what the seller set beats what we recorded for her", () => {
 const r = pickStoreContact({ supportEmail: "hello@shop.com", curated: "old@onboarding.com" });
 assert.deepEqual(r, { email: "hello@shop.com", source: "support-email" });
});

test("a configured sending identity wins over everything", () => {
 const r = pickStoreContact({ replyTo: "orders@shop.com", supportEmail: "hello@shop.com", curated: "old@x.com", ownerLogin: "her@gmail.com" });
 assert.equal(r?.source, "reply-to");
});

// The case that was sending sellers' mail to VYA, or nowhere.
test("a self-onboarded store falls back to the address she signs in with", () => {
 const r = pickStoreContact({ supportEmail: null, curated: null, ownerLogin: "her@gmail.com" });
 assert.deepEqual(r, { email: "her@gmail.com", source: "owner-login" });
});

test("no address at all is null — never an ops address dressed up as the store's", () => {
 assert.equal(pickStoreContact({}), null);
 assert.equal(pickStoreContact({ supportEmail: "", curated: null, ownerLogin: undefined }), null);
});

test("an undeliverable address does not beat a real one below it", () => {
 assert.deepEqual(
  pickStoreContact({ supportEmail: "not-an-email", curated: "real@shop.com" }),
  { email: "real@shop.com", source: "curated" },
 );
 assert.deepEqual(
  pickStoreContact({ supportEmail: "seller@example.com", ownerLogin: "her@gmail.com" }),
  { email: "her@gmail.com", source: "owner-login" },
 );
 assert.equal(pickStoreContact({ supportEmail: "someone@noreply.shop.com" }), null);
});

test("whitespace is trimmed, the address is not otherwise touched", () => {
 assert.equal(pickStoreContact({ supportEmail: "  Hello@Shop.com  " })?.email, "Hello@Shop.com");
});

test("what counts as deliverable", () => {
 assert.equal(isDeliverable("a@b.co"), true);
 assert.equal(isDeliverable("a@b"), false);
 assert.equal(isDeliverable(""), false);
 assert.equal(isDeliverable(null), false);
 assert.equal(isDeliverable("x@test"), false);
 assert.equal(isDeliverable("x@localhost"), false);
});
