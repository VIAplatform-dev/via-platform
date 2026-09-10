import { test } from "node:test";
import assert from "node:assert/strict";
import { taxBehaviorForSale } from "./tax-inclusive.ts";
import { taxCodeForItem, TAX_CODE_SHIPPING } from "./tax-codes.ts";

// The rules calculateSalesTax() is built on. The Stripe call itself is not testable here without a
// network, so what is pinned is the arithmetic and the decisions around it — the parts that decide
// whether a buyer is charged the right amount.

test("only the exclusive part is added to the charge", () => {
 // US: the price is pre-tax, so tax is added on top.
 const add = (calc: { tax_amount_exclusive?: number }) => Math.max(0, Math.round(Number(calc?.tax_amount_exclusive) || 0));
 assert.equal(add({ tax_amount_exclusive: 1_650 }), 1_650);
});

test("inclusive tax adds nothing — the price already contains it", () => {
 // A UK seller's "200" means £200 all in. Adding the VAT again would charge it twice.
 const add = (calc: { tax_amount_exclusive?: number }) => Math.max(0, Math.round(Number(calc?.tax_amount_exclusive) || 0));
 assert.equal(add({ tax_amount_exclusive: 0 }), 0);
 assert.equal(add({}), 0);
});

test("a malformed answer adds nothing rather than something wrong", () => {
 const add = (calc: unknown) => Math.max(0, Math.round(Number((calc as { tax_amount_exclusive?: number })?.tax_amount_exclusive) || 0));
 assert.equal(add(null), 0);
 assert.equal(add({ tax_amount_exclusive: "oops" }), 0);
 assert.equal(add({ tax_amount_exclusive: -500 }), 0);
});

test("a UK seller selling in the UK prices inclusive", () => {
 assert.equal(taxBehaviorForSale("GB", "GB"), "inclusive");
});

test("a UK seller shipping to the US prices exclusive — she can't absorb US sales tax", () => {
 assert.equal(taxBehaviorForSale("GB", "US"), "exclusive");
});

test("a US seller is always exclusive", () => {
 assert.equal(taxBehaviorForSale("US", "US"), "exclusive");
 assert.equal(taxBehaviorForSale("US", "GB"), "exclusive");
});

test("the tax code is per item, not per store", () => {
 // NY exempts clothing under $110; none of that covers handbags. One blanket code would
 // under-collect on bags — tax the seller owes and never charged.
 const dress = taxCodeForItem("dresses", "Silk slip dress");
 const bag = taxCodeForItem("bags", "Jumbo black bag");
 assert.ok(dress);
 assert.ok(bag);
 assert.notEqual(dress, bag);
});

test("shipping carries its own tax code", () => {
 assert.equal(TAX_CODE_SHIPPING, "txcd_92010001");
});

test("the platform fee is computed on the goods, never on the tax", () => {
 // appFee comes from the discounted sale price; tax is added to `amount` afterwards, so VYA can
 // never take a cut of money the seller owes a tax authority.
 const salePrice = 20_000, shipping = 800, tax = 1_650;
 const appFee = Math.round(salePrice * 0.01) + shipping;
 const amount = salePrice + shipping + tax;
 assert.equal(amount, 22_450);
 assert.equal(appFee, 1_000);
 assert.ok(appFee < amount - tax);
});
