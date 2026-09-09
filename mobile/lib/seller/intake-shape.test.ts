import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDraft, readEstimate } from "./intake-shape.ts";

// The real response, copied from a live production call — see intake-shape.ts for why this
// fixture is written out rather than paraphrased.
const DRAFT = {
  title: "Y2K Fendi Zucchino Monogram Logo Slide Sandals",
  description: "Fendi Zucchino monogram slides in the house's signature canvas.",
  brand: { value: "Fendi", confidence: 1 },
  era: { value: "Y2K / early 2000s", confidence: 0.85 },
  material: { value: null, confidence: 0.4 },
  condition: { value: "Good — light wear consistent with use", confidence: 0.7 },
  conditionGrade: "Good",
  category: "shoes",
  priceHint: 275,
};

test("a {value, confidence} field is flattened to its value", () => {
  // THE BUG THIS EXISTS FOR: rendering brand straight from the API put an OBJECT into a <Text>,
  // which React Native throws on. The flow died at the last screen, after the AI had been paid for.
  const d = normalizeDraft(DRAFT);
  assert.equal(d.brand, "Fendi");
  assert.equal(d.era, "Y2K / early 2000s");
  assert.equal(d.condition, "Good — light wear consistent with use");
});

test("plain string fields pass through untouched", () => {
  const d = normalizeDraft(DRAFT);
  assert.equal(d.title, "Y2K Fendi Zucchino Monogram Logo Slide Sandals");
  assert.equal(d.category, "shoes");
});

test("a field whose value is null becomes undefined, not the string 'null'", () => {
  assert.equal(normalizeDraft(DRAFT).material, undefined);
});

test("a missing draft yields an empty object rather than throwing", () => {
  // A 200 with no draft is possible when every field was typed by the seller.
  assert.deepEqual(normalizeDraft(undefined), {});
  assert.deepEqual(normalizeDraft(null), {});
});

/* ── the price ──────────────────────────────────────────────────────────── */

const ESTIMATE = {
  suggestedCents: 21921,
  marketCents: 22990,
  lowCents: 16150,
  highCents: 33250,
  confidence: 0.52,
  comps: [{ title: "Fendi Multi Slides", priceCents: 21500 }, { title: "Fendi slides", priceCents: 24000 }],
  source: "comps",
};

test("the suggested price is read from estimate, not a top-level price", () => {
  assert.equal(readEstimate(ESTIMATE).priceCents, 21921);
});

test("the comps count is how many comparable sales it actually read", () => {
  // This is the "14 comps" on the Review screen — the difference between a number she trusts and
  // one she overrides.
  assert.equal(readEstimate(ESTIMATE).compsCount, 2);
});

test("no estimate is not a free piece", () => {
  // Pricing can legitimately come back empty. Zero would be published as the price.
  assert.equal(readEstimate(null).priceCents, null);
  assert.equal(readEstimate(undefined).compsCount, 0);
});

test("an estimate with no comps still yields its price", () => {
  assert.equal(readEstimate({ suggestedCents: 5000 }).priceCents, 5000);
  assert.equal(readEstimate({ suggestedCents: 5000 }).compsCount, 0);
});
