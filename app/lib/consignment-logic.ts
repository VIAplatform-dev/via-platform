// Pure consignment business logic, no DB, so it's fully unit-testable.
// The DB layer (consignment-db.ts) fetches rows and calls into these.

export type SplitRule = {
 minPriceCents: number;
 maxPriceCents: number | null; // null = "and up"
 category: string | null; // null = any category
 splitPct: number; // the CONSIGNOR's cut, 0–100
};

/**
 * The consignor's cut for an item, most-specific-first:
 *   consignor's own rate  →  a matching store price-band rule  →  the store default.
 * The resolved number is frozen onto the item at intake, so later rule changes never rewrite
 * what a consignor was promised.
 */
export function resolveSplitPct(opts: {
 consignorDefaultPct: number | null;
 priceCents: number;
 category: string | null;
 rules: SplitRule[];
 storeDefaultPct: number;
}): number {
 if (opts.consignorDefaultPct != null) return clampPct(opts.consignorDefaultPct);

 const inBand = (r: SplitRule) => opts.priceCents >= r.minPriceCents && (r.maxPriceCents == null || opts.priceCents <= r.maxPriceCents);
 const catOk = (r: SplitRule) => r.category == null || (opts.category != null && r.category.toLowerCase() === opts.category.toLowerCase());
 const matches = opts.rules.filter((r) => inBand(r) && catOk(r));
 if (matches.length) {
 // Prefer a category-specific rule over a catch-all, then the tightest band (highest floor).
 matches.sort((a, b) => {
 const aCat = a.category != null ? 1 : 0;
 const bCat = b.category != null ? 1 : 0;
 if (aCat !== bCat) return bCat - aCat;
 return b.minPriceCents - a.minPriceCents;
 });
 return clampPct(matches[0].splitPct);
 }
 return clampPct(opts.storeDefaultPct);
}

/** The consignor's payout for a sale. Their split of the sale price, in cents. */
export function consignorCutCents(soldPriceCents: number, splitPct: number): number {
 return Math.round(soldPriceCents * (clampPct(splitPct) / 100));
}

/** A consignor's balance is just the sum of their ledger entries (+ credits, − payouts/reversals). */
export function ledgerBalanceCents(entries: { amountCents: number }[]): number {
 return entries.reduce((sum, e) => sum + e.amountCents, 0);
}

function clampPct(n: number): number {
 if (!Number.isFinite(n)) return 0;
 return Math.min(100, Math.max(0, n));
}
