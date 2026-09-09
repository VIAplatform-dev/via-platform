import { test } from "node:test";
import assert from "node:assert/strict";
import { shipsToLine, countryShortName } from "./ships-to-core.ts";

test("a store that only ships at home says so, naming the country", () => {
 assert.equal(shipsToLine({ domestic: { enabled: true } }, "GB"), "UK only");
 assert.equal(shipsToLine({ domestic: { enabled: true } }, "US"), "US only");
 assert.equal(shipsToLine({ domestic: { enabled: true } }, "FR"), "France only");
});

test("the served zones are listed in order, joined the way a person would say them", () => {
 assert.equal(shipsToLine({ domestic: { enabled: true }, europe: { enabled: true }, north_america: { enabled: true } }, "GB"), "UK, Europe and North America");
 assert.equal(shipsToLine({ domestic: { enabled: true }, north_america: { enabled: true } }, "GB"), "UK and North America");
 assert.equal(shipsToLine({ domestic: { enabled: true }, rest_of_world: { enabled: true } }, "US"), "US and the rest of the world");
});

test("every zone on reads as Worldwide", () => {
 assert.equal(shipsToLine({ domestic: { enabled: true }, europe: { enabled: true }, north_america: { enabled: true }, rest_of_world: { enabled: true } }, "GB"), "Worldwide");
});

test("null zones means shipping is off — say nothing; the Buy button already handles it", () => {
 assert.equal(shipsToLine(null, "GB"), null);
 assert.equal(shipsToLine(undefined, "GB"), null);
});

test("an unknown ship-from country falls back to 'your country' rather than a blank", () => {
 assert.equal(shipsToLine({ domestic: { enabled: true } }, null), "Domestic only");
 assert.equal(shipsToLine({ domestic: { enabled: true }, europe: { enabled: true } }, ""), "Domestic and Europe");
});

test("country short names: the two big ones are initialisms, the rest are plain names", () => {
 assert.equal(countryShortName("gb"), "UK");
 assert.equal(countryShortName("UK"), "UK");
 assert.equal(countryShortName("US"), "US");
 assert.equal(countryShortName("DE"), "Germany");
 assert.equal(countryShortName("ZZ"), "ZZ");
});
