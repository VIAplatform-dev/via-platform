import { test } from "node:test";
import assert from "node:assert/strict";
import { destinationBar, canShipTo, refusalMessage, barredDestinations, EMBARGOED_COUNTRIES, SUSPENDED_COUNTRIES } from "./shipping-embargo.ts";
import { shipsTo, quoteShipping, shippingReach, DEFAULT_ZONES } from "./shipping-zones.ts";

// A store that has ticked every box, which the settings page invites and which is what made this
// necessary: "Rest of world" is a catch-all, so one checkbox offered Iran and North Korea.
const EVERYWHERE = {
 domestic: { enabled: true }, europe: { enabled: true },
 north_america: { enabled: true }, rest_of_world: { enabled: true },
};

test("the embargoed four are refused however the store has set its zones", () => {
 for (const c of EMBARGOED_COUNTRIES) {
  const bar = destinationBar(c);
  assert.equal(bar.barred, true, c);
  if (bar.barred) assert.equal(bar.reason, "embargo");
  // And through the two functions everything else routes on.
  assert.equal(shipsTo(EVERYWHERE, "US", c), false, `shipsTo ${c}`);
  const q = quoteShipping({ fromCountry: "US", toCountry: c, parcel: { weightOz: 8 }, zones: EVERYWHERE });
  assert.equal(q.ok, false, `quote ${c}`);
  if (!q.ok) assert.equal(q.reason, "restricted");
 }
});

test("a suspended country is refused too, and says something different", () => {
 for (const c of SUSPENDED_COUNTRIES) {
  const bar = destinationBar(c);
  assert.equal(bar.barred, true, c);
  // Not an accusation: the carriers stopped, so there is no label to buy.
  if (bar.barred) { assert.equal(bar.reason, "suspended"); assert.match(bar.message, /suspended/i); }
  assert.equal(canShipTo(c), false, c);
 }
});

test("Ukraine is shippable and its occupied regions are not", () => {
 // The reason Ukraine is NOT cut out of Europe. Refusing the whole country to avoid the awkward
 // part would refuse Kyiv to protect us from Crimea.
 assert.equal(canShipTo("UA"), true);
 assert.equal(canShipTo("UA", "Kyiv"), true);
 assert.equal(canShipTo("UA", "Lviv Oblast"), true);
 for (const region of [
  "Crimea", "Crimea Republic", "AR Krym", "Автономна Республіка Крим",
  "Sevastopol", "Севастополь",
  "Donetsk", "Donetska oblast", "Донецьк",
  "Luhansk", "Lugansk", "Луганськ",
 ]) {
  assert.equal(canShipTo("UA", region), false, region);
 }
});

test("a region only bars inside its own country", () => {
 // "Donetsk" typed into a US address line is not a sanctions match.
 assert.equal(canShipTo("US", "Donetsk"), true);
 assert.equal(canShipTo("GB", "Crimea"), true);
});

test("an address with no country yet decides nothing", () => {
 // A product page has no address. Guessing barred there would refuse a shopper who has not typed
 // anything; guessing allowed is correct, because checkout asks again with the real address.
 for (const v of [undefined, null, "", "  ", "United States", 42, {}]) {
  assert.equal(destinationBar(v).barred, false, JSON.stringify(v));
 }
});

test("case and whitespace are not a way around it", () => {
 for (const v of ["ir", " Ir ", "iR", "KP ", " kp"]) assert.equal(canShipTo(v), false, JSON.stringify(v));
});

test("a store's own zone choice still refuses, and reads differently", () => {
 // Two reasons, kept apart. One is the shop's decision; the other is not, and a shopper told the
 // wrong one blames the wrong party.
 const homeOnly = { ...DEFAULT_ZONES, domestic: { enabled: true } };
 const notServed = quoteShipping({ fromCountry: "US", toCountry: "FR", parcel: { weightOz: 8 }, zones: homeOnly });
 assert.equal(notServed.ok, false);
 if (!notServed.ok) assert.equal(notServed.reason, "not-served");
 assert.match(refusalMessage(notServed), /doesn't ship to that country yet/);

 const restricted = quoteShipping({ fromCountry: "US", toCountry: "IR", parcel: { weightOz: 8 }, zones: EVERYWHERE });
 assert.equal(restricted.ok, false);
 assert.doesNotMatch(refusalMessage(restricted), /yet/, "nothing the shop does will change this");
 assert.match(refusalMessage(restricted), /sanctions|suspended/i);
 assert.match(refusalMessage(restricted), /isn't the shop's choice/);
});

test("an ordinary destination is untouched", () => {
 for (const c of ["FR", "CA", "AU", "JP", "GB", "MX", "AE"]) {
  assert.equal(canShipTo(c), true, c);
  assert.equal(shipsTo(EVERYWHERE, "US", c), true, c);
 }
});

test("the product page never blames the shop for a sanction", () => {
 // "This shop doesn't post to IR: it ships to worldwide" is both an accusation and a contradiction.
 const reach = shippingReach(EVERYWHERE, "US", "IR");
 assert.equal(reach.ships, false);
 assert.doesNotMatch(reach.line, /this shop/i);
 assert.match(reach.line, /sanctions/i);
 // A destination the store simply chose not to serve still reads as the store's choice, because
 // it is one.
 const homeOnly = { domestic: { enabled: true } };
 assert.match(shippingReach(homeOnly, "US", "FR").line, /this shop doesn't post/i);
 // And nothing changes for a country that is fine.
 assert.equal(shippingReach(EVERYWHERE, "US", "FR").ships, true);
});

test("what the settings page shows is what checkout enforces", () => {
 // THE FAILURE THIS GUARDS. A list written out beside the sets, rather than built from them, goes
 // stale the first time one is edited, and the way a seller finds out is a customer who couldn't
 // check out from a country her settings page told her was fine.
 const shown = barredDestinations().flatMap((g) => g.places.map((p) => p.code));
 for (const code of [...EMBARGOED_COUNTRIES, ...SUSPENDED_COUNTRIES]) {
  assert.ok(shown.includes(code), `${code} is refused at checkout but not shown to the seller`);
 }
 // And nothing is shown that isn't actually refused. Country entries only: the two region rows
 // have no country code of their own, which is why they carry a "UA-" one.
 for (const code of shown.filter((c) => !c.includes("-"))) {
  assert.equal(canShipTo(code), false, `${code} is shown as barred but checkout would allow it`);
 }
});

test("the list reads as a seller writes, not as ISO codes", () => {
 const all = barredDestinations();
 assert.deepEqual(all.map((g) => g.reason), ["embargo", "suspended"]);
 const names = all.flatMap((g) => g.places.map((p) => p.name));
 for (const expected of ["Cuba", "Iran", "North Korea", "Syria", "Russia", "Belarus"]) {
  assert.ok(names.includes(expected), expected);
 }
 // Ukraine is shippable, so it appears NOWHERE as a country; its four occupied regions are named
 // instead, because a seller would otherwise conclude the whole country was fine.
 assert.ok(!names.includes("Ukraine"));
 assert.ok(names.some((n) => /Crimea/.test(n)) && names.some((n) => /Donetsk/.test(n)));
 // Sorted, so the list doesn't reshuffle between renders.
 for (const g of all) {
  const countries = g.places.filter((p) => !p.code.includes("-")).map((p) => p.name);
  assert.deepEqual(countries, [...countries].sort((a, b) => a.localeCompare(b)), g.label);
 }
});
