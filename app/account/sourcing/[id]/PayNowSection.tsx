"use client";

import { useState, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(
 process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
 "pk_live_51SuO4fH2dVF0WrN0yaIdMeQo3yco2VskEh10ggAbEp5OaTKvfnINJhXTHkUPk6deacXTcmySqx7PzsILoK2BCpwN00WCbtIaPK"
);

export default function PayNowSection({ requestId }: { requestId: string }) {
 const [clientSecret, setClientSecret] = useState<string | null>(null);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);

 async function handlePayNow() {
 setLoading(true);
 setError(null);
 try {
 const res = await fetch(`/api/sourcing/${requestId}/pay`, { method: "POST" });
 const data = await res.json();
 if (!res.ok || !data.clientSecret) {
 setError(data.error || "Could not start checkout. Please try again.");
 return;
 }
 setClientSecret(data.clientSecret);
 } catch {
 setError("Network error. Please try again.");
 } finally {
 setLoading(false);
 }
 }

 const fetchClientSecret = useCallback(async () => clientSecret ?? "", [clientSecret]);

 if (error) {
 return (
 <div className="border border-red-200 p-5 bg-red-50">
 <p className="text-sm text-red-700">{error}</p>
 </div>
 );
 }

 if (clientSecret) {
 return (
 <div className="border border-[#5D0F17]/15">
 <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
 <EmbeddedCheckout />
 </EmbeddedCheckoutProvider>
 </div>
 );
 }

 return (
 <div className="border border-[#5D0F17]/15 p-6 text-center">
 <p className="text-sm text-[#5D0F17]/60 mb-1">Sourcing fee</p>
 <p className="font-serif text-2xl mb-1">$20</p>
 <p className="text-xs text-[#5D0F17]/40 mb-6">Refundable if no match is found within 21 business days.</p>
 <button
 onClick={handlePayNow}
 disabled={loading}
 className="w-full text-sm uppercase tracking-wide px-8 py-3 bg-[#5D0F17] text-[#FFFDF8] hover:bg-[#5D0F17]/85 disabled:opacity-50 disabled:cursor-not-allowed transition"
 >
 {loading ? "Loading…" : "Complete Payment: Send to Stores"}
 </button>
 </div>
 );
}
