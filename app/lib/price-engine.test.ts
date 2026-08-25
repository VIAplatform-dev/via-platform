import { test } from "node:test";
import assert from "node:assert/strict";
import { exactPieceEvidence, compLine, brandFirstQuery } from "./price-engine.ts";
import type { Comp } from "./comps.ts";

const c = (over: Partial<Comp>): Comp => ({
 title: "Miu Miu dress", priceCents: 100000, currency: "USD", sold: false, source: "eBay", ...over,
});

// ── the brand-less query bug ──
// A Valentino Boutique dress priced at $331 instead of ~$1,250 because every comp search ran
// on the vision draft's brand-less searchQuery ("vintage 1970s 1980s pink polka dot ruched
// sundress"). Reverse-image had already identified the brand — it just never reached the query.
test("brandFirstQuery puts a resolved brand at the front of the query", () => {
 assert.equal(
  brandFirstQuery("vintage 1970s 1980s pink polka dot ruched sundress", "Valentino Boutique", "dresses"),
  "Valentino Boutique vintage 1970s 1980s pink polka dot ruched sundress",
 );
});

test("brandFirstQuery leaves a query that already names the brand alone", () => {
 assert.equal(brandFirstQuery("Prada Re-Nylon shoulder bag", "Prada", "bags"), "Prada Re-Nylon shoulder bag");
 // Matching ignores case and punctuation, so no duplicate prefix.
 assert.equal(brandFirstQuery("miu miu 1999 patchwork dress", "Miu Miu", "dresses"), "miu miu 1999 patchwork dress");
});

test("brandFirstQuery attaches the category when the query names no garment", () => {
 assert.equal(brandFirstQuery("1999 patchwork satin", "Miu Miu", "dresses"), "Miu Miu 1999 patchwork satin dress");
 // Already has a garment word — don't bolt a redundant one on.
 assert.equal(brandFirstQuery("beige silk maxi dress", "Miu Miu", "dresses"), "Miu Miu beige silk maxi dress");
 assert.equal(brandFirstQuery("Re-Nylon shoulder bag", "Prada", "bags"), "Prada Re-Nylon shoulder bag");
});

test("brandFirstQuery is a no-op without a brand", () => {
 assert.equal(brandFirstQuery("vintage pink sundress", null, "dresses"), "vintage pink sundress");
 assert.equal(brandFirstQuery("vintage pink sundress", "", null), "vintage pink sundress");
});
// ── same-piece evidence replaces sold-anchoring ──
// Sold-vs-asking was the hierarchy and it underpriced everything: a $900 sale beat a
// $1,459–$2,082 cluster; 20 brand-level sales beat the actual listing; two unrelated $350–$500
// sales beat nine listings of one Versace runway dress at $1,733–$3,200. Match quality leads now.
test("exactPieceEvidence counts only visually-confirmed listings of this garment", () => {
 const comps = [
  c({ exactPiece: true, similarity: 0.95, priceCents: 173300, source: "Blummier" }),
  c({ exactPiece: true, similarity: 0.91, priceCents: 320000, source: "1stDibs" }),
  c({ sold: true, saleType: "bin", priceCents: 35000, source: "eBay (sold)" }),
 ];
 const ev = exactPieceEvidence(comps);
 assert.equal(ev.exactCount, 2, "a realized sale of a DIFFERENT garment is not same-piece evidence");
 assert.deepEqual(ev.exactPrices, [173300, 320000], "returned low→high for the prompt's range");
});

test("exactPieceEvidence reports none when every comp is a keyword match", () => {
 const ev = exactPieceEvidence([c({ sold: true, priceCents: 35000 }), c({ priceCents: 50000 })]);
 assert.equal(ev.exactCount, 0);
 assert.deepEqual(ev.exactPrices, []);
});

// ── what the valuation model actually sees ──
test("compLine leads with match quality, not sold status", () => {
 const same = compLine(c({ exactPiece: true, similarity: 0.954, priceCents: 320000, source: "1stDibs" }), 0);
 assert.match(same, /SAME PIECE/);
 assert.match(same, /0\.95/, "the similarity score is shown so the model can weigh confidence");
 assert.match(same, /specialist/);

 const keyword = compLine(c({ sold: true, saleType: "bin", priceCents: 35000, source: "eBay (sold)" }), 1);
 assert.match(keyword, /keyword match/, "a text match must be labelled as a DIFFERENT garment");
 assert.match(keyword, /marketplace/);
 // Sold status survives as context, but must not be the leading label any more.
 assert.match(keyword, /realized sale/);
 assert.ok(keyword.indexOf("keyword match") < keyword.indexOf("realized sale"), "match quality leads");

 assert.match(compLine(c({ sold: true, saleType: "auction", priceCents: 16600, source: "eBay (auction)" }), 2), /auction close/);
});

test("compLine renders whole-dollar prices with the comp index", () => {
 assert.match(compLine(c({ priceCents: 145927, source: "VYA" }), 7), /^7\. /);
 assert.match(compLine(c({ priceCents: 145927, source: "VYA" }), 7), /\$1459/);
});

// ── retail is not a resale comp ─────────────────────────────────────────────────────────────────

test("sites that sell NEW are tiered as retail, not as specialist resale", async () => {
 const { sourceTier } = await import("./comps.ts");
 // These were all falling through to "specialist" — quoted to the model as authoritative resale.
 for (const s of ["Editorialist", "FWRD", "Net-a-Porter", "Nordstrom", "H&M", "Revolve", "SSENSE", "Farfetch"]) {
  assert.equal(sourceTier(s), "retail", `${s} should be retail`);
 }
});

test("genuine resale keeps its tier", async () => {
 const { sourceTier } = await import("./comps.ts");
 for (const s of ["The RealReal", "Vestiaire Collective", "1stDibs", "Fashionphile"]) {
  assert.equal(sourceTier(s), "specialist", `${s} should stay specialist`);
 }
 for (const s of ["eBay (sold)", "Depop", "Grailed", "Poshmark"]) {
  assert.equal(sourceTier(s), "marketplace", `${s} should stay marketplace`);
 }
 assert.equal(sourceTier("VYA (sold)"), "vya");
});

test("an unknown independent dealer is still treated as a specialist", async () => {
 const { sourceTier } = await import("./comps.ts");
 // The fallback has to stay generous — most archival dealers are small sites we've never seen.
 assert.equal(sourceTier("somevintagearchive.com"), "specialist");
});

// ── query construction ──
// These two bugs were found by reading the SerpApi log, not the code: every search VYA had ever
// paid for on an unbranded piece was built from a query no shopper would type.

test("a database category slug is never pasted into a search query", () => {
 // "Emilio Pucci blue and white tshirt other-clothing" was a real, paid-for Google Shopping search.
 assert.equal(brandFirstQuery("blue and white tshirt", "Emilio Pucci", "other-clothing"), "Emilio Pucci blue and white tshirt");
 assert.equal(brandFirstQuery("1990s silk piece", null, "uncategorized"), "1990s silk piece");
});

test("a compound category slug contributes a real word, not the hyphenated label", () => {
 assert.equal(brandFirstQuery("Burberry 1980s check", "Burberry", "coats-jackets"), "Burberry 1980s check coat");
});

test("a garment word already in the query stops the category being appended", () => {
 assert.equal(brandFirstQuery("Valentino polka dot dress", "Valentino", "dresses"), "Valentino polka dot dress");
 // "tshirt" without the hyphen used to fail the garment-word check, so the slug got appended anyway.
 assert.equal(brandFirstQuery("Pucci tshirt", "Pucci", "tops"), "Pucci tshirt");
});
