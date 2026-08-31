import "server-only";
import { attachStripe, type MarketCheckout } from "./checkout-db";
import { createMarketSession, createMarketIntent } from "./stripe-market";
import { getMarketItem } from "./inventory-db";

/** Create the Stripe object for a fresh card checkout. Shared with the self-heal in GET /checkout/[id]. */
export async function attachPayment(c: MarketCheckout, sellerId: string, acct: string, tender: "qr" | "keyed"): Promise<{ checkout: MarketCheckout; clientSecret: string | null }> {
 if (tender === "qr") {
 const items = await Promise.all(c.items.map(async (l) => { const it = await getMarketItem(sellerId, l.itemId); return { title: it?.title || "Item", image: it?.image ?? null, saleCents: l.saleCents }; }));
 const s = await createMarketSession({ checkout: c, item: items[0], items, acct });
 await attachStripe(c.id, { session: s.id, paymentIntent: s.paymentIntent, payUrl: s.url });
 return { checkout: { ...c, stripeCheckoutSession: s.id, stripePaymentIntent: s.paymentIntent, payUrl: s.url }, clientSecret: null };
 }
 const pi = await createMarketIntent({ checkout: c, acct });
 await attachStripe(c.id, { paymentIntent: pi.id });
 return { checkout: { ...c, stripePaymentIntent: pi.id }, clientSecret: pi.clientSecret };
}

