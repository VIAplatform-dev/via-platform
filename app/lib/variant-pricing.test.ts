import { test } from "node:test";
import assert from "node:assert/strict";
import { isRentalOption, pickBuyVariant, withoutRentalOptions, sizeFromOptionLabel, rentalTiersFromOptions } from "./variant-pricing.ts";

// Real listings from venusvintage.co, a rental shop. Every piece carries three options — 3 Day
// Rental, 7 Day Rental, Purchase — and the shop leaves an option at $0.00 to mean "not offered".
// Their theme hides $0 options; the importer read whichever option came FIRST, so 116 of their 135
// pieces arrived unpriced and were skipped, and the Dior slingbacks were listed at their $22 rental.

type V = { id: number; title: string; price: string };
const read = (v: V) => ({ label: v.title, price: Number(v.price) });

const boots: V[] = [ // Dolce & Gabbana S/S 2004 Red Cowboy Stiletto Boots — the page says "Rent: $150" and has no Buy
 { id: 1, title: "3 Day Rental", price: "0.00" },
 { id: 2, title: "7 Day Rental", price: "150.00" },
 { id: 3, title: "Purchase", price: "0.00" },
];
const mules: V[] = [ // Prada Yellow Ribbon Satin Bow Mules — "Rent: $75, Buy: $380"
 { id: 1, title: "3 Day Rental", price: "0.00" },
 { id: 2, title: "7 Day Rental", price: "75.00" },
 { id: 3, title: "Purchase", price: "380.00" },
];
const slingbacks: V[] = [ // Christian Dior Pink Leather Logo Slingback Heels — options listed in a different order
 { id: 1, title: "3 Day Rental", price: "22.00" },
 { id: 2, title: "Purchase", price: "540.00" },
 { id: 3, title: "7 Day Rental", price: "80.00" },
];

test("a rent-only piece has no buy price, even though a rental option is priced", () => {
 const pick = pickBuyVariant(boots, read);
 assert.equal(pick.price, null, "the $150 is a rental price — selling the boots for $150 would be wrong");
 assert.equal(pick.variant, null);
 assert.equal(pick.rentOnly, true);
});

test("the buy price is the Purchase option's, not the first option's", () => {
 const pick = pickBuyVariant(mules, read);
 assert.equal(pick.price, 380);
 assert.equal(pick.variant?.id, 3);
 assert.equal(pick.rentOnly, false);
});

test("a priced rental option listed first never becomes the buy price", () => {
 assert.equal(pickBuyVariant(slingbacks, read).price, 540);
});

test("a rental listing with nothing priced is neither buyable nor rentable", () => {
 const pick = pickBuyVariant(boots.map((v) => ({ ...v, price: "0.00" })), read);
 assert.equal(pick.price, null);
 assert.equal(pick.rentOnly, false);
});

test("an ordinary one-option listing is priced exactly as before", () => {
 const pick = pickBuyVariant([{ id: 9, title: "Default Title", price: "120.00" }], read);
 assert.equal(pick.price, 120);
 assert.equal(pick.variant?.id, 9);
 assert.equal(pick.rentOnly, false);
});

test("a size run keeps its first size's price, as before", () => {
 assert.equal(pickBuyVariant([{ id: 1, title: "S", price: "627.00" }, { id: 2, title: "M", price: "700.00" }], read).price, 627);
});

test("a $0 option is not offered, so the next priced option sets the price", () => {
 const pick = pickBuyVariant([{ id: 1, title: "S", price: "0.00" }, { id: 2, title: "M", price: "50.00" }], read);
 assert.equal(pick.price, 50);
 assert.equal(pick.variant?.id, 2);
});

test("a listing with no price anywhere keeps its first option and its $0, as before", () => {
 // Sellers zero the price of a SOLD piece and keep it as archive; the importer decides what to do
 // with that from availability, so this must not turn into something else.
 const pick = pickBuyVariant([{ id: 7, title: "Default Title", price: "0.00" }], read);
 assert.equal(pick.price, 0);
 assert.equal(pick.variant?.id, 7);
 assert.equal(pick.rentOnly, false);
});

test("no options at all is unpriced, not a crash", () => {
 assert.deepEqual(pickBuyVariant([] as V[], read), { variant: null, price: null, rentOnly: false });
});

test("rental wording is matched as a whole word, never inside another word", () => {
 for (const yes of ["3 Day Rental", "Rent", "RENTAL - 4 days", "M / 7 Day Rental", "Hire - 1 week", "Rentals"]) assert.equal(isRentalOption(yes), true, yes);
 for (const no of ["Purchase", "Default Title", "Parent's Coat", "Current Season", "Torrent Blue", "Brown", "Shire"]) assert.equal(isRentalOption(no), false, no);
});

test("rental options are dropped from the options a piece is sold in", () => {
 assert.deepEqual(withoutRentalOptions(mules, read).map((v) => v.id), [3]);
 const sizes = [{ id: 1, title: "S", price: "10.00" }, { id: 2, title: "M", price: "10.00" }];
 assert.deepEqual(withoutRentalOptions(sizes, read), sizes, "an ordinary size run is untouched");
});

// ── The rental price ladder itself (Phase 2: a rent-only piece can still be RENTED) ────────────────
test("the boots' rental ladder is just their one priced rental option", () => {
 assert.deepEqual(rentalTiersFromOptions(boots, read), [{ days: 7, cents: 15000 }]);
});

test("the mules' rental ladder includes every priced rental option, sorted by days, Purchase excluded", () => {
 assert.deepEqual(rentalTiersFromOptions(mules, read), [{ days: 3, cents: 0 }, { days: 7, cents: 7500 }].filter((t) => t.cents > 0));
});

test("the slingbacks' ladder is unaffected by option order", () => {
 assert.deepEqual(rentalTiersFromOptions(slingbacks, read), [{ days: 3, cents: 2200 }, { days: 7, cents: 8000 }]);
});

test("a $0 rental option contributes no tier — it is not offered", () => {
 assert.deepEqual(rentalTiersFromOptions([{ id: 1, title: "3 Day Rental", price: "0.00" }], read), []);
});

test("an ordinary (non-rental) listing has no rental ladder at all", () => {
 assert.deepEqual(rentalTiersFromOptions([{ id: 1, title: "Default Title", price: "120.00" }], read), []);
});

test("a rental label with no day count is not a tier — nothing to charge per day for", () => {
 assert.deepEqual(rentalTiersFromOptions([{ id: 1, title: "Weekend Rental", price: "60.00" }], read), []);
});

test("a Purchase-only listing (no rental options) has an empty ladder", () => {
 assert.deepEqual(rentalTiersFromOptions([{ id: 1, title: "Purchase", price: "380.00" }], read), []);
});

test("a Purchase or Buy option is not a size", () => {
 assert.equal(sizeFromOptionLabel("Purchase"), null);
 assert.equal(sizeFromOptionLabel("Buy"), null);
 assert.equal(sizeFromOptionLabel("Default Title"), null);
 assert.equal(sizeFromOptionLabel(""), null);
 assert.equal(sizeFromOptionLabel(null), null);
 assert.equal(sizeFromOptionLabel("M"), "M");
 assert.equal(sizeFromOptionLabel("US 8"), "US 8");
});
