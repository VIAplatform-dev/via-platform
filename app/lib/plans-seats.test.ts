import { test } from "node:test";
import assert from "node:assert/strict";
import { seatsForTier, canAddSeat, SEATS_BY_TIER, FREE_SEATS } from "./plans.ts";

test("each tier has its seat count", () => {
 assert.equal(SEATS_BY_TIER.starter, 2);
 assert.equal(SEATS_BY_TIER.studio, 4);
 assert.equal(SEATS_BY_TIER.atelier, 6);
});

test("no live tier still leaves the owner her own store", () => {
 // A lapsed card must not lock someone out of their own inventory.
 assert.equal(seatsForTier(null), FREE_SEATS);
 assert.equal(seatsForTier(undefined), 1);
});

test("a seat is available below the limit", () => {
 assert.deepEqual(canAddSeat("starter", 1), { ok: true });
 assert.deepEqual(canAddSeat("atelier", 5), { ok: true });
});

test("at the limit it refuses and names the next tier", () => {
 const r = canAddSeat("starter", 2);
 assert.equal(r.ok, false);
 if (!r.ok) { assert.equal(r.limit, 2); assert.match(r.reason, /Studio/); }
});

test("the top tier has nowhere to point, so it says so instead", () => {
 const r = canAddSeat("atelier", 6);
 assert.equal(r.ok, false);
 if (!r.ok) assert.match(r.reason, /Get in touch/);
});

test("over the limit is still refused, not just exactly at it", () => {
 // A store downgraded from Pro to Starter can sit above its new limit.
 assert.equal(canAddSeat("starter", 5).ok, false);
});

test("the owner counts toward the limit", () => {
 // 2 seats means the owner plus one; a limit excluding the owner would read as a bug.
 assert.equal(canAddSeat("starter", 1).ok, true);
 assert.equal(canAddSeat("starter", 2).ok, false);
});
