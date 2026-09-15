import { test } from "node:test";
import assert from "node:assert/strict";
import { zoneFor, quoteShipping, servedZones, normalizeZones, tierPriceCents, DEFAULT_ZONES, shipsTo, describeServedZones, shippingReach } from "./shipping-zones.ts";

const MEDIUM = { weightOz: 30, lengthIn: 14, widthIn: 10, heightIn: 4 };

test("home always wins over the geographic buckets", () => {
 // A French store posting to Paris is domestic, not "Europe". Otherwise the cheapest possible
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

test("a rate left over on a zone is not charged: VYA prices the parcel", () => {
 // This asserted 2500, the store's own number. Postage is VYA's to price now, and a rate saved by
 // the old settings form is inert rather than a trap nobody can reach (shipping-prices-core.ts).
 const q = quoteShipping({
  fromCountry: "GB", toCountry: "US", parcel: MEDIUM,
  zones: { north_america: { enabled: true, rates: { medium: 2500 } } },
 });
 assert.equal(q.ok, true);
 if (q.ok) { assert.equal(q.amountCents, 4800); assert.equal(q.tier, "medium"); }
});

test("a served zone with no rate of its own is priced for the DISTANCE, not the domestic rate", () => {
 // THE BUG: this used to assert tierPriceCents("medium"), the home price, for a parcel crossing
 // the Atlantic. A store offering worldwide postage on flat pricing quoted its domestic rate on
 // every export and paid the difference out of the sale.
 const q = quoteShipping({
  fromCountry: "GB", toCountry: "US", parcel: MEDIUM,
  zones: { north_america: { enabled: true } },
 });
 assert.equal(q.ok, true);
 if (q.ok) {
  assert.ok(q.amountCents > tierPriceCents("medium"), "an export costs more than posting at home");
  assert.equal(q.amountCents, 4800); // 1400 × 3.4 (far), rounded up to the whole unit
 }
});

test("the same zone costs less to a store that lives in it", () => {
 // "europe" is Paris-from-London and Paris-from-Chicago, and they are not the same parcel. The
 // single default table charged them identically.
 const near = quoteShipping({ fromCountry: "GB", toCountry: "FR", parcel: MEDIUM, zones: { europe: { enabled: true } } });
 const far = quoteShipping({ fromCountry: "US", toCountry: "FR", parcel: MEDIUM, zones: { europe: { enabled: true } } });
 assert.equal(near.ok && far.ok, true);
 if (near.ok && far.ok) assert.ok(near.amountCents < far.amountCents, "London to Paris beats Chicago to Paris");
});

test("a store that has not said where it stands is priced as far", () => {
 // The cautious answer. An unknown origin cannot be assumed next door to the buyer, and guessing
 // near would sell postage below what the label costs.
 const unknown = quoteShipping({ fromCountry: "", toCountry: "FR", parcel: MEDIUM, zones: { europe: { enabled: true } } });
 const chicago = quoteShipping({ fromCountry: "US", toCountry: "FR", parcel: MEDIUM, zones: { europe: { enabled: true } } });
 assert.equal(unknown.ok && chicago.ok, true);
 if (unknown.ok && chicago.ok) assert.equal(unknown.amountCents, chicago.amountCents);
});

test("a zero left on a zone is not free postage either", () => {
 // The most expensive leftover of the lot: a real label bought against a price of nothing, set by
 // the one party that never pays for it.
 const q = quoteShipping({
  fromCountry: "GB", toCountry: "US", parcel: MEDIUM,
  zones: { north_america: { enabled: true, rates: { medium: 0 } } },
 });
 assert.equal(q.ok, true);
 if (q.ok) assert.equal(q.amountCents, 4800);
});

test("normalizeZones drops a rate rather than storing it", () => {
 // So the rows that already hold one clear themselves the next time the store saves anything.
 const z = normalizeZones({ domestic: { enabled: true, rates: { small: 100, medium: 100 } }, europe: { enabled: true, rates: { large: 0 } } });
 assert.deepEqual(z.domestic, { enabled: true });
 assert.deepEqual(z.europe, { enabled: true });
});

test("the parcel still decides the tier inside a zone", () => {
 const zones = { north_america: { enabled: true } };
 const small = quoteShipping({ fromCountry: "GB", toCountry: "US", parcel: { weightOz: 8, lengthIn: 8, widthIn: 6, heightIn: 2 }, zones });
 const large = quoteShipping({ fromCountry: "GB", toCountry: "US", parcel: { weightOz: 200, lengthIn: 24, widthIn: 18, heightIn: 10 }, zones });
 assert.equal(small.ok && large.ok, true);
 if (small.ok && large.ok) {
  assert.equal(small.tier, "small");
  assert.equal(large.tier, "large");
  assert.ok(large.amountCents > small.amountCents, "a bigger parcel costs more to send");
 }
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

// ── Telling a shopper where a store posts, before she types an address ───────
// The rule already existed at checkout and nowhere earlier: a shopper in a country a store doesn't
// serve chose a piece, filled in a full address and was refused at the card.

test("shipsTo answers the checkout question without an address", () => {
 const uk = { domestic: { enabled: true }, europe: { enabled: true }, north_america: { enabled: false }, rest_of_world: { enabled: false } };
 assert.equal(shipsTo(uk, "GB", "GB"), true);
 assert.equal(shipsTo(uk, "GB", "FR"), true);
 assert.equal(shipsTo(uk, "GB", "US"), false);
 assert.equal(shipsTo(uk, "GB", "AU"), false);
 // A US store with the same config reads its OWN country as domestic.
 assert.equal(shipsTo(uk, "US", "US"), true);
 assert.equal(shipsTo(uk, "US", "GB"), true);
});

test("where a store ships, as a phrase", () => {
 assert.equal(describeServedZones({ domestic: { enabled: true }, europe: { enabled: false }, north_america: { enabled: false }, rest_of_world: { enabled: false } }, "GB"), "GB");
 assert.equal(
  describeServedZones({ domestic: { enabled: true }, europe: { enabled: true }, north_america: { enabled: true }, rest_of_world: { enabled: true } }, "GB"),
  "worldwide",
 );
 assert.equal(
  describeServedZones({ domestic: { enabled: true }, europe: { enabled: true }, north_america: { enabled: false }, rest_of_world: { enabled: false } }, "GB"),
  "GB and Europe",
 );
});

test("with no idea where she is, it says where the store ships and claims nothing about her", () => {
 const uk = { domestic: { enabled: true }, europe: { enabled: true }, north_america: { enabled: false }, rest_of_world: { enabled: false } };
 const unknown = shippingReach(uk, "GB");
 assert.equal(unknown.ships, null);
 assert.match(unknown.line, /^Ships to GB and Europe\.$/);
 // A junk country is not a guess either.
 assert.equal(shippingReach(uk, "GB", "not-a-country").ships, null);

 const outside = shippingReach(uk, "GB", "US");
 assert.equal(outside.ships, false);
 assert.match(outside.line, /doesn't post to US/);
 assert.match(outside.line, /GB and Europe/);

 assert.equal(shippingReach(uk, "GB", "FR").ships, true);
});
