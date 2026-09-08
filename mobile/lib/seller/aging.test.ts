import { test } from "node:test";
import assert from "node:assert/strict";
import { daysListed, ageLabel, agingBuckets, agingTile } from "./aging.ts";

const NOW = new Date("2026-09-07T12:00:00.000Z");

test("days listed counts whole days since the piece was created", () => {
  assert.equal(daysListed("2026-09-06T12:00:00.000Z", NOW), 1);
  assert.equal(daysListed("2026-06-09T12:00:00.000Z", NOW), 90);
  assert.equal(daysListed(null, NOW), null);
});

test("the age label on a row is short, and goes quiet on a fresh piece", () => {
  // "· 3d" on every new listing is noise; the number only earns its place once it means something.
  assert.equal(ageLabel(3), null);
  assert.equal(ageLabel(14), "14d");
  assert.equal(ageLabel(120), "120d");
  assert.equal(ageLabel(null), null);
});

test("only live pieces age", () => {
  const b = agingBuckets([
    { status: "active", createdAt: "2026-05-01T00:00:00.000Z" },
    { status: "sold", createdAt: "2026-01-01T00:00:00.000Z" },
  ], NOW);
  assert.equal(b.over90, 1);
  assert.equal(b.live, 1);
});

test("the Home tile says the number that matters", () => {
  assert.equal(agingTile({ over90: 14, over60: 20, live: 200 }), "14 pieces over 90 days");
  assert.equal(agingTile({ over90: 0, over60: 0, live: 20 }), null);
});
