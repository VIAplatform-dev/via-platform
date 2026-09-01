import { test } from "node:test";
import assert from "node:assert/strict";
import {
 taxCodeForItem, TAX_CODE_CLOTHING, TAX_CODE_HANDBAGS, TAX_CODE_JEWELRY,
 TAX_CODE_WATCHES, TAX_CODE_SUNGLASSES, TAX_CODE_BELTS, TAX_CODE_WALLETS, TAX_CODE_GENERAL,
} from "./tax-codes.ts";
import { CATEGORY_SLUGS } from "./item-tags.ts";

// The stakes: New York exempts clothing and footwear under $110, and Pennsylvania
// and New Jersey exempt most apparel outright — but NOT handbags, jewelry or
// eyewear. Mislabel a bag as clothing and the seller owes tax they never charged.

test("clothing is clothing", () => {
 for (const c of ["dresses", "tops", "coats-jackets", "jeans", "swimwear", "lingerie"]) {
  assert.equal(taxCodeForItem(c), TAX_CODE_CLOTHING, c);
 }
});

test("footwear shares the clothing code, as Stripe defines it", () => {
 for (const c of ["boots", "heels", "sneakers", "sandals", "flats", "shoes"]) {
  assert.equal(taxCodeForItem(c), TAX_CODE_CLOTHING, c);
 }
});

test("bags are never clothing — this is the expensive one", () => {
 for (const c of ["handbags", "totes", "clutches", "crossbody-bags", "bags"]) {
  const code = taxCodeForItem(c, "Gucci GG Supreme tote");
  assert.notEqual(code, TAX_CODE_CLOTHING, `${c} must not be taxed as clothing`);
  assert.equal(code, TAX_CODE_HANDBAGS, c);
 }
});

test("accessories split by what they actually are", () => {
 assert.equal(taxCodeForItem("jewelry", "Gold hoop earrings"), TAX_CODE_JEWELRY);
 assert.equal(taxCodeForItem("belts", "Leather belt"), TAX_CODE_BELTS);
 assert.equal(taxCodeForItem("sunglasses", "Chanel shades"), TAX_CODE_SUNGLASSES);
});

test("a watch is filed under jewelry but taxed as a watch", () => {
 assert.equal(taxCodeForItem("jewelry", "Cartier Tank watch"), TAX_CODE_WATCHES);
});

test("a wallet in the bags bucket is taxed as a wallet", () => {
 assert.equal(taxCodeForItem("bags", "Chanel caviar wallet"), TAX_CODE_WALLETS);
});

test("a title never overrides a confident category", () => {
 // "bag not included" must not turn a jacket into a handbag.
 assert.equal(taxCodeForItem("coats-jackets", "Chanel jacket — matching bag not included"), TAX_CODE_CLOTHING);
 assert.equal(taxCodeForItem("dresses", "Dress with watch-print silk"), TAX_CODE_CLOTHING);
});

test("an unknown or missing category falls back to general goods, never an exemption", () => {
 assert.equal(taxCodeForItem(null), TAX_CODE_GENERAL);
 assert.equal(taxCodeForItem(""), TAX_CODE_GENERAL);
 assert.equal(taxCodeForItem("something-new"), TAX_CODE_GENERAL);
});

test("every category in the taxonomy resolves to a real Stripe code", () => {
 for (const slug of CATEGORY_SLUGS) {
  const code = taxCodeForItem(slug);
  assert.match(code, /^txcd_\d+$/, `${slug} produced ${code}`);
 }
});
