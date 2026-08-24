import { test } from "node:test";
import assert from "node:assert/strict";
import {
 clusterByRatio,
 dominantCluster,
 percentile,
 scoreConfidence,
 filterGarmentConflicts,
 selectComps,
 isConfidentEnough,
 contextSpreadRatios,
} from "./comp-cohesion.ts";
import type { Comp } from "./comps.ts";

const comp = (title: string, dollars: number, extra: Partial<Comp> = {}): Comp => ({
 title,
 priceCents: Math.round(dollars * 100),
 currency: "USD",
 sold: false,
 source: "ebay.com",
 ...extra,
});

// ── clustering ──────────────────────────────────────────────────────────────────────────────────

test("clusterByRatio splits at real gaps, not absolute distance", () => {
 // $40→$80 and $2000→$4000 are the SAME disagreement. An absolute threshold would treat them
 // differently; a ratio threshold must not.
 assert.equal(clusterByRatio([4000, 8000], 1.8).length, 2);
 assert.equal(clusterByRatio([200000, 400000], 1.8).length, 2);
});

test("clusterByRatio keeps ordinary condition/size variation together", () => {
 const c = clusterByRatio([50000, 55000, 60000, 68000, 72000], 1.8);
 assert.equal(c.length, 1, "a 1.44x spread is one garment varying, not two products");
});

test("clusterByRatio separates the diffusion-vs-archival split", () => {
 // The exact failure the user described: a Dior dress is either a ~$300 diffusion piece or a
 // ~$2,000 archival one, and averaging them serves neither.
 const c = clusterByRatio([28000, 31000, 33000, 190000, 210000], 1.8);
 assert.equal(c.length, 2);
 assert.deepEqual(c[0], [28000, 31000, 33000]);
});

test("dominantCluster takes the biggest, and breaks ties downward", () => {
 assert.deepEqual(dominantCluster([[100], [200, 300, 400]]), [200, 300, 400]);
 // Equal sizes → the lower cluster wins: a typical example is not priced at the collector level.
 assert.deepEqual(dominantCluster([[500, 600], [5000, 6000]]), [500, 600]);
 assert.deepEqual(dominantCluster([]), []);
});

test("percentile is inclusive at both ends and safe when empty", () => {
 assert.equal(percentile([], 0.5), null);
 assert.equal(percentile([10], 0.5), 10);
 assert.equal(percentile([10, 20, 30, 40], 0.25), 20);
 assert.equal(percentile([10, 20, 30, 40], 0.75), 30);
});

// ── confidence ──────────────────────────────────────────────────────────────────────────────────

test("confidence falls with a small sample AND with disagreement, independently", () => {
 const many = scoreConfidence(10, 1.2, "cluster");
 const few = scoreConfidence(2, 1.2, "cluster");
 const wide = scoreConfidence(10, 4, "cluster");
 assert.ok(many > few, "fewer comps is less trustworthy");
 assert.ok(many > wide, "comps that disagree is less trustworthy");
 assert.equal(scoreConfidence(0, null, "none"), 0);
 assert.ok(many <= 1 && wide >= 0);
});

test("a 3x spread — the measured failure — never reads as confident", () => {
 // This is the regression that matters: the old pipeline reported high confidence on sets like this.
 assert.ok(scoreConfidence(8, 3.0, "cluster") < 0.65);
});

test("same-piece evidence lifts confidence but a sample of two is still small", () => {
 assert.ok(scoreConfidence(2, 1.2, "same-piece") > scoreConfidence(2, 1.2, "cluster"));
 assert.ok(scoreConfidence(2, 1.2, "same-piece") < 0.7, "two photos is still n=2");
});

// ── garment gate ────────────────────────────────────────────────────────────────────────────────

test("a bag never prices a dress", () => {
 const comps = [
  comp("Christian Dior silk slip dress", 600),
  comp("Christian Dior Lady Dior handbag", 3200),
  comp("Christian Dior evening gown", 700),
 ];
 const kept = filterGarmentConflicts(comps, "Christian Dior 1998 silk slip dress");
 assert.equal(kept.length, 2);
 assert.ok(!kept.some((c) => /handbag/i.test(c.title)));
});

test("a comp with no readable garment type gets the benefit of the doubt", () => {
 const comps = [comp("Dior dress", 600), comp("Dior — rare archive piece", 900)];
 assert.equal(filterGarmentConflicts(comps, "Dior dress").length, 2);
});

test("a query with no garment signal filters nothing", () => {
 const comps = [comp("Dior handbag", 3200), comp("Dior dress", 600)];
 assert.equal(filterGarmentConflicts(comps, "Christian Dior").length, 2);
});

// ── end to end ──────────────────────────────────────────────────────────────────────────────────

test("the headline case: a 3x set collapses to a coherent cluster", () => {
 const comps = [
  comp("Dior diffusion silk dress", 290),
  comp("Dior silk dress", 310),
  comp("Dior silk day dress", 330),
  comp("Dior silk dress", 350),
  comp("Dior archival runway dress", 1900),
  comp("Dior couture runway gown", 2400),
 ];
 const sel = selectComps(comps, "Christian Dior silk dress");
 assert.equal(sel.basis, "cluster");
 assert.equal(sel.n, 4, "the four ordinary dresses, not the two runway pieces");
 assert.equal(sel.medianCents, 33000);
 assert.ok(sel.spreadRatio !== null && sel.spreadRatio < 1.5, `spread was ${sel.spreadRatio}`);
 assert.equal(sel.dropped.nonCluster, 2);
 assert.ok(isConfidentEnough(sel));
});

test("same-piece sets the PRICE; keyword matches stop setting it", () => {
 const comps = [
  comp("THE piece, listed", 820, { exactPiece: true, similarity: 0.93 }),
  comp("THE piece, another listing", 880, { exactPiece: true, similarity: 0.9 }),
  ...Array.from({ length: 9 }, (_, i) => comp(`similar dress ${i}`, 200 + i)),
 ];
 const sel = selectComps(comps, "silk dress");
 assert.equal(sel.basis, "same-piece");
 assert.equal(sel.n, 2);
 assert.equal(sel.medianCents, 88000, "priced off the actual garment, not nine look-alikes");
 assert.ok(!sel.kept.some((c) => /similar/.test(c.title)));
});

test("...but keyword matches are KEPT as context, not thrown away", () => {
 const comps = [
  comp("THE piece, listed", 820, { exactPiece: true }),
  comp("THE piece, another listing", 880, { exactPiece: true }),
  ...Array.from({ length: 9 }, (_, i) => comp(`similar dress ${i}`, 200 + i * 30)),
 ];
 const sel = selectComps(comps, "silk dress");
 assert.equal(sel.context.length, 9, "nothing is discarded — it changes job");
 assert.ok(sel.context.every((c) => !c.exactPiece));
});

test("the band borrows how much similar pieces VARY, not what they cost", () => {
 // Two listings of the piece agree closely ($820/$880). That is not evidence the market is precise.
 // Comparable dresses swing widely, so the quoted range must widen — around the PIECE's level.
 const comps = [
  comp("THE piece", 820, { exactPiece: true }),
  comp("THE piece again", 880, { exactPiece: true }),
  comp("similar a", 200), comp("similar b", 300), comp("similar c", 400),
  comp("similar d", 500), comp("similar e", 600),
 ];
 const sel = selectComps(comps, "silk dress");
 assert.equal(sel.medianCents, 88000, "level still comes from the piece");
 assert.ok(sel.bandLowCents! < 82000, `band widened below the pair, got ${sel.bandLowCents}`);
 assert.ok(sel.bandHighCents! > 88000, `band widened above the pair, got ${sel.bandHighCents}`);
 // The level of the cheap look-alikes must NOT leak into the band.
 assert.ok(sel.bandLowCents! > 40000, "borrowed the spread, not the $200-$600 level");
});

test("contextSpreadRatios stays inside a band a seller can act on", () => {
 // A wildly incoherent context set must not reproduce the 445%-wide band from the earlier attempt.
 const r = contextSpreadRatios([1000, 5000, 20000, 90000, 400000]);
 assert.ok(r && r.lo >= 0.6 && r.hi <= 1.6, `got ${JSON.stringify(r)}`);
 assert.equal(contextSpreadRatios([100, 200]), null, "too few to claim anything about variation");
});

test("a tight context set does not inflate the band", () => {
 const comps = [
  comp("THE piece", 820, { exactPiece: true }),
  comp("THE piece again", 840, { exactPiece: true }),
  comp("similar a", 800), comp("similar b", 810), comp("similar c", 820), comp("similar d", 830),
 ];
 const sel = selectComps(comps, "silk dress");
 assert.ok(sel.bandHighCents! / sel.bandLowCents! < 1.5, "agreeing comps yield a tight band");
});

test("one same-piece hit is not enough to discard everything else", () => {
 const comps = [
  comp("maybe the piece", 820, { exactPiece: true }),
  comp("dress a", 300), comp("dress b", 320), comp("dress c", 340),
 ];
 const sel = selectComps(comps, "dress");
 assert.notEqual(sel.basis, "same-piece", "a single visual match is not corroborated");
});

test("a thin set is reported as thin and withheld rather than dressed up", () => {
 const sel = selectComps([comp("dress a", 300), comp("dress b", 900)], "dress");
 assert.equal(sel.basis, "thin");
 assert.ok(sel.confidence < 0.5);
 assert.ok(!isConfidentEnough(sel), "two comps 3x apart must not produce a confident price");
});

test("no comps yields no basis and no price, never a fabricated one", () => {
 const sel = selectComps([], "dress");
 assert.equal(sel.basis, "none");
 assert.equal(sel.medianCents, null);
 assert.equal(sel.confidence, 0);
 assert.ok(!isConfidentEnough(sel));
});

test("unpriced comps are ignored rather than counted as $0", () => {
 const comps = [comp("dress a", 0), comp("dress b", 300), comp("dress c", 320), comp("dress d", 310)];
 const sel = selectComps(comps, "dress");
 assert.equal(sel.n, 3);
 assert.ok(sel.medianCents !== null && sel.medianCents > 0);
});

test("a gate that would remove everything falls back instead of pricing off nothing", () => {
 // Every comp is a bag; the query is a dress. Filtering to zero would be worse than a hedged price.
 const comps = [comp("Dior handbag", 3000), comp("Dior tote bag", 3200), comp("Dior clutch bag", 2900)];
 const sel = selectComps(comps, "Dior dress");
 assert.ok(sel.n > 0, "fell back rather than returning nothing");
 assert.equal(sel.dropped.garment, 3);
});

test("the band comes from the kept cluster's own spread", () => {
 const comps = [comp("d1", 400), comp("d2", 450), comp("d3", 500), comp("d4", 560), comp("d5", 600)];
 const sel = selectComps(comps, "dress");
 assert.equal(sel.p25Cents, 45000);
 assert.equal(sel.p75Cents, 56000);
 // The old band was a fixed ±15% cushion regardless of what the comps said; this one is measured.
 assert.ok(sel.p25Cents! < sel.medianCents! && sel.medianCents! < sel.p75Cents!);
});
