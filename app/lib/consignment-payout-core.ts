// Paying a consignor for a sale that happened somewhere else — and only once the money has cleared.
//
// The shape of the problem. A consigned piece sells on eBay. eBay pays the STORE, directly, so VYA
// is holding nothing. To pay the consignor, VYA debits the store's bank (ACH) and forwards it.
//
// ACH is slow and it is reversible. It takes days to clear and can bounce afterwards — insufficient
// funds, closed account, a consumer dispute up to 60 days later. So the one rule that matters is:
//
//   THE CONSIGNOR IS PAID AFTER THE DEBIT CLEARS, NEVER WHEN IT IS STARTED.
//
// Pay on click and a bounce on day four leaves VYA out of pocket, chasing a store for money it
// already handed to somebody else.
//
// The second rule is about the seller's balance. recordPayout debits the consignor's ledger the
// moment a payout row exists, which is right — it RESERVES the money so a second payout can't be
// started for the same $50 while the first is in flight. But it means a failed debit has already
// taken the money off her balance, so failing MUST give it back. A hold that is never released is
// money the consignor is owed and can no longer see.
//
// Pure. No Stripe, no database — just what may follow what, and what each move does to the balance.

export type PayoutStatus =
 /** Debit started against the store's bank. Money reserved, consignor not paid. */
 | "awaiting_funds"
 /** Debit cleared and the transfer went out. Terminal. */
 | "paid"
 /** Debit bounced or was disputed. The reservation must be released. Terminal. */
 | "failed"
 /** Called off before the debit cleared. The reservation must be released. Terminal. */
 | "canceled";

const NEXT: Record<PayoutStatus, PayoutStatus[]> = {
 awaiting_funds: ["paid", "failed", "canceled"],
 paid: [],      // terminal on purpose: a cleared ACH that later reverses is a NEW debit, not an edit
 failed: [],
 canceled: [],
};

export function canTransition(from: PayoutStatus, to: PayoutStatus): boolean {
 return (NEXT[from] ?? []).includes(to);
}

/** What a move does to the consignor's reserved balance. */
export type LedgerEffect =
 | "hold"    // take it off her available balance so it can't be paid twice
 | "release" // give it back — the money never reached her
 | "none";

export function ledgerEffect(from: PayoutStatus | null, to: PayoutStatus): LedgerEffect {
 if (from === null) return to === "awaiting_funds" || to === "paid" ? "hold" : "none";
 if (!canTransition(from, to)) return "none";
 // Cleared: the hold becomes the payment. Nothing further to do to the balance.
 if (to === "paid") return "none";
 // Bounced or called off: she never got it, so it goes back to what she is owed.
 return "release";
}

export type PayoutPlan =
 | { ok: true; amountCents: number }
 | { ok: false; reason: string };

/**
 * How much may be paid right now.
 *
 * `inFlightCents` is everything already reserved by a debit that has not cleared. Without
 * subtracting it, pressing Pay twice while the first ACH is still settling starts a second debit
 * for money that is already spoken for, and the store is debited twice for one sale.
 */
export function planOffPlatformPayout(o: {
 owedCents: number;
 inFlightCents?: number;
 /** Below this, the ACH fee is a silly proportion of the payment. */
 minimumCents?: number;
 storeBankConnected: boolean;
 consignorPayoutReady: boolean;
}): PayoutPlan {
 const owed = Math.max(0, Math.round(o.owedCents || 0));
 const inFlight = Math.max(0, Math.round(o.inFlightCents || 0));
 const minimum = o.minimumCents ?? 100;
 const available = owed - inFlight;

 if (!o.storeBankConnected) return { ok: false, reason: "Connect a bank account to pay consignors for sales that happened off VYA." };
 if (!o.consignorPayoutReady) return { ok: false, reason: "This consignor hasn’t finished setting up payouts yet." };
 if (available <= 0) {
  return inFlight > 0
   ? { ok: false, reason: "A payment for this is already on its way — it clears in a few working days." }
   : { ok: false, reason: "Nothing owed from off-VYA sales." };
 }
 if (available < minimum) return { ok: false, reason: `Too small to send on its own — $${(minimum / 100).toFixed(2)} minimum.` };
 return { ok: true, amountCents: available };
}

/** Plain-language state for the payouts screen. Sellers do not read status enums. */
export function payoutStatusLabel(status: PayoutStatus): string {
 return status === "awaiting_funds" ? "On its way — clearing"
  : status === "paid" ? "Paid"
  : status === "failed" ? "Didn’t go through"
  : "Cancelled";
}

/**
 * What a Stripe PaymentIntent's status means for this payout.
 *
 * The debit is an ACH pull against the store's bank, so the interesting statuses are the slow ones.
 * `processing` is where an ACH lives for most of its life — submitted, not yet cleared, and NOT a
 * reason to pay anybody. Returning null means "this event tells us nothing new", which is the right
 * answer for the statuses a PaymentIntent passes through before the debit is even submitted:
 * treating those as a state change would either pay early or release a hold that is still live.
 */
export function payoutStatusForIntent(stripeStatus: string | null | undefined): PayoutStatus | null {
 switch ((stripeStatus || "").trim()) {
  case "processing": return "awaiting_funds";
  case "succeeded": return "paid";
  // Stripe walks a failed ACH back to requires_payment_method — there is no "failed" status.
  case "requires_payment_method": return "failed";
  case "canceled": return "canceled";
  default: return null;
 }
}
