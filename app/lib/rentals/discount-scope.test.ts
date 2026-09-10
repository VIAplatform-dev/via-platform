import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSettings, DEFAULT_SETTINGS } from "./settings-core.ts";

// What a code comes off on a rental. The store answers this; the deposit is never one of the answers.
// Mirrors the arithmetic in app/api/storefront/rental-intent.
function split(scope: "none" | "rent" | "rent_waiver", rent: number, waiver: number, pct: number) {
 if (scope === "none") return { rentOff: 0, waiverOff: 0 };
 const base = scope === "rent_waiver" ? rent + waiver : rent;
 const off = Math.round((base * pct) / 100);
 const rentOff = Math.min(rent, off);
 return { rentOff, waiverOff: scope === "rent_waiver" ? Math.min(waiver, off - rentOff) : 0 };
}

test("a store that hasn't chosen takes no codes — which is what rentals did before", () => {
 assert.equal(DEFAULT_SETTINGS.discountApplies, "none");
 assert.deepEqual(split("none", 20_000, 2_000, 15), { rentOff: 0, waiverOff: 0 });
});

test("rent only: 15% off a $200 hire is $30, and the waiver is untouched", () => {
 assert.deepEqual(split("rent", 20_000, 2_000, 15), { rentOff: 3_000, waiverOff: 0 });
});

test("rent + waiver: the percentage is worked out on BOTH, then taken off the rent first", () => {
 // $200 hire + $20 waiver = $220 → $33 off. The rent is big enough to absorb all of it, so that is
 // where it lands; the buyer pays the same either way, and the split only decides how the sale is
 // recorded. The difference from "rent only" is the BASE: $33 here versus $30 there.
 assert.deepEqual(split("rent_waiver", 20_000, 2_000, 15), { rentOff: 3_300, waiverOff: 0 });
 assert.deepEqual(split("rent", 20_000, 2_000, 15), { rentOff: 3_000, waiverOff: 0 });
});

test("the waiver is only reached once the rent is used up", () => {
 // A $10 hire with a $5 waiver at 100%: $15 off, $10 of it from the rent, $5 from the waiver.
 assert.deepEqual(split("rent_waiver", 1_000, 500, 100), { rentOff: 1_000, waiverOff: 500 });
});

test("a discount bigger than the rent spills onto the waiver, never past it", () => {
 const r = split("rent_waiver", 1_000, 500, 100);
 assert.deepEqual(r, { rentOff: 1_000, waiverOff: 500 });
});

test("rent-only never touches the waiver even when the discount exceeds the rent", () => {
 assert.deepEqual(split("rent", 1_000, 500, 100), { rentOff: 1_000, waiverOff: 0 });
});

test("the deposit is not in the arithmetic at all", () => {
 // It has no term in any branch — the renter's money can't be discounted back to her.
 const deposit = 50_000;
 const before = 20_000 + 2_000 + deposit;
 const { rentOff, waiverOff } = split("rent_waiver", 20_000, 2_000, 15);
 assert.equal(before - rentOff - waiverOff, deposit + 20_000 + 2_000 - 3_300);
});

test("the setting survives a round trip and refuses nonsense", () => {
 assert.equal(resolveSettings({ discountApplies: "rent" }).discountApplies, "rent");
 assert.equal(resolveSettings({ discountApplies: "rent_waiver" }).discountApplies, "rent_waiver");
 // A bad value falls back rather than throwing — this is seller-entered JSON.
 assert.equal(resolveSettings({ discountApplies: "deposit" as never }).discountApplies, "none");
 assert.equal(resolveSettings(null).discountApplies, "none");
});

test("an item override beats the store's choice, like every other rental setting", () => {
 assert.equal(resolveSettings({ discountApplies: "rent" }, { discountApplies: "none" }).discountApplies, "none");
});
