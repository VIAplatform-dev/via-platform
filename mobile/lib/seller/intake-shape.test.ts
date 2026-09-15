import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDraft, readEstimate, costFromText, hasRealValue, unsureFields, CONFIDENCE_THRESHOLD } from "./intake-shape.ts";

// The real response, copied from a live production call. See intake-shape.ts for why this
// fixture is written out rather than paraphrased.
const DRAFT = {
  title: "Y2K Fendi Zucchino Monogram Logo Slide Sandals",
  description: "Fendi Zucchino monogram slides in the house's signature canvas.",
  brand: { value: "Fendi", confidence: 1 },
  era: { value: "Y2K / early 2000s", confidence: 0.85 },
  material: { value: null, confidence: 0.4 },
  condition: { value: "Good: light wear consistent with use", confidence: 0.7 },
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
  // Condition is now structure: the grade on the chips, the sentence as the note (see below).
  assert.equal(d.condition, "Good");
  assert.equal(d.conditionNote, "Good: light wear consistent with use");
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
  // This is the "14 comps" on the Review screen. The difference between a number she trusts and
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

/* ── structure: the parcel the model judged, and the grade vs the note (owner audit #27/#31) ── */

test("the AI's parcel survives normalisation, so Review can say what the piece ships as", () => {
  const d = normalizeDraft({ title: "Coat", parcel: { weightOz: 44, lengthIn: 16, widthIn: 12, heightIn: 6 } });
  assert.deepEqual(d.parcel, { weightOz: 44, lengthIn: 16, widthIn: 12, heightIn: 6 });
  assert.equal(normalizeDraft({ title: "Coat", parcel: { weightOz: "heavy" } }).parcel, undefined);
  assert.equal(normalizeDraft({ title: "Coat" }).parcel, undefined);
});

test("condition splits into the grade on the scale and the model's sentence as the note", () => {
  const d = normalizeDraft({ conditionGrade: "Very Good", condition: { value: "Very good: light wear to the sole", confidence: 0.8 } });
  assert.equal(d.condition, "Very good");
  assert.equal(d.conditionNote, "Very good: light wear to the sole");
  // The pricer's top grade maps onto the scale's.
  assert.equal(normalizeDraft({ conditionGrade: "Deadstock/NWT" }).condition, "Mint");
  // No grade, a bare sentence: the nearest grade, and the sentence kept as the note.
  const bare = normalizeDraft({ condition: { value: "Excellent: barely worn", confidence: 0.7 } });
  assert.equal(bare.condition, "Excellent");
  assert.equal(bare.conditionNote, "Excellent: barely worn");
  // A sentence that IS just a grade needs no note.
  assert.equal(normalizeDraft({ condition: "Good" }).conditionNote, undefined);
});

test("cost is what she typed, in major units, and a blank is unknown rather than free", () => {
  assert.equal(costFromText("140"), 140);
  assert.equal(costFromText("£33.50"), 33.5);
  assert.equal(costFromText(12), 12);
  assert.equal(costFromText(""), undefined);
  assert.equal(costFromText("   "), undefined);
  assert.equal(costFromText(undefined), undefined);
  assert.equal(costFromText(-4), undefined);
});

test("an AI placeholder is not a value", () => {
  assert.equal(hasRealValue("Prada"), true);
  assert.equal(hasRealValue("  Re-Nylon  "), true);
  for (const v of ["N/A", "n/a", "na", "None", "unknown", "Unsure", "not sure", "Not applicable", "n.a."]) {
    assert.equal(hasRealValue(v), false, `${v} should not count as a value`);
  }
  assert.equal(hasRealValue(""), false);
  assert.equal(hasRealValue(null), false);
  assert.equal(hasRealValue(undefined), false);
});

test("the phone carries the model's own price through to the pricer", () => {
  // The Todd Oldham split: 1,681 on the web and 16,013 on the phone, same photo, same endpoints.
  // The desktop sent knowledgeHintCents and the phone did not, and price-engine falls back to it
  // when the comparables are useless, which they were (Chanel handbags for a dress).
  const hint = (priceHint: unknown) =>
    typeof priceHint === "number" && priceHint > 0 ? priceHint * 100 : null;
  assert.equal(hint(1681), 168100, "dollars in, cents out: the route multiplies by 100");
  assert.equal(hint(0), null);
  assert.equal(hint(null), null);
  assert.equal(hint(undefined), null);
  assert.equal(hint("1681"), null, "a string is not a price");
});

/* ── AI unsure. Confirm ─────────────────────────────────────────────────── */

// The web marks brand/era/material "● AI unsure. Confirm" when the model filled a blank with
// something it wasn't sure of (RISKY + THRESHOLD in add-listing/page.tsx). The phone dropped the
// confidence numbers entirely, so a Todd Oldham dress could come back branded Chanel and read as
// confidently as a brand off a legible tag.

const risky = (value: string, confidence: number) => ({ value, confidence });

test("a low-confidence guess at a blank field is queried", () => {
  const draft = { brand: risky("Chanel", 0.4), era: risky("1990s", 0.9), material: risky("Silk", 0.2) };
  assert.deepEqual(unsureFields(draft, {}), ["brand", "material"]);
});

test("what she typed herself is never queried, however unsure the model was", () => {
  const draft = { brand: risky("Chanel", 0.1), era: risky("1990s", 0.1) };
  assert.deepEqual(unsureFields(draft, { brand: "Todd Oldham" }), ["era"]);
  assert.deepEqual(unsureFields(draft, { brand: "Todd Oldham", era: "1995" }), []);
  // Whitespace is not an answer.
  assert.deepEqual(unsureFields(draft, { brand: "   " }), ["brand", "era"]);
});

test("a refusal is not a low-confidence answer; there is nothing to confirm about a blank", () => {
  assert.deepEqual(unsureFields({ brand: risky("N/A", 0.1), era: risky("Unknown", 0.2), material: risky("", 0.1) }, {}), []);
});

test("exactly at the threshold is confident enough, matching the web's strict <", () => {
  assert.deepEqual(unsureFields({ brand: risky("Prada", CONFIDENCE_THRESHOLD) }, {}), []);
  assert.deepEqual(unsureFields({ brand: risky("Prada", CONFIDENCE_THRESHOLD - 0.01) }, {}), ["brand"]);
});

test("only the three the web queries; a plain string carries no confidence to judge", () => {
  // title/category/description are not on the list even when the payload wraps them.
  assert.deepEqual(unsureFields({ title: risky("A dress", 0.1), category: risky("dresses", 0.1) }, {}), []);
  // Fields that arrive as bare strings have no confidence, so they cannot be unsure.
  assert.deepEqual(unsureFields({ brand: "Chanel", era: "1990s" }, {}), []);
});

test("a missing or malformed draft is not an error", () => {
  assert.deepEqual(unsureFields(null, {}), []);
  assert.deepEqual(unsureFields(undefined, {}), []);
  assert.deepEqual(unsureFields("nope", {}), []);
  assert.deepEqual(unsureFields({}, {}), []);
  assert.deepEqual(unsureFields({ brand: risky("Chanel", 0.4) }), ["brand"]);
});
