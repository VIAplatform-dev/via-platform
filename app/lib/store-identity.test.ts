import { test } from "node:test";
import assert from "node:assert/strict";
import { review, reviewAll } from "./store-identity.ts";

const rec = (o = {}) => ({ slug: "shop", accountOwner: "her@shop.com", accessOwner: "her@shop.com", sellerEmail: "her@shop.com", ...o });

test("a store whose three records agree is left alone", () => {
 assert.deepEqual(review(rec()), { slug: "shop", kind: "ok" });
 // Case and spacing are not a disagreement.
 assert.equal(review(rec({ accessOwner: " Her@Shop.com " })).kind, "ok");
});

test("a shop with no address of its own gets the owner's", () => {
 // sellers.email is the reply-to on her emails and the contact on her shipping labels. Blank is
 // not cosmetic: five real shops are in this state.
 assert.deepEqual(review(rec({ sellerEmail: null })), { slug: "shop", kind: "set-seller-email", to: "her@shop.com", from: null });
 assert.deepEqual(review(rec({ sellerEmail: "" })).kind, "set-seller-email");
});

test("one of OUR addresses standing in for a seller's is replaced", () => {
 // sourcedbyscottie's contact was import-test+sourcedbyscottie@vyaplatform.com. Ours, from an
 // import, sitting where her address should be.
 const f = review(rec({ accountOwner: null, accessOwner: "emma@scottiestudios.com", sellerEmail: "import-test+x@vyaplatform.com" }));
 assert.deepEqual(f, { slug: "shop", kind: "set-seller-email", to: "emma@scottiestudios.com", from: "import-test+x@vyaplatform.com" });
 // But if the owner IS one of ours (a test store), leave it. There is nothing better to use.
 assert.equal(review(rec({ accountOwner: "x@vyaplatform.com", accessOwner: "x@vyaplatform.com", sellerEmail: "import-test+y@vyaplatform.com" })).kind, "ok");
});

test("a real owner address that grants no login is REPORTED, not fixed", () => {
 // vangie's contact is evan@vangie.co; the only access row is whoever onboarded her. So the shop's
 // actual owner cannot sign in to her own shop. Granting access is a decision, not a tidy-up.
 const f = review(rec({ accountOwner: null, accessOwner: "gianna@vya.com", sellerEmail: "evan@vangie.co" }));
 assert.deepEqual(f, { slug: "shop", kind: "orphaned-owner", address: "evan@vangie.co", hasAccess: "gianna@vya.com" });
});

test("two records naming different people is never guessed at", () => {
 const f = review(rec({ accountOwner: "a@x.com", accessOwner: "b@y.com" }));
 assert.deepEqual(f, { slug: "shop", kind: "owners-disagree", account: "a@x.com", access: "b@y.com" });
});

test("a store nobody owns is said, not silently skipped", () => {
 assert.deepEqual(review(rec({ accountOwner: null, accessOwner: null })), { slug: "shop", kind: "no-owner" });
 assert.equal(review(rec({ accountOwner: "not-an-email", accessOwner: null })).kind, "no-owner");
});

test("every store gets exactly one finding", () => {
 const out = reviewAll([rec({ slug: "a" }), rec({ slug: "b", sellerEmail: null })]);
 assert.deepEqual(out.map((f) => [f.slug, f.kind]), [["a", "ok"], ["b", "set-seller-email"]]);
 assert.deepEqual(reviewAll([]), []);
});
