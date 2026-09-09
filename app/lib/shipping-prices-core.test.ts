import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTierPrice, validateZoneRates, tierPriceTable } from "./shipping-prices-core.ts";
import { quoteShipping, DEFAULT_ZONES } from "./shipping-zones.ts";
import { SHIPPING_TIERS } from "./shipping-tiers.ts";

const DEFAULTS = { small: 800, medium: 1400, large: 2400 };

test("her override wins over VYA's default for that tier and zone", () => {
 const overrides = { domestic: { enabled: true, rates: { medium: 450 } } };
 assert.equal(resolveTierPrice({ tier: "medium", zone: "domestic", overrides, defaults: DEFAULTS }), 450);
});

test("a tier she hasn't priced falls back to VYA's default; so does a zone with no rates", () => {
 const overrides = { domestic: { enabled: true, rates: { medium: 450 } }, europe: { enabled: true } };
 assert.equal(resolveTierPrice({ tier: "small", zone: "domestic", overrides, defaults: DEFAULTS }), 800);
 assert.equal(resolveTierPrice({ tier: "large", zone: "europe", overrides, defaults: DEFAULTS }), 2400);
 assert.equal(resolveTierPrice({ tier: "large", zone: "europe", overrides: null, defaults: DEFAULTS }), 2400);
});

test("zero is a real price — free shipping on that tier — not an unset field", () => {
 const overrides = { domestic: { enabled: true, rates: { small: 0 } } };
 assert.equal(resolveTierPrice({ tier: "small", zone: "domestic", overrides, defaults: DEFAULTS }), 0);
});

test("a negative or non-numeric override is ignored, never charged", () => {
 const overrides = { domestic: { enabled: true, rates: { small: -5, medium: Number.NaN, large: "12" as unknown as number } } };
 assert.equal(resolveTierPrice({ tier: "small", zone: "domestic", overrides, defaults: DEFAULTS }), 800);
 assert.equal(resolveTierPrice({ tier: "medium", zone: "domestic", overrides, defaults: DEFAULTS }), 1400);
 assert.equal(resolveTierPrice({ tier: "large", zone: "domestic", overrides, defaults: DEFAULTS }), 2400);
});

test("defaults come from the tier table when none are given, and are rounded to whole minor units", () => {
 assert.equal(resolveTierPrice({ tier: "medium", zone: "domestic", overrides: null }), SHIPPING_TIERS[1].priceCents);
 assert.equal(resolveTierPrice({ tier: "medium", zone: "domestic", overrides: { domestic: { enabled: true, rates: { medium: 449.6 } } } }), 450);
});

test("the settings form's rates are validated: a negative is refused with the row named", () => {
 assert.deepEqual(validateZoneRates({ domestic: { enabled: true, rates: { small: 0, medium: 450 } } }), { ok: true });
 const bad = validateZoneRates({ europe: { enabled: true, rates: { large: -1 } } });
 assert.equal(bad.ok, false);
 if (!bad.ok) assert.match(bad.error, /Europe.*Large/);
 const junk = validateZoneRates({ domestic: { enabled: true, rates: { small: "abc" } } });
 assert.equal(junk.ok, false);
});

test("the table the settings page renders: every zone × tier, with her price or null and the default beside it", () => {
 const t = tierPriceTable({ domestic: { enabled: true, rates: { medium: 450 } } });
 const dom = t.find((r) => r.zone === "domestic")!;
 assert.deepEqual(dom.cells.map((c) => [c.tier, c.priceCents, c.defaultCents]), [["small", null, 800], ["medium", 450, 1400], ["large", null, 2400]]);
 assert.equal(t.length, 4);
});

test("quoteShipping goes through the same resolver: override, default, zero", () => {
 const parcel = { weightOz: 20, lengthIn: 12, widthIn: 9, heightIn: 3 }; // medium
 const zones = { ...DEFAULT_ZONES, domestic: { enabled: true, rates: { medium: 0 } }, europe: { enabled: true, rates: { medium: 1900 } } };
 assert.deepEqual(quoteShipping({ fromCountry: "GB", toCountry: "GB", parcel, zones }), { ok: true, zone: "domestic", tier: "medium", amountCents: 0 });
 assert.deepEqual(quoteShipping({ fromCountry: "GB", toCountry: "FR", parcel, zones }), { ok: true, zone: "europe", tier: "medium", amountCents: 1900 });
 assert.deepEqual(quoteShipping({ fromCountry: "GB", toCountry: "FR", parcel: { weightOz: 8, lengthIn: 8, widthIn: 6, heightIn: 2 }, zones }), { ok: true, zone: "europe", tier: "small", amountCents: 800 });
});
