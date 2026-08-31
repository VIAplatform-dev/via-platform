import { test } from "node:test";
import assert from "node:assert/strict";
import { worthImporting, unreadCollectionSlugs, membershipToWrite, taggedSlugs, unfileVanished } from "./capture-commerce-core.ts";

// ── a piece she has sold and zeroed the price on ─────────────────────────────────────────────────
test("a SOLD piece with no price is still imported", () => {
 // bag-crush keeps 24 sold pieces published with 19–28 photographs each and the price zeroed —
 // Chanel Mademoiselle Flap, a Louis Vuitton Multi Pochette, a Chanel Classic Flap. Every one was
 // dropped by `!cents`, so her archive was 24 of her best pieces smaller on our copy, silently.
 //
 // The Squarespace reader in this same codebase already got this right: "Keep sold items even
 // though Squarespace zeroes their price; only skip a LIVE item that has no price." The Shopify
 // path skipped all of them.
 assert.equal(worthImporting({ title: "Chanel Mademoiselle Flap", cents: 0, available: false }), true);
});

test("a LIVE piece with no price is still skipped", () => {
 // Nobody can buy this, and showing it offers a price we do not have. That is the case the rule
 // was written for, and it stays.
 assert.equal(worthImporting({ title: "Draft listing", cents: 0, available: true }), false);
});

test("a piece with no title is skipped whatever else it has", () => {
 assert.equal(worthImporting({ title: "", cents: 5000, available: true }), false);
 assert.equal(worthImporting({ title: "   ", cents: 0, available: false }), false);
});

test("an ordinary priced piece is imported", () => {
 assert.equal(worthImporting({ title: "Gucci bag", cents: 42000, available: true }), true);
 assert.equal(worthImporting({ title: "Gucci bag", cents: 42000, available: false }), true);
});

test("availability we could not read is treated as live, so a priceless piece is not imported", () => {
 // `undefined` means the feed did not say. Guessing "sold" would import every draft with no price.
 assert.equal(worthImporting({ title: "Unknown", cents: 0, available: undefined }), false);
});

// ── a collection the seller has emptied ──────────────────────────────────────────────────────────
test("a collection that read cleanly and came back empty is believed", () => {
 // shop-vintage-charm's "USA" shows 34 pieces on our copy and NOTHING on hers. Same for frames (21),
 // plates-bowls (26), boots and flats on ascensio. 86 products in categories the sellers cleared out
 // months ago — frozen because an empty answer was read as a failed read, every single run, while
 // she was told "we couldn't read these, re-run the import" for a problem that does not exist.
 // A realistic store: 267 collections, of which she has cleared one. The fixture matters — with a
 // single collection, "one emptied" is the whole shop and the mass-emptying guard rightly fires.
 assert.deepEqual(unreadCollectionSlugs({
  readCount: new Map([["dresses", 40], ["bags", 12], ["jewelry", 9]]),
  storedCount: new Map([["usa", 34], ["dresses", 40], ["bags", 12], ["jewelry", 9]]),
  completed: new Set(["usa", "dresses", "bags", "jewelry"]),
 }), []);
});

test("a collection that came back empty WITHOUT a clean read is still protected", () => {
 // The original fear, and it stands: a read that failed must never empty a curated collection.
 // Erring this way once cost a store 417 memberships in a single re-run.
 assert.deepEqual(unreadCollectionSlugs({
  readCount: new Map([["dresses", 40], ["bags", 12]]),
  storedCount: new Map([["usa", 34], ["dresses", 40], ["bags", 12]]),
  completed: new Set(["dresses", "bags"]),
 }), ["usa"]);
});

test("a whole store going empty at once is refused, however clean each read looked", () => {
 // One seller clearing one category is ordinary. Every category emptying in the same pass is a
 // store-wide failure wearing an ordinary answer — the same shape the product sweep guard already
 // refuses. We would rather serve a stale collection than empty a seller's shop.
 const stored = new Map([["a", 10], ["b", 10], ["c", 10], ["d", 10]]);
 const got = unreadCollectionSlugs({ readCount: new Map(), storedCount: stored, completed: new Set(["a", "b", "c", "d"]) });
 assert.deepEqual(got.sort(), ["a", "b", "c", "d"]);
});

test("a minority emptying is believed, and the rest are untouched", () => {
 const stored = new Map([["a", 10], ["b", 10], ["c", 10], ["d", 10], ["e", 10], ["f", 10]]);
 const readCount = new Map([["b", 10], ["c", 10], ["d", 10], ["e", 10], ["f", 10]]);
 assert.deepEqual(unreadCollectionSlugs({ readCount, storedCount: stored, completed: new Set(["a", "b", "c", "d", "e", "f"]) }), []);
});

test("collections the fetch layer already failed on are always unread", () => {
 assert.deepEqual(unreadCollectionSlugs({
  readCount: new Map(), storedCount: new Map(), unread: ["throttled"], completed: new Set(),
 }), ["throttled"]);
});

test("a collection we hold nothing for is nobody's business", () => {
 assert.deepEqual(unreadCollectionSlugs({ readCount: new Map(), storedCount: new Map([["x", 0]]), completed: new Set(["x"]) }), []);
});

// ── an item the feed no longer files anywhere ────────────────────────────────────────────────────
test("a piece the feed places in no collection is REMOVED from the ones we read", () => {
 // The other half of the empty-collection bug. Believing an empty read was not enough: the item
 // loop skipped any piece the feed placed nowhere, so its old links were never rewritten and it
 // stayed in the category for ever. shop-vintage-charm's "USA" kept all 34 pieces even after the
 // guard stopped calling the read a failure.
 assert.deepEqual(membershipToWrite({ fromFeed: [], held: ["usa", "frames"], unread: [] }), []);
});

test("but it KEEPS its place in collections we could not read", () => {
 // setItemCollections REPLACES an item's collections, so a set built while a listing was throttled
 // would delete everything that listing would have confirmed. One throttled read once turned
 // "34 pieces in Best Dressed Guest" into 13.
 assert.deepEqual(membershipToWrite({ fromFeed: [], held: ["usa", "frames"], unread: ["frames"] }), ["frames"]);
});

test("the feed's answer wins where we have one", () => {
 assert.deepEqual(membershipToWrite({ fromFeed: ["dresses"], held: ["usa"], unread: [] }), ["dresses"]);
});

test("feed and preserved are merged without duplicates", () => {
 assert.deepEqual(
  membershipToWrite({ fromFeed: ["dresses", "bags"], held: ["bags", "usa"], unread: ["bags"] }).sort(),
  ["bags", "dresses"],
 );
});

test("taggedSlugs: a tag cannot file a piece into a collection whose listing we read", () => {
 // ascensio's three Prada/Mulberry boots are all still tagged "Boots", but she emptied her Boots
 // collection when they sold. We read that collection to the end — so the tag is a stale guess and
 // the read is the answer. Filing them back is how her empty collection kept showing 3 sold pairs.
 const out = taggedSlugs({ tags: ["Boots", "Prada"], known: new Set(["boots"]), unread: new Set() });
 assert.deepEqual(out, []);
});

test("taggedSlugs: a tag still files when we could NOT read that collection", () => {
 // Squarespace and any throttled read land here: the tag is the only signal we have, so it stands.
 const out = taggedSlugs({ tags: ["Boots"], known: new Set(["boots"]), unread: new Set(["boots"]) });
 assert.deepEqual(out, ["boots"]);
});

test("taggedSlugs: tags naming no collection of ours are ignored either way", () => {
 assert.deepEqual(taggedSlugs({ tags: ["SS2003", "archive"], known: new Set(["boots"]), unread: new Set(["boots"]) }), []);
});

test("unfileVanished: a piece her store no longer lists leaves the collections we read", () => {
 // blummier's Chantal Thomass corset sold and she deleted it — it is in none of her 157 products.
 // The membership loop only walks pieces the feed still returns, so its old links stood for ever.
 const out = unfileVanished({ held: new Map([["i1", ["c1", "c2"]]]), vanished: new Set(["i1"]), unread: [] });
 assert.deepEqual([...out], [["i1", []]]);
});

test("unfileVanished: it keeps its place in collections we could not read", () => {
 const out = unfileVanished({ held: new Map([["i1", ["c1", "c2"]]]), vanished: new Set(["i1"]), unread: ["c2"] });
 assert.deepEqual([...out], [["i1", ["c2"]]]);
});

test("unfileVanished: a piece still listed on her site is never touched here", () => {
 // The main loop owns those. Touching them from two places is how curation gets clobbered.
 const out = unfileVanished({ held: new Map([["i1", ["c1"]]]), vanished: new Set(), unread: [] });
 assert.equal(out.size, 0);
});

test("unfileVanished: no write when there is nothing to unfile", () => {
 const out = unfileVanished({ held: new Map(), vanished: new Set(["i1"]), unread: [] });
 assert.equal(out.size, 0);
});
