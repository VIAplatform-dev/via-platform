import { test } from "node:test";
import assert from "node:assert/strict";
import { funnelByStep, stuckSinceDays, type FunnelStore } from "./setup-funnel-core.ts";

// Where stores get stuck: for the owner, not the seller. Each incomplete store is counted once,
// against the step it is stuck on; complete stores are in the table but never in a bar.

const store = (slug: string, next: FunnelStore["next"], stuckSinceDays: number, done = 2): FunnelStore => ({
 slug, name: slug, next, done, total: 6, complete: next === null, stuckSinceDays,
});

test("counts per step, percent of ALL stores, ordered by count desc then step order", () => {
 const rows = funnelByStep([
  store("a", "ship_from", 10), store("b", "ship_from", 20), store("c", "ship_from", 30),
  store("d", "returns", 4), store("e", "payments", 8),
  store("f", null, 0, 5), store("g", null, 0, 6), store("h", null, 0, 5), store("i", null, 0, 5), store("j", null, 0, 5),
 ]);
 assert.deepEqual(rows.map((r) => r.id), ["ship_from", "payments", "returns", "shipping", "first_listing"]);
 assert.deepEqual(rows.map((r) => r.count), [3, 1, 1, 0, 0]);
 assert.deepEqual(rows.map((r) => r.pct), [30, 10, 10, 0, 0]);
 assert.deepEqual(rows.map((r) => r.avgStuckDays), [20, 8, 4, 0, 0]);
 assert.equal(rows[0].label, "Add the address you ship from");
 assert.equal(rows[1].label, "Connect Stripe so you can get paid");
});

test("complete stores never appear in a bar; the domain is never a bar (it never blocks)", () => {
 const rows = funnelByStep([store("f", null, 3, 5), store("g", null, 3, 6)]);
 assert.equal(rows.reduce((n, r) => n + r.count, 0), 0);
 assert.ok(!rows.some((r) => r.id === "domain"));
 assert.equal(rows.length, 5);
});

test("no stores at all: five empty bars, no division by zero", () => {
 const rows = funnelByStep([]);
 assert.equal(rows.length, 5);
 for (const r of rows) assert.deepEqual({ count: r.count, pct: r.pct, avg: r.avgStuckDays }, { count: 0, pct: 0, avg: 0 });
});

test("stuck since = whole days since the seller row was created, never negative, unknown = 0", () => {
 const now = new Date("2026-09-08T12:00:00Z");
 assert.equal(stuckSinceDays(new Date("2026-09-01T00:00:00Z"), now), 7);
 assert.equal(stuckSinceDays("2026-09-08T09:00:00Z", now), 0);
 assert.equal(stuckSinceDays(new Date("2026-09-09T00:00:00Z"), now), 0);
 assert.equal(stuckSinceDays(null, now), 0);
 assert.equal(stuckSinceDays("not a date", now), 0);
});
