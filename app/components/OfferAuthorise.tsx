"use client";

import { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

/**
 * The second step of a BINDING offer: the card, and where it goes.
 *
 * WHY A BUYER IS ASKED FOR THIS BEFORE ANYONE HAS SAID YES. On a shop with binding offers on,
 * accepting IS the sale: the seller presses Accept and the money moves. That only works if the card
 * is already authorised, so the ask has to come first. In exchange the buyer gets the thing an
 * offer usually cannot give her: a yes that is final, on a one-of-one piece, with nobody able to
 * buy it out from under her while she decides.
 *
 * NOTHING IS CHARGED HERE. This saves the card against the offer (a SetupIntent, not a payment).
 * If the seller declines or counters, no money has moved and there is nothing to refund.
 *
 * The card is saved on the STORE's own Stripe account, because that is where the charge will
 * happen. A payment method saved to VYA's platform account could never be used for a direct charge.
 */

export type OfferAuth = {
 token: string;
 clientSecret: string;
 publishableKey: string | null;
 stripeAccount: string;
};

const FIELD = "w-full border border-black/20 bg-white/70 px-2.5 py-1.5 text-[12px] outline-none focus:border-black/50";

function Inner({ auth, accent, amount, onDone }: { auth: OfferAuth; accent: string; amount: string; onDone: () => void }) {
 const stripe = useStripe();
 const elements = useElements();
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState<string | null>(null);
 const [ship, setShip] = useState({ name: "", line1: "", line2: "", city: "", state: "", zip: "", country: "US", phone: "" });
 const set = (k: string, v: string) => setShip((s) => ({ ...s, [k]: v }));

 async function authorise(e: React.FormEvent) {
  e.preventDefault();
  if (!stripe || !elements) return;
  setBusy(true); setErr(null);

  // The card first. No point asking Stripe to remember an address for an offer that has no card.
  const { error, setupIntent } = await stripe.confirmSetup({ elements, redirect: "if_required" });
  if (error || !setupIntent?.id) {
   setBusy(false);
   setErr(error?.message || "That card didn't save. Try another.");
   return;
  }

  // The server re-reads the SetupIntent from Stripe rather than trusting this id, and only then
  // does the seller hear about the offer at all.
  const r = await fetch("/api/storefront/offer/authorise", {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ token: auth.token, setupIntentId: setupIntent.id, shipTo: ship }),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(false);
  if (!r?.ok) { setErr(r?.d?.error || "Couldn't send your offer. Try again."); return; }
  onDone();
 }

 return (
  <form onSubmit={authorise} className="mt-2 flex flex-col gap-1.5">
   <p className="text-[11px] leading-relaxed opacity-70">
    This shop takes binding offers. Add a card and your address, and if they say yes to {amount} it
    is yours straight away. Nothing is charged unless they accept.
   </p>
   <input required value={ship.name} onChange={(e) => set("name", e.target.value)} placeholder="Full name" className={FIELD} />
   <input required value={ship.line1} onChange={(e) => set("line1", e.target.value)} placeholder="Address" className={FIELD} />
   <input value={ship.line2} onChange={(e) => set("line2", e.target.value)} placeholder="Apartment, floor (optional)" className={FIELD} />
   <div className="flex gap-1.5">
    <input required value={ship.city} onChange={(e) => set("city", e.target.value)} placeholder="City" className={FIELD} />
    <input value={ship.state} onChange={(e) => set("state", e.target.value)} placeholder="State" className={FIELD} />
   </div>
   <div className="flex gap-1.5">
    <input required value={ship.zip} onChange={(e) => set("zip", e.target.value)} placeholder="Postcode" className={FIELD} />
    <input required maxLength={2} value={ship.country} onChange={(e) => set("country", e.target.value.toUpperCase())} placeholder="US" className={FIELD} />
   </div>
   <div className="mt-1"><PaymentElement options={{ layout: "tabs" }} /></div>
   {err && <p className="text-[11px] text-red-700">{err}</p>}
   <button
    type="submit"
    disabled={busy || !stripe}
    className="mt-1 self-start px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-white disabled:opacity-50"
    style={{ background: accent }}
   >
    {busy ? "Sending…" : `Send offer of ${amount}`}
   </button>
  </form>
 );
}

export default function OfferAuthorise({ auth, accent, amount, onDone }: { auth: OfferAuth; accent: string; amount: string; onDone: () => void }) {
 const stripePromise = useMemo(
  () => (auth.publishableKey ? loadStripe(auth.publishableKey, { stripeAccount: auth.stripeAccount }) : null),
  [auth.publishableKey, auth.stripeAccount],
 );
 if (!stripePromise) return <p className="mt-2 text-[11px] opacity-60">Card payments aren&rsquo;t set up for this shop yet.</p>;
 return (
  <Elements stripe={stripePromise} options={{ clientSecret: auth.clientSecret, appearance: { theme: "flat" } }}>
   <Inner auth={auth} accent={accent} amount={amount} onDone={onDone} />
  </Elements>
 );
}
