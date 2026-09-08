// The one definition of profit.
//
// Home and the Analytics P&L used to disagree: Home ran its own arithmetic over the raw order
// list and clamped the result at zero; Analytics computed gross minus operating costs. Neither
// subtracted the label she bought for each parcel (recorded on every order as label_cost_cents),
// the consignor's cut (half the revenue on a consigned piece was never hers), VYA's fee, or the
// card fee. A consignment-heavy store saw roughly double what she made, and a genuine loss read
// as £0.
//
// This module is pure so the arithmetic is testable on its own. margin.ts gathers the inputs
// over the COVERED slice — sales whose piece has a cost on record — and both surfaces render what
// comes out of here. Where a figure is estimated (card fees: Stripe's per-charge fee isn't stored)
// the line says so, and the seller can tell an estimate from a fact.

export type ProfitInputs = {
 /** Net of tax collected — the government's share is not revenue. */
 revenueCents: number;
 /** What she paid for the pieces that sold. Only known on the covered slice. */
 costCents: number;
 /** VYA's application fee, as charged. */
 feeCents: number;
 /** Card processing, ESTIMATED (2.9% + 30¢ per charge) for sales that went through checkout. */
 cardFeeCents: number;
 /** Shipping labels bought through VYA, as charged. */
 labelCostCents: number;
 /** The consignor's share of consigned sales — never the store's money. */
 consignorCutCents: number;
 /** Everything else the store spent to trade: booth fees, packaging, the monthly list. */
 operatingCents: number;
 /** Sales that went through checkout (so a card fee applies), for the estimate's own caveat. */
 orderSales: number;
 /** Sales whose piece carries a cost. Profit is only ever computed on these. */
 coveredSales: number;
 totalSales: number;
};

export type ProfitLine = {
 label: string;
 /** Signed: revenue positive, every cost negative, net whichever it is. */
 cents: number;
 /** True where the number is inferred rather than recorded. */
 estimate?: boolean;
 /** True on the closing line, so a renderer can weight it. */
 total?: boolean;
};

/**
 * Net profit in cents, or null when there is no cost on record for anything that sold.
 *
 * Null, not zero: a month with no costed sales has an unknown profit, and printing 0 — or worse,
 * printing revenue as profit — is the exact error this replaces. Negative is allowed and expected;
 * a month where postage and booth fees ate the margin is a fact she needs to see.
 */
export function netProfit(p: ProfitInputs): number | null {
 if (p.coveredSales <= 0) return null;
 return p.revenueCents - p.costCents - p.feeCents - p.cardFeeCents - p.labelCostCents - p.consignorCutCents - p.operatingCents;
}

/** Net profit as a percentage of revenue, one decimal, or null when either side is unknown. */
export function netMarginPct(p: ProfitInputs): number | null {
 const net = netProfit(p);
 if (net === null || p.revenueCents <= 0) return null;
 return Math.round((net / p.revenueCents) * 1000) / 10;
}

/**
 * The statement, in reading order. Zero lines are dropped so a cash-only store with no labels
 * and no consignors sees three lines, not seven empty ones. Revenue and Net always appear.
 */
export function profitLines(p: ProfitInputs): ProfitLine[] {
 const net = netProfit(p);
 const costs: ProfitLine[] = [
  { label: "Cost of goods", cents: -p.costCents },
  { label: "VYA fees", cents: -p.feeCents },
  { label: "Card processing", cents: -p.cardFeeCents, estimate: true },
  { label: "Shipping labels", cents: -p.labelCostCents },
  { label: "Consignor payouts", cents: -p.consignorCutCents },
  { label: "Expenses", cents: -p.operatingCents },
 ].filter((l) => l.cents !== 0);
 return [
  { label: "Revenue", cents: p.revenueCents },
  ...costs,
  { label: "Net profit", cents: net ?? 0, total: true },
 ];
}

/**
 * "Cost missing on 3 sold pieces — not counted above." or null when every sale is covered.
 *
 * Said plainly because the alternative — silently computing over 6 of 9 sales — is how a
 * seller ends up trusting a margin that describes two thirds of her month.
 */
export function missingCostNote(p: ProfitInputs): string | null {
 const missing = Math.max(0, p.totalSales - p.coveredSales);
 if (missing === 0) return null;
 return `Cost missing on ${missing} sold ${missing === 1 ? "piece" : "pieces"} — not counted above.`;
}
