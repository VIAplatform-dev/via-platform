// ───────────────────────────────────────────────────────────────────────────
// Market Mode checkout — pure rules (no DB), so the state machine is unit-testable
// in isolation. checkout-db.ts enforces these atomically with status-guarded UPDATEs.
//
// A market checkout is the seller's intent to sell ONE item to the customer in
// front of them. Money is the fact: a checkout becomes `paid` only when a payment
// is verified (Stripe) or the seller explicitly took cash. The item flips to sold
// AFTER the paid claim wins, never before.
// ───────────────────────────────────────────────────────────────────────────

export type MarketCheckoutStatus =
 | "awaiting_payment" // open: reservation held, waiting on the customer
 | "paid" // payment verified (or cash) and the item is sold
 | "canceled" // seller canceled before payment; reservation released
 | "expired" // hold ran out with no payment; reservation released
 | "failed" // payment provider reported a definite failure; reservation released
 | "paid_conflict"; // payment landed but the item was no longer sellable → refund + alert

export type MarketTender = "qr" | "keyed" | "cash";

/** How long a market checkout holds the item. Longer than the 10-min online hold: the
 *  customer is standing there, but a phone lock / app switch shouldn't lose the sale. */
export const MARKET_CHECKOUT_TTL_SECONDS = 15 * 60;

export const CHECKOUT_TRANSITIONS: Record<MarketCheckoutStatus, MarketCheckoutStatus[]> = {
 awaiting_payment: ["paid", "canceled", "expired", "failed"],
 // A payment that lands after the seller canceled / the hold expired is still real money.
 canceled: ["paid"],
 expired: ["paid"],
 failed: [],
 paid: ["paid_conflict"], // only if markSold loses after the money is claimed
 paid_conflict: [],
};

export function canCheckoutTransition(from: MarketCheckoutStatus, to: MarketCheckoutStatus): boolean {
 return CHECKOUT_TRANSITIONS[from]?.includes(to) ?? false;
}

/** The statuses a verified payment may arrive from — the WHERE clause of the paid claim. */
export function allowedFromForPaid(): MarketCheckoutStatus[] {
 return (Object.keys(CHECKOUT_TRANSITIONS) as MarketCheckoutStatus[]).filter((s) => canCheckoutTransition(s, "paid"));
}

export function isOpenCheckout(status: MarketCheckoutStatus): boolean {
 return status === "awaiting_payment";
}

export function checkoutExpiry(from: Date = new Date(), ttlSeconds: number = MARKET_CHECKOUT_TTL_SECONDS): Date {
 return new Date(from.getTime() + ttlSeconds * 1000);
}

export function checkoutExpired(expiresAt: Date, now: Date = new Date()): boolean {
 return now.getTime() >= expiresAt.getTime();
}
