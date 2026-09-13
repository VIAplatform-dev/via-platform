import { test } from "node:test";
import assert from "node:assert/strict";
import { membershipSubjects, mergeCapturedMembership, worthImporting, unreadCollectionSlugs, membershipToWrite, taggedSlugs, unfileVanished, rentOnlyAction, rentOnlyWarning } from "./capture-commerce-core.ts";

// ── a piece her shop only rents ──────────────────────────────────────────────────────────────────
// Venus Vintage rents most of its pieces and sells only some. A rent-only piece has no buy price,
// so it must never be for sale — but it is a real piece of her inventory, with a real rental price,
// so it is imported as a DRAFT (visible to her, never to a shopper) with its rental ladder saved.
// That is a data holding pattern, not a launch: nothing rents through VYA until she turns rentals on
// AND the checkout/cross-listing paths are built for it — see the phase-2 report.
test("a rent-only piece we have never imported is created as a new draft", () => {
 assert.equal(rentOnlyAction(null), "create-draft");
});

test("a rent-only piece already held here — draft or wrongly for sale — is refreshed as a draft", () => {
 // Five Venus pieces were imported at a RENTAL price as if it were the buy price — the Dior tan
 // gaucho heels at $25. Leaving them alone would keep those rows for sale at the wrong price.
 assert.equal(rentOnlyAction({ origin: "source", status: "active" }), "update-draft");
 assert.equal(rentOnlyAction({ origin: "source", status: "draft" }), "update-draft");
});

test("a rent-only piece the seller edited herself is left alone — her version wins", () => {
 assert.equal(rentOnlyAction({ origin: "user", status: "active" }), "skip");
});

test("a rent-only piece mid-checkout, already sold, or already removed is left alone", () => {
 for (const status of ["reserved", "sold", "removed"]) assert.equal(rentOnlyAction({ origin: "source", status }), "skip", status);
});

test("the rent-only note says how many were saved as drafts, and nothing when there are none", () => {
 assert.equal(rentOnlyWarning(0, 0), null);
 const many = rentOnlyWarning(113, 5) || "";
 assert.match(many, /113 pieces/);
 assert.match(many, /5 /);
 assert.match(many, /draft/i);
 assert.match(many, /not visible to shoppers/i);
 const one = rentOnlyWarning(1, 0) || "";
 assert.match(one, /1 piece /);
 assert.doesNotMatch(one, /moved back/);
});

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

// ── Who the membership pass is ABOUT ─────────────────────────────────────────────────────────────
// The pass walked `products` — whatever the feed read returned in the SAME invocation — and looked
// each one up in the database. On a small store that is invisible: one read returns the whole
// catalogue, so "what the feed returned" and "what we hold" are the same list.
//
// They come apart completely on a large one. 2nd Street's shop holds 5,289 items; a feed read
// against a rate-limited storefront returned 72. So the pass read up to 300 of her collections from
// her live site — ten minutes of requests — and could then file at most those 72 pieces. It reported
// success and wrote nothing. Every one of her 761 collection pages would have been empty.
//
// The collection read is the authority on membership, and it is keyed by source id, not by whether
// a product happened to appear in this run's feed. So the subjects are the items we HOLD.

test("membershipSubjects: every held item is a subject, not just the ones this feed read returned", () => {
 const items = [
  { id: "i1", sourceId: "h1", title: "Silk Slip", origin: "import" },
  { id: "i2", sourceId: "h2", title: "Beaded Clutch", origin: "import" },
  { id: "i3", sourceId: "h3", title: "Wool Coat", origin: "import" },
 ];
 const products = [{ sourceId: "h2", name: "Beaded Clutch", tags: ["bags"] }];
 const subjects = membershipSubjects(items, products);
 assert.deepEqual(subjects.map((s) => s.itemId), ["i1", "i2", "i3"]);
});

test("membershipSubjects: the feed's tags ride along when the feed saw the piece", () => {
 const items = [
  { id: "i1", sourceId: "h1", title: "Silk Slip", origin: "import" },
  { id: "i2", sourceId: "h2", title: "Beaded Clutch", origin: "import" },
 ];
 const products = [{ sourceId: "h2", name: "Beaded Clutch", tags: ["bags", "evening"] }];
 const subjects = membershipSubjects(items, products);
 assert.deepEqual(subjects.find((s) => s.itemId === "i2")!.tags, ["bags", "evening"]);
 // Tags only ever vote on collections we could NOT read (see taggedSlugs), so a piece the feed
 // missed simply gets no tag vote — never a guess in place of one.
 assert.deepEqual(subjects.find((s) => s.itemId === "i1")!.tags, []);
});

test("membershipSubjects: a piece the seller filed herself is left alone", () => {
 // Same rule the old loop enforced with `if (item.origin === "user") continue`. A seller who has
 // organised her own collections owns that decision.
 const items = [
  { id: "i1", sourceId: "h1", title: "Silk Slip", origin: "user" },
  { id: "i2", sourceId: "h2", title: "Beaded Clutch", origin: "import" },
 ];
 assert.deepEqual(membershipSubjects(items, []).map((s) => s.itemId), ["i2"]);
});

test("membershipSubjects: an old row with no source id is still matched by title", () => {
 // Rows imported before source identity existed carry no sourceId — the legacy byTitle fallback.
 const items = [{ id: "i1", sourceId: null, title: "Silk  SLIP ", origin: "import" }];
 const products = [{ sourceId: "h9", name: "silk slip", tags: ["dresses"] }];
 const s = membershipSubjects(items, products);
 assert.equal(s.length, 1);
 assert.deepEqual(s[0].tags, ["dresses"], "matched to the feed row by title");
 assert.equal(s[0].sourceId, "h9", "and adopts the source id the feed knows it by");
});

test("membershipSubjects: two held rows never fight over one feed row", () => {
 // A title collision must not let one feed row's tags attach to two different pieces.
 const items = [
  { id: "i1", sourceId: null, title: "Silk Slip", origin: "import" },
  { id: "i2", sourceId: null, title: "Silk Slip", origin: "import" },
 ];
 const products = [{ sourceId: "h1", name: "Silk Slip", tags: ["dresses"] }];
 const s = membershipSubjects(items, products);
 assert.equal(s.length, 2);
 assert.equal(s.filter((x) => x.sourceId === "h1").length, 1, "only one row claims the feed row");
});

// ── Collections we could not read live ───────────────────────────────────────────────────────────
// A collection the live pass could not reach — throttled, or past the ceiling — holds nothing at
// all. 461 of 2nd Street's 761 are in that position on every run. But we have already downloaded
// its page: the crawl stored /collections/{slug} along with 941 others. Reading membership off the
// page we already paid for costs no requests at all.
//
// It is a WORSE source than the live read: page one only, frozen at crawl day. So it is additive
// and it never wins. Where we read the collection live, the live answer stands; where we did not,
// stale-and-partial beats empty. And the collection stays marked unread either way, so nothing we
// already hold can be removed on the strength of a captured page.

test("mergeCapturedMembership: an unread collection is filled from the page we already have", () => {
 const live = new Map<string, string[]>([["h1", ["dresses"]]]);
 const captured = new Map<string, string[]>([["boots", ["h1", "h2"]]]);
 const out = mergeCapturedMembership(live, captured, new Set(["boots"]));
 assert.deepEqual(out.get("h1"), ["dresses", "boots"], "added, and the live answer is kept");
 assert.deepEqual(out.get("h2"), ["boots"], "a piece the live read never mentioned is still filed");
});

test("mergeCapturedMembership: a collection we DID read live is never overridden by a stale page", () => {
 // She emptied "dresses" and we read that correctly. The captured page is from crawl day and still
 // shows the old contents — believing it would put her archive back, which is the whole failure
 // mode the sold-policy and unread work exists to prevent.
 const live = new Map<string, string[]>();
 const captured = new Map<string, string[]>([["dresses", ["h1", "h2"]]]);
 const out = mergeCapturedMembership(live, captured, new Set());
 assert.equal(out.size, 0, "read live and empty means empty");
});

test("mergeCapturedMembership: filing a piece twice does not duplicate it", () => {
 const live = new Map<string, string[]>([["h1", ["boots"]]]);
 const captured = new Map<string, string[]>([["boots", ["h1"]]]);
 const out = mergeCapturedMembership(live, captured, new Set(["boots"]));
 assert.deepEqual(out.get("h1"), ["boots"]);
});

test("mergeCapturedMembership: the live map is not mutated", () => {
 const live = new Map<string, string[]>([["h1", ["dresses"]]]);
 const out = mergeCapturedMembership(live, new Map([["boots", ["h1"]]]), new Set(["boots"]));
 assert.deepEqual(live.get("h1"), ["dresses"], "caller's map untouched");
 assert.deepEqual(out.get("h1"), ["dresses", "boots"]);
});
