import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyMatchesByImage, matchesToComps, priceToCents, pickRetailerRows, VESTIAIRE_SOURCE, parseEbayRows, sourceTier, partitionByVisualMatch, reverseImageTiered } from "./comps.ts";

// ── exact-piece comps ──
// A Versace S/S 2005 runway dress had NINE listings of itself at $1,733–$3,200, and priced at
// $473 — because reverse-image matches enter as ordinary `asking` comps, and the valuation rules
// rank any SOLD comp above any asking comp. A listing of THIS piece is not an ordinary ask.
test("matchesToComps marks visually-verified matches as the exact piece", () => {
 const comps = matchesToComps([
  { title: "same dress", priceCents: 320000, source: "1stDibs", similarity: 0.95, visuallyVerified: true },
  { title: "keyword match", priceCents: 50000, source: "eBay" },
 ]);
 assert.equal(comps[0].exactPiece, true);
 assert.equal(comps[0].similarity, 0.95);
 assert.equal(comps[1].exactPiece, undefined, "an unverified match is not an exact-piece comp");
});

test("partitionByVisualMatch flags what it verified so the price engine can tier it", async () => {
 const r = await partitionByVisualMatch(
  [{ title: "x", priceCents: 100, source: "s", thumbnail: "https://t/x.jpg" }],
  { min: 0.7, scoreOne: async () => 0.9 },
 );
 assert.equal(r.verified[0].visuallyVerified, true);
});

// Full-size images separate the same garment from a look-alike ~10x better than Google's ~225px
// thumbnails (measured on a real dress: same piece 0.744 → 0.954, best non-match 0.733 → 0.849).
test("partitionByVisualMatch prefers the full-size image and falls back to the thumbnail", async () => {
 const tried: string[] = [];
 const scorer = async (url: string) => { tried.push(url); return url.includes("full") ? 0.95 : 0.5; };
 const r = await partitionByVisualMatch(
  [{ title: "a", priceCents: 1, source: "s", image: "https://x/full.jpg", thumbnail: "https://x/thumb.jpg" }],
  { min: 0.9, scoreOne: scorer },
 );
 assert.deepEqual(tried, ["https://x/full.jpg"], "full image is scored, not the thumbnail");
 assert.equal(r.verified.length, 1);
});

test("partitionByVisualMatch falls back to the thumbnail when the full image can't be scored", async () => {
 // Vestiaire / Poshmark / TikTok full-size URLs are unfetchable by the embedding API.
 const scorer = async (url: string) => (url.includes("blocked") ? null : 0.92);
 const r = await partitionByVisualMatch(
  [{ title: "a", priceCents: 1, source: "s", image: "https://blocked/x.jpg", thumbnail: "https://x/thumb.jpg" }],
  { min: 0.9, scoreOne: scorer },
 );
 assert.equal(r.verified.length, 1, "a blocked full image must not lose the match entirely");
});

// ── ordering: verify by image BEFORE filtering by brand text ──
// A Valentino dress lost all 8 of its priced matches because the brand filter runs on TITLE text
// and those listings ("Pink Polka Dot Swing Dress", "Fairycore Pink French Dot Maxi Dress") never
// say Valentino — even though they're the same dress. A visual match outranks a title match.
test("partitionByVisualMatch splits matches into verified, rejected and unchecked", async () => {
 const matches = [
  { title: "same dress, no brand in title", priceCents: 12000, source: "Etsy", thumbnail: "https://t/a.jpg" },
  { title: "different dress", priceCents: 3000, source: "eBay", thumbnail: "https://t/b.jpg" },
  { title: "no thumbnail to check", priceCents: 5000, source: "Depop" },
 ];
 // Injected scorer stands in for the embedding call: first match is the same piece, second isn't.
 const scorer = async (url: string) => (url === "https://t/a.jpg" ? 0.91 : 0.30);
 const r = await partitionByVisualMatch(matches, { min: 0.75, scoreOne: scorer });
 assert.equal(r.ran, true);
 assert.deepEqual(r.verified.map((m) => m.title), ["same dress, no brand in title"]);
 assert.deepEqual(r.rejected.map((m) => m.title), ["different dress"]);
 assert.deepEqual(r.unchecked.map((m) => m.title), ["no thumbnail to check"], "unscoreable matches are neither kept nor killed");
});

test("partitionByVisualMatch reports ran=false when nothing could be scored", async () => {
 const matches = [{ title: "a", priceCents: 100, source: "s" }];
 const r = await partitionByVisualMatch(matches, { min: 0.75, scoreOne: async () => null });
 assert.equal(r.ran, false);
 assert.deepEqual(r.verified, []);
 assert.deepEqual(r.unchecked.map((m) => m.title), ["a"], "with no signal, everything is unchecked");
});

test("partitionByVisualMatch attaches the similarity score to verified matches", async () => {
 const matches = [{ title: "x", priceCents: 100, source: "s", thumbnail: "https://t/x.jpg" }];
 const r = await partitionByVisualMatch(matches, { min: 0.7, scoreOne: async () => 0.88 });
 assert.equal(r.verified[0].similarity, 0.88);
});

// ── eBay: auction closes are not market value ──
// An auction that ends at $900 on a slow night is auction dynamics, not what the piece is
// worth. A Buy It Now sale means someone paid the seller's asking price — the real signal.
test("parseEbayRows keeps Buy It Now sales as the sold anchor", () => {
 const comps = parseEbayRows([
  { title: "Miu Miu dress", price: { extracted: 900 }, link: "https://e/1", buying_format: "buy_it_now", buying_format_text: "Buy It Now" },
 ]);
 assert.equal(comps.length, 1);
 assert.equal(comps[0].sold, true);
 assert.equal(comps[0].saleType, "bin");
 assert.equal(comps[0].priceCents, 90000);
});

test("parseEbayRows tags auction closes so they can be excluded from the anchor", () => {
 const comps = parseEbayRows([
  { title: "auctioned dress", price: { extracted: 166 }, link: "https://e/2", buying_format: "auction", buying_format_text: "Auction" },
 ]);
 assert.equal(comps[0].saleType, "auction");
 assert.equal(comps[0].source, "eBay (auction)", "labelled distinctly so the valuation can see it");
});

test("parseEbayRows treats an unlabelled row as unknown format, not as Buy It Now", () => {
 const comps = parseEbayRows([{ title: "no format", price: { extracted: 300 }, link: "https://e/3" }]);
 assert.equal(comps[0].saleType, null);
});

// ── source weighting ──
// A specialist archival dealer's price is better evidence for a 1999 runway piece than a
// general-marketplace listing; VYA's own realized data is the strongest of all.
test("sourceTier ranks VYA, specialist resale, and general marketplaces", () => {
 assert.equal(sourceTier("VYA"), "vya");
 assert.equal(sourceTier("VYA (sold)"), "vya");
 assert.equal(sourceTier("Vestiaire Collective"), "specialist");
 assert.equal(sourceTier("The RealReal"), "specialist");
 assert.equal(sourceTier("1stDibs"), "specialist");
 assert.equal(sourceTier("Fashionphile"), "specialist");
 assert.equal(sourceTier("eBay (sold)"), "marketplace");
 assert.equal(sourceTier("Depop"), "marketplace");
 assert.equal(sourceTier("Etsy"), "marketplace");
});

test("sourceTier defaults an unrecognized boutique to specialist, not marketplace", () => {
 // Independent archival dealers (timesupshop, anteactus…) are curated sellers — closer in
 // caliber to Vestiaire than to a general marketplace, and they are the bulk of link-verify hits.
 assert.equal(sourceTier("Time's Up Vintage"), "specialist");
 assert.equal(sourceTier("Anteactus"), "specialist");
});

// Retailer keyword pass. Vestiaire hard-blocks direct page fetches (403 even with full browser
// headers), but Google has already crawled them — so we read their prices out of SerpApi's
// Shopping index instead of the retailer. Same approach the RealReal pass already uses.
test("pickRetailerRows keeps only rows from the retailer we asked for", () => {
 const rows = [
  { title: "Miu Miu dress", source: "Vestiaire Collective", extracted_price: 966, link: "https://vc/1" },
  { title: "Miu Miu dress", source: "Some Other Shop", extracted_price: 120, link: "https://x/2" },
  { title: "Miu Miu dress", source: "vestiairecollective.com", extracted_price: 800, link: "https://vc/3" },
 ];
 const comps = pickRetailerRows(rows, VESTIAIRE_SOURCE, "Vestiaire Collective");
 assert.equal(comps.length, 2, "the unrelated shop is excluded");
 assert.deepEqual(comps.map((c) => c.priceCents), [96600, 80000]);
 assert.ok(comps.every((c) => c.source === "Vestiaire Collective"));
 assert.ok(comps.every((c) => c.sold === false), "Shopping results are asking prices, not sold");
});

test("pickRetailerRows skips rows with no usable price", () => {
 const rows = [
  { title: "no price", source: "Vestiaire Collective", link: "https://vc/1" },
  { title: "zero", source: "Vestiaire Collective", extracted_price: 0, link: "https://vc/2" },
  { title: "good", source: "Vestiaire Collective", extracted_price: 450, link: "https://vc/3" },
 ];
 const comps = pickRetailerRows(rows, VESTIAIRE_SOURCE, "Vestiaire Collective");
 assert.deepEqual(comps.map((c) => c.title), ["good"]);
});

test("pickRetailerRows converts a foreign-currency Shopping row and drops an unknown one", () => {
 const rows = [
  { title: "eur row", source: "Vestiaire Collective", price: "€450.00", extracted_price: 450, link: "https://vc/1" },
  { title: "unknown", source: "Vestiaire Collective", price: "kr 1200", extracted_price: 1200, link: "https://vc/2" },
 ];
 const comps = pickRetailerRows(rows, VESTIAIRE_SOURCE, "Vestiaire Collective");
 assert.equal(comps.length, 1, "ambiguous 'kr' is dropped rather than assumed USD");
 assert.ok(comps[0].priceCents > 45000, "€450 must convert above $450");
});

// The fallback guarantees: verification only ever REMOVES matches it can prove are a different
// item. With no query embedding or no thumbnails it can't prove anything, so it must pass the set
// through untouched (filtered=false) — never make pricing worse than before.
test("verifyMatchesByImage is a no-op without a query embedding", async () => {
 const matches = [{ title: "Gucci bag", priceCents: 180000, source: "realreal", thumbnail: "https://t/x.jpg" }];
 const { verified, filtered, checked } = await verifyMatchesByImage(null, matches);
 assert.equal(filtered, false);
 assert.equal(checked, 0);
 assert.deepEqual(verified, matches);
});

test("verifyMatchesByImage is a no-op when no match has a thumbnail", async () => {
 const matches = [{ title: "Gucci bag", priceCents: 180000, source: "realreal" }];
 const { verified, filtered } = await verifyMatchesByImage([0.1, 0.2, 0.3], matches);
 assert.equal(filtered, false);
 assert.deepEqual(verified, matches);
});

test("matchesToComps keeps only priced matches", () => {
 const comps = matchesToComps([
  { title: "priced", priceCents: 12000, source: "ebay" },
  { title: "no price", priceCents: null, source: "blog" },
 ]);
 assert.equal(comps.length, 1);
 assert.equal(comps[0].priceCents, 12000);
});

test("priceToCents coerces SerpApi shapes", () => {
 assert.equal(priceToCents({ extracted_value: 18 }), 1800);
 assert.equal(priceToCents("$1,800.00"), 180000);
 assert.equal(priceToCents(null), null);
});

// ── Phase 2: tiered reverse-image escalation ──
// The original spec: search by image; if the evidence is thin, re-search with the BRAND attached;
// if still thin, attach the CATEGORY too. Brand always leads, so a refinement can never wander
// into another label's market. Each tier costs one Lens call, so we stop as soon as it's enough.
const vm = (title: string, price: number | null, extra: Record<string, unknown> = {}) =>
 ({ title, priceCents: price, source: "s", thumbnail: `https://t/${title}.jpg`, ...extra });

test("reverseImageTiered stops at tier 1 when the image alone finds enough priced matches", async () => {
 const queries: (string | undefined)[] = [];
 const search = async (_u: string, q?: string) => { queries.push(q); return [vm("a", 100), vm("b", 200), vm("c", 300), vm("d", 400), vm("e", 500)]; };
 const r = await reverseImageTiered("https://img", { brand: "Valentino", category: "dresses", search, verifyAll: true });
 assert.equal(r.tiersUsed, 1, "a clean photo must cost exactly one Lens call");
 assert.deepEqual(queries, [undefined]);
});

test("reverseImageTiered escalates to brand, then to brand + category", async () => {
 const queries: (string | undefined)[] = [];
 // Unpriced matches: each tier finds something, but never enough PRICED evidence to stop early.
 const search = async (_u: string, q?: string) => { queries.push(q); return [vm(`only-${q ?? "img"}`, null)]; };
 const r = await reverseImageTiered("https://img", { brand: "Valentino", category: "dresses", search, verifyAll: true });
 assert.equal(r.tiersUsed, 3, "thin evidence at every tier escalates all the way");
 assert.deepEqual(queries, [undefined, "Valentino", "Valentino dress"], "brand first, then brand + singular category");
});

test("reverseImageTiered merges and dedupes matches across tiers", async () => {
 const search = async (_u: string, q?: string) => (q ? [vm("shared", 100), vm("new", 200)] : [vm("shared", 100)]);
 const r = await reverseImageTiered("https://img", { brand: "Valentino", category: "dresses", search, verifyAll: true });
 assert.equal(r.matches.filter((m) => m.title === "shared").length, 1, "the same listing must not be counted twice");
});

test("reverseImageTiered drops matches whose title names a DIFFERENT brand", async () => {
 // The refinement pulls in other labels; brand-first phrasing alone can't prevent that.
 const search = async (_u: string, q?: string) =>
  (q ? [vm("Prada nylon shoulder bag", 900), vm("Valentino Garavani dress", 800)] : [vm("unbranded pink dress", 100)]);
 const r = await reverseImageTiered("https://img", { brand: "Valentino", category: "dresses", search, verifyAll: true });
 const titles = r.matches.map((m) => m.title);
 assert.ok(!titles.includes("Prada nylon shoulder bag"), "a different brand must never survive a refined tier");
 assert.ok(titles.includes("Valentino Garavani dress"));
 assert.ok(titles.includes("unbranded pink dress"), "a no-brand title from tier 1 still gets the benefit of the doubt");
});

test("reverseImageTiered falls back to category + material when there is no brand", async () => {
 const queries: (string | undefined)[] = [];
 const search = async (_u: string, q?: string) => { queries.push(q); return [vm("x", 1)]; };
 await reverseImageTiered("https://img", { brand: null, category: "dresses", material: "silk", search, verifyAll: true });
 assert.deepEqual(queries, [undefined, "silk dress"], "unbranded pieces skip the brand tier entirely");
});
