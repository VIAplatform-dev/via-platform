import { test } from "node:test";
import assert from "node:assert/strict";
import { daysListed, agingBuckets, agingTile } from "./aging-core.ts";

const NOW = new Date("2026-09-07T12:00:00.000Z");

test("days listed counts whole days since the piece was created", () => {
 assert.equal(daysListed("2026-09-07T09:00:00.000Z", NOW), 0);
 assert.equal(daysListed("2026-09-06T12:00:00.000Z", NOW), 1);
 assert.equal(daysListed("2026-06-09T12:00:00.000Z", NOW), 90);
});

test("a missing date is unknown, not zero days", () => {
 assert.equal(daysListed(null, NOW), null);
 assert.equal(daysListed("not a date", NOW), null);
});

test("only live pieces age — sold, drafts and removed are not sitting on a rail", () => {
 const items = [
  { status: "active", createdAt: "2026-05-01T00:00:00.000Z" }, // 129 days
  { status: "active", createdAt: "2026-07-01T00:00:00.000Z" }, // 68 days
  { status: "active", createdAt: "2026-09-01T00:00:00.000Z" }, // 6 days
  { status: "sold", createdAt: "2026-01-01T00:00:00.000Z" },
  { status: "draft", createdAt: "2026-01-01T00:00:00.000Z" },
 ];
 const b = agingBuckets(items, NOW);
 assert.equal(b.over90, 1);
 assert.equal(b.over60, 2); // includes the over-90 one
 assert.equal(b.live, 3);
});

test("the Home tile names the number that matters and stays quiet when there isn't one", () => {
 assert.equal(agingTile({ over90: 14, over60: 20, live: 200 }), "14 pieces over 90 days");
 assert.equal(agingTile({ over90: 1, over60: 1, live: 20 }), "1 piece over 90 days");
 assert.equal(agingTile({ over90: 0, over60: 3, live: 20 }), "3 pieces over 60 days");
 assert.equal(agingTile({ over90: 0, over60: 0, live: 20 }), null);
});
