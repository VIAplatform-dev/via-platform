import { test } from "node:test";
import assert from "node:assert/strict";
import { rowReadiness, batchSummary, canPriceBatch, filledFields, type BulkRow } from "./listing.ts";

const row = (over: Partial<BulkRow> = {}): BulkRow => ({ id: "r", photos: ["p1"], brand: "", cost: "", ...over });

/* ── one row at a time ──────────────────────────────────────────────────── */

test("a row with brand and cost is ready", () => {
  assert.equal(rowReadiness(row({ brand: "Gucci", cost: "120" })), "ready");
});

test("a row with neither still needs her — the AI would only be guessing", () => {
  // The pricer takes brand as an input. Nothing in the old interface ever asked for it, so it
  // guessed at something she could simply have typed, and the comps were worse for it.
  assert.equal(rowReadiness(row()), "needs-you");
});

test("a row with only one of the two is partial", () => {
  assert.equal(rowReadiness(row({ brand: "Miu Miu" })), "partial");
  assert.equal(rowReadiness(row({ cost: "210" })), "partial");
});

test("whitespace is not a filled field", () => {
  assert.equal(rowReadiness(row({ brand: "   ", cost: "  " })), "needs-you");
});

test("a row with no photo can never be ready, whatever she typed", () => {
  assert.equal(rowReadiness(row({ photos: [], brand: "Gucci", cost: "120" })), "needs-you");
});

/* ── the batch header ───────────────────────────────────────────────────── */

test("the header counts photos and the pieces they were grouped into", () => {
  assert.equal(batchSummary(18, 5), "18 photos · grouped into 5 pieces");
  assert.equal(batchSummary(1, 1), "1 photo · grouped into 1 piece");
});

test("no photos yet says so rather than counting to zero", () => {
  assert.equal(batchSummary(0, 0), "No photos yet");
});

/* ── the button ─────────────────────────────────────────────────────────── */

test("pricing the batch needs at least one row with a photo", () => {
  assert.equal(canPriceBatch([]), false);
  assert.equal(canPriceBatch([row({ photos: [] })]), false);
  assert.equal(canPriceBatch([row()]), true);
});

/* ── what gets sent to the AI ───────────────────────────────────────────── */

test("only fields she actually typed are sent as `filled`", () => {
  // The API only generates what is missing, so sending an empty string would claim she had
  // answered and leave the field blank in the draft.
  assert.deepEqual(filledFields({ brand: "Prada", era: "", cost: "140" }), { brand: "Prada", cost: "140" });
});

test("filled is an empty object when she typed nothing — not a set of empty strings", () => {
  assert.deepEqual(filledFields({ brand: "", era: "   " }), {});
});
