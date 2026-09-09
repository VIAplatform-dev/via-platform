import { test } from "node:test";
import assert from "node:assert/strict";
import { computePriceFlag } from "./price-engine.ts";

// The floor rule, stated once so a test can hold it:  floor = cost × (1 + markup).
const floorOf = (costCents: number, bps: number) => Math.round(costCents * (1 + bps / 10000));

test("the floor is cost plus the markup", () => {
 assert.equal(floorOf(10_000, 3000), 13_000);  // $100 at 30% → $130
 assert.equal(floorOf(4_500, 10000), 9_000);   // $45 at 100% → $90
});

test("the floor wins when the market sits below it", () => {
 // The whole point: comps say $90, she paid $100, her markup is 30% → $130 stands.
 const market = 9_000, floor = floorOf(10_000, 3000);
 assert.equal(Math.max(market, floor), 13_000);
});

test("the market wins when it sits above the floor — a floor is not a target", () => {
 const market = 40_000, floor = floorOf(10_000, 3000);
 assert.equal(Math.max(market, floor), 40_000);
});

test("the floor survives the store's pricing stance", () => {
 // A "value" stance multiplies market DOWN (0.9×). It must not take the price under cost+markup.
 const market = 12_000, adjusted = Math.round(market * 0.9), floor = floorOf(10_000, 3000);
 assert.equal(adjusted, 10_800);
 assert.equal(Math.max(adjusted, floor), 13_000);
});

test("a premium stance still clears the floor and keeps its premium", () => {
 const market = 40_000, adjusted = Math.round(market * 1.25), floor = floorOf(10_000, 3000);
 assert.equal(Math.max(adjusted, floor), 50_000);
});

test("no cost means no floor — a floor over an unknown cost is not a floor", () => {
 const costCents: number | null = null;
 assert.equal(costCents ? floorOf(costCents, 3000) : null, null);
});

test("a zero markup floors at cost itself", () => {
 assert.equal(floorOf(10_000, 0), 10_000);
});

// ── the flag ───────────────────────────────────────────────────────────────────────────────────
// It answers "what will buyers pay", so it is measured against RAW market. The client was measuring
// against the suggestion — market × the store's stance — so a premium store's own premium cancelled
// out its own warning and the two halves of the app disagreed by exactly the multiplier.
test("a premium store priced at its stance IS above market, and is told so", () => {
 const market = 40_000;
 const priced = Math.round(market * 1.25); // exactly the premium stance
 const flag = computePriceFlag(priced, market, Math.round(market * 0.85), Math.round(market * 1.2));
 assert.equal(flag.level, "over");
 assert.equal(flag.pct, 25);
});

test("quoting the suggestion misstates the gap — the client said 0% above a market it was 25% above", () => {
 // Half one of the bug. The band was raw-market, so the LEVEL was right; the percentage and the
 // "~$X" in the message came from the suggestion, so the sentence contradicted itself.
 const market = 40_000, suggestion = Math.round(market * 1.25);
 const wrong = computePriceFlag(suggestion, suggestion, Math.round(market * 0.85), Math.round(market * 1.2));
 assert.equal(wrong.level, "over");
 assert.equal(wrong.pct, 0);            // "About 0% above market"
 assert.equal(wrong.marketUsd, 500);    // "(~$500)" — that is the suggestion, not the market
 const right = computePriceFlag(suggestion, market, Math.round(market * 0.85), Math.round(market * 1.2));
 assert.equal(right.pct, 25);
 assert.equal(right.marketUsd, 400);
});

test("with no band to fall back on, the suggestion hid the warning completely", () => {
 // Half two. computePriceFlag derives a ±band from whatever midpoint it is given, so passing the
 // suggestion moved the ceiling up with the price: a 25% premium came back "at market".
 const market = 40_000, suggestion = Math.round(market * 1.25);
 assert.equal(computePriceFlag(suggestion, suggestion, null, null).level, "at");
 assert.equal(computePriceFlag(suggestion, market, null, null).level, "over");
});

test("a price inside the band is at market whatever the stance", () => {
 assert.equal(computePriceFlag(41_000, 40_000, 34_000, 48_000).level, "at");
});

test("under-market is still under-market", () => {
 assert.equal(computePriceFlag(20_000, 40_000, 34_000, 48_000).level, "under");
});
