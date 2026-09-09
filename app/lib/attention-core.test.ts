import { test } from "node:test";
import assert from "node:assert/strict";
import { itemCounts, attentionRows, type AttentionCounts } from "./attention-core.ts";

// "Needs you", counted. Home and the phone both show a row per thing that is waiting on the seller;
// this is the one place that decides what counts, what it is called, and where the row goes.

const NOW = new Date("2026-09-07T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const item = (o: Partial<{ id: string; status: string; priceCents: number; costCents: number | null; images: string[]; createdAt: string }>) => ({
 id: "x", status: "active", priceCents: 12_000, costCents: 4_000, images: ["a.jpg"], createdAt: daysAgo(3), ...o,
});

const ZERO: AttentionCounts = { noPhoto: 0, unpriced: 0, lowConfidence: 0, costMissing: 0, holdsToday: 0, pickupsWaiting: 0, unanswered24h: 0, payoutsDue: 0, crossListingFailed: 0, over90: 0, over60: 0 };

test("photos and prices are counted over live and draft pieces; sold ones are nobody's work", () => {
 const c = itemCounts([
  item({ id: "a", images: [] }),
  item({ id: "b", status: "draft", images: [] }),
  item({ id: "c", status: "sold", images: [], priceCents: 0 }),
  item({ id: "d", priceCents: 0 }),
  item({ id: "e", status: "reserved", images: [] }),
 ], new Set(), NOW);
 assert.equal(c.noPhoto, 2);
 assert.equal(c.unpriced, 1);
});

test("a missing cost only matters on a piece that is live — a draft is still being written", () => {
 const c = itemCounts([item({ id: "a", costCents: null }), item({ id: "b", status: "draft", costCents: null }), item({ id: "c", costCents: 0 })], new Set(), NOW);
 assert.equal(c.costMissing, 1);
});

test("AI prices to check are the live pieces whose intake confidence was low", () => {
 const c = itemCounts([item({ id: "a" }), item({ id: "b" }), item({ id: "c", status: "draft" })], new Set(["b", "c", "zzz"]), NOW);
 assert.equal(c.lowConfidence, 1);
});

test("aging uses the same buckets as the Inventory Days column", () => {
 const c = itemCounts([item({ id: "a", createdAt: daysAgo(65) }), item({ id: "b", createdAt: daysAgo(130) }), item({ id: "c", status: "sold", createdAt: daysAgo(400) })], new Set(), NOW);
 assert.equal(c.over60, 2);
 assert.equal(c.over90, 1);
});

test("only rows with something in them, in a fixed order, with the seller's words and a place to go", () => {
 const rows = attentionRows({ ...ZERO, noPhoto: 3, unpriced: 1, lowConfidence: 2, costMissing: 4, holdsToday: 1, pickupsWaiting: 2, unanswered24h: 1, payoutsDue: 2, crossListingFailed: 1, over90: 2, over60: 5 });
 assert.deepEqual(rows.map((r) => r.id), ["noPhoto", "unpriced", "lowConfidence", "costMissing", "holdsToday", "pickupsWaiting", "unanswered24h", "payoutsDue", "crossListingFailed", "aging"]);
 assert.deepEqual(rows.map((r) => r.label), [
  "3 pieces without a photo",
  "1 unpriced piece",
  "2 AI prices to check",
  "4 pieces with no cost",
  "Holds lapse today",
  "2 collections waiting",
  "1 message waiting over a day",
  "2 consignor payouts due",
  "1 piece failed to post",
  "Listed over 90 days",
 ]);
 assert.deepEqual(rows.map((r) => r.href), [
  "/admin/inventory?missing=photo",
  "/admin/inventory?missing=price",
  "/admin/inventory?missing=confidence",
  "/admin/inventory?missing=cost",
  "/admin/inventory?status=reserved",
  "/admin/orders?delivery=pickup",
  "/admin/inbox",
  "/admin/consignment/payouts",
  "/admin/cross-listing",
  "/admin/inventory?sort=oldest",
 ]);
 assert.deepEqual(rows.map((r) => r.urgent), [true, true, true, false, true, true, true, true, true, false]);
 // The aging row carries the 90-day count when there is one, else the 60-day count.
 assert.equal(rows[9].count, 2);
});

test("with nothing waiting there are no rows at all", () => {
 assert.deepEqual(attentionRows(ZERO), []);
});

test("sixty days is the aging line only when nothing has hit ninety", () => {
 const rows = attentionRows({ ...ZERO, over60: 3 });
 assert.equal(rows.length, 1);
 assert.equal(rows[0].label, "Listed over 60 days");
 assert.equal(rows[0].count, 3);
});

test("singulars read as English and a base other than /admin moves every link", () => {
 const rows = attentionRows({ ...ZERO, noPhoto: 1, pickupsWaiting: 1, payoutsDue: 1, crossListingFailed: 2, unanswered24h: 3 }, "/x");
 assert.deepEqual(rows.map((r) => r.label), ["1 piece without a photo", "1 collection waiting", "3 messages waiting over a day", "1 consignor payout due", "2 pieces failed to post"]);
 assert.ok(rows.every((r) => r.href.startsWith("/x/")));
});
