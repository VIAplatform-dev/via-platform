import { test } from "node:test";
import assert from "node:assert/strict";
import { starterTiers } from "./RentalPanel.tsx";

test("a priced piece gets a rental ladder that can actually be saved", () => {
 // The bug: the starter was three lengths at zero, saving drops anything unpriced, so turning
 // Renting on and pressing Save always failed. Every tier must carry a price.
 const t = starterTiers(20000); // a $200 piece
 assert.equal(t.length, 3);
 for (const x of t) assert.ok(x.cents > 0, `${x.days} days is unpriced`);
});

test("longer costs more", () => {
 const t = starterTiers(20000);
 assert.ok(t[0].cents < t[1].cents && t[1].cents < t[2].cents);
});

test("renting a piece costs less than buying it", () => {
 for (const price of [5000, 20000, 100000]) {
  for (const t of starterTiers(price)) assert.ok(t.cents < price, `${t.days} days at ${t.cents} vs ${price}`);
 }
});

test("a cheap piece still gets a real price, never zero", () => {
 for (const t of starterTiers(500)) assert.ok(t.cents >= 100, `${t.days} days came out at ${t.cents}`);
});

test("no price yet falls back rather than inventing one", () => {
 for (const bad of [0, null, undefined, NaN]) {
  assert.equal(starterTiers(bad as number).every((t) => t.cents === 0), true);
 }
});
