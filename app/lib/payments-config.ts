// ───────────────────────────────────────────────────────────────────────────
// VYA platform economics. The single source of truth for what VYA charges.
// Money model: the seller is merchant of record (Stripe Connect *direct* charges);
// VYA earns a seller subscription (primary) PLUS a per-order application fee taken
// off the top of each direct charge (secondary). Never hardcode the fee or the
// subscription price anywhere else. Import from here.
// ───────────────────────────────────────────────────────────────────────────

// Revenue model: the seller's monthly SUBSCRIPTION is the primary revenue; a
// small per-transaction commission rides on top. Both numbers are still being
// figured out: they live here so there's one place to change them.
export const PAYMENTS = {
 // VYA's small cut of each sale, collected as a Stripe application fee on the
 // direct charge to the seller's connected account. 100 bps = 1% (working number).
 applicationFeeBps: 100,

 // Seller subscription to be on VYA (the primary revenue). Billed via Stripe
 // Billing against sellers.stripe_customer_id (subscription flow wired later).
 // priceCents is a placeholder until the plan is finalized.
 subscription: {
 priceCents: 0,
 interval: "month" as const,
 trialDays: 0,
 },
} as const;

/** VYA's application fee (in cents) for an order subtotal, rounded to the nearest cent. */
export function applicationFeeCents(amountCents: number): number {
 if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
 return Math.round((amountCents * PAYMENTS.applicationFeeBps) / 10_000);
}
