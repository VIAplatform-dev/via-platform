import { test } from "node:test";
import assert from "node:assert/strict";
import { netProfit, profitLines, missingCostNote, type ProfitInputs } from "./profit-core.ts";

// A month that looks fine on the old formula and isn't.
const MONTH: ProfitInputs = {
 revenueCents: 100_000, // £1,000, net of tax
 costCents: 40_000, // what she paid for the pieces that sold
 feeCents: 1_000, // VYA's 1%
 cardFeeCents: 3_200, // Stripe, estimated
 labelCostCents: 9_000, // nine parcels
 consignorCutCents: 30_000, // half the revenue was consigned at 60/40
 operatingCents: 25_000, // booth fee, packaging
 orderSales: 9,
 coveredSales: 9,
 totalSales: 9,
};

test("net profit subtracts every cost the store actually bore", () => {
 // 1000 − 400 − 10 − 32 − 90 − 300 − 250 = −82. The old Home number for this month was +£558.
 assert.equal(netProfit(MONTH), -8_200);
});

test("a loss is reported as a loss, not clamped to zero", () => {
 // THE BUG THIS EXISTS FOR. Home wrapped the figure in Math.max(0, …), so a bad month read as £0 —
 // which turns bad news into no news. A store that lost money needs to see the minus sign.
 assert.ok(netProfit(MONTH) < 0);
});

test("the consignor's cut is not the store's revenue", () => {
 const owned = { ...MONTH, consignorCutCents: 0 };
 assert.equal(netProfit(owned) - netProfit(MONTH), 30_000);
});

test("label costs count, because they are recorded on every order", () => {
 const noLabels = { ...MONTH, labelCostCents: 0 };
 assert.equal(netProfit(noLabels) - netProfit(MONTH), 9_000);
});

test("no cost on record means no net figure — not a 100% margin", () => {
 // A piece with no cost is unknown, not free. Margin.ts already refuses to compute on it; the
 // net figure follows the same rule so an uncosted month never prints a profit it can't defend.
 assert.equal(netProfit({ ...MONTH, coveredSales: 0, costCents: 0 }), null);
});

test("lines are produced in reading order, with signs", () => {
 const lines = profitLines(MONTH);
 assert.deepEqual(lines.map((l) => l.label), [
  "Revenue", "Cost of goods", "VYA fees", "Card processing", "Shipping labels", "Consignor payouts", "Expenses", "Net profit",
 ]);
 assert.equal(lines[0].cents, 100_000);
 assert.equal(lines[1].cents, -40_000);
 assert.equal(lines[lines.length - 1].cents, -8_200);
});

test("card processing is flagged as an estimate, nothing else is", () => {
 const est = profitLines(MONTH).filter((l) => l.estimate).map((l) => l.label);
 assert.deepEqual(est, ["Card processing"]);
});

test("a zero line is omitted so a cash-only store isn't shown empty rows", () => {
 const cashOnly = { ...MONTH, cardFeeCents: 0, labelCostCents: 0, consignorCutCents: 0 };
 const labels = profitLines(cashOnly).map((l) => l.label);
 assert.ok(!labels.includes("Card processing"));
 assert.ok(!labels.includes("Shipping labels"));
 assert.ok(!labels.includes("Consignor payouts"));
 assert.ok(labels.includes("Net profit"));
});

test("the missing-cost note says how many sold pieces the figure could not include", () => {
 assert.equal(missingCostNote({ ...MONTH, coveredSales: 6, totalSales: 9 }), "Cost missing on 3 sold pieces — not counted above.");
 assert.equal(missingCostNote({ ...MONTH, coveredSales: 8, totalSales: 9 }), "Cost missing on 1 sold piece — not counted above.");
 assert.equal(missingCostNote(MONTH), null);
});
