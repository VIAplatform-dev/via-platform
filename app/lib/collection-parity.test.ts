import { test } from "node:test";
import assert from "node:assert/strict";
import { compareCollections } from "./collection-parity.ts";

// The seller's feed lists the pieces still on their site. We keep pieces that vanished from it
// (marked no-longer-available), so a raw row count on our side is never comparable to theirs.
const live = new Set(["a", "b", "c", "d", "e"]);

test("a piece that vanished from the seller's feed does not count as a difference", () => {
 // Their "resort" rail lists 3 pieces; we hold those 3 plus one that vanished from their feed.
 const r = compareCollections({
  source: [{ handle: "resort", count: 3 }],
  ours: new Map([["resort", ["a", "b", "c", "gone-from-their-site"]]]),
  liveSourceIds: live,
 });
 assert.equal(r.collectionsExact, 1);
 assert.deepEqual(r.collectionsOff, []);
});

test("a real shortfall is still reported, counting only pieces they still list", () => {
 const r = compareCollections({
  source: [{ handle: "tops", count: 5 }],
  ours: new Map([["tops", ["a", "b", "vanished"]]]),
  liveSourceIds: live,
 });
 assert.equal(r.collectionsExact, 0);
 assert.deepEqual(r.collectionsOff, ["tops 2/5"]);
});

test("a collection we could not read from their site is not reported as a difference", () => {
 // A throttled or failed read is not evidence that the collection is empty.
 const r = compareCollections({
  source: [{ handle: "usa", count: 0, unread: true }],
  ours: new Map([["usa", ["a", "b", "c"]]]),
  liveSourceIds: live,
 });
 assert.deepEqual(r.collectionsOff, []);
 assert.deepEqual(r.collectionsUnread, ["usa"]);
 assert.equal(r.collections, 0, "an unread collection is not part of the comparison at all");
});

test("an empty 200 from their site is treated as unread, not as an empty collection", () => {
 const r = compareCollections({
  source: [{ handle: "beaded", count: 0 }],
  ours: new Map([["beaded", ["a", "b"]]]),
  liveSourceIds: live,
 });
 assert.deepEqual(r.collectionsOff, []);
 assert.deepEqual(r.collectionsUnread, ["beaded"]);
});

test("a collection genuinely empty on both sides still matches", () => {
 const r = compareCollections({
  source: [{ handle: "empty", count: 0 }],
  ours: new Map([["empty", []]]),
  liveSourceIds: live,
 });
 assert.deepEqual(r.collectionsUnread, []);
 assert.equal(r.collectionsExact, 1);
});

test("a read that hit our page cap is not reported as a difference", () => {
 const r = compareCollections({
  source: [{ handle: "all-items", count: 1500, truncated: true }],
  ours: new Map([["all-items", ["a", "b", "c", "d", "e"]]]),
  liveSourceIds: live,
 });
 assert.deepEqual(r.collectionsOff, []);
 assert.equal(r.collections, 0);
});

test("a collection on their site that we never created is missing here — except Shopify's catch-all", () => {
 const r = compareCollections({
  source: [{ handle: "gucci", count: 24 }, { handle: "all", count: 900 }],
  ours: new Map(),
  liveSourceIds: live,
 });
 assert.deepEqual(r.collectionsMissingHere, ["gucci"]);
});

test("collectionsOff is capped so a broken store cannot flood the seller's page", () => {
 const source = Array.from({ length: 12 }, (_, i) => ({ handle: `c${i}`, count: 5 }));
 const ours = new Map(source.map((c) => [c.handle, ["a"]]));
 const r = compareCollections({ source, ours, liveSourceIds: live });
 assert.equal(r.collectionsOff.length, 8);
 assert.equal(r.collections - r.collectionsExact, 12, "the count still reflects every mismatch");
});

// ── what we SERVE vs what we FILED ───────────────────────────────────────────────────────────────
// Everything above compares our filing cabinet with the seller's site. That is not enough: a rail
// can hold 94 pieces in the database and still serve 401 to a shopper. This compares the page.

test("a rail that serves more pieces than were filed in it is our bug, and is named", () => {
 const r = compareCollections({
  source: [{ handle: "dresses", count: 81 }],
  ours: new Map([["dresses", ["a", "b", "c"]]]),
  liveSourceIds: live,
  served: new Map([["dresses", 401]]),
 });
 assert.deepEqual(r.collectionsInflated, ["dresses 401/3"]);
});

test("a rail that serves exactly what was filed in it is not flagged", () => {
 const r = compareCollections({
  source: [{ handle: "resort", count: 3 }],
  ours: new Map([["resort", ["a", "b", "c"]]]),
  liveSourceIds: live,
  served: new Map([["resort", 3]]),
 });
 assert.deepEqual(r.collectionsInflated, []);
});

test("a rail serving FEWER pieces than were filed is flagged too — a rail can go missing as well as bloat", () => {
 const r = compareCollections({
  source: [{ handle: "tops", count: 3 }],
  ours: new Map([["tops", ["a", "b", "c"]]]),
  liveSourceIds: live,
  served: new Map([["tops", 0]]),
 });
 assert.deepEqual(r.collectionsInflated, ["tops 0/3"]);
});

test("a page whose size we could not read is not accused of anything", () => {
 // An older capture with no stamp, or a page that failed to load. Silence, not a false alarm.
 const r = compareCollections({
  source: [{ handle: "dresses", count: 3 }],
  ours: new Map([["dresses", ["a", "b", "c"]]]),
  liveSourceIds: live,
  served: new Map([["dresses", null]]),
 });
 assert.deepEqual(r.collectionsInflated, []);
});

test("served counts are compared against everything filed, not just what the seller still lists", () => {
 // The page serves sold and vanished pieces too, so the comparison is against raw membership —
 // otherwise every rail holding a sold piece would look inflated.
 const r = compareCollections({
  source: [{ handle: "resort", count: 2 }],
  ours: new Map([["resort", ["a", "b", "gone-from-their-site"]]]),
  liveSourceIds: live,
  served: new Map([["resort", 3]]),
 });
 assert.deepEqual(r.collectionsInflated, [], "3 served, 3 filed — correct");
 assert.equal(r.collectionsExact, 1, "…and against their site it is still an exact match");
});

test("with no served counts supplied at all, nothing is flagged", () => {
 const r = compareCollections({ source: [{ handle: "x", count: 1 }], ours: new Map([["x", ["a"]]]), liveSourceIds: live });
 assert.deepEqual(r.collectionsInflated, []);
});

// A page that never claimed to follow our filing cannot be faulted for differing from it.
test("a page serving what the captured page showed is not accused of inventing stock", () => {
 // blummier: her Gucci collection holds 24 pieces on her site, our membership sync could not read
 // it, so the page serves the 16 the captured page named. Reporting that as "showing pieces you
 // didn't put in them" flagged 26 collections that were doing the best available thing.
 const r = compareCollections({
  source: [{ handle: "gucci", count: 24 }],
  ours: new Map([["gucci", []]]),
  liveSourceIds: live,
  served: new Map([["gucci", 16]]),
  servedSource: new Map([["gucci", "captured"]]),
 });
 assert.deepEqual(r.collectionsInflated, []);
});

test("a page that DID claim to follow our filing is still held to it", () => {
 const r = compareCollections({
  source: [{ handle: "dresses", count: 81 }],
  ours: new Map([["dresses", ["a", "b", "c"]]]),
  liveSourceIds: live,
  served: new Map([["dresses", 401]]),
  servedSource: new Map([["dresses", "filed"]]),
 });
 assert.deepEqual(r.collectionsInflated, ["dresses 401/3"]);
});

test("a page declaring itself empty must actually be empty", () => {
 const r = compareCollections({
  source: [{ handle: "alaia", count: 0, unread: true }],
  ours: new Map([["alaia", []]]),
  liveSourceIds: live,
  served: new Map([["alaia", 7]]),
  servedSource: new Map([["alaia", "empty"]]),
 });
 assert.deepEqual(r.collectionsInflated, ["alaia 7/0"]);
});

test("an older page with no declared source is still checked against our filing", () => {
 // Absence of the stamp must not become a way to escape the check.
 const r = compareCollections({
  source: [{ handle: "x", count: 5 }],
  ours: new Map([["x", ["a"]]]),
  liveSourceIds: live,
  served: new Map([["x", 99]]),
 });
 assert.deepEqual(r.collectionsInflated, ["x 99/1"]);
});

test("a page serving the captured copy is compared on what it SHOWS, not on what we filed", () => {
 // blummier's Gucci: her site has 24, we filed 0 (the sync could not read it), and the page serves
 // the 16 the captured copy named. Reporting "0 of 24" told her the page was empty when a shopper
 // sees 16 — an overstatement of her problem by 16 pieces. The gap is 8, and that is what to say.
 const r = compareCollections({
  source: [{ handle: "gucci", count: 24 }],
  ours: new Map([["gucci", []]]),
  liveSourceIds: live,
  served: new Map([["gucci", 16]]),
  servedSource: new Map([["gucci", "captured"]]),
 });
 assert.deepEqual(r.collectionsOff, ["gucci 16/24"]);
 assert.deepEqual(r.collectionsInflated, [], "and still not called a fault");
});

test("a page serving our filing is still compared on the filing, like for like", () => {
 // Here the filed comparison is the right one: it excludes pieces that vanished from the seller's
 // feed, which the served count deliberately keeps.
 const r = compareCollections({
  source: [{ handle: "resort", count: 3 }],
  ours: new Map([["resort", ["a", "b", "c", "vanished"]]]),
  liveSourceIds: live,
  served: new Map([["resort", 4]]),
  servedSource: new Map([["resort", "filed"]]),
 });
 assert.equal(r.collectionsExact, 1, "3 of theirs, 3 of ours still listed — a match");
});

// ── comparing pieces, not counts ─────────────────────────────────────────────────────────────────
// Counts cannot be made to work here. Sellers' collection feeds treat sold pieces differently:
// ascensio-demo's DROPS them (its 31-piece "dresses" reads 21 on their side, and 21 is our active
// count), while sourcedbyscottie's KEEPS them (its 51-piece "resort" reads 50). No subtraction rule
// is right for both, so the comparison uses the handles their feed actually returned.

test("pieces their feed drops because they sold are not counted against us", () => {
 // ascensio-demo's shape: we hold 5, they list the 2 that are still live.
 const r = compareCollections({
  source: [{ handle: "dresses", count: 2, handles: ["a", "b"] }],
  ours: new Map([["dresses", ["a", "b", "sold-1", "sold-2", "sold-3"]]]),
  ourActive: new Set(["a", "b"]),
  liveSourceIds: new Set(["a", "b", "sold-1", "sold-2", "sold-3"]),
 });
 assert.equal(r.collectionsExact, 1);
 assert.deepEqual(r.collectionsOff, []);
});

test("pieces their feed keeps because they are still listed sold-out also match", () => {
 // sourcedbyscottie's shape: they list all three, one of which is sold. So do we.
 const r = compareCollections({
  source: [{ handle: "resort", count: 3, handles: ["a", "b", "sold-1"] }],
  ours: new Map([["resort", ["a", "b", "sold-1"]]]),
  ourActive: new Set(["a", "b"]),
  liveSourceIds: new Set(["a", "b", "sold-1"]),
 });
 assert.equal(r.collectionsExact, 1);
});

test("a piece on their page that we do not have is a real gap", () => {
 const r = compareCollections({
  source: [{ handle: "gucci", count: 3, handles: ["a", "b", "c"] }],
  ours: new Map([["gucci", ["a", "b"]]]),
  ourActive: new Set(["a", "b"]),
  liveSourceIds: new Set(["a", "b", "c"]),
 });
 assert.deepEqual(r.collectionsOff, ["gucci 2/3"]);
});

test("a LIVE piece we show that their page does not is a real extra", () => {
 // Still for sale on their site, just not in this collection any more. A shopper sees it here and
 // not there — the drift that matters.
 const r = compareCollections({
  source: [{ handle: "dresses", count: 1, handles: ["a"] }],
  ours: new Map([["dresses", ["a", "moved-away"]]]),
  ourActive: new Set(["a", "moved-away"]),
  liveSourceIds: new Set(["a", "moved-away"]),
 });
 assert.deepEqual(r.collectionsOff, ["dresses 2/1"]);
});

test("a sold piece we keep that their page dropped is never an extra", () => {
 const r = compareCollections({
  source: [{ handle: "dresses", count: 1, handles: ["a"] }],
  ours: new Map([["dresses", ["a", "sold-1"]]]),
  ourActive: new Set(["a"]),
  liveSourceIds: new Set(["a", "sold-1"]),
 });
 assert.equal(r.collectionsExact, 1);
});

test("with no handles from their feed, the old count comparison still runs", () => {
 // Older reports, and any feed that gives us a count without the pieces. Must not crash or silently
 // start passing everything.
 const r = compareCollections({
  source: [{ handle: "x", count: 5 }],
  ours: new Map([["x", ["a"]]]),
  liveSourceIds: new Set(["a"]),
 });
 assert.deepEqual(r.collectionsOff, ["x 1/5"]);
});

test("a piece the seller shows but does not sell is not counted against us", () => {
 // blummier's john-galliano-fall-2005-pink-floral-silk-dress and fall-1994-black-maxi-dress: nine
 // and seven photos each, £0.00, available:false. Archive display pieces. The importer skips them on
 // purpose and the CATALOGUE check excludes them on purpose ("0 missing") — but the collection
 // comparison counted them, so her archive read 42/44 and clothing 110/112 for pieces that are not
 // for sale and never should have been imported.
 const r = compareCollections({
  source: [{ handle: "archive", count: 4, handles: ["a", "b", "display-1", "display-2"] }],
  ours: new Map([["archive", ["a", "b"]]]),
  ourActive: new Set(["a", "b"]),
  liveSourceIds: new Set(["a", "b", "display-1", "display-2"]),
  unsellable: new Set(["display-1", "display-2"]),
 });
 assert.equal(r.collectionsExact, 1);
 assert.deepEqual(r.collectionsOff, []);
});

test("a sellable piece missing from a collection is still a real gap", () => {
 const r = compareCollections({
  source: [{ handle: "archive", count: 3, handles: ["a", "b", "real-gap"] }],
  ours: new Map([["archive", ["a", "b"]]]),
  ourActive: new Set(["a", "b"]),
  liveSourceIds: new Set(["a", "b", "real-gap"]),
  unsellable: new Set(["display-1"]),
 });
 assert.deepEqual(r.collectionsOff, ["archive 2/3"]);
});
