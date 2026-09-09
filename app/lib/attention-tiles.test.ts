import { test } from "node:test";
import assert from "node:assert/strict";
import { homeTiles, HOME_TILE_COUNT, type Tile } from "./attention-tiles.ts";

// The four tiles across the top of Home. A seller saw eight, two of them zeros sitting above "21
// pieces failed to post", and said: "if they have 0 parcels and 0 offers then it should flag the
// other stuff". So: four slots, pressing things claim them first, and the resting four fill the rest.

const t = (id: string, count: number): Tile => ({ id: id as Tile["id"], label: id, count, href: `/${id}` });

// Everything Home can show, all non-zero — the ordering is what's under test.
const all = (counts: Partial<Record<string, number>>): Tile[] =>
 (["toShip", "offers", "drafts", "liveListings", "unanswered24h", "pickupsWaiting", "holdsToday", "payoutsDue", "crossListingFailed", "noPhoto", "unpriced", "lowConfidence", "costMissing", "aging"] as const)
  .map((id) => t(id, counts[id] ?? 0));

test("never shows more than four", () => {
 const out = homeTiles(all({ toShip: 1, offers: 2, unanswered24h: 3, holdsToday: 1, crossListingFailed: 9, unpriced: 4 }));
 assert.equal(out.length, HOME_TILE_COUNT);
});

test("a quiet store gets the resting four, in order", () => {
 const out = homeTiles(all({ drafts: 3, liveListings: 6 }));
 assert.deepEqual(out.map((o) => o.id), ["toShip", "drafts", "liveListings", "offers"]);
});

test("zero tiles never outrank something that needs doing", () => {
 // Her screenshot exactly: nothing to ship, no offers, but plenty wrong with the inventory.
 const out = homeTiles(all({ drafts: 3, liveListings: 6, crossListingFailed: 21, unpriced: 5, lowConfidence: 1, costMissing: 3 }));
 assert.deepEqual(out.map((o) => o.id), ["crossListingFailed", "unpriced", "lowConfidence", "costMissing"]);
 assert.ok(!out.some((o) => o.count === 0), "a zero tile took a slot from a real one");
});

test("a buyer waiting comes before anything wrong with the inventory", () => {
 const out = homeTiles(all({ toShip: 1, offers: 1, crossListingFailed: 21, unpriced: 5, noPhoto: 8 }));
 assert.deepEqual(out.map((o) => o.id), ["toShip", "offers", "crossListingFailed", "noPhoto"]);
});

test("pressing things are ranked by tier, not by how big the number is", () => {
 // 40 unpriced pieces do not outrank one person waiting on a parcel.
 const out = homeTiles(all({ toShip: 1, unpriced: 40, noPhoto: 30, costMissing: 20 }));
 assert.equal(out[0].id, "toShip");
});

test("partly busy: pressing first, then the resting order backfills", () => {
 const out = homeTiles(all({ offers: 2, drafts: 3, liveListings: 6 }));
 assert.deepEqual(out.map((o) => o.id), ["offers", "toShip", "drafts", "liveListings"]);
});

test("a tile is never shown twice when it is both pressing and resting", () => {
 const out = homeTiles(all({ toShip: 2, offers: 1, drafts: 3, liveListings: 6 }));
 assert.deepEqual(out.map((o) => o.id), ["toShip", "offers", "drafts", "liveListings"]);
 assert.equal(new Set(out.map((o) => o.id)).size, out.length);
});

test("a tile Home does not supply is simply absent", () => {
 // Home builds holds and aging itself and drops the server's copies, so they can be missing.
 const out = homeTiles([t("drafts", 3), t("liveListings", 6)]);
 assert.deepEqual(out.map((o) => o.id), ["drafts", "liveListings"]);
});

test("an unranked row still surfaces when it has a count, rather than vanishing", () => {
 // A new attention row added to attention-core but not to the ladder must not disappear silently.
 const out = homeTiles([t("drafts", 0), t("liveListings", 0), { id: "somethingNew" as Tile["id"], label: "new", count: 7, href: "/x" }]);
 assert.ok(out.some((o) => o.id === "somethingNew"), "an unranked non-zero row was dropped");
});

test("no tiles in, nothing out", () => {
 assert.deepEqual(homeTiles([]), []);
});
