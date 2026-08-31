// The customer's phone lands here after paying a market QR. It proves nothing on its own — the
// seller's screen (driven by Stripe's webhook / our reconcile) is the source of truth for "paid".
export default function PayDone() {
 return (
 <main className="flex min-h-screen items-center justify-center bg-[#f7f6f3] px-6 text-center" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
 <div>
 <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-700">✓</div>
 <h1 className="mt-4 text-2xl font-semibold text-stone-900">Payment sent</h1>
 <p className="mt-2 text-[15px] text-stone-600">Show this to the seller — their screen will confirm the sale in a moment. A receipt is on its way if you entered an email.</p>
 </div>
 </main>
 );
}
