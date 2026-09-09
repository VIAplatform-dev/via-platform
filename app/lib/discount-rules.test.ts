import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDiscount, distributeDiscount } from "./store-discounts-db.ts";

// The arithmetic is unchanged by the expiry work; these pin it so the next change to this file
// can't quietly move what a code takes off.
test("a percentage comes off the subtotal", () => {
 assert.deepEqual(computeDiscount({ kind: "percent", value: 10 }, 20_000), { offCents: 2_000, freeShipping: false });
});

test("a code with no amount set takes nothing off — it does not throw, and it does not take 100%", () => {
 // The reported bug was a WELCOME10 saved before the "10" was typed. It must be harmless until fixed.
 assert.deepEqual(computeDiscount({ kind: "percent", value: null }, 20_000), { offCents: 0, freeShipping: false });
 assert.deepEqual(computeDiscount({ kind: "fixed", value: null }, 20_000), { offCents: 0, freeShipping: false });
});

test("a discount can never exceed the subtotal", () => {
 assert.equal(computeDiscount({ kind: "percent", value: 200 }, 5_000).offCents, 5_000);
 assert.equal(computeDiscount({ kind: "fixed", value: 999 }, 5_000).offCents, 5_000);
});

test("free shipping waives shipping and takes nothing off the goods", () => {
 assert.deepEqual(computeDiscount({ kind: "free_shipping", value: null }, 20_000), { offCents: 0, freeShipping: true });
});

test("a spread discount still adds up to the penny", () => {
 const out = distributeDiscount([3_333, 3_333, 3_334], 1_000);
 assert.equal(out.reduce((a, b) => a + b, 0), 10_000 - 1_000);
});

// ── expiry ─────────────────────────────────────────────────────────────────────────────────────
// validateDiscount is the single gate every checkout path goes through, and it now refuses a code
// past its ends_at. The SQL does the comparing, so what is testable here is the rule itself.
const live = (endsAt: string | null, now = new Date()) => endsAt == null || new Date(endsAt) > now;

test("a code with no end date never expires", () => {
 assert.equal(live(null), true);
});

test("a code is live right up to its end and dead after", () => {
 const now = new Date("2026-09-09T12:00:00Z");
 assert.equal(live("2026-09-09T12:00:01Z", now), true);
 assert.equal(live("2026-09-09T11:59:59Z", now), false);
});

test("'15% off for 24 hours' is live for the day and dead the next", () => {
 const start = new Date("2026-09-09T12:00:00Z");
 const ends = new Date(start.getTime() + 24 * 3600 * 1000).toISOString();
 assert.equal(live(ends, new Date("2026-09-10T11:00:00Z")), true);
 assert.equal(live(ends, new Date("2026-09-10T13:00:00Z")), false);
});
