// Whether refunding an order should undo the tax it filed. Pure, no I/O.
//
// Split out of sales-tax.ts, which reaches Stripe and so cannot be loaded by a test. The rule is
// the part worth holding still; the API call around it is not.
export type TaxReversal = "full" | "manual" | "none";

/**
 * Whether a refund should reverse the sale's tax transaction, and whether we may do it ourselves.
 *
 * WHY THIS IS NOT "REFUNDED, SO REVERSE IT". Two things make a refund partial, and a full reversal
 * on either would hand the seller back tax she is still holding:
 *
 *   · A RESTOCKING FEE or a deducted return label. The buyer keeps paying part of the sale, so part
 *     of the tax stands.
 *   · A SHARED INTENT. Orders are one row per piece, so a bag of three is one PaymentIntent and one
 *     tax transaction. Refunding one piece of three must not reverse the tax on the other two.
 *
 * "manual" is deliberate and is not a failure. Working out the taxable portion of a partial refund
 * needs the per-line tax from the original calculation, and a wrong number filed against a seller's
 * account is worse than a flagged one she or VYA can correct in Stripe. So the partial case is
 * surfaced rather than guessed at.
 */
export function taxReversalFor(args: {
 /** Everything the buyer paid on this order, in cents. */
 fullChargeCents: number;
 /** What is actually going back to them. */
 refundAmountCents: number;
 /** Does this PaymentIntent cover more than one piece? */
 sharedIntent: boolean;
 /** Are all the other pieces on that intent already refunded? */
 siblingsAllRefunded?: boolean;
 /** Was any tax collected at all? No tax, nothing to reverse. */
 taxCollected: boolean;
}): TaxReversal {
 if (!args.taxCollected) return "none";
 const full = args.refundAmountCents >= args.fullChargeCents && args.fullChargeCents > 0;
 if (!full) return "manual"; // a fee was kept, so part of the tax is still owed
 if (args.sharedIntent && !args.siblingsAllRefunded) return "manual"; // other pieces on this intent still stand
 return "full";
}
