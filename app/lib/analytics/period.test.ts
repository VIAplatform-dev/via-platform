import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePeriod, deltaPct } from "./period.ts";

// A fixed clock so every expectation is exact: 2026-08-29T15:00Z.
const NOW = new Date("2026-08-29T15:00:00.000Z");
const d = (iso: string) => new Date(iso).toISOString();

test("calendar quarter resolves to whole-quarter bounds", () => {
 const p = resolvePeriod({ period: "2026-Q3", now: NOW });
 assert.equal(p.key, "2026-Q3");
 assert.equal(p.current.startISO, d("2026-07-01T00:00:00Z"));
 assert.equal(p.current.endISO, d("2026-10-01T00:00:00Z"));
 assert.equal(p.current.label, "Q3 2026");
});

test("quarter compares against the previous quarter, not 92 days earlier", () => {
 const p = resolvePeriod({ period: "2026-Q1", now: NOW });
 assert.equal(p.prior?.startISO, d("2025-10-01T00:00:00Z"));
 assert.equal(p.prior?.endISO, d("2026-01-01T00:00:00Z"));
 assert.equal(p.yoy?.startISO, d("2025-01-01T00:00:00Z"));
 assert.equal(p.yoy?.endISO, d("2025-04-01T00:00:00Z"));
});

test("month prior is the calendar month before, whatever its length", () => {
 // March is 31 days; a naive 31-day shift would start in late January.
 const p = resolvePeriod({ period: "2026-03", now: NOW });
 assert.equal(p.prior?.startISO, d("2026-02-01T00:00:00Z"));
 assert.equal(p.prior?.endISO, d("2026-03-01T00:00:00Z"));
 assert.equal(p.current.label, "March 2026");
});

test("q3-2026 and 2026-q3 parse the same", () => {
 assert.equal(resolvePeriod({ period: "q3-2026", now: NOW }).key, resolvePeriod({ period: "2026-Q3", now: NOW }).key);
});

test("rolling windows slide for both comparisons", () => {
 const p = resolvePeriod({ period: "30d", now: NOW });
 assert.equal(p.current.endISO, NOW.toISOString());
 assert.equal(p.current.days, 30);
 assert.equal(p.prior?.endISO, p.current.startISO);
 assert.equal(p.yoy?.endISO, d("2025-08-29T15:00:00Z"));
});

test("to-date compares against the same elapsed span, not a finished period", () => {
 const p = resolvePeriod({ period: "qtd", now: NOW });
 assert.equal(p.current.startISO, d("2026-07-01T00:00:00Z"));
 assert.equal(p.current.endISO, NOW.toISOString());
 // Q3 started Jul 1; the prior span must start Apr 1 and run the same length.
 assert.equal(p.prior?.startISO, d("2025-04-01T00:00:00Z").replace("2025", "2026"));
 const len = Date.parse(p.current.endISO) - Date.parse(p.current.startISO);
 assert.equal(Date.parse(p.prior!.endISO) - Date.parse(p.prior!.startISO), len);
 assert.equal(p.yoy?.startISO, d("2025-07-01T00:00:00Z"));
});

test("custom range is inclusive of its end date", () => {
 const p = resolvePeriod({ period: "custom", from: "2026-02-01", to: "2026-02-14", now: NOW });
 assert.equal(p.current.startISO, d("2026-02-01T00:00:00Z"));
 assert.equal(p.current.endISO, d("2026-02-15T00:00:00Z")); // exclusive end = the 15th
 assert.equal(p.current.days, 14);
});

test("a malformed custom range falls back to the 30-day default", () => {
 const p = resolvePeriod({ period: "custom", from: "not-a-date", to: "2026-02-14", now: NOW });
 assert.equal(p.key, "30d");
});

test("timezone shifts calendar boundaries off UTC midnight", () => {
 const p = resolvePeriod({ period: "2026-08", tz: "America/New_York", now: NOW });
 // August 1 EDT (UTC-4) begins at 04:00 UTC.
 assert.equal(p.current.startISO, d("2026-08-01T04:00:00Z"));
 assert.equal(p.tz, "America/New_York");
});

test("a winter month in a DST zone uses the winter offset", () => {
 const p = resolvePeriod({ period: "2026-01", tz: "America/New_York", now: NOW });
 assert.equal(p.current.startISO, d("2026-01-01T05:00:00Z")); // EST, UTC-5
});

test("an unknown timezone degrades to UTC rather than throwing", () => {
 assert.equal(resolvePeriod({ period: "2026-08", tz: "Mars/Olympus", now: NOW }).tz, "UTC");
});

test("all-time has no comparison windows", () => {
 const p = resolvePeriod({ period: "all", now: NOW });
 assert.equal(p.allTime, true);
 assert.equal(p.prior, null);
 assert.equal(p.yoy, null);
 assert.equal(p.granularity, "month");
});

test("granularity widens with the window", () => {
 assert.equal(resolvePeriod({ period: "30d", now: NOW }).granularity, "day");
 assert.equal(resolvePeriod({ period: "90d", now: NOW }).granularity, "week");
 assert.equal(resolvePeriod({ period: "2026", now: NOW }).granularity, "month");
});

test("deltaPct returns null against a zero base", () => {
 assert.equal(deltaPct(10, 0), null);
 assert.equal(deltaPct(110, 100), 10);
 assert.equal(deltaPct(50, 100), -50);
});
