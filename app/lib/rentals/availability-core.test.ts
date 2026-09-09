import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSettings, settingsWarnings, DEFAULT_SETTINGS } from "./settings-core.ts";
import {
 addDays, lengthInDays, spansOverlap, blockedBand, priceForDays, quote, freeSpans,
 toDateRange, fromDateRange, isDay, type Span,
} from "./availability-core.ts";

// A rental takes a piece off the floor for longer than it bills for, and every
// band is the store's own measurement. These tests are mostly about the edges
// where a wrong answer double-books a one-of-one garment.

const TODAY = "2026-09-03";
const TIERS = [{ days: 4, cents: 15000 }, { days: 7, cents: 20500 }, { days: 28, cents: 48000 }];
const S = resolveSettings({ enabled: true });

// ── days ───────────────────────────────────────────────────────────────────

test("a span counts both ends", () => {
 assert.equal(lengthInDays({ start: "2026-09-14", end: "2026-09-18" }), 5);
 assert.equal(lengthInDays({ start: "2026-09-14", end: "2026-09-14" }), 1);
});

test("day maths crosses months, years and leap days without drifting", () => {
 assert.equal(addDays("2026-09-30", 1), "2026-10-01");
 assert.equal(addDays("2026-01-01", -1), "2025-12-31");
 assert.equal(addDays("2028-02-28", 1), "2028-02-29");
});

test("impossible dates are not days", () => {
 assert.equal(isDay("2026-02-31"), false);
 assert.equal(isDay("2026-9-3"), false);
 assert.equal(isDay(""), false);
});

test("touching spans overlap, adjacent ones do not", () => {
 assert.equal(spansOverlap({ start: "2026-09-01", end: "2026-09-05" }, { start: "2026-09-05", end: "2026-09-09" }), true);
 assert.equal(spansOverlap({ start: "2026-09-01", end: "2026-09-04" }, { start: "2026-09-05", end: "2026-09-09" }), false);
});

// ── the band a rental really occupies ──────────────────────────────────────

test("the store's own bands widen the rental", () => {
 // "two days to ship, three to clean once it's back"
 const s = resolveSettings({ shipOutDays: 2, shipBackDays: 2, turnaroundDays: 3 });
 const band = blockedBand({ start: "2026-09-14", end: "2026-09-17" }, s);
 assert.deepEqual(band, { start: "2026-09-12", end: "2026-09-22" });
 assert.equal(lengthInDays(band), 11); // 4 billed days cost 11
});

test("a pickup shop that doesn't clean blocks only the rented days", () => {
 const s = resolveSettings({ shipOutDays: 0, shipBackDays: 0, turnaroundDays: 0 });
 const rented = { start: "2026-09-14", end: "2026-09-17" };
 assert.deepEqual(blockedBand(rented, s), rented);
});

// ── price ladder ───────────────────────────────────────────────────────────

test("a length pays the cheapest tier that covers it", () => {
 assert.equal(priceForDays(4, TIERS), 15000);
 assert.equal(priceForDays(5, TIERS), 20500); // 5 days pays the 7-day rate
 assert.equal(priceForDays(7, TIERS), 20500);
 assert.equal(priceForDays(28, TIERS), 48000);
});

test("longer than every tier is not for rent, not a discount", () => {
 assert.equal(priceForDays(29, TIERS), null);
 assert.equal(priceForDays(0, TIERS), null);
 assert.equal(priceForDays(4, []), null);
});

// ── quoting ────────────────────────────────────────────────────────────────

const span = (start: string, days: number): Span => ({ start, end: addDays(start, days - 1) });

test("a clean request quotes and returns its blocked band", () => {
 const q = quote(span("2026-09-14", 5), S, TIERS, TODAY);
 assert.equal(q.ok, true);
 if (!q.ok) return;
 assert.equal(q.days, 5);
 assert.equal(q.cents, 20500);
 assert.deepEqual(q.blocked, { start: "2026-09-13", end: "2026-09-22" }); // 1 out, 2 back, 2 turnaround
});

test("the store's window is enforced at both ends", () => {
 assert.deepEqual(quote(span("2026-09-14", 2), S, TIERS, TODAY), { ok: false, reason: "too-short" });
 assert.deepEqual(quote(span("2026-09-14", 40), S, TIERS, TODAY), { ok: false, reason: "too-long" });
});

test("lead time and horizon are enforced against today", () => {
 assert.deepEqual(quote(span("2026-09-03", 5), S, TIERS, TODAY), { ok: false, reason: "too-soon" });
 assert.deepEqual(quote(span("2027-06-01", 5), S, TIERS, TODAY), { ok: false, reason: "beyond-horizon" });
});

test("same-day is fine for a store with no lead time", () => {
 const s = resolveSettings({ leadDays: 0, minDays: 1 });
 const q = quote({ start: TODAY, end: TODAY }, s, [{ days: 1, cents: 5000 }], TODAY);
 assert.equal(q.ok, true);
});

test("backwards and nonsense dates are refused before anything else", () => {
 assert.deepEqual(quote({ start: "2026-09-18", end: "2026-09-14" }, S, TIERS, TODAY), { ok: false, reason: "bad-dates" });
 assert.deepEqual(quote({ start: "2026-02-31", end: "2026-03-04" }, S, TIERS, TODAY), { ok: false, reason: "bad-dates" });
});

test("a rental is refused when its BAND clashes, even if the rented days don't", () => {
 // Someone has it 20th–24th. Their band runs 19th → 28th once shipping and cleaning are counted.
 const taken = blockedBand(span("2026-09-20", 5), S);
 assert.deepEqual(taken, { start: "2026-09-19", end: "2026-09-28" });

 // Nobody is wearing it on the 26th, but it's in a garment bag — refused.
 assert.deepEqual(quote(span("2026-09-26", 5), S, TIERS, TODAY, [taken]), { ok: false, reason: "unavailable" });

 // The 29th LOOKS free: the previous renter is long gone and cleaning ends on the 28th. It isn't.
 // Shipping out starts a day early, so this band opens on the 28th and touches the last one. This
 // is the case that silently double-books a one-of-one garment if you only compare rented days.
 assert.deepEqual(quote(span("2026-09-29", 5), S, TIERS, TODAY, [taken]), { ok: false, reason: "unavailable" });

 // The 30th is genuinely clear — its band opens on the 29th.
 assert.equal(quote(span("2026-09-30", 5), S, TIERS, TODAY, [taken]).ok, true);
});

// ── free calendar ──────────────────────────────────────────────────────────

test("free spans are the gaps between blocked bands", () => {
 const s = resolveSettings({ leadDays: 0, horizonDays: 30 });
 const free = freeSpans([{ start: "2026-09-10", end: "2026-09-15" }], s, TODAY);
 assert.deepEqual(free, [
  { start: "2026-09-03", end: "2026-09-09" },
  { start: "2026-09-16", end: "2026-10-03" },
 ]);
});

test("overlapping and touching bands collapse into one gap", () => {
 const s = resolveSettings({ leadDays: 0, horizonDays: 30 });
 const free = freeSpans([
  { start: "2026-09-10", end: "2026-09-15" },
  { start: "2026-09-14", end: "2026-09-20" },
  { start: "2026-09-21", end: "2026-09-22" },
 ], s, TODAY);
 assert.deepEqual(free, [
  { start: "2026-09-03", end: "2026-09-09" },
  { start: "2026-09-23", end: "2026-10-03" },
 ]);
});

test("a fully booked horizon has no free spans", () => {
 const s = resolveSettings({ leadDays: 0, horizonDays: 10 });
 assert.deepEqual(freeSpans([{ start: "2026-09-01", end: "2026-10-01" }], s, TODAY), []);
});

// ── postgres round-trip ────────────────────────────────────────────────────

test("spans round-trip through a half-open daterange", () => {
 const s: Span = { start: "2026-09-14", end: "2026-09-18" };
 assert.equal(toDateRange(s), "[2026-09-14,2026-09-19)");
 assert.deepEqual(fromDateRange(toDateRange(s)), s);
 assert.equal(fromDateRange("empty"), null);
 assert.equal(fromDateRange(null), null);
});

// ── settings ───────────────────────────────────────────────────────────────

test("item overrides beat store settings beat defaults", () => {
 const r = resolveSettings({ minDays: 2, turnaroundDays: 5 }, { turnaroundDays: 9 });
 assert.equal(r.minDays, 2); // from the store
 assert.equal(r.turnaroundDays, 9); // item wins
 assert.equal(r.horizonDays, DEFAULT_SETTINGS.horizonDays); // default fills the rest
});

test("a junk override falls back instead of taking the listing down", () => {
 const r = resolveSettings(null, { minDays: "soon", security: "vibes", shipOutDays: -4 } as never);
 assert.equal(r.minDays, DEFAULT_SETTINGS.minDays);
 assert.equal(r.security, DEFAULT_SETTINGS.security);
 assert.equal(r.shipOutDays, 0); // clamped, not negative
});

test("a max below the min is widened rather than left unbookable", () => {
 assert.equal(resolveSettings({ minDays: 10, maxDays: 3 }).maxDays, 10);
});

test("incoherent combinations are reported, not silently accepted", () => {
 const w = settingsWarnings(resolveSettings({ security: "deposit", depositCents: 20000, maxDays: 28 }));
 assert.ok(w.includes("deposit-outlives-authorisation")); // 7-day auth vs 28-day rental
 // Appointments moved out of rental settings entirely — a shop that only sells still takes them —
 // so a pickup-only store no longer warns about them here.
 const p = settingsWarnings(resolveSettings({ fulfilment: "pickup", prepaidLabel: true }));
 assert.deepEqual(p, ["pickup-with-prepaid-label"]);
 assert.deepEqual(settingsWarnings(resolveSettings({ enabled: true })), []);
});
