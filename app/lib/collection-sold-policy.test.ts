import { test } from "node:test";
import assert from "node:assert/strict";
import { soldPolicy } from "./collection-sold-policy.ts";

test("a seller who lists sold pieces in her own collection keeps them", () => {
 // bag-crush's collections carry 385 sold pieces against 67 buyable. Her archive IS the browsing.
 assert.equal(soldPolicy({ feedUnavailable: 385, feedTotal: 452, weHoldSold: 242 }), "keeps");
});

test("a seller whose collection has no sold pieces, where we hold plenty, drops them", () => {
 // ascensio-demo's Dresses returns 21 products, none unavailable — while we hold 10 sold pieces
 // filed in it. She clears sold stock out of her collections; we were putting it back, which is
 // the whole of the "31 here, 21 on hers" discrepancy.
 assert.equal(soldPolicy({ feedUnavailable: 0, feedTotal: 21, weHoldSold: 10 }), "drops");
});

test("no sold pieces on EITHER side proves nothing", () => {
 // THE TRAP. A collection where nothing has sold yet looks identical to one she clears out. Calling
 // that "drops" would start hiding an archive she never asked us to hide — the same "couldn't tell
 // two situations apart" mistake as every other bug this week.
 assert.equal(soldPolicy({ feedUnavailable: 0, feedTotal: 21, weHoldSold: 0 }), "unknown");
});

test("a collection we could not read is unknown, never 'drops'", () => {
 // A throttled or failed read returns nothing. Reading that as "she has no sold pieces" would
 // empty her archive on the strength of a network error.
 assert.equal(soldPolicy({ feedUnavailable: 0, feedTotal: 0, weHoldSold: 40 }), "unknown");
 assert.equal(soldPolicy({ feedUnavailable: 0, feedTotal: 0, weHoldSold: 0 }), "unknown");
});

test("one sold piece is enough to prove she keeps them", () => {
 // feathers has just 7 sold across four collections. Sparse evidence is still evidence — she has
 // not cleared them out.
 assert.equal(soldPolicy({ feedUnavailable: 1, feedTotal: 97, weHoldSold: 26 }), "keeps");
});

test("a tiny sample is not enough to conclude she drops them", () => {
 // Two products, both in stock, and we hold one sold piece. That is not a policy, it is a coincidence.
 assert.equal(soldPolicy({ feedUnavailable: 0, feedTotal: 2, weHoldSold: 1 }), "unknown");
});

test("unknown is the safe answer, and the caller must be able to tell it from a decision", () => {
 const answers = new Set(["keeps", "drops", "unknown"]);
 for (const p of [
  soldPolicy({ feedUnavailable: 0, feedTotal: 0, weHoldSold: 0 }),
  soldPolicy({ feedUnavailable: 5, feedTotal: 5, weHoldSold: 5 }),
 ]) assert.ok(answers.has(p));
});
