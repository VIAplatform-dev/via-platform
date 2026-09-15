import { test } from "node:test";
import assert from "node:assert/strict";
import { describeZoneCoverage, shipsToLine, countryShortName } from "./ships-to-core.ts";

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

test("null zones means shipping is off, say nothing; the Buy button already handles it", () => {
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

// ── what a zone actually covers ───────────────────────────────────────────────

test("a zone names its countries instead of gesturing at them", () => {
 // The question this answers: "can somebody in Israel buy from me?" Europe saying "the EEA and its
 // near neighbours" did not settle Switzerland, let alone Israel.
 const eu = describeZoneCoverage("europe", "US");
 assert.equal(eu.count, 39);
 assert.ok(eu.names.includes("Switzerland") && eu.names.includes("Serbia"));
 assert.match(eu.summary, /39 countries/);
 // Alphabetical, so the list doesn't reshuffle between renders.
 assert.deepEqual(eu.names, [...eu.names].sort((a, b) => a.localeCompare(b)));
});

test("a zone's membership depends on where the store stands", () => {
 // THE BUG: the page said North America was "United States, Canada, Mexico" while, for a US store,
 // the United States is a different zone on that same page. Domestic wins (zoneFor).
 assert.deepEqual(describeZoneCoverage("north_america", "US").names, ["Canada", "Mexico"]);
 assert.ok(describeZoneCoverage("north_america", "GB").names.includes("US"));
 // Same for a London shop looking at Europe: its own country is not one of the 39.
 assert.equal(describeZoneCoverage("europe", "GB").count, 38);
 assert.ok(!describeZoneCoverage("europe", "GB").names.includes("UK"));
 assert.equal(describeZoneCoverage("europe", "US").count, 39);
});

test("rest of world is the remainder and says so, with Israel named", () => {
 // It cannot be enumerated: it is every country not in the other two, about 150 of them. What a
 // seller needs is whether a particular place is in it, so the examples are spread across the map.
 const row = describeZoneCoverage("rest_of_world", "US");
 assert.equal(row.count, null);
 assert.deepEqual(row.names, []);
 assert.match(row.summary, /Israel/);
 assert.match(row.summary, /not listed above/i);
});

test("a store with no ship-from still gets a readable answer", () => {
 for (const home of [undefined, null, "", "United States"]) {
  const eu = describeZoneCoverage("europe", home);
  assert.equal(eu.count, 39, String(home));
  assert.ok(eu.summary.length > 0);
 }
 // And its own country is empty rather than a broken line.
 assert.equal(describeZoneCoverage("domestic", "").names.length, 0);
 assert.match(describeZoneCoverage("domestic", "").summary, /Nowhere else/);
});
