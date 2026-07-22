"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

type LineItem = { id: string; title: string; priceCents: number; currency: string; image: string | null };
type Info = { items: LineItem[]; storeName: string; freeShipping: boolean; subtotalCents: number };

const input = "w-full bg-white border border-[#5D0F17]/15 px-3 py-2.5 text-sm text-[#5D0F17] placeholder-[#5D0F17]/40 outline-none focus:border-[#5D0F17]/50 transition";
const label = "block mb-2 text-[11px] uppercase tracking-[0.16em] text-[#5D0F17]/55";
const payBtn = "w-full bg-[#5D0F17] text-[#FFFDF8] px-6 py-3.5 text-xs uppercase tracking-[0.15em] hover:bg-[#5D0F17]/85 transition disabled:opacity-50";
const appearance = { theme: "flat" as const, variables: { colorPrimary: "#5D0F17", colorText: "#5D0F17", colorBackground: "#ffffff", fontFamily: "ui-sans-serif, system-ui, sans-serif", borderRadius: "2px", fontSizeBase: "14px" } };

export default function CheckoutPage() {
 return (
 <Suspense fallback={<main className="min-h-screen bg-[#FFFDF8]" />}>
 <CheckoutInner />
 </Suspense>
 );
}

function CheckoutInner() {
 const sp = useSearchParams();
 const itemId = sp.get("item") || "";
 const isCart = sp.get("cart") === "1";
 const [info, setInfo] = useState<Info | null>(null);
 const [loadErr, setLoadErr] = useState<string | null>(null);
 const [email, setEmail] = useState("");
 const [a, setA] = useState({ name: "", line1: "", line2: "", city: "", state: "", zip: "", country: "US", phone: "" });
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState<string | null>(null);
 const [shipCents, setShipCents] = useState<number | null>(null); // flat shipping once the address is known
 const [clientSecret, setClientSecret] = useState<string | null>(null);
 const [stripeP, setStripeP] = useState<Promise<Stripe | null> | null>(null);
 const [payTotal, setPayTotal] = useState(0);
 const preparedKey = useRef<string>("");

 useEffect(() => {
 if (!itemId && !isCart) return;
 let cancelled = false;
 (async () => {
 try {
 const r = await fetch(isCart ? `/api/storefront/cart-checkout-info` : `/api/storefront/checkout-info?item=${itemId}`);
 const d = await r.json();
 if (cancelled) return;
 if (!r.ok) { setLoadErr(d.error || "Couldn’t load this checkout."); return; }
 setInfo(isCart ? d : { items: [d.item], storeName: d.storeName, freeShipping: d.freeShipping, subtotalCents: d.item.priceCents });
 } catch {
 if (!cancelled) setLoadErr("Couldn’t load this checkout.");
 }
 })();
 return () => { cancelled = true; };
 }, [itemId, isCart]);

 const cur = info?.items[0]?.currency || "USD";
 const money = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format((c || 0) / 100);
 const resetPrep = () => { setShipCents(null); setClientSecret(null); setStripeP(null); preparedKey.current = ""; };
 const setF = (k: keyof typeof a, v: string) => { setA((s) => ({ ...s, [k]: v })); resetPrep(); };
 const addrValid = !!(a.line1 && a.city && a.state && a.zip && email.includes("@"));
 const addrKey = `${email}|${a.line1}|${a.line2}|${a.city}|${a.state}|${a.zip}|${a.country}`;

 // Compute flat shipping and, for a cart, create the PaymentIntent so the card mounts inline —
 // all on this one page, no "continue" steps. Reuses the same endpoints the old flow used.
 async function prepare() {
 if (!info) return;
 setBusy(true); setErr(null);
 try {
 let ship = 0;
 if (!info.freeShipping) {
 const toAddress = { name: a.name, street1: a.line1, street2: a.line2, city: a.city, state: a.state, zip: a.zip, country: a.country, phone: a.phone };
 const r = await fetch(isCart ? "/api/storefront/cart-shipping" : "/api/storefront/shipping-rates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(isCart ? { toAddress } : { itemId, toAddress }) });
 const d = await r.json();
 if (!r.ok) { setErr(d.error || "Couldn’t calculate shipping."); setBusy(false); preparedKey.current = ""; return; }
 ship = d.free ? 0 : (d.rates?.[0]?.costCents || 0);
 }
 setShipCents(ship);
 if (isCart) {
 const buyer = { email, name: a.name, phone: a.phone };
 const shipAddr = { line1: a.line1, line2: a.line2, city: a.city, state: a.state, zip: a.zip, country: a.country };
 const r2 = await fetch("/api/storefront/cart-intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ buyer, ship: shipAddr, shippingCostCents: ship }) });
 const d2 = await r2.json();
 if (!r2.ok || !d2.clientSecret) { setErr(d2.error || "Couldn’t start payment."); setBusy(false); preparedKey.current = ""; return; }
 setPayTotal(d2.amountCents);
 setStripeP(loadStripe(d2.publishableKey, { stripeAccount: d2.stripeAccount }));
 setClientSecret(d2.clientSecret);
 }
 } catch { setErr("Couldn’t prepare checkout."); preparedKey.current = ""; }
 setBusy(false);
 }

 // Auto-prepare once the address is complete (debounced) — the card appears on the same page.
 useEffect(() => {
 if (!info || !addrValid || preparedKey.current === addrKey) return;
 const t = setTimeout(() => { preparedKey.current = addrKey; prepare(); }, 600);
 return () => clearTimeout(t);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [info, addrValid, addrKey]);

 // Single item → Stripe-hosted payment (address already collected here).
 async function redirectPay() {
 setBusy(true); setErr(null);
 try {
 const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, buyer: { email, name: a.name, phone: a.phone }, ship: { line1: a.line1, line2: a.line2, city: a.city, state: a.state, zip: a.zip, country: a.country }, shippingCostCents: shipCents || 0 }) });
 const d = await r.json();
 if (!r.ok || !d.url) { setErr(d.error || "Checkout failed."); setBusy(false); return; }
 window.location.href = d.url;
 } catch { setErr("Checkout failed."); setBusy(false); }
 }

 if (loadErr) return <main className="min-h-screen bg-[#FFFDF8] text-[#5D0F17] flex items-center justify-center"><p className="text-sm text-[#5D0F17]/60">{loadErr}</p></main>;
 if (!info) return <main className="min-h-screen bg-[#FFFDF8] text-[#5D0F17] flex items-center justify-center"><p className="text-sm text-[#5D0F17]/50">Loading…</p></main>;

 const shownShip = info.freeShipping ? 0 : shipCents;
 const total = isCart && clientSecret ? payTotal : info.subtotalCents + (shownShip || 0);

 return (
 <main className="min-h-screen bg-[#FFFDF8] text-[#5D0F17]">
 <header className="border-b border-[#5D0F17]/10">
 <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
 <span className="font-serif text-lg">VYA</span>
 <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-[#5D0F17]/50"><Lock /> Secure checkout</span>
 </div>
 </header>

 <div className="mx-auto max-w-5xl px-6 py-10 grid gap-10 lg:grid-cols-[1fr_380px]">
 {/* LEFT — one continuous form */}
 <div className="order-2 lg:order-1">
 <h1 className="font-serif text-2xl mb-1">Checkout</h1>
 <p className="text-xs text-[#5D0F17]/50 mb-8">from {info.storeName}</p>

 <section className="mb-8">
 <span className={label}>Contact</span>
 <input className={input} value={email} onChange={(e) => { setEmail(e.target.value); resetPrep(); }} placeholder="Email (for your receipt)" inputMode="email" />
 </section>

 <section className="mb-8">
 <span className={label}>Shipping address</span>
 <div className="space-y-2">
 <input className={input} value={a.name} onChange={(e) => setF("name", e.target.value)} placeholder="Full name" />
 <input className={input} value={a.line1} onChange={(e) => setF("line1", e.target.value)} placeholder="Street address" />
 <input className={input} value={a.line2} onChange={(e) => setF("line2", e.target.value)} placeholder="Apt, suite (optional)" />
 <div className="grid grid-cols-3 gap-2">
 <input className={input} value={a.city} onChange={(e) => setF("city", e.target.value)} placeholder="City" />
 <input className={input} value={a.state} onChange={(e) => setF("state", e.target.value)} placeholder="State" />
 <input className={input} value={a.zip} onChange={(e) => setF("zip", e.target.value)} placeholder="ZIP" />
 </div>
 <input className={input} value={a.phone} onChange={(e) => setF("phone", e.target.value)} placeholder="Phone (optional)" inputMode="tel" />
 </div>
 </section>

 <section>
 <span className={label}>Payment</span>
 {!addrValid ? (
 <div className="border border-dashed border-[#5D0F17]/20 bg-white/40 px-4 py-6 text-center text-[13px] text-[#5D0F17]/50">Enter your shipping address above to continue to payment.</div>
 ) : isCart ? (
 clientSecret && stripeP ? (
 <Elements stripe={stripeP} options={{ clientSecret, appearance }}>
 <PayForm total={total} money={money} />
 </Elements>
 ) : (
 <div className="border border-[#5D0F17]/12 bg-white px-4 py-6 text-center text-[13px] text-[#5D0F17]/50">{err ? "" : "Preparing secure payment…"}</div>
 )
 ) : (
 <button onClick={redirectPay} disabled={busy || shipCents === null} className={payBtn}>{busy ? "…" : `Pay ${money(total)} →`}</button>
 )}
 {err && <p className="mt-3 text-xs text-red-700">{err}</p>}
 <p className="mt-4 flex items-center gap-1.5 text-[11px] text-[#5D0F17]/40"><Lock /> Payments are processed securely by Stripe — VYA never sees your card details.</p>
 </section>
 </div>

 {/* RIGHT — sticky order summary */}
 <aside className="order-1 lg:order-2">
 <div className="lg:sticky lg:top-8 border border-[#5D0F17]/12 bg-white">
 <div className="divide-y divide-[#5D0F17]/10">
 {info.items.map((it) => (
 <div key={it.id} className="flex gap-3 items-center p-4">
 <div className="h-16 w-16 shrink-0 overflow-hidden bg-[#efe6d7]">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 {it.image && <img src={it.image} alt="" className="h-full w-full object-cover" />}
 </div>
 <div className="min-w-0 flex-1"><p className="text-sm leading-snug">{it.title}</p></div>
 <p className="text-sm font-medium whitespace-nowrap">{money(it.priceCents)}</p>
 </div>
 ))}
 </div>
 <div className="border-t border-[#5D0F17]/10 p-4 space-y-1.5 text-sm">
 <div className="flex justify-between"><span className="text-[#5D0F17]/60">Subtotal</span><span>{money(info.subtotalCents)}</span></div>
 <div className="flex justify-between"><span className="text-[#5D0F17]/60">Shipping</span><span>{info.freeShipping ? "Free" : shownShip === null ? <span className="text-[#5D0F17]/40">Calculated at address</span> : money(shownShip)}</span></div>
 <div className="flex justify-between border-t border-[#5D0F17]/10 pt-2 mt-1 text-base font-semibold"><span>Total</span><span>{money(total)}</span></div>
 </div>
 </div>
 </aside>
 </div>
 </main>
 );
}

function Lock() {
 return (
 <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
 <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
 </svg>
 );
}

// The embedded payment form: Apple Pay / Google Pay / card + billing via Stripe's Payment Element.
function PayForm({ total, money }: { total: number; money: (c: number) => string }) {
 const stripe = useStripe();
 const elements = useElements();
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState<string | null>(null);

 async function submit(e: React.FormEvent) {
 e.preventDefault();
 if (!stripe || !elements) return;
 setBusy(true); setErr(null);
 const { error } = await stripe.confirmPayment({ elements, confirmParams: { return_url: `${window.location.origin}/checkout/success` } });
 if (error) { setErr(error.message || "Payment failed."); setBusy(false); }
 }

 return (
 <form onSubmit={submit}>
 <PaymentElement options={{ layout: "tabs" }} />
 <button type="submit" disabled={!stripe || busy} className="mt-4 w-full bg-[#5D0F17] text-[#FFFDF8] px-6 py-3.5 text-xs uppercase tracking-[0.15em] hover:bg-[#5D0F17]/85 transition disabled:opacity-50">{busy ? "Processing…" : `Pay ${money(total)} →`}</button>
 {err && <p className="mt-3 text-xs text-red-700">{err}</p>}
 </form>
 );
}
