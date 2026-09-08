import { test } from "node:test";
import assert from "node:assert/strict";
import { perDayTiers, perDayRate, priceForDays } from "./availability-core.ts";

test("a daily rate prices every allowed length exactly", () => {
 const tiers = perDayTiers(1500, 4, 10); // $15/day, store allows 4–10 days
 assert.equal(tiers.length, 7);
 assert.equal(priceForDays(4, tiers), 6000);
 assert.equal(priceForDays(5, tiers), 7500);
 assert.equal(priceForDays(10, tiers), 15000);
});

test("a booking longer than the store allows is still refused", () => {
 assert.equal(priceForDays(11, perDayTiers(1500, 4, 10)), null);
});

test("a per-day ladder is recognised on the way back in", () => {
 assert.equal(perDayRate(perDayTiers(1500, 4, 10), 4, 10), 1500);
});

test("named lengths are not mistaken for a daily rate", () => {
 // The 4/7/28 ladder a seller types by hand — three rows, not a rate.
 const named = [{ days: 4, cents: 2000 }, { days: 7, cents: 2500 }, { days: 28, cents: 10000 }];
 assert.equal(perDayRate(named, 4, 28), null);
});

test("a ladder that covers every day but isn't linear isn't a rate either", () => {
 const bumpy = [{ days: 4, cents: 6000 }, { days: 5, cents: 7000 }, { days: 6, cents: 9000 }];
 assert.equal(perDayRate(bumpy, 4, 6), null);
});

test("nonsense in, nothing out", () => {
 assert.deepEqual(perDayTiers(0, 4, 10), []);
 assert.deepEqual(perDayTiers(1500, 10, 4), []);
 assert.equal(perDayRate([], 4, 10), null);
});
