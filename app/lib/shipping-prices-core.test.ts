import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTierPrice, zoneTierDefaults, vyaTierDefaults } from "./shipping-prices-core.ts";
import { ZONE_IDS, quoteShipping, DEFAULT_ZONES } from "./shipping-zones.ts";
import { SHIPPING_TIERS } from "./shipping-tiers.ts";

const DEFAULTS = { small: 800, medium: 1400, large: 2400 };

test("a store's saved rate is NOT the price: VYA's is", () => {
 // The rule, inverted. It used to read the store's number first, which had it backwards: VYA buys
 // every label and takes the buyer's postage, so a seller typing 450 was setting VYA's revenue on
 // a cost she never pays. One store had 100 (a dollar) sitting in this field.
 const overrides = { domestic: { enabled: true, rates: { medium: 450 } } };
 assert.equal(resolveTierPrice({ tier: "medium", zone: "domestic", overrides, defaults: DEFAULTS }), 1400);
 // Zero was the worst of them: free postage on a real label, chosen by the person not paying it.
 assert.equal(resolveTierPrice({ tier: "small", zone: "domestic", overrides: { domestic: { enabled: true, rates: { small: 0 } } } }), 800);
});

test("a zone still says WHERE she ships, which IS hers", () => {
 // Only `rates` stopped being read. `enabled` is the seller's answer and quoteShipping still asks.
 const off = quoteShipping({ fromCountry: "US", toCountry: "FR", parcel: { weightOz: 8 }, zones: { europe: { enabled: false } } });
 assert.deepEqual(off, { ok: false, zone: "europe", reason: "not-served" });
});

test("the price is VYA's zone default, wherever the caller got it from", () => {
 assert.equal(resolveTierPrice({ tier: "medium", zone: "domestic" }), SHIPPING_TIERS[1].priceCents);
 assert.equal(resolveTierPrice({ tier: "large", zone: "europe", overrides: null, defaults: DEFAULTS }), 2400);
 // `defaults` is a caller passing back a table it already computed, not a seller's number.
 assert.equal(resolveTierPrice({ tier: "medium", zone: "domestic", defaults: { medium: 449.6 } }), 450);
});

test("quoteShipping is priced by VYA too, and by the same resolver", () => {
 const parcel = { weightOz: 20, lengthIn: 12, widthIn: 9, heightIn: 3 }; // medium
 // Rates left over from the old settings form, on both zones. Neither is charged.
 const zones = { ...DEFAULT_ZONES, domestic: { enabled: true, rates: { medium: 0 } }, europe: { enabled: true, rates: { medium: 1900 } } };
 assert.deepEqual(quoteShipping({ fromCountry: "GB", toCountry: "GB", parcel, zones }), { ok: true, zone: "domestic", tier: "medium", amountCents: 1400 });
 // And a London shop reaching France is still near-Europe, 1400 × 2.2, rounded up.
 assert.deepEqual(quoteShipping({ fromCountry: "GB", toCountry: "FR", parcel, zones }), { ok: true, zone: "europe", tier: "medium", amountCents: 3100 });
});

// ── VYA's defaults per zone ───────────────────────────────────────────────────

test("every region away from home costs more than posting at home", () => {
 // The whole point. Before this, all four zones fell back to the same three numbers, so a small
 // parcel was 800 to the next town and 800 to Australia.
 for (const home of ["US", "GB", "AU"]) {
  const base = zoneTierDefaults("domestic", home);
  assert.deepEqual(base, vyaTierDefaults(), "home is the tier table itself");
  for (const zone of ["europe", "north_america", "rest_of_world"] as const) {
   const d = zoneTierDefaults(zone, home);
   for (const t of ["small", "medium", "large"] as const) {
    assert.ok(d[t] > base[t], `${home} to ${zone} ${t}: ${d[t]} should beat ${base[t]}`);
   }
  }
 }
});

test("a store inside the region pays the near rate, one outside pays the far rate", () => {
 // London to Paris and Chicago to Paris are the same zone and not the same parcel.
 assert.ok(zoneTierDefaults("europe", "GB").small < zoneTierDefaults("europe", "US").small);
 assert.ok(zoneTierDefaults("north_america", "US").large < zoneTierDefaults("north_america", "GB").large);
 // Australia reaching Japan is rest-of-world for both of them, and it is a near one.
 assert.ok(zoneTierDefaults("rest_of_world", "AU").medium < zoneTierDefaults("rest_of_world", "US").medium);
});

test("an unknown ship-from is priced as far, never as near", () => {
 for (const nothing of [undefined, null, "", "  ", "United States", 42]) {
  assert.deepEqual(zoneTierDefaults("europe", nothing), zoneTierDefaults("europe", "US"), String(nothing));
 }
});

test("the gap between home and abroad widens with the parcel", () => {
 // International postage does not scale with weight the way domestic does: the gap is far wider
 // for a coat than for a scarf, and a single flat multiple would underprice the coat.
 const home = vyaTierDefaults();
 const away = zoneTierDefaults("rest_of_world", "US");
 const ratio = (t: "small" | "medium" | "large") => away[t] / home[t];
 assert.ok(ratio("large") > ratio("small"), "a large parcel is proportionally dearer to export");
});

test("every default is a whole unit", () => {
 // Postage quoted to the penny reads as a carrier passthrough and invites the question of why it
 // is not exactly the carrier's price.
 for (const home of ["US", "GB", "JP", ""]) {
  for (const zone of ZONE_IDS) {
   for (const cents of Object.values(zoneTierDefaults(zone, home))) {
    assert.equal(cents % 100, 0, `${home} ${zone} ${cents}`);
   }
  }
 }
});
