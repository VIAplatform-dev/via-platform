import { test } from "node:test";
import assert from "node:assert/strict";
import { shippingPolicy, returnsPolicy, privacyPolicy, termsPolicy, writePolicies, canWrite } from "./policy-writer.ts";

const shop = { storeName: "Hana's Store", supportEmail: "hi@hanas.store", formatMoney: (c: number) => `$${c / 100}` };

test("the shipping policy says where she ACTUALLY ships, not worldwide", () => {
 // THE POINT OF GENERATING IT. A policy that promises worldwide postage while Europe is switched
 // off is worse than an empty box: it is a promise the checkout will refuse.
 const homeOnly = shippingPolicy({ ...shop, zones: { domestic: { enabled: true }, europe: { enabled: false } } });
 assert.match(homeOnly, /only\. No overseas orders/);
 assert.doesNotMatch(homeOnly, /Europe/);

 const wider = shippingPolicy({ ...shop, zones: { domestic: { enabled: true }, europe: { enabled: true }, north_america: { enabled: true } } });
 assert.match(wider, /Europe/);
 assert.match(wider, /North America/);
});

test("who pays postage follows the setting", () => {
 const z = { domestic: { enabled: true } };
 assert.match(shippingPolicy({ ...shop, zones: z, shipMode: "store_pays" }), /Postage is free/i);
 assert.match(shippingPolicy({ ...shop, zones: z, shipMode: "free_over", freeThresholdCents: 15000 }), /free over \$150/);
 assert.match(shippingPolicy({ ...shop, zones: z, shipMode: "buyer_pays" }), /added at checkout/);
});

test("duty is only mentioned when she actually ships abroad", () => {
 const home = shippingPolicy({ ...shop, zones: { domestic: { enabled: true } } });
 assert.doesNotMatch(home, /duty/i, "a home-only shop has no customs to explain");

 const abroad = { domestic: { enabled: true }, europe: { enabled: true } };
 assert.match(shippingPolicy({ ...shop, zones: abroad }), /yours to pay/);
 assert.match(shippingPolicy({ ...shop, zones: abroad, dutyMode: "absorbed" }), /already in our prices/);
 assert.match(shippingPolicy({ ...shop, zones: abroad, dutyMode: "collected" }), /separate line at checkout/);
});

test("all sales final reads as a policy, not as a blank", () => {
 const p = returnsPolicy({ ...shop, refundsEnabled: false });
 assert.match(p, /All sales are final/);
 // And it still promises the one thing every shop owes: a piece that arrives wrong is put right.
 assert.match(p, /damaged or isn't as described/);
 assert.doesNotMatch(p, /restocking/);
});

test("the returns policy carries her real numbers", () => {
 const p = returnsPolicy({ ...shop, refundsEnabled: true, returnWindowDays: 14, restockingFeePct: 10, returnShippingPaidBy: "buyer" });
 assert.match(p, /You have 14 days from delivery/);
 assert.match(p, /10% restocking fee/);
 assert.match(p, /You pay return postage/);

 const generous = returnsPolicy({ ...shop, refundsEnabled: true, returnWindowDays: 30, restockingFeePct: 0, returnShippingPaidBy: "store" });
 assert.match(generous, /You have 30 days from delivery/);
 assert.doesNotMatch(generous, /restocking/, "no fee, no sentence about a fee");
 assert.match(generous, /We pay return postage/);
});

test("a zero-day window is discretion, not 'return within 0 days'", () => {
 const p = returnsPolicy({ ...shop, refundsEnabled: true, returnWindowDays: 0 });
 assert.doesNotMatch(p, /0 days/);
 assert.match(p, /case by case/);
});

test("privacy and terms are never drafted for her", () => {
 // They are legal documents, not restatements of her settings: what they must say depends on where
 // she trades and who her customers are, and a generated one reads plausible enough to publish
 // unread. The cost of getting those wrong lands on her.
 assert.equal(canWrite("privacy", { storeName: "X" }), false);
 assert.equal(canWrite("terms", { storeName: "X" }), false);
 const all = writePolicies({ ...shop, zones: { domestic: { enabled: true } }, refundsEnabled: true });
 assert.equal(all.privacy, "");
 assert.equal(all.terms, "");
});

test("the wording they would have had, kept for the day it is a deliberate choice", () => {
 const priv = privacyPolicy(shop);
 assert.match(priv, /hi@hanas\.store/);
 assert.match(priv, /not legal advice/);
 assert.match(priv, /don't sell your details/);

 const terms = termsPolicy({ ...shop, legalName: "Hana Elster Ltd" });
 assert.match(terms, /Hana's Store, trading as Hana Elster Ltd/, "the registered name when it differs");
 assert.match(terms, /not legal advice/);
 // The one thing a one-of-one shop must say.
 assert.match(terms, /sells twice, you get a full refund/);
});

test("the two we do draft come back full", () => {
 const all = writePolicies({ ...shop, zones: { domestic: { enabled: true } }, refundsEnabled: true, returnWindowDays: 14 });
 for (const k of ["returns", "shipping"] as const) assert.ok(all[k].trim().length > 80, `${k} is too thin to publish`);
});

test("we only offer to write what the settings can answer", () => {
 // A shop that has never opened Shipping gets no shipping draft: it would be invented, not read.
 assert.equal(canWrite("shipping", { storeName: "X" }), false);
 assert.equal(canWrite("shipping", { storeName: "X", zones: { domestic: { enabled: true } } }), true);
 assert.equal(canWrite("returns", { storeName: "X" }), false);
 assert.equal(canWrite("returns", { storeName: "X", refundsEnabled: false }), true);
 // And privacy and terms are never offered at all.
 assert.equal(canWrite("privacy", { storeName: "X" }), false);
});

// ── everything custom to a store has to move the words ───────────────────────

test("her contact address is in the policy, not 'email us'", () => {
 // A returns policy that says "email us" and never says where is a dead end at exactly the moment
 // somebody needs her. The address is already in Settings → Store details.
 const withEmail = returnsPolicy({ ...shop, refundsEnabled: false });
 assert.match(withEmail, /email hi@hanas\.store/);
 // And a shop that hasn't set one still reads properly rather than leaving a gap.
 const without = returnsPolicy({ storeName: "S", refundsEnabled: false });
 assert.match(without, /email us/);
 assert.doesNotMatch(without, /undefined|null/);
 // Sentence-start gets a capital.
 assert.match(returnsPolicy({ ...shop, refundsEnabled: true, returnWindowDays: 0 }), /Email hi@hanas\.store and we'll/);
});

test("collection names the town when she has one", () => {
 const z = { domestic: { enabled: true } };
 assert.match(shippingPolicy({ ...shop, zones: z, pickup: true, pickupCity: "Brooklyn" }), /collect in person in Brooklyn/);
 assert.match(shippingPolicy({ ...shop, zones: z, pickup: true }), /collect in person instead/);
 assert.doesNotMatch(shippingPolicy({ ...shop, zones: z, pickup: false }), /collect/);
});

test("a faster option is only mentioned when she offers one", () => {
 const z = { domestic: { enabled: true } };
 assert.match(shippingPolicy({ ...shop, zones: z, expedited: true }), /faster delivery option/);
 assert.doesNotMatch(shippingPolicy({ ...shop, zones: z }), /faster/);
});

test("rest of world reads as words, not as our zone name", () => {
 const p = shippingPolicy({ ...shop, zones: { domestic: { enabled: true }, rest_of_world: { enabled: true } } });
 assert.match(p, /the rest of the world/);
 assert.doesNotMatch(p, /Rest of world/);
});

test("every setting that differs makes the words differ", () => {
 // The whole promise: two shops with different settings never get the same policy.
 const z = { domestic: { enabled: true }, europe: { enabled: true } };
 const a = shippingPolicy({ ...shop, zones: z, shipMode: "buyer_pays", dutyMode: "buyer_pays" });
 const b = shippingPolicy({ ...shop, zones: { domestic: { enabled: true } }, shipMode: "store_pays" });
 assert.notEqual(a, b);
 const r1 = returnsPolicy({ ...shop, refundsEnabled: true, returnWindowDays: 14, restockingFeePct: 10, returnShippingPaidBy: "buyer" });
 const r2 = returnsPolicy({ ...shop, refundsEnabled: true, returnWindowDays: 30, restockingFeePct: 0, returnShippingPaidBy: "store" });
 assert.notEqual(r1, r2);
 assert.notEqual(r1, returnsPolicy({ ...shop, refundsEnabled: false }));
});

test("how fast she posts is only promised when she has said", () => {
 // A carrier quotes transit time, never how long a parcel sits on her table first. And a promise
 // about her own week is not one to invent for her.
 const z = { domestic: { enabled: true } };
 assert.match(shippingPolicy({ ...shop, zones: z, dispatchDays: 2 }), /Orders go out within 2 working days/);
 assert.match(shippingPolicy({ ...shop, zones: z, dispatchDays: 1 }), /within one working day/, "not '1 working days'");
 for (const v of [null, undefined, 0, -3, NaN]) {
  assert.doesNotMatch(shippingPolicy({ ...shop, zones: z, dispatchDays: v as number }), /go out within/, String(v));
 }
});
