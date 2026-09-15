// Pure builders for the Stripe objects a market checkout creates, and the reconcile rule. No I/O.
// Card-only on purpose: `card` brings Apple Pay / Google Pay / Link, and every async method (BNPL,
// Cash App) would leave the seller standing there waiting on a pending payment.

export const MARKET_METADATA_CHANNEL = "market";
const SESSION_MIN_TTL_SECONDS = 30 * 60; // Stripe: expires_at must be ≥ 30 minutes out

export type CheckoutLike = { id: string; itemId: string; sellerId: string; amountCents: number; currency: string; tender: "qr" | "keyed" | "cash"; createdAt: string; expiresAt: string; items?: { itemId: string; saleCents: number }[] };

/* eslint-disable @typescript-eslint/no-explicit-any */
export function marketMetadata(c: CheckoutLike, tax?: { calculationId?: string | null; taxCents?: number }): Record<string, string> {
 const meta: Record<string, string> = { channel: MARKET_METADATA_CHANNEL, market_checkout_id: c.id, itemId: c.itemId, sellerId: c.sellerId, tender: c.tender, sale_price_cents: String(c.amountCents) };

 // Same mechanism the storefront uses: the calculation id travels on the payment so the webhook
 // can turn it into a filed Tax Transaction once the money is actually taken.
 if (tax?.calculationId) meta.tax_calculation = tax.calculationId;
 if (tax?.taxCents) meta.tax_cents = String(Math.round(tax.taxCents));
 return meta;
}

export function marketSessionParams(o: { taxCents?: number; taxCalculationId?: string | null; checkout: CheckoutLike; item: { title: string; image: string | null }; items?: { title: string; image: string | null; saleCents: number }[]; base: string; feeCents: number; now: Date }): any {
 const c = o.checkout;
 const meta = marketMetadata(c, { calculationId: o.taxCalculationId, taxCents: o.taxCents });
 // Indexed objects, not arrays: app/lib/stripe.ts flattens objects into line_items[0][…] form
 // fields but stringifies a JS array to "[object Object]". One line per cart item at its SALE price.
 const lines = (o.items && o.items.length ? o.items : [{ title: o.item.title, image: o.item.image, saleCents: c.amountCents }]).filter((l) => l.saleCents > 0);
 const line_items: Record<number, unknown> = {};
 lines.forEach((l, i) => { line_items[i] = { quantity: 1, price_data: { currency: c.currency.toLowerCase(), unit_amount: l.saleCents, product_data: { name: l.title.slice(0, 120), ...(l.image ? { images: { 0: l.image } } : {}) } } }; });
 // SALES TAX ON A SALE MADE ACROSS A TABLE.
 //
 // In-person sales were the one channel that charged none at all. A dress sold at a stall in a
 // state with sales tax is as taxable as the same dress posted from the same shop, and the seller
 // is as liable for it, but nothing here ever asked. So the line was simply missing from her
 // takings and from her filings.
 //
 // Its own line rather than Stripe's automatic_tax, because automatic_tax on a hosted Session
 // needs an address from the buyer, and asking somebody at a market stall for their billing
 // address to buy a scarf is not a checkout anybody finishes. The amount is worked out before this
 // (the seller's own location is the point of sale) and shown as what it is.
 if (o.taxCents && o.taxCents > 0) {
  line_items[lines.length] = {
   quantity: 1,
   price_data: { currency: c.currency.toLowerCase(), unit_amount: Math.round(o.taxCents), product_data: { name: "Sales tax" } },
  };
 }
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

export function marketIntentParams(o: { checkout: CheckoutLike; feeCents: number; taxCents?: number; taxCalculationId?: string | null }): any {
 const c = o.checkout;
 return {
 // The tax rides on the amount here: a PaymentIntent has no line items to hang it off. The
 // metadata below carries the calculation so the webhook can file it (sales-tax.ts).
 amount: c.amountCents + Math.max(0, Math.round(o.taxCents ?? 0)),
 currency: c.currency.toLowerCase(),
 payment_method_types: { 0: "card" },
 ...(o.feeCents > 0 ? { application_fee_amount: o.feeCents } : {}),
 metadata: marketMetadata(c, { calculationId: o.taxCalculationId, taxCents: o.taxCents }),
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
