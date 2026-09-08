import { stripePost, stripeGet } from "@/app/lib/stripe";

// The Stripe half of a refund, shared by the online refund (Orders) and a void at the stall
// (Market Mode). ONE implementation: the buyer is refunded on the seller's connected account,
// VYA's application fee comes back, and a basket that shares one PaymentIntent is only ever
// refunded for THIS order's amount. Nothing here touches the order row or the piece — the caller
// does that once the money has moved, so a Stripe failure changes nothing.

export type RefundPaymentInput = {
 /** The seller's connected account — the charge lives there. */
 stripeAccountId: string;
 paymentIntent: string;
 /** What the buyer gets back. */
 refundAmountCents: number;
 /** VYA's application fee on this order, as charged. */
 feeCents: number;
 /** The return-label cost VYA keeps out of the fee it hands back (0 when there is none). */
 returnShipDeduction: number;
 /** Restocking + return label — when > 0 the refund is partial and must carry an amount. */
 totalDeduction: number;
 /** The intent carries several orders (a Market Mode basket): never a bare full refund. */
 sharedIntent: boolean;
};

export async function refundOrderPayment(o: RefundPaymentInput): Promise<{ ok: true } | { ok: false; error: string }> {
 const acct = o.stripeAccountId;
 const pi = o.paymentIntent;
 // RECOUP: when the buyer paid return shipping, VYA keeps that label cost out of the fee it hands
 // back to the seller — so the money for the label VYA bought lands with VYA, not the seller. This
 // needs the platform application-fee id; if we can't get it, fall back to the standard refund
 // (buyer still refunded correctly, VYA just doesn't recoup — no worse than before).
 let feeId: string | null = null;
 if (o.returnShipDeduction > 0 && o.feeCents > 0) {
  try {
   const piData = await stripeGet(`payment_intents/${pi}?expand[]=latest_charge`, undefined, acct) as { latest_charge?: { application_fee?: string | { id: string } } };
   const af = piData?.latest_charge?.application_fee;
   feeId = typeof af === "string" ? af : (af?.id ?? null);
  } catch { feeId = null; }
 }
 try {
  if (feeId) {
   // 1) Refund the buyer the net amount. 2) Return the seller's share of VYA's fee — the whole fee
   // MINUS the return-label cost VYA keeps. (Fee refunds are a platform op → no connected-account.)
   await stripePost("refunds", { payment_intent: pi, amount: String(o.refundAmountCents) }, acct);
   const feeRefund = Math.max(0, o.feeCents - o.returnShipDeduction);
   if (feeRefund > 0) await stripePost(`application_fees/${feeId}/refunds`, { amount: String(feeRefund) }, undefined);
  } else {
   // Standard: partial refund when a deduction applies, else full; fee returned proportionally.
   await stripePost("refunds", {
    payment_intent: pi,
    refund_application_fee: "true",
    // Always scope to this order's amount when the intent carries several orders (a Market Mode
    // basket): a bare refund would return the WHOLE charge for one returned item.
    ...(o.totalDeduction > 0 || o.sharedIntent ? { amount: String(o.refundAmountCents) } : {}),
   }, acct);
  }
  return { ok: true };
 } catch (e) {
  return { ok: false, error: e instanceof Error ? e.message : "Refund failed at Stripe." };
 }
}
