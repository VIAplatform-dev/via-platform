import { test } from "node:test";
import assert from "node:assert/strict";
import { symbolToIso, toUsdCents, lensPriceToUsdCents } from "./currency.ts";

// The €450-as-$450 bug: Lens visual matches carry a currency symbol (or ISO code), and every
// price must resolve to an ISO code before it may enter the comp pool.
test("symbolToIso maps common symbols and passes ISO codes through", () => {
 assert.equal(symbolToIso("$"), "USD");
 assert.equal(symbolToIso("US$"), "USD");
 assert.equal(symbolToIso("€"), "EUR");
 assert.equal(symbolToIso("£"), "GBP");
 assert.equal(symbolToIso("¥"), "JPY");
 assert.equal(symbolToIso("C$"), "CAD");
 assert.equal(symbolToIso("A$"), "AUD");
 assert.equal(symbolToIso("EUR"), "EUR");
 assert.equal(symbolToIso("gbp"), "GBP");
});

test("symbolToIso refuses to guess ambiguous or unknown symbols", () => {
 assert.equal(symbolToIso("kr"), null); // SEK? DKK? NOK? — ambiguous, don't guess
 assert.equal(symbolToIso("¤"), null);
 assert.equal(symbolToIso(""), null);
 assert.equal(symbolToIso(null), null);
 assert.equal(symbolToIso(undefined), null);
});

test("toUsdCents passes USD through unchanged", () => {
 assert.equal(toUsdCents(45000, "USD"), 45000);
});

test("toUsdCents converts EUR and GBP at the config rate", () => {
 // Exact values depend on FX_TO_USD in data-layer/config.ts — assert direction + rounding,
 // not a hardcoded rate: EUR and GBP are both worth MORE than a dollar.
 const eur = toUsdCents(45000, "EUR");
 assert.ok(eur != null && eur > 45000, `expected €450 to exceed $450, got ${eur}`);
 const gbp = toUsdCents(45000, "GBP");
 assert.ok(gbp != null && gbp > (eur as number), "GBP should convert above EUR");
 assert.ok(Number.isInteger(eur) && Number.isInteger(gbp), "cents stay integers");
});

// SerpApi Lens price objects: {value: "€450*", extracted_value: 450, currency: "€"}. This is
// where the €-as-$ bug lived — the old path took extracted_value and assumed dollars.
test("lensPriceToUsdCents converts by the Lens currency symbol", () => {
 assert.equal(lensPriceToUsdCents({ value: "$966*", extracted_value: 966, currency: "$" }), 96600);
 const eur = lensPriceToUsdCents({ value: "€450*", extracted_value: 450, currency: "€" });
 assert.ok(eur != null && eur > 45000, `€450 must exceed $450, got ${eur}`);
});

test("lensPriceToUsdCents assumes USD only when currency is absent (US-targeted search), never for unknown symbols", () => {
 assert.equal(lensPriceToUsdCents({ extracted_value: 120 }), 12000);
 assert.equal(lensPriceToUsdCents({ extracted_value: 1200, currency: "kr" }), null); // ambiguous → unpriced (link-verify can rescue it)
 assert.equal(lensPriceToUsdCents({ currency: "$" }), null);
 assert.equal(lensPriceToUsdCents(null), null);
});

// Resale comps surface from Gulf/Asian boutiques too — a real AED product page was dropped
// for want of a rate. Pegged/stable currencies are cheap to support and safe to convert.
test("toUsdCents supports the currencies resale comps actually appear in", () => {
 for (const iso of ["AED", "HKD", "SGD", "CNY", "JPY", "SEK", "DKK", "NOK", "PLN", "CHF", "CAD", "AUD"]) {
  const v = toUsdCents(100000, iso);
  assert.ok(v != null && v > 0, `${iso} should convert, got ${v}`);
 }
});

test("toUsdCents drops unknown currencies rather than guessing", () => {
 assert.equal(toUsdCents(45000, "XYZ"), null);
 assert.equal(toUsdCents(45000, null), null);
 assert.equal(toUsdCents(0, "USD"), null); // non-positive is never a price
});
