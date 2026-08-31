import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDiscount, cartTotals, changeDue, normalizeCart } from "./sale-core.ts";

test("percent and fixed discounts round to cents and never go below zero", () => {
 assert.equal(applyDiscount(8500, { type: "percent", value: 10 }), 7650);
 assert.equal(applyDiscount(8500, { type: "fixed", value: 500 }), 8000);
 assert.equal(applyDiscount(8500, { type: "fixed", value: 99999 }), 0);
 assert.equal(applyDiscount(8500, { type: "price", value: 7000 }), 7000);
 assert.equal(applyDiscount(8500, null), 8500);
});

test("cart totals: list, sale, discount across items", () => {
 const t = cartTotals([{ itemId: "a", listCents: 8500, saleCents: 7650 }, { itemId: "b", listCents: 4000, saleCents: 4000 }]);
 assert.deepEqual(t, { listCents: 12500, saleCents: 11650, discountCents: 850, count: 2 });
});

test("change due from tendered cash, never negative, null when not tendered", () => {
 assert.equal(changeDue(11650, 12000), 350);
 assert.equal(changeDue(11650, 11650), 0);
 assert.equal(changeDue(11650, 10000), null); // short — not a valid tender
 assert.equal(changeDue(11650, null), null);
});

test("normalizeCart dedupes items, drops junk, caps sale at list", () => {
 const c = normalizeCart([{ itemId: "a", listCents: 100, saleCents: 150 }, { itemId: "a", listCents: 100, saleCents: 90 }, { itemId: "", listCents: 5, saleCents: 5 }, { itemId: "b", listCents: 200, saleCents: -5 }]);
 assert.deepEqual(c, [{ itemId: "a", listCents: 100, saleCents: 100 }, { itemId: "b", listCents: 200, saleCents: 0 }]);
});
