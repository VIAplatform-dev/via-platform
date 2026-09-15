import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  starterTiers, tierToText, textToCents, formFromTiers, tiersFromForm,
  termsProblem, termsPayload, termsSummary, tierLabel, TIER_DAYS,
} from "./rental-terms.ts";

test("the opening ladder matches the web's, proportions included", () => {
  // A seller who prices a piece on the phone and reopens it on a laptop must not be shown a
  // different set of suggestions for the same piece.
  const web = fs.readFileSync(
    path.join(process.cwd(), "..", "app", "infrastructure", "admin", "rentals", "RentalPanel.tsx"), "utf8",
  );
  const m = web.match(/return \[\{ days: 4, cents: at\((\d+)\) \}, \{ days: 7, cents: at\((\d+)\) \}, \{ days: 28, cents: at\((\d+)\) \}\]/);
  assert.ok(m, "the web's starterTiers no longer has the shape this test reads");
  assert.deepEqual([m[1], m[2], m[3]].map(Number), [15, 20, 40]);

  // …and the arithmetic agrees at a real price.
  assert.deepEqual(starterTiers(30000), [
    { days: 4, cents: 4500 }, { days: 7, cents: 6000 }, { days: 28, cents: 12000 },
  ]);
});

test("a suggestion is never zero, because the route filters zeroes out", () => {
  // The toggle used to look broken: three lengths at zero, save filters them all, "give at least
  // one length a price".
  for (const c of starterTiers(1)) assert.ok(c.cents >= 100, JSON.stringify(c));
  for (const c of starterTiers(500)) assert.ok(c.cents >= 100, JSON.stringify(c));
});

test("an unpriced piece still offers the three lengths to fill in", () => {
  assert.deepEqual(starterTiers(0).map((t) => t.days), [...TIER_DAYS]);
  assert.deepEqual(starterTiers(null).map((t) => t.cents), [0, 0, 0]);
});

test("whole units in the box, cents on the wire", () => {
  assert.equal(tierToText(4500), "45");
  assert.equal(tierToText(0), "");
  assert.equal(textToCents("45"), 4500);
  assert.equal(textToCents("£45"), 4500);
  assert.equal(textToCents(""), 0);
  assert.equal(textToCents("abc"), 0);
  assert.equal(textToCents(null), 0);
});

test("a form round-trips through the tiers it came from", () => {
  const tiers = starterTiers(30000);
  const form = formFromTiers(tiers, 45000);
  assert.deepEqual(tiersFromForm(form), tiers);
  assert.equal(form.replacement, "450");
});

test("an unpriced length is simply not on offer", () => {
  const form = { prices: { 4: "45", 7: "", 28: "120" }, replacement: "" };
  assert.deepEqual(tiersFromForm(form), [{ days: 4, cents: 4500 }, { days: 28, cents: 12000 }]);
});

test("it says why it cannot be saved BEFORE she taps save", () => {
  // The route rejects an empty ladder. That is the right rule and the wrong moment to learn it.
  assert.match(termsProblem({ prices: { 4: "", 7: "", 28: "" }, replacement: "" })!, /at least one length/i);
  assert.equal(termsProblem({ prices: { 4: "45", 7: "", 28: "" }, replacement: "" }), null);
});

test("a replacement value below the rental price is refused", () => {
  // Otherwise it is cheaper to keep the piece than to return it, which nobody means to offer.
  assert.match(termsProblem({ prices: { 4: "45" }, replacement: "20" })!, /more than the rental price/i);
  assert.equal(termsProblem({ prices: { 4: "45" }, replacement: "450" }), null);
  // No replacement value at all is allowed. It is optional.
  assert.equal(termsProblem({ prices: { 4: "45" }, replacement: "" }), null);
});

test("the payload is exactly what the route takes", () => {
  const p = termsPayload({ prices: { 4: "45", 7: "60", 28: "" }, replacement: "450" }, true);
  assert.deepEqual(p, {
    tiers: [{ days: 4, cents: 4500 }, { days: 7, cents: 6000 }],
    replacementCents: 45000,
    fitsSizes: null,
    alsoForSale: true,
  });
  assert.equal(termsPayload({ prices: { 4: "45" }, replacement: "" }, false).replacementCents, null);
});

test("the summary reads like a price list, in her currency", () => {
  const form = { prices: { 4: "45", 7: "60", 28: "120" }, replacement: "" };
  assert.equal(termsSummary(form, "USD"), "4 days $45 · 1 week $60 · 4 weeks $120");
  assert.equal(termsSummary(form, "GBP"), "4 days £45 · 1 week £60 · 4 weeks £120");
  assert.equal(termsSummary({ prices: {}, replacement: "" }, "USD"), null);
});

test("lengths are named the way a person says them", () => {
  assert.equal(tierLabel(4), "4 days");
  assert.equal(tierLabel(7), "1 week");
  assert.equal(tierLabel(28), "4 weeks");
});
