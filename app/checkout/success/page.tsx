import { getOrdersByPaymentIntent } from "@/app/lib/db/orders";
import { loadBuyerOrder } from "@/app/lib/buyer-order";
import OrderView from "@/app/order/OrderView";

export const dynamic = "force-dynamic";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Order confirmation. Stripe appends ?payment_intent=… to the checkout return_url, so we resolve the
// real order and render the full, store-branded confirmation (order #, item, totals, ship-to, status).
// Fulfillment (order row) is created async by the webhook, so we retry briefly to win the race; if it's
// still catching up we show a graceful "payment received" state that names the store from ?store=.
export default async function CheckoutSuccess({ searchParams }: { searchParams: Promise<{ store?: string; payment_intent?: string; item?: string }> }) {
 const { store, payment_intent } = await searchParams;

 let orderId: string | null = null;
 if (payment_intent) {
 for (let i = 0; i < 4 && !orderId; i++) {
 const rows = await getOrdersByPaymentIntent(payment_intent).catch(() => []);
 if (rows.length) orderId = rows[0].id;
 else if (i < 3) await sleep(1200); // webhook usually lands within ~1–2s
 }
 }

 const view = orderId ? await loadBuyerOrder(orderId) : null;
 if (view) return <OrderView v={view} mode="confirmation" />;

 // Fallback: payment succeeded but the order row isn't written yet (or no PI param). Reassure + name the store.
 const storeName = (store || "").trim();
 return (
 <main className="flex min-h-screen items-center justify-center bg-[#fffdf8] px-6 text-[#1a1a1a]">
 <div className="max-w-md text-center">
 <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-[#5D0F17] text-white">
 <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
 </div>
 <p className="mb-3 font-serif text-3xl sm:text-4xl">Thank you for your order</p>
 <p className="text-sm leading-relaxed text-black/55">
 Your payment went through and your order is confirmed.{" "}
 {storeName ? <><span className="font-medium text-[#1a1a1a]">{storeName}</span> will be shipping it to you soon</> : "The seller will be in touch about shipping soon"} — your confirmation email is on its way, with a link to track it. Since it’s one-of-one, it’s now off the shelf.
 </p>
 </div>
 </main>
 );
}
