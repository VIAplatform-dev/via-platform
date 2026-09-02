// What the consignor is owed when a consigned piece sells somewhere that isn't VYA.
//
// Two things change off-platform, and they are independent:
//
//  1. THE MONEY DOESN'T COME THROUGH US. eBay and Depop pay the seller's own account directly.
//     VYA never holds that cash, so it cannot transfer the consignor's share out of a balance it
//     was never given — see settledThroughVya below.
//
//  2. THE MARKETPLACE TOOK A CUT FIRST. eBay is around 13%. Splitting the GROSS means the store
//     pays the whole fee out of its own half: on a $100 sale at 50/50 the consignor gets $50, eBay
//     gets $13, and the store keeps $37 rather than $50. That may be exactly what a store's
//     agreement says — but it has to be a decision, not an accident, so it is a per-store setting.

/** Who absorbs the marketplace's cut on an off-platform sale. */
export type FeePolicy =
 /** The store pays it. The consignor's split is taken from the full sale price. */
 | "store"
 /** Shared. The fee comes off the top, then the split applies to what's left. */
 | "split";

export const DEFAULT_FEE_POLICY: FeePolicy = "store";

/** Channels whose money passes through VYA, so a Stripe payout has something behind it. */
const ROUTED_CHANNELS = new Set(["vya", "storefront", "market"]);

/**
 * Did this sale's money actually reach VYA?
 *
 * The auto-payout transfers from VYA's own Stripe balance. For a VYA sale that balance holds the
 * consignor's cut, routed at checkout. For an eBay sale it holds nothing — the seller was paid
 * directly — so paying out against it would send VYA's own money for a sale it never processed.
 */
export function settledThroughVya(channel: string | null | undefined): boolean {
 return ROUTED_CHANNELS.has((channel || "vya").toLowerCase());
}

/**
 * The consignor's cut, honouring the store's fee policy.
 *
 * Rounded DOWN to the cent for the consignor on a split, so rounding never creates money the store
 * doesn't have. A fee larger than the sale (possible with tiny sales and fixed fees) floors the base
 * at zero rather than going negative.
 */
export function consignorCutWithFee(
 soldPriceCents: number,
 splitPct: number,
 opts: { feeCents?: number | null; policy?: FeePolicy } = {},
): { cutCents: number; baseCents: number; feeAppliedCents: number } {
 const gross = Math.max(0, Math.round(soldPriceCents || 0));
 const pct = Math.min(100, Math.max(0, Number(splitPct) || 0));
 const fee = Math.max(0, Math.round(opts.feeCents || 0));
 const policy: FeePolicy = opts.policy ?? DEFAULT_FEE_POLICY;

 const feeApplied = policy === "split" ? Math.min(fee, gross) : 0;
 const base = gross - feeApplied;
 return { cutCents: Math.floor((base * pct) / 100), baseCents: base, feeAppliedCents: feeApplied };
}

/** eBay's cut, near enough to reason with when the real figure isn't in the payload. */
export const MARKETPLACE_FEE_PCT: Record<string, number> = { ebay: 13.25, depop: 10, etsy: 6.5 };

/**
 * An estimate of what the marketplace took, for channels that don't tell us.
 *
 * Explicitly an estimate: eBay's actual fee varies by category, store subscription and promotion,
 * and the number that matters is on the payout report. Used only when a real fee wasn't supplied,
 * and the ledger records which it was so a seller reconciling later can tell them apart.
 */
export function estimateMarketplaceFeeCents(channel: string | null | undefined, soldPriceCents: number): number | null {
 const pct = MARKETPLACE_FEE_PCT[(channel || "").toLowerCase()];
 if (!pct) return null;
 return Math.round((Math.max(0, soldPriceCents) * pct) / 100);
}
