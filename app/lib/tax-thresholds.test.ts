import { test } from "node:test";
import assert from "node:assert/strict";
import { TAX_THRESHOLDS, thresholdFor, hasConfirmedThreshold, unconfirmedNote, internationalNote } from "./tax-thresholds.ts";

test("the figures we print are the ones that were confirmed", () => {
 // Checked against the authorities on 14 Sep 2026. If one of these changes, the test is the thing
 // that should fail, before a seller reads a stale number and acts on it.
 assert.equal(thresholdFor("GB")?.amount, "£90,000");
 assert.equal(thresholdFor("GB")?.tax, "VAT");
 assert.equal(thresholdFor("CA")?.amount, "CAD $30,000");
 assert.equal(thresholdFor("CA")?.tax, "GST/HST");
 assert.equal(thresholdFor("AU")?.amount, "AUD $75,000");
});

test("a country we have not confirmed gets no number at all", () => {
 // Never a guess. A made-up threshold on a tax page is worse than an empty one.
 for (const c of ["US", "FR", "DE", "JP", "", "United Kingdom", null, undefined]) {
  assert.equal(thresholdFor(c), null, JSON.stringify(c));
  assert.equal(hasConfirmedThreshold(c), false, JSON.stringify(c));
 }
 assert.equal(thresholdFor("gb")?.amount, "£90,000", "case is not a way to miss");
});

test("an EU store is told its own country decides, and that several are zero", () => {
 assert.match(unconfirmedNote("FR"), /country by country/);
 assert.match(unconfirmedNote("IE"), /zero/);
 // And a country outside both gets the general sentence rather than the EU one.
 assert.doesNotMatch(unconfirmedNote("JP"), /country by country/);
 assert.match(unconfirmedNote("JP"), /threshold/);
});

test("every entry can be checked by the seller, and says when we last did", () => {
 const yearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
 for (const [country, t] of Object.entries(TAX_THRESHOLDS)) {
  assert.match(t.url, /^https:\/\//, country);
  assert.match(t.asOf, /^\d{4}-\d{2}-\d{2}$/, country);
  assert.ok(t.authority.length > 0 && t.period.length > 0, country);
  // A tax page nobody has revisited in over a year is a liability, not a feature.
  assert.ok(t.asOf > yearAgo, `${country}: last checked ${t.asOf}, which is over a year ago. Re-confirm it.`);
 }
});

test("the international note neither reassures nor frightens", () => {
 const n = internationalNote();
 // The instinct it confirms: shipping abroad does not put you over your home threshold.
 assert.match(n, /doesn't put you over your own country's threshold/);
 // And the hole in it, which is the only reason the sentence is worth printing.
 assert.match(n, /[Ll]ow-value/);
 // Whose registration it is, said rather than implied. She is merchant of record on VYA.
 assert.match(n, /your registration to make, not VYA's/);
 // And it stops short of telling her what her position IS, because that is not ours to say.
 assert.match(n, /accountant/);
});
