import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileBrand, brandQuestion, reconcileGarment, garmentQuestion, garmentFromMatches, type BrandCandidate } from "./brand-reconcile.ts";

const c = (source: BrandCandidate["source"], value: string | null, confidence: number): BrandCandidate =>
 ({ source, value, confidence });

// ── the case that started this ──────────────────────────────────────────────────────────────────

test("THE regression: three sources, three brands — ask instead of picking one", () => {
 // One real dress. Vision said Dior, Lens said Prada, and the title writer said Sue Wong. The old
 // path printed "Dior" in the brand field at full confidence.
 const d = reconcileBrand([c("vision", "Dior", 0.7), c("lens", "Prada", 0.6)]);
 assert.equal(d.conflict, true);
 assert.equal(d.needsQuestion, true);
 assert.ok(d.confidence < 0.4, `confidence should collapse, got ${d.confidence}`);
 assert.match(d.reason, /disagree/);
 const q = brandQuestion(d);
 assert.ok(q);
 assert.equal(q.prompt, "What brand is this?");
});

test("the real answer — a label — settles it without asking", () => {
 // Same dress, but the care tag was legible: Betsey Johnson. No question, no argument.
 const d = reconcileBrand([c("vision", "Dior", 0.7), c("lens", "Prada", 0.6), c("label", "Betsey Johnson", 0.92)]);
 assert.equal(d.value, "Betsey Johnson");
 assert.equal(d.needsQuestion, false, "a photographed label outranks any guess");
 assert.equal(d.conflict, true, "the disagreement is still recorded, just not surfaced");
 assert.equal(brandQuestion(d), null);
});

test("an RN resolved off the care tag counts as physical evidence too", () => {
 const d = reconcileBrand([c("vision", "Dior", 0.8), c("rn", "Betsey Johnson", 0.9)]);
 assert.equal(d.value, "Betsey Johnson");
 assert.equal(d.source, "rn");
 assert.equal(d.needsQuestion, false);
 assert.match(d.reason, /care tag RN/);
});

// ── the seller is never argued with ──────────────────────────────────────────────────────────────

test("a brand the seller typed always wins and is never questioned", () => {
 const d = reconcileBrand([c("seller", "Kontatto", 1), c("lens", "Shein", 0.85), c("vision", "Dior", 0.9)]);
 assert.equal(d.value, "Kontatto");
 assert.equal(d.confidence, 1);
 assert.equal(d.needsQuestion, false);
 assert.equal(brandQuestion(d), null);
});

// ── agreement and its limits ─────────────────────────────────────────────────────────────────────

test("two inferences agreeing raises confidence and asks nothing", () => {
 const d = reconcileBrand([c("vision", "Chanel", 0.75), c("lens", "Chanel", 0.85)]);
 assert.equal(d.value, "Chanel");
 assert.equal(d.conflict, false);
 assert.ok(d.confidence > 0.85);
 assert.equal(d.needsQuestion, false);
 assert.match(d.reason, /2 sources agree/);
});

test("agreement is capped — two guesses are not a photograph of a label", () => {
 const d = reconcileBrand([c("vision", "Chanel", 0.95), c("lens", "Chanel", 0.95)]);
 assert.ok(d.confidence <= 0.9);
});

test("one weak lone guess still triggers a question", () => {
 // A single Lens hit scores 0.6 in the route — below the 0.75 review threshold.
 const d = reconcileBrand([c("lens", "Moschino", 0.6)]);
 assert.equal(d.value, "Moschino");
 assert.equal(d.conflict, false);
 assert.equal(d.needsQuestion, true, "below the confidence threshold");
 assert.match(d.reason, /only lens/);
});

test("one STRONG lone guess is accepted without asking", () => {
 const d = reconcileBrand([c("lens", "Chanel", 0.85)]);
 assert.equal(d.needsQuestion, false);
});

test("silence is not disagreement", () => {
 // Lens finding nothing is an absence of evidence, not a contradiction — it must not trigger a
 // conflict, or every item with a thin Lens result would interrupt the seller.
 const d = reconcileBrand([c("vision", "Chanel", 0.85), c("lens", null, 0)]);
 assert.equal(d.conflict, false);
 assert.equal(d.needsQuestion, false);
});

test("brand matching ignores punctuation and case", () => {
 const d = reconcileBrand([c("vision", "Yves Saint-Laurent", 0.8), c("lens", "YVES SAINT LAURENT", 0.85)]);
 assert.equal(d.conflict, false, "same house written two ways is not a conflict");
});

// ── nothing at all ───────────────────────────────────────────────────────────────────────────────

test("no brand from anywhere returns null and asks — never a fabricated one", () => {
 const d = reconcileBrand([c("vision", null, 0), c("lens", null, 0)]);
 assert.equal(d.value, null);
 assert.equal(d.confidence, 0);
 assert.equal(d.needsQuestion, true);
 assert.match(d.reason, /nothing identified/);
});

test("the question is answerable by looking at the garment, and offers a way out", () => {
 const q = brandQuestion(reconcileBrand([c("vision", "Dior", 0.6), c("lens", "Prada", 0.6)]))!;
 assert.match(q.hint, /label/i, "tells them where to look");
 assert.match(q.hint, /leave it blank/i, "no dead end when there is no label");
 // Nothing here asks the seller to research anything — era, runway and collection are our job.
 assert.doesNotMatch(`${q.prompt} ${q.hint}`, /runway|collection|season|archive/i);
});


// ── garment type ────────────────────────────────────────────────────────────────────────────────

test("THE top-priced-as-a-dress case: photos and matches disagree → ask", () => {
 // A Roberto Cavalli top photographed flat read as a "strapless mini dress". That word went into
 // all four comp searches and produced $689 for a top.
 const d = reconcileGarment({
  vision: "mini dress", visionConfidence: 0.8,
  lens: { category: "Tops", hits: 6, total: 12 },
 });
 assert.equal(d.conflict, true);
 assert.equal(d.needsQuestion, true);
 assert.ok(d.confidence <= 0.45);
 const q = garmentQuestion(d)!;
 assert.ok(q);
 assert.match(q.prompt, /Is this a/);
 assert.deepEqual(q.options.sort(), ["Dresses", "Tops"]);
});

test("the question offers the two candidates, not an open field", () => {
 const q = garmentQuestion(reconcileGarment({
  vision: "dress", visionConfidence: 0.7, lens: { category: "Tops", hits: 5, total: 9 },
 }))!;
 assert.ok(q.options.length === 2, "one tap, inside our own taxonomy");
 assert.match(q.hint, /every price comparison/i, "says why it matters");
});

test("a seller's own category is never questioned", () => {
 const d = reconcileGarment({
  seller: "Tops", vision: "dress", visionConfidence: 0.9,
  lens: { category: "Dresses", hits: 8, total: 10 },
 });
 assert.equal(d.value, "Tops");
 assert.equal(d.needsQuestion, false);
 assert.equal(garmentQuestion(d), null);
});

test("photos and matches agreeing raises confidence and asks nothing", () => {
 const d = reconcileGarment({ vision: "dress", visionConfidence: 0.8, lens: { category: "Dresses", hits: 7, total: 10 } });
 assert.equal(d.value, "Dresses");
 assert.equal(d.conflict, false);
 assert.ok(d.confidence > 0.8);
 assert.equal(d.needsQuestion, false);
});

test("one stray match is noise, not a second opinion", () => {
 // Below 3 agreeing matches Lens does not get a vote — otherwise a single odd title would
 // interrupt the seller on items that are perfectly clear.
 const d = reconcileGarment({ vision: "dress", visionConfidence: 0.85, lens: { category: "Tops", hits: 1, total: 14 } });
 assert.equal(d.conflict, false);
 assert.equal(d.needsQuestion, false);
});

test("a shaky lone read still asks", () => {
 const d = reconcileGarment({ vision: "dress", visionConfidence: 0.5, lens: { category: null, hits: 0, total: 8 } });
 assert.equal(d.needsQuestion, true, "below the confidence threshold with no corroboration");
});

test("garmentFromMatches buckets match titles through the platform taxonomy", () => {
 const g = garmentFromMatches([
  "Roberto Cavalli silk corset top", "Cavalli 2000s bustier top", "Cavalli chain print top",
  "Roberto Cavalli mini dress",
 ]);
 assert.equal(g.category, "Tops");
 assert.equal(g.hits, 3);
 assert.equal(g.total, 4);
});

test("nothing identifiable → ask rather than default to anything", () => {
 const d = reconcileGarment({ lens: { category: null, hits: 0, total: 0 } });
 assert.equal(d.value, null);
 assert.equal(d.needsQuestion, true);
});


// ── look-alike consensus is not evidence ────────────────────────────────────────────────────────

test("THE Staud case: unverified lens agreement must not pass as confident", () => {
 // A Valentino scallop-hem tube top returned several STAUD tube tops. Lens "agreed with itself",
 // scored 0.85, and stated Staud with no question — while the valuation on the same screen said
 // "No same-piece evidence exists". Unverified agreement now scores 0.55, below the ask threshold.
 const d = reconcileBrand([c("lens", "Staud", 0.55)]);
 assert.equal(d.needsQuestion, true, "a look-alike cluster must trigger a question");
 assert.ok(d.confidence < 0.75);
});

test("same-piece-confirmed lens agreement still passes without a question", () => {
 // The gate must not make every Lens result ask — a genuinely matched piece is strong evidence.
 const d = reconcileBrand([c("lens", "Chanel", 0.85)]);
 assert.equal(d.needsQuestion, false);
});

test("the garment question reads as one garment, not a taxonomy label", () => {
 const q = garmentQuestion(reconcileGarment({
  vision: "top", visionConfidence: 0.7, lens: { category: "Dresses", hits: 5, total: 9 },
 }))!;
 assert.equal(q.prompt, "Is this a top or a dress?");
 assert.doesNotMatch(q.prompt, /tops or dresses/i);
});
