import test from "node:test";
import assert from "node:assert/strict";
import { compKind, filterKindConflicts, comparablesAreThin } from "./comp-kind.ts";

test("a dress is never priced off handbags", () => {
 // The Oldham case: a 1,681 dress anchored to 16,013 of Chanel bags, shoes and jewellery.
 const comps = [
  { title: "CHANEL Vintage CC Logos Chain Shoulder Bag", priceCents: 1601300 },
  { title: "Chanel black leather ballet flats", priceCents: 68000 },
  { title: "Chanel costume pearl necklace", priceCents: 95000 },
  { title: "Todd Oldham 1995 black cutout mini dress", priceCents: 168100 },
 ];
 const kept = filterKindConflicts(comps, "Todd Oldham S/S 1995 Black Cutout Mini Dress with Rhinestone O-Ring");
 assert.deepEqual(kept.map((c) => c.title), ["Todd Oldham 1995 black cutout mini dress"]);
});

test("the four kinds are told apart", () => {
 assert.equal(compKind("Chanel quilted lambskin shoulder bag"), "bag");
 assert.equal(compKind("Chanel black leather ballet flats"), "shoes");
 assert.equal(compKind("Chanel costume pearl necklace"), "jewellery");
 assert.equal(compKind("Chanel black wool blazer"), "garment");
});

test("a foot beats a bag when a title could be either", () => {
 // "boot bag" and "bootie" both exist; the thing being sold is the shoe.
 assert.equal(compKind("vintage leather ankle bootie"), "shoes");
 assert.equal(compKind("Chanel boot bag"), "shoes");
});

test("a comp that does not say what it is survives", () => {
 // Abstaining beats guessing: half of eBay's titles are brand and adjectives.
 const comps = [{ title: "Chanel 1995 runway piece" }, { title: "Chanel handbag" }];
 const kept = filterKindConflicts(comps, "black cutout mini dress");
 assert.deepEqual(kept.map((c) => c.title), ["Chanel 1995 runway piece"]);
});

test("an unreadable piece filters nothing at all", () => {
 // If we cannot tell what is being priced, we have no business dropping anybody's comps.
 const comps = [{ title: "Chanel handbag" }, { title: "Chanel boots" }];
 assert.equal(filterKindConflicts(comps, "archival runway look").length, 2);
 assert.equal(filterKindConflicts(comps, null).length, 2);
});

test("the category stands in when the title is silent", () => {
 const comps = [{ title: "Gucci leather tote" }, { title: "Gucci silk dress" }];
 const kept = filterKindConflicts(comps, "1970s piece", "dresses");
 assert.deepEqual(kept.map((c) => c.title), ["Gucci silk dress"]);
});

test("a bag IS priced off other bags", () => {
 // The filter must not fire on the ordinary case it was never meant to touch.
 const comps = [{ title: "Prada re-nylon shoulder bag" }, { title: "Prada nylon tote" }, { title: "Prada dress" }];
 const kept = filterKindConflicts(comps, "Prada Re-Nylon shoulder bag");
 assert.equal(kept.length, 2);
});

test("a list with nothing left is reported as thin, not priced", () => {
 // "No true garment peers" was printed under a number rather than instead of one.
 assert.equal(comparablesAreThin(1, 31), true);
 assert.equal(comparablesAreThin(0, 12), true);
 assert.equal(comparablesAreThin(2, 4), true, "two comps is not a market");
 assert.equal(comparablesAreThin(8, 12), false);
 assert.equal(comparablesAreThin(0, 0), true);
});
