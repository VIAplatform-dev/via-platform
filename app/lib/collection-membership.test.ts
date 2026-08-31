import { test } from "node:test";
import assert from "node:assert/strict";
import { readCollectionMembership, type CollectionPageFetch } from "./collection-membership.ts";

/** A fake store: slug → the pages it would return. `null` in a slot means the read failed. */
function store(pages: Record<string, (string[] | null)[]>): { fetch: CollectionPageFetch; calls: string[] } {
 const calls: string[] = [];
 const fetch: CollectionPageFetch = async (slug, page) => {
  calls.push(`${slug}#${page}`);
  const got = pages[slug]?.[page - 1];
  if (got === null) return null;
  return (got ?? []).map((handle) => ({ handle }));
 };
 return { fetch, calls };
}

const noWait = async () => {};

test("every collection is read, not the first 25", () => {
 // The cap was the whole disease. shop-vintage-charm has 267 collections and 197 of them hold
 // nothing; blummier has 76 and 47 hold nothing. In both cases the number never attempted lines up
 // with the number left empty. Those pages then fell back to the captured copy, or to the whole shop.
 const slugs = Array.from({ length: 60 }, (_, i) => `c${i}`);
 const pages = Object.fromEntries(slugs.map((s) => [s, [[`p-${s}`]]]));
 const { fetch, calls } = store(pages);
 return readCollectionMembership(slugs, { fetchPage: fetch, wait: noWait }).then((r) => {
  assert.equal(calls.length, 60, "one read per collection");
  assert.equal(r.membership.size, 60);
  assert.deepEqual(r.incomplete, []);
 });
});

test("reads are paced, so we stop being throttled in the first place", async () => {
 const waited: number[] = [];
 const { fetch } = store({ a: [["x"]], b: [["y"]], c: [["z"]] });
 await readCollectionMembership(["a", "b", "c"], { fetchPage: fetch, wait: async (ms) => { waited.push(ms); }, delayMs: 700 });
 assert.deepEqual(waited, [700, 700], "a pause between collections, but not before the first or after the last");
});

test("an empty answer is retried before it is believed", async () => {
 // `200 {"products":[]}` is what a busy Shopify returns AND what an empty collection returns. The
 // product feed already learned to ask twice; this never did, so a throttled read was recorded as
 // "this collection is genuinely empty".
 let asked = 0;
 const fetchPage: CollectionPageFetch = async () => (++asked === 1 ? [] : [{ handle: "came-back" }]);
 const r = await readCollectionMembership(["gucci"], { fetchPage, wait: noWait });
 assert.equal(asked, 2, "asked again rather than believing the first empty answer");
 assert.deepEqual([...r.membership.keys()], ["came-back"]);
 assert.deepEqual(r.incomplete, []);
});

test("an answer that is empty twice is a genuinely empty collection", async () => {
 // blummier's alaia, blumarine and fendi really are empty on her own site. Empty is the right answer
 // and must be recorded as a COMPLETE read, or the collection is left alone for ever.
 const { fetch } = store({ alaia: [[], []] });
 const r = await readCollectionMembership(["alaia"], { fetchPage: fetch, wait: noWait });
 assert.equal(r.membership.size, 0);
 assert.deepEqual(r.incomplete, [], "empty, and we are sure of it");
});

test("a collection we could not read is reported, never treated as empty", async () => {
 const { fetch } = store({ gucci: [null] });
 const r = await readCollectionMembership(["gucci"], { fetchPage: fetch, wait: noWait });
 assert.deepEqual(r.incomplete, ["gucci"]);
});

test("a full page means there is more to fetch", async () => {
 const full = Array.from({ length: 250 }, (_, i) => `p${i}`);
 const { fetch, calls } = store({ big: [full, ["p250"]] });
 const r = await readCollectionMembership(["big"], { fetchPage: fetch, wait: noWait });
 assert.deepEqual(calls, ["big#1", "big#2"]);
 assert.equal(r.membership.size, 251);
 assert.deepEqual(r.incomplete, []);
});

test("a store with more collections than we will ever read says so", async () => {
 // A cap still exists so one pathological store cannot pin a fleet run open — but hitting it is
 // recorded, not silent. Silence is what made 25 look like "we read them all".
 const slugs = Array.from({ length: 5 }, (_, i) => `c${i}`);
 const { fetch, calls } = store(Object.fromEntries(slugs.map((s) => [s, [["x"]]])));
 const r = await readCollectionMembership(slugs, { fetchPage: fetch, wait: noWait, maxCollections: 3 });
 assert.equal(calls.length, 3);
 assert.deepEqual(r.notAttempted, ["c3", "c4"]);
});

test("a piece in two collections is recorded in both", async () => {
 const { fetch } = store({ dresses: [["silk-slip"]], archive: [["silk-slip"]] });
 const r = await readCollectionMembership(["dresses", "archive"], { fetchPage: fetch, wait: noWait });
 assert.deepEqual([...(r.membership.get("silk-slip") ?? [])].sort(), ["archive", "dresses"]);
});

// ── when the store says stop ──────────────────────────────────────────────────────────────────────
// blummier answers 11 of her 76 collections with HTTP 429 — and they are every collection from
// "ralph-lauren" to the end of the alphabet. We read in alphabetical order, so what actually happens
// is her store puts up a wall two thirds of the way through and we bounce off it for the rest of the
// run. The unread ones are not bad collections; they are wherever we happened to be when it said stop.

test("when the store says stop, we wait as long as it asked and try that collection again", async () => {
 const waited: number[] = [];
 let asked = 0;
 const fetchPage = async () => (++asked === 1 ? { throttled: true as const, retryAfterMs: 9000 } : [{ handle: "got-it" }]);
 const r = await readCollectionMembership(["versace"], { fetchPage, wait: async (ms) => { waited.push(ms); } });
 assert.ok(waited.includes(9000), `expected to honour the store's own Retry-After, waited ${waited}`);
 assert.deepEqual([...r.membership.keys()], ["got-it"]);
 assert.deepEqual(r.incomplete, []);
});

test("with no Retry-After we back off for seconds, not milliseconds", async () => {
 // The old code waited ~1s and gave up. A rate limit does not lift in a second, so the rest of the
 // store was lost.
 const waited: number[] = [];
 let asked = 0;
 const fetchPage = async () => (++asked === 1 ? { throttled: true as const } : []);
 await readCollectionMembership(["shoes"], { fetchPage, wait: async (ms) => { waited.push(ms); } });
 assert.ok(Math.max(...waited) >= 5000, `expected a multi-second backoff, waited ${waited}`);
});

test("after a refusal we stay slower for the REST of the store, not just the next request", async () => {
 // Going straight back to the old pace is what kept us bouncing off the wall from R to Z.
 const waited: number[] = [];
 let asked = 0;
 const fetchPage = async (slug: string) => {
  asked++;
  if (slug === "b" && asked === 2) return { throttled: true as const };
  return [{ handle: `p-${slug}` }];
 };
 await readCollectionMembership(["a", "b", "c", "d"], { fetchPage, wait: async (ms) => { waited.push(ms); }, delayMs: 700 });
 const paces = waited.filter((ms) => ms < 5000);
 assert.ok(paces.at(-1)! > 700, `pace should have slowed after the refusal, got ${paces}`);
});

test("a store that will not stop refusing leaves the collection unread, never empty", async () => {
 // The one answer that must never come out of this: "that collection is empty". It blanks a page.
 const fetchPage = async () => ({ throttled: true as const });
 const r = await readCollectionMembership(["versace"], { fetchPage, wait: async () => {} });
 assert.deepEqual(r.incomplete, ["versace"]);
 assert.equal(r.membership.size, 0);
});

test("the slow-down has a ceiling, so one rude store cannot stall a run for ever", async () => {
 const waited: number[] = [];
 let n = 0;
 const fetchPage = async () => (++n % 2 === 1 ? { throttled: true as const } : [{ handle: `p${n}` }]);
 await readCollectionMembership(["a", "b", "c", "d", "e", "f"], { fetchPage, wait: async (ms) => { waited.push(ms); }, delayMs: 700 });
 assert.ok(Math.max(...waited) <= 60000, `backoff should be capped, saw ${Math.max(...waited)}`);
});

// ── a collection bigger than we will read ────────────────────────────────────────────────────────
// chill-boutique's catch-all holds 1,789 pieces; we filed 1,500 and said nothing. The ceiling was
// six pages of 250, and hitting it was recorded as a COMPLETE read — so the shortfall looked like
// the seller's drift rather than our own limit.

test("a collection bigger than the ceiling is reported, not silently truncated", async () => {
 // Distinct handles per page, so the count reflects how much we actually read.
 const page = (n: number) => Array.from({ length: 250 }, (_, i) => `p${n}-${i}`);
 const { fetch } = store({ "all-items": [page(1), page(2), page(3), page(4)] });
 const r = await readCollectionMembership(["all-items"], { fetchPage: fetch, wait: noWait, maxPages: 3 });
 assert.deepEqual(r.truncated, ["all-items"], "we must know we stopped short");
 assert.deepEqual(r.incomplete, [], "…but what we did read is still usable, so it is not 'unread'");
 assert.equal(r.membership.size, 750, "everything we managed to read is kept");
});

test("a collection that fits under the ceiling is not reported as truncated", async () => {
 const full = Array.from({ length: 250 }, (_, i) => `p${i}`);
 const { fetch } = store({ big: [full, ["last"]] });
 const r = await readCollectionMembership(["big"], { fetchPage: fetch, wait: noWait, maxPages: 3 });
 assert.deepEqual(r.truncated, []);
 assert.equal(r.membership.size, 251);
});

test("the default ceiling reaches past the biggest collection in the fleet", async () => {
 // chill-boutique's catch-all holds 1,789. The old ceiling was six pages of 250 = 1,500.
 const page = (n: number) => Array.from({ length: 250 }, (_, i) => `q${n}-${i}`);
 const { fetch } = store({ y: Array.from({ length: 8 }, (_, n) => page(n)) });
 const r = await readCollectionMembership(["y"], { fetchPage: fetch, wait: noWait });
 assert.equal(r.membership.size, 2000, "1,789 must be reachable; 2,000 proves the ceiling cleared it");
 assert.deepEqual(r.truncated, []);
});

// ── the ORDER the seller put her collection in ───────────────────────────────────────────────────
// Membership answers "which pieces"; it threw away "in what order", and the order was then read off
// the copy we took of the collection page on capture day — a photograph, never refreshed. A homepage
// rail is the most volatile part of a shop, so within days it is showing yesterday's pieces in
// yesterday's order. The feed we already page through IS the seller's order; keeping it costs
// nothing extra.

test("the seller's own order is kept, not just the membership", async () => {
 const { fetch } = store({ "crush-edit": [["lv-looping", "gucci-jackie", "dior-saddle"]] });
 const r = await readCollectionMembership(["crush-edit"], { fetchPage: fetch, wait: noWait });
 assert.deepEqual(r.order.get("crush-edit"), ["lv-looping", "gucci-jackie", "dior-saddle"]);
});

test("the order survives a collection that takes more than one page", async () => {
 // Page one is full, so there is a page two — and page two's pieces come AFTER page one's.
 const first = Array.from({ length: 250 }, (_, i) => `p${i}`);
 const { fetch } = store({ big: [first, ["tail-a", "tail-b"]] });
 const r = await readCollectionMembership(["big"], { fetchPage: fetch, wait: noWait });
 const order = r.order.get("big")!;
 assert.equal(order.length, 252, "both pages, in one list");
 assert.equal(order[0], "p0");
 assert.deepEqual(order.slice(-2), ["tail-a", "tail-b"], "page two follows page one");
});

test("a collection we could not read in full offers NO order", async () => {
 // Reordering from half a list is worse than leaving it alone: it would push everything we failed
 // to read to the bottom of the seller's rail. Same rule as the membership merge.
 const { fetch } = store({ dresses: [Array.from({ length: 250 }, (_, i) => `d${i}`), null] });
 const r = await readCollectionMembership(["dresses"], { fetchPage: fetch, wait: noWait });
 assert.deepEqual(r.incomplete, ["dresses"]);
 assert.equal(r.order.get("dresses"), undefined, "a partial list must not be offered as an order");
});

test("a piece listed twice in a collection appears once, at its first position", async () => {
 const { fetch } = store({ sale: [["a", "b", "a", "c"]] });
 const r = await readCollectionMembership(["sale"], { fetchPage: fetch, wait: noWait });
 assert.deepEqual(r.order.get("sale"), ["a", "b", "c"]);
});

test("her feed's availability is kept, not discarded", () => {
 // Whether a seller keeps sold pieces in a collection is written all over the pages we already
 // fetch — and we threw it away, exactly as we threw away the ORDER before that. Two features
 // running on data that was in our hands the whole time.
 const pages: Record<string, CollectionProduct[][]> = {
  keeps: [[{ handle: "a", variants: [{ available: true }] }, { handle: "b", variants: [{ available: false }] }]],
  drops: [[{ handle: "c", variants: [{ available: true }] }, { handle: "d", variants: [{ available: true }] }]],
 };
 return readCollectionMembership(["keeps", "drops"], {
  fetchPage: async (slug, page) => pages[slug]?.[page - 1] ?? [],
  wait: async () => {},
 }).then((r) => {
  assert.deepEqual(r.stock.get("keeps"), { unavailable: 1, total: 2 });
  assert.deepEqual(r.stock.get("drops"), { unavailable: 0, total: 2 });
 });
});

test("a collection we could not read reports no stock figures at all", () => {
 // Zero-of-zero would read as "she has no sold pieces", which is how a network error would come to
 // empty a seller's archive.
 return readCollectionMembership(["gone"], {
  fetchPage: async () => null,
  wait: async () => {},
 }).then((r) => assert.equal(r.stock.get("gone"), undefined));
});

test("a product with no variants counts as unavailable, not as absent", () => {
 return readCollectionMembership(["x"], {
  fetchPage: async (_s, page) => (page === 1 ? [{ handle: "a" }] : []),
  wait: async () => {},
 }).then((r) => assert.deepEqual(r.stock.get("x"), { unavailable: 1, total: 1 }));
});
