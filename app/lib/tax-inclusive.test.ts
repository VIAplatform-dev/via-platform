import { test } from "node:test";
import assert from "node:assert/strict";
import {
 pricesIncludeTaxFor, taxBehaviorFor, normalizeCountry,
 netRevenueCents, splitInclusive, grossFromNet, taxBehaviorForSale,
} from "./tax-inclusive.ts";

test("the US and Canada show prices before tax", () => {
 // Canada is the one people get wrong — it looks European but prices are pre-tax like the US.
 assert.equal(pricesIncludeTaxFor("US"), false);
 assert.equal(pricesIncludeTaxFor("CA"), false);
});

test("the UK, EU and Australia show prices with tax already in them", () => {
 for (const c of ["GB", "IE", "FR", "DE", "ES", "AU", "NZ", "JP"]) {
  assert.equal(pricesIncludeTaxFor(c), true, `${c} should be inclusive`);
 }
});

test("an unknown country falls back to exclusive, which is the safe direction", () => {
 // Wrongly treating an exclusive price as inclusive silently eats the seller's margin;
 // the other way round is just an ordinary US-style checkout.
 assert.equal(pricesIncludeTaxFor("ZZ"), false);
 assert.equal(pricesIncludeTaxFor(null), false);
 assert.equal(pricesIncludeTaxFor(""), false);
 assert.equal(pricesIncludeTaxFor(undefined), false);
});

test("country codes are read case- and whitespace-insensitively", () => {
 assert.equal(normalizeCountry(" gb "), "GB");
 assert.equal(normalizeCountry("gbr"), null); // three letters isn't a country code here
 assert.equal(normalizeCountry(12), null);
 assert.equal(pricesIncludeTaxFor(" gb "), true);
});

test("the Stripe behaviour follows the country", () => {
 assert.equal(taxBehaviorFor("GB"), "inclusive");
 assert.equal(taxBehaviorFor("US"), "exclusive");
});

/* ── the money ──────────────────────────────────────────────────────────── */

test("revenue is the gross less the tax that was actually collected", () => {
 assert.equal(netRevenueCents(20000, 3333), 16667);
});

test("with no tax recorded the gross is returned unchanged", () => {
 // The caller has to SAY the figure includes tax rather than invent a rate.
 assert.equal(netRevenueCents(20000, null), 20000);
 assert.equal(netRevenueCents(20000, 0), 20000);
 assert.equal(netRevenueCents(20000, undefined), 20000);
});

test("tax can never exceed the sale or drive revenue negative", () => {
 assert.equal(netRevenueCents(1000, 5000), 0);
 assert.equal(netRevenueCents(0, 100), 0);
});

test("splitting an inclusive price divides, it doesn't subtract a percentage", () => {
 // The classic error: 20% off £200 is £160, but £200 INCLUDING 20% VAT is £166.67.
 const { netCents, taxCents } = splitInclusive(20000, 20);
 assert.equal(netCents, 16667);
 assert.equal(taxCents, 3333);
 assert.equal(netCents + taxCents, 20000, "the split must add back to the gross");
});

test("a split always adds back to exactly the gross, at any rate", () => {
 for (const gross of [999, 1000, 12345, 20000, 7]) {
  for (const rate of [5, 7.5, 19, 20, 21, 25]) {
   const s = splitInclusive(gross, rate);
   assert.equal(s.netCents + s.taxCents, gross, `${gross} at ${rate}% must not lose a penny`);
  }
 }
});

test("a zero rate or a zero amount splits harmlessly", () => {
 assert.deepEqual(splitInclusive(20000, 0), { netCents: 20000, taxCents: 0 });
 assert.deepEqual(splitInclusive(0, 20), { netCents: 0, taxCents: 0 });
});

test("grossFromNet is the inverse — what to display to still net your number", () => {
 assert.equal(grossFromNet(16667, 20), 20000);
 assert.equal(grossFromNet(10000, 0), 10000);
});

/* ── one real sale needs both ends of it ────────────────────────────────── */

test("a domestic UK sale stays inclusive, as the law requires", () => {
 assert.equal(taxBehaviorForSale("GB", "GB"), "inclusive");
 assert.equal(taxBehaviorForSale("GB", "FR"), "inclusive"); // still inside the VAT world
});

test("a UK seller exporting to the US is exclusive, so she can't absorb US tax", () => {
 // UK VAT is zero-rated on exports. Marked inclusive, Stripe would take any US sales tax OUT of
 // her price and she would eat it without ever seeing it.
 assert.equal(taxBehaviorForSale("GB", "US"), "exclusive");
 assert.equal(taxBehaviorForSale("AU", "CA"), "exclusive");
});

test("a US seller is exclusive wherever the buyer is", () => {
 assert.equal(taxBehaviorForSale("US", "US"), "exclusive");
 assert.equal(taxBehaviorForSale("US", "GB"), "exclusive");
});

test("with no destination yet it falls back to the seller's own convention", () => {
 assert.equal(taxBehaviorForSale("GB", null), "inclusive");
 assert.equal(taxBehaviorForSale("US", ""), "exclusive");
});
