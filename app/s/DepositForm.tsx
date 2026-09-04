"use client";

import { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

/**
 * Paying the deposit that holds an appointment slot.
 *
 * The booking API has always created the PaymentIntent; there was nowhere to type a card, so a shop
 * that set a deposit took bookings that could never be confirmed — the slot sat unpaid until the
 * sweep cancelled it half an hour later.
 *
 * Charged on the STORE's own Stripe account (`stripeAccount`), like every other payment on the
 * platform, so the money never routes through VYA's balance.
 *
 * `redirect: "if_required"` keeps the shopper on the page for a normal card. The webhook is what
 * actually confirms the appointment and sends the emails — this only reports what the browser saw,
 * so a closed tab or a dropped connection still lands the booking.
 */

export type Deposit = {
 amountCents: number;
 credits: boolean;
 clientSecret: string;
 publishableKey?: string;
 stripeAccount: string;
};

const money = (c: number) => `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`;

function PayBox({ deposit, accent, cta, onPaid }: { deposit: Deposit; accent: string; cta: string; onPaid: () => void }) {
 const stripe = useStripe();
 const elements = useElements();
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState<string | null>(null);

 async function pay() {
  if (!stripe || !elements) return;
  setBusy(true); setErr(null);
  const { error } = await stripe.confirmPayment({ elements, redirect: "if_required", confirmParams: { return_url: window.location.href } });
  setBusy(false);
  if (error) { setErr(error.message || "That card didn't go through. Try another."); return; }
  onPaid();
 }

 return (
  <div className="flex flex-col gap-3">
   <PaymentElement options={{ layout: "tabs" }} />
   <button
    type="button" disabled={busy || !stripe} onClick={pay}
    className="vya-cta w-full py-4 text-center text-[11px] uppercase tracking-[0.2em] text-white transition disabled:opacity-35"
    style={{ background: accent }}
   >{busy ? "Paying…" : `${cta} — ${money(deposit.amountCents)}`}</button>
   {err && <p className="text-[12.5px]" role="alert" style={{ color: accent }}>{err}</p>}
  </div>
 );
}

export default function DepositForm({ deposit, accent, cta = "Pay deposit", onPaid }: {
 deposit: Deposit; accent: string; cta?: string; onPaid: () => void;
}) {
 const stripe = useMemo(
  () => (deposit.publishableKey ? loadStripe(deposit.publishableKey, { stripeAccount: deposit.stripeAccount }) : null),
  [deposit.publishableKey, deposit.stripeAccount],
 );

 // No publishable key means card entry can't be built. Say so rather than render an empty box —
 // the time is still held, and the shop can take the deposit another way.
 if (!stripe) {
  return (
   <div className="vya-round border border-current/15 px-5 py-6 text-center">
    <p className="text-[13px]">Your time is held.</p>
    <p className="mx-auto mt-2 max-w-[38ch] text-[12.5px] leading-relaxed opacity-65">
     We couldn&rsquo;t open card payment just now — the shop will be in touch about the {money(deposit.amountCents)} deposit.
    </p>
   </div>
  );
 }

 return (
  <div className="flex flex-col gap-3">
   <p className="text-[12.5px] leading-relaxed opacity-70">
    A {money(deposit.amountCents)} deposit holds this time.{deposit.credits ? " It comes off anything you buy on the day." : ""}
   </p>
   <Elements stripe={stripe} options={{ clientSecret: deposit.clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: accent } } }}>
    <PayBox deposit={deposit} accent={accent} cta={cta} onPaid={onPaid} />
   </Elements>
  </div>
 );
}
