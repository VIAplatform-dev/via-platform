export const dynamic = "force-dynamic";

// Order confirmation. The store name rides along in the return_url (?store=…) that the checkout
// page sets on Stripe's confirmPayment, so we can name who's shipping without a DB round-trip
// (fulfillment happens async in the webhook).
export default async function CheckoutSuccess({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
 const { store } = await searchParams;
 const storeName = (store || "").trim();

 return (
 <main className="min-h-screen bg-[#ffffff] text-[#111111] flex items-center justify-center px-6">
 <div className="text-center max-w-md">
 <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#111111]/[0.07] text-[#111111]">
 <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
 </div>
 <p className="font-serif text-3xl sm:text-4xl mb-3">Thank you for your order</p>
 <p className="text-sm leading-relaxed text-black/55">
 Your payment went through and your order is confirmed.{" "}
 {storeName ? <><span className="font-medium text-[#111111]">{storeName}</span> will be shipping it to you soon</> : "The seller will be in touch about shipping soon"} — you’ll get an email confirmation shortly. Since it’s one-of-one, it’s now off the shelf, so nobody else can buy it.
 </p>
 </div>
 </main>
 );
}
