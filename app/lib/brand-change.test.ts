import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyBrandCorrection, describeReprice, describeStale, mentionsBrand, priceIsStale, rewriteBrand,
  shouldReprice, staleBrandMentions,
} from "./brand-change";

// A Roberto Cavalli bustier drafted as Dolce & Gabbana. The seller fixes the Brand field, which is
// the one place she was looking, and the title and description still say Dolce & Gabbana. Live,
// that does not read as a typo. It reads as a counterfeit.

const LISTING = {
  title: "Dolce & Gabbana leopard print bustier",
  description: "This Dolce and Gabbana piece is cut close through the body, with the house's signature print.",
  conditionNote: "Light wear to the hem.",
};

test("the fields that still name the old brand are found, and the ones that don't are left alone", () => {
  const stale = staleBrandMentions("Dolce & Gabbana", "Roberto Cavalli", LISTING);
  assert.deepEqual(stale?.fields, ["title", "description"]);
  assert.equal(stale?.from, "Dolce & Gabbana");
  assert.equal(stale?.to, "Roberto Cavalli");
});

test("a brand is caught however it was written", () => {
  // A seller types one spelling; the drafter writes another. Matching only the canonical one is
  // the difference between catching a stale mention and shipping it.
  for (const written of ["Dolce & Gabbana", "Dolce and Gabbana", "Dolce&Gabbana", "dolce gabbana", "DOLCE + GABBANA"]) {
    assert.equal(mentionsBrand(`A ${written} top`, "Dolce & Gabbana"), true, written);
  }
  assert.equal(mentionsBrand("A Prada top", "Dolce & Gabbana"), false);
});

test("a word inside another word is not a mention", () => {
  // "Dior" must not match "Diorama", or a correction rewrites the middle of a real word.
  assert.equal(mentionsBrand("A Diorama print skirt", "Dior"), false);
  assert.equal(mentionsBrand("A Dior skirt", "Dior"), true);
});

test("nothing to fix is the common case, and says so", () => {
  assert.equal(staleBrandMentions("Prada", "Roberto Cavalli", LISTING), null);
  assert.equal(staleBrandMentions("", "Roberto Cavalli", LISTING), null);
  assert.equal(staleBrandMentions("Dolce & Gabbana", "", LISTING), null);
  assert.equal(staleBrandMentions("Dolce & Gabbana", "Dolce & Gabbana", LISTING), null);
  assert.equal(staleBrandMentions("Prada", "Prada", { title: "A Prada bag" }), null);
});

test("refining a name is not correcting it", () => {
  // "Dior" → "Christian Dior" leaves the words underneath correct. Offering to rewrite them is
  // noise, and accepting would produce "A Christian Dior Christian Dior skirt".
  assert.equal(staleBrandMentions("Dior", "Christian Dior", { title: "A Dior skirt" }), null);
});

test("the correction rewrites every mention, in every stale field, and touches nothing else", () => {
  const stale = staleBrandMentions("Dolce & Gabbana", "Roberto Cavalli", LISTING)!;
  // A PATCH: only what changed, so a caller can spread it over its own state.
  const patch = applyBrandCorrection(LISTING, stale);
  assert.deepEqual(Object.keys(patch).sort(), ["description", "title"]);
  const fixed = { ...LISTING, ...patch };
  assert.equal(fixed.title, "Roberto Cavalli leopard print bustier");
  assert.equal(
    fixed.description,
    "This Roberto Cavalli piece is cut close through the body, with the house's signature print.",
  );
  // Untouched: it never named the brand, so the patch does not mention it at all.
  assert.equal(fixed.conditionNote, LISTING.conditionNote);
  assert.equal("conditionNote" in patch, false);
});

test("two mentions in one field are both rewritten", () => {
  assert.equal(
    rewriteBrand("Dolce & Gabbana, the Dolce and Gabbana of the 2000s", "Dolce & Gabbana", "Roberto Cavalli"),
    "Roberto Cavalli, the Roberto Cavalli of the 2000s",
  );
});

test("the sentence names the fields rather than counting them", () => {
  assert.equal(
    describeStale({ fields: ["title", "description"], from: "Dolce & Gabbana", to: "Roberto Cavalli" }),
    "The title and the description still say Dolce & Gabbana.",
  );
  assert.equal(
    describeStale({ fields: ["description"], from: "Prada", to: "Miu Miu" }),
    "The description still says Prada.",
  );
});

test("a price she typed is hers; a price the AI worked out is stale", () => {
  // The comps count is the tell: only a pricing run sets it.
  assert.equal(priceIsStale({ compsCount: 3, priceTypedByHer: false }), true);
  assert.equal(priceIsStale({ compsCount: 3, priceTypedByHer: true }), false);
  assert.equal(priceIsStale({ compsCount: 0, priceTypedByHer: false }), false);
  assert.equal(priceIsStale({ compsCount: null, priceTypedByHer: false }), false);
});

test("the price is only re-run when it is ours, and there is something to re-run it on", () => {
  const ok = { brandChanged: true, hasPhotos: true, compsCount: 4, priceTypedByHer: false };
  assert.equal(shouldReprice(ok), true);
  // She typed the number. That is a decision, not a guess we are free to overrule.
  assert.equal(shouldReprice({ ...ok, priceTypedByHer: true }), false);
  // Nothing priced it yet: there is no stale number, and Fill with AI will price it with the
  // brand already in hand.
  assert.equal(shouldReprice({ ...ok, compsCount: null }), false);
  // The pricer reads the photographs. With none, the call has nothing to work from.
  assert.equal(shouldReprice({ ...ok, hasPhotos: false }), false);
  // Left the field without changing anything: the commonest blur of all.
  assert.equal(shouldReprice({ ...ok, brandChanged: false }), false);
});

test("the line says what the number was, and says something when it did not move", () => {
  assert.equal(describeReprice("Dior", "$20", "$340"), "Repriced for Dior: $20 to $340.");
  assert.equal(
    describeReprice("Dior", "$340", "$340"),
    "Checked against Dior sales: $340 still looks right.",
  );
  // No old number to show (she had none before the run).
  assert.equal(describeReprice("Dior", null, "$340"), "Checked against Dior sales: $340 still looks right.");
});
