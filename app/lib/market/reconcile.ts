import "server-only";
import { getCheckout, closeCheckout, finalizeMarketSale, listOpenCheckouts, listPaidWithoutOrder, claimStripeCheck, type MarketCheckout } from "./checkout-db";
import { getSellerById } from "@/app/lib/db/sellers";
import { sellerAccount, stripeView, expireMarketPayment } from "./stripe-market";
import { reconcileDecision } from "./stripe-market-core";
import { logError } from "@/app/lib/error-log";

// One function, three callers (the seller's poll, the webhook, the cron): look at what Stripe says
// and move the checkout accordingly. Every step is idempotent, so callers can overlap freely.
export async function reconcileCheckout(c: MarketCheckout, source: string, now: Date = new Date()): Promise<MarketCheckout | null> {
 const seller = await getSellerById(c.sellerId).catch(() => null);
 const acct = seller ? await sellerAccount(seller.slug) : null;
 let view = null;
 if (c.tender !== "cash" && acct && (c.stripeCheckoutSession || c.stripePaymentIntent)) {
 // Throttle: the poll, the cron and a second device may all be looking at this checkout.
 if (!(await claimStripeCheck(c.id))) return c;
 try { view = await stripeView({ session: c.stripeCheckoutSession, paymentIntent: c.stripePaymentIntent, acct: acct.acct }); }
 catch (e) { logError("market-reconcile-stripe", e, { context: { checkoutId: c.id } }); return c; } // Stripe hiccup: leave it, try again next tick
 }
 const action = reconcileDecision(c, view, now);
 if (action === "finalize") {
 await finalizeMarketSale({ checkoutId: c.id, paymentIntent: view?.paymentIntent ?? c.stripePaymentIntent, tender: c.tender, source, receiptEmail: view?.email ?? null });
 return getCheckout(c.id);
 }
 if (action === "expire") {
 const closed = await closeCheckout(c.id, "expired", source);
 if (closed && acct) await expireMarketPayment({ session: c.stripeCheckoutSession, paymentIntent: c.stripePaymentIntent, acct: acct.acct });
 return closed ?? getCheckout(c.id);
 }
 return c;
}

/** The cron body: sweep every open checkout, and finish any paid one that lost its order. */
export async function reconcileAll(now: Date = new Date()): Promise<{ checked: number; expired: number; finalized: number; repaired: number }> {
 const out = { checked: 0, expired: 0, finalized: 0, repaired: 0 };
 // A few at a time: at 500 sellers there can be hundreds open, and serial Stripe calls would blow
 // the cron's time budget; eight in flight keeps well under Stripe's read limit.
 const open = await listOpenCheckouts(300);
 const CONC = 8;
 for (let i = 0; i < open.length; i += CONC) {
 await Promise.all(open.slice(i, i + CONC).map(async (c) => {
 out.checked++;
 const after = await reconcileCheckout(c, "cron", now).catch((e) => { logError("market-reconcile", e, { context: { checkoutId: c.id } }); return null; });
 if (after?.status === "expired") out.expired++;
 if (after?.status === "paid") out.finalized++;
 }));
 }
 for (const c of await listPaidWithoutOrder(50)) {
 const r = await finalizeMarketSale({ checkoutId: c.id, paymentIntent: c.stripePaymentIntent, tender: c.tender, source: "cron-repair" }).catch(() => null);
 if (r?.orderId) out.repaired++;
 }
 return out;
}
