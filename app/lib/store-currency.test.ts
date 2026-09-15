import { test } from "node:test";
import assert from "node:assert/strict";
import { currencyForCountry, resolveStoreCurrency, currencyToAdoptOnAddress } from "./store-currency.ts";

test("the address answers it, for the countries VYA's stores are in", () => {
 assert.equal(currencyForCountry("GB"), "GBP");
 assert.equal(currencyForCountry("CA"), "CAD");
 assert.equal(currencyForCountry("US"), "USD");
 assert.equal(currencyForCountry("AU"), "AUD");
 // The euro is twenty countries, not one.
 for (const c of ["FR", "DE", "IE", "IT", "ES", "NL", "PT"]) assert.equal(currencyForCountry(c), "EUR", c);
 // And a European country that is not in the euro keeps its own.
 assert.equal(currencyForCountry("CH"), "CHF");
 assert.equal(currencyForCountry("SE"), "SEK");
 assert.equal(currencyForCountry("PL"), "PLN");
});

test("a country we have no answer for returns null, not a guess", () => {
 // Null means "leave it alone". Answering USD here would write over a seller's own choice with a
 // currency her country does not use.
 for (const c of ["ZW", "FJ", "", "  ", "United Kingdom", 42, null, undefined]) {
  assert.equal(currencyForCountry(c), null, JSON.stringify(c));
 }
 assert.equal(currencyForCountry("gb"), "GBP", "case is not a way to miss");
});

test("what she chose beats everything", () => {
 // A Berlin shop pricing in USD for an American audience is a real thing.
 assert.equal(resolveStoreCurrency({ chosen: "USD", shipFromCountry: "DE", legacy: "EUR" }), "USD");
 assert.equal(resolveStoreCurrency({ chosen: "eur", shipFromCountry: "US" }), "EUR");
});

test("with no choice, the address decides, and only then the old partner list", () => {
 assert.equal(resolveStoreCurrency({ shipFromCountry: "GB" }), "GBP");
 assert.equal(resolveStoreCurrency({ shipFromCountry: "CA", legacy: "USD" }), "CAD");
 // THE BUG: this is the case where every store that signed up after the array was written landed.
 assert.equal(resolveStoreCurrency({}), "USD");
 // An original partner shop with no ship-from keeps what it has always had.
 assert.equal(resolveStoreCurrency({ legacy: "GBP" }), "GBP");
});

test("junk never becomes a currency", () => {
 for (const bad of ["$", "pounds", "GBPX", "", "  ", 12]) {
  assert.equal(resolveStoreCurrency({ chosen: bad as string, shipFromCountry: "GB" }), "GBP", JSON.stringify(bad));
 }
});

test("saving an address only sets the currency when nothing was chosen", () => {
 assert.equal(currencyToAdoptOnAddress({ shipFromCountry: "GB" }), "GBP");
 assert.equal(currencyToAdoptOnAddress({ chosen: null, shipFromCountry: "CA" }), "CAD");
 // Moving a studio across a border is not an instruction to re-price the whole catalogue.
 assert.equal(currencyToAdoptOnAddress({ chosen: "GBP", shipFromCountry: "FR" }), null);
 // And an address in a country we have no answer for changes nothing.
 assert.equal(currencyToAdoptOnAddress({ shipFromCountry: "ZW" }), null);
});
