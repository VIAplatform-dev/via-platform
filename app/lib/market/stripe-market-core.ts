// Pure builders for the Stripe objects a market checkout creates, and the reconcile rule. No I/O.
// Card-only on purpose: `card` brings Apple Pay / Google Pay / Link, and every async method (BNPL,
// Cash App) would leave the seller standing there waiting on a pending payment.

export const MARKET_METADATA_CHANNEL = "market";
const SESSION_MIN_TTL_SECONDS = 30 * 60; // Stripe: expires_at must be ≥ 30 minutes out

export type CheckoutLike = { id: string; itemId: string; sellerId: string; amountCents: number; currency: string; tender: "qr" | "keyed" | "cash"; createdAt: string; expiresAt: string; items?: { itemId: string; saleCents: number }[] };

/* eslint-disable @typescript-eslint/no-explicit-any */
export function marketMetadata(c: CheckoutLike): Record<string, string> {
 return { channel: MARKET_METADATA_CHANNEL, market_checkout_id: c.id, itemId: c.itemId, sellerId: c.sellerId, tender: c.tender, sale_price_cents: String(c.amountCents) };
}

export function marketSessionParams(o: { checkout: CheckoutLike; item: { title: string; image: string | null }; items?: { title: string; image: string | null; saleCents: number }[]; base: string; feeCents: number; now: Date }): any {
 const c = o.checkout;
 const meta = marketMetadata(c);
 // Indexed objects, not arrays: app/lib/stripe.ts flattens objects into line_items[0][…] form
 // fields but stringifies a JS array to "[object Object]". One line per cart item at its SALE price.
 const lines = (o.items && o.items.length ? o.items : [{ title: o.item.title, image: o.item.image, saleCents: c.amountCents }]).filter((l) => l.saleCents > 0);
 const line_items: Record<number, unknown> = {};
 lines.forEach((l, i) => { line_items[i] = { quantity: 1, price_data: { currency: c.currency.toLowerCase(), unit_amount: l.saleCents, product_data: { name: l.title.slice(0, 120), ...(l.image ? { images: { 0: l.image } } : {}) } } }; });
 return {
 mode: "payment",
 payment_method_types: { 0: "card" },
 line_items,
 metadata: meta,
 payment_intent_data: { ...(o.feeCents > 0 ? { application_fee_amount: o.feeCents } : {}), metadata: meta },
 success_url: `${o.base}/pay/done`,
 cancel_url: `${o.base}/pay/cancel`,
 expires_at: Math.floor(o.now.getTime() / 1000) + SESSION_MIN_TTL_SECONDS,
 };
}

export function marketIntentParams(o: { checkout: CheckoutLike; feeCents: number }): any {
 const c = o.checkout;
 return {
 amount: c.amountCents,
 currency: c.currency.toLowerCase(),
 payment_method_types: { 0: "card" },
 ...(o.feeCents > 0 ? { application_fee_amount: o.feeCents } : {}),
 metadata: marketMetadata(c),
 };
}

export type StripeView = { paid: boolean; paymentIntent: string | null; email?: string | null } | null;
export type ReconcileAction = "finalize" | "expire" | "wait" | "none";

/** What to do with a checkout given what Stripe says right now. Money wins over time. */
export function reconcileDecision(c: { status: string; tender: string; expiresAt: string; createdAt: string }, stripe: StripeView, now: Date): ReconcileAction {
 if (stripe?.paid && c.status !== "paid" && c.status !== "paid_conflict" && c.status !== "failed") return "finalize";
 if (c.status !== "awaiting_payment") return "none";
 if (now.getTime() >= new Date(c.expiresAt).getTime()) return "expire";
 return "wait";
}
