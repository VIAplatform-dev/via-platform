import { test } from "node:test";
import assert from "node:assert/strict";
import { zoneFor, quoteShipping, servedZones, normalizeZones, tierPriceCents, DEFAULT_ZONES } from "./shipping-zones.ts";

const MEDIUM = { weightOz: 30, lengthIn: 14, widthIn: 10, heightIn: 4 };

test("home always wins over the geographic buckets", () => {
 // A French store posting to Paris is domestic, not "Europe" — otherwise the cheapest possible
 // parcel gets charged the export rate.
 assert.equal(zoneFor("FR", "FR"), "domestic");
 assert.equal(zoneFor("GB", "GB"), "domestic");
});

test("destinations land in the right bucket", () => {
 assert.equal(zoneFor("US", "GB"), "europe");
 assert.equal(zoneFor("GB", "US"), "north_america");
 assert.equal(zoneFor("GB", "AU"), "rest_of_world");
 assert.equal(zoneFor("US", "MX"), "north_america");
});

test("an unreadable destination falls to rest of world, never to domestic", () => {
 // Falling to domestic would price an unknown destination at the cheapest rate.
 assert.equal(zoneFor("GB", ""), "rest_of_world");
 assert.equal(zoneFor("GB", null), "rest_of_world");
});

test("by default a store ships only at home", () => {
 assert.deepEqual(servedZones(DEFAULT_ZONES), ["domestic"]);
 const q = quoteShipping({ fromCountry: "GB", toCountry: "GB", parcel: MEDIUM });
 assert.equal(q.ok, true);
});

test("an unserved destination is refused, not priced", () => {
 // The shopper needs "we don't ship there", not a price the store can't honour.
 const q = quoteShipping({ fromCountry: "GB", toCountry: "US", parcel: MEDIUM });
 assert.equal(q.ok, false);
 if (!q.ok) { assert.equal(q.reason, "not-served"); assert.equal(q.zone, "north_america"); }
});

test("a served zone uses its own rate", () => {
 const q = quoteShipping({
  fromCountry: "GB", toCountry: "US", parcel: MEDIUM,
  zones: { north_america: { enabled: true, rates: { medium: 2500 } } },
 });
 assert.equal(q.ok, true);
 if (q.ok) { assert.equal(q.amountCents, 2500); assert.equal(q.tier, "medium"); }
});

test("a served zone with no rate of its own falls back to the standard tier price", () => {
 const q = quoteShipping({
  fromCountry: "GB", toCountry: "US", parcel: MEDIUM,
  zones: { north_america: { enabled: true } },
 });
 assert.equal(q.ok, true);
 if (q.ok) assert.equal(q.amountCents, tierPriceCents("medium"));
});

test("a zone rate of zero is free shipping, not a missing field", () => {
 const q = quoteShipping({
  fromCountry: "GB", toCountry: "US", parcel: MEDIUM,
  zones: { north_america: { enabled: true, rates: { medium: 0 } } },
 });
 assert.equal(q.ok, true);
 if (q.ok) assert.equal(q.amountCents, 0);
});

test("the parcel still decides the tier inside a zone", () => {
 const zones = { north_america: { enabled: true, rates: { small: 1200, large: 4000 } } };
 const small = quoteShipping({ fromCountry: "GB", toCountry: "US", parcel: { weightOz: 8, lengthIn: 8, widthIn: 6, heightIn: 2 }, zones });
 const large = quoteShipping({ fromCountry: "GB", toCountry: "US", parcel: { weightOz: 200, lengthIn: 24, widthIn: 18, heightIn: 10 }, zones });
 if (small.ok) assert.equal(small.amountCents, 1200);
 if (large.ok) assert.equal(large.amountCents, 4000);
});

test("home can never be switched off", () => {
 // A store that ships nowhere isn't a store; the form can't produce that state.
 const z = normalizeZones({ domestic: { enabled: false }, europe: { enabled: true } });
 assert.equal(z.domestic?.enabled, true);
 assert.equal(z.europe?.enabled, true);
});

test("junk from a form doesn't become a rate", () => {
 const z = normalizeZones({ europe: { enabled: true, rates: { medium: "abc", small: -5, large: 999999999 } } });
 assert.equal(z.europe?.rates?.medium, undefined);
 assert.equal(z.europe?.rates?.small, undefined);
 assert.equal(z.europe?.rates?.large, undefined);
});

test("normalising nothing gives the closed default", () => {
 assert.deepEqual(servedZones(normalizeZones(null)), ["domestic"]);
 assert.deepEqual(servedZones(normalizeZones(undefined)), ["domestic"]);
});
