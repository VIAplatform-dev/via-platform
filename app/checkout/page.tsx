"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, AddressElement, useStripe, useElements } from "@stripe/react-stripe-js";

type LineItem = { id: string; title: string; priceCents: number; currency: string; image: string | null };
type Info = { items: LineItem[]; storeName: string; freeShipping: boolean; subtotalCents: number; publishableKey?: string };
type Addr = { name: string; line1: string; line2: string; city: string; state: string; zip: string; country: string; phone: string };

const input = "w-full bg-white border border-black/30 px-3 py-2.5 text-sm text-black placeholder-black/40 outline-none focus:border-black transition rounded";
const label = "block mb-2 text-[11px] uppercase tracking-[0.16em] text-black/55";
// Black & white. The "stripe" theme (not "flat") renders legible payment-method tabs and visible
// field borders out of the box; we only push the input borders darker so every box reads clearly,
// and force the selected tab's label/icon dark so you can always tell what you're on.
const appearance = {
 theme: "stripe" as const,
 variables: {
 colorPrimary: "#111111",
 colorText: "#111111",
 colorTextSecondary: "#555555",
 colorTextPlaceholder: "#9ca3af",
 colorBackground: "#ffffff",
 colorDanger: "#b00020",
 fontFamily: "ui-sans-serif, system-ui, sans-serif",
 borderRadius: "6px",
 fontSizeBase: "14px",
 },
 rules: {
 ".Input": { border: "1px solid rgba(0,0,0,0.28)", boxShadow: "none" },
 ".Input:focus": { border: "1px solid #111111", boxShadow: "none" },
 ".Tab": { border: "1px solid rgba(0,0,0,0.20)", boxShadow: "none" },
 ".Tab--selected, .Tab--selected:focus": { border: "1px solid #111111", boxShadow: "none", color: "#111111" },
 ".TabLabel, .TabLabel--selected": { color: "#111111" },
 },
};

export default function CheckoutPage() {
 return (
 <Suspense fallback={<main className="min-h-screen bg-[#ffffff]" />}>
 <CheckoutInner />
 </Suspense>
 );
}

function CheckoutInner() {
 const sp = useSearchParams();
 const itemId = sp.get("item") || "";
 const offerToken = sp.get("offer") || ""; // accepted binding offer → checkout at the agreed price
 const isCart = sp.get("cart") === "1";
 const [info, setInfo] = useState<Info | null>(null);
 const [loadErr, setLoadErr] = useState<string | null>(null);
 const [email, setEmail] = useState("");
 const [a, setA] = useState({ name: "", line1: "", line2: "", city: "", state: "", zip: "", country: "US", phone: "" });
 const [err, setErr] = useState<string | null>(null);
 const [shipCents, setShipCents] = useState<number | null>(null); // flat shipping once the address is known
 const [clientSecret, setClientSecret] = useState<string | null>(null);
 const [stripeP, setStripeP] = useState<Promise<Stripe | null> | null>(null);
 const [payTotal, setPayTotal] = useState(0);
 // A platform-key Stripe instance JUST for the Address Element (autocomplete) — separate from the
 // connected-account instance the Payment Element uses. Loaded once the publishable key arrives.
 const [addrStripe, setAddrStripe] = useState<Promise<Stripe | null> | null>(null);
 const preparedKey = useRef<string>("");
 const [discountCode, setDiscountCode] = useState("");
 const [discount, setDiscount] = useState<{ code: string; offCents: number; freeShipping: boolean } | null>(null);
 const [dcErr, setDcErr] = useState<string | null>(null);
 const [dcBusy, setDcBusy] = useState(false);

 useEffect(() => {
 if (!itemId && !isCart) return;
 let cancelled = false;
 (async () => {
 try {
 const r = await fetch(isCart ? `/api/storefront/cart-checkout-info` : `/api/storefront/checkout-info?item=${itemId}${offerToken ? `&offer=${offerToken}` : ""}`);
 const d = await r.json();
 if (cancelled) return;
 if (!r.ok) { setLoadErr(d.error || "Couldn’t load this checkout."); return; }
 setInfo(isCart ? d : { items: [d.item], storeName: d.storeName, freeShipping: d.freeShipping, subtotalCents: d.item.priceCents, publishableKey: d.publishableKey });
 } catch {
 if (!cancelled) setLoadErr("Couldn’t load this checkout.");
 }
 })();
 return () => { cancelled = true; };
 }, [itemId, isCart, offerToken]);

 const cur = info?.items[0]?.currency || "USD";
 const money = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format((c || 0) / 100);
 const resetPrep = () => { setShipCents(null); setClientSecret(null); setStripeP(null); preparedKey.current = ""; };
 // Load the Address Element's Stripe instance once the publishable key arrives with checkout info.
 useEffect(() => { if (info?.publishableKey && !addrStripe) setAddrStripe(loadStripe(info.publishableKey)); }, [info, addrStripe]);
 const addrValid = !!(a.line1 && a.city && a.state && a.zip && email.includes("@"));
 const addrKey = `${email}|${a.line1}|${a.line2}|${a.city}|${a.state}|${a.zip}|${a.country}`;
 // Re-prepare the PaymentIntent when the amount could change — address, or (single item) the
 // applied discount / offer — so the embedded card always charges the right total.
 const prepKey = `${addrKey}|${discount ? `${discount.code}:${discount.offCents}:${discount.freeShipping}` : ""}|${offerToken}`;

 // Compute flat shipping and, for a cart, create the PaymentIntent so the card mounts inline —
 // all on this one page, no "continue" steps. Reuses the same endpoints the old flow used.
 async function prepare() {
 if (!info) return;
 setErr(null);
 try {
 let ship = 0;
 if (!info.freeShipping) {
 const toAddress = { name: a.name, street1: a.line1, street2: a.line2, city: a.city, state: a.state, zip: a.zip, country: a.country, phone: a.phone };
 const r = await fetch(isCart ? "/api/storefront/cart-shipping" : "/api/storefront/shipping-rates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(isCart ? { toAddress } : { itemId, toAddress }) });
 const d = await r.json();
 if (!r.ok) { setErr(d.error || "Couldn’t calculate shipping."); preparedKey.current = ""; return; }
 ship = d.free ? 0 : (d.rates?.[0]?.costCents || 0);
 }
 setShipCents(ship);
 // Create the PaymentIntent for BOTH cart and single item, so the card mounts inline either way
 // (single item used to redirect to Stripe-hosted Checkout — now it's embedded like the cart).
 const buyer = { email, name: a.name, phone: a.phone };
 const shipAddr = { line1: a.line1, line2: a.line2, city: a.city, state: a.state, zip: a.zip, country: a.country };
 const r2 = await fetch(isCart ? "/api/storefront/cart-intent" : "/api/storefront/item-intent", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(
 isCart
 ? { buyer, ship: shipAddr, shippingCostCents: ship }
 : { itemId, offer: offerToken || undefined, discountCode: discount ? discountCode.trim() : undefined, buyer, ship: shipAddr, shippingCostCents: ship },
 ),
 });
 const d2 = await r2.json();
 if (!r2.ok || !d2.clientSecret) { setErr(d2.error || "Couldn’t start payment."); preparedKey.current = ""; return; }
 setPayTotal(d2.amountCents);
 setStripeP(loadStripe(d2.publishableKey, { stripeAccount: d2.stripeAccount }));
 setClientSecret(d2.clientSecret);
 } catch { setErr("Couldn’t prepare checkout."); preparedKey.current = ""; }
 }

 // Auto-prepare once the address is complete (debounced) — the card appears on the same page.
 useEffect(() => {
 if (!info || !addrValid || preparedKey.current === prepKey) return;
 setClientSecret(null); setStripeP(null); // drop a stale card while re-preparing (address/discount changed)
 const t = setTimeout(() => { preparedKey.current = prepKey; prepare(); }, 600);
 return () => clearTimeout(t);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [info, addrValid, prepKey]);

 // Validate a discount code for THIS store (server scopes it to the item's seller).
 async function applyDiscount() {
 const code = discountCode.trim();
 if (!code || !info) return;
 setDcBusy(true); setDcErr(null);
 try {
 const r = await fetch("/api/storefront/discount", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, code, subtotalCents: info.subtotalCents }) });
 const d = await r.json();
 if (d.ok) { setDiscount({ code: d.code, offCents: d.offCents, freeShipping: d.freeShipping }); setDcErr(null); }
 else { setDiscount(null); setDcErr(d.error || "That code isn’t valid."); }
 } catch { setDcErr("Couldn’t apply code."); }
 setDcBusy(false);
 }

 if (loadErr) return <main className="min-h-screen bg-[#ffffff] text-[#111111] flex items-center justify-center"><p className="text-sm text-[#111111]/60">{loadErr}</p></main>;
 if (!info) return <main className="min-h-screen bg-[#ffffff] text-[#111111] flex items-center justify-center"><p className="text-sm text-[#111111]/50">Loading…</p></main>;

 const discountOff = !isCart && discount ? discount.offCents : 0;
 const codeFreeShip = !isCart && !!discount?.freeShipping;
 const shownShip = info.freeShipping || codeFreeShip ? 0 : shipCents;
 const total = clientSecret ? payTotal : Math.max(0, info.subtotalCents - discountOff) + (shownShip || 0);

 return (
 <main className="min-h-screen bg-[#ffffff] text-[#111111]">
 <header className="border-b border-[#111111]/10">
 <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
 <span className="font-serif text-lg">VYA</span>
 <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-[#111111]/50"><Lock /> Secure checkout</span>
 </div>
 </header>

 <div className="mx-auto max-w-5xl px-6 py-10 grid gap-10 lg:grid-cols-[1fr_380px]">
 {/* LEFT — one continuous form */}
 <div className="order-2 lg:order-1">
 <h1 className="font-serif text-2xl mb-1">Checkout</h1>
 <p className="text-xs text-[#111111]/50 mb-8">from {info.storeName}</p>

 <section className="mb-8">
 <span className={label}>Contact</span>
 <input className={input} value={email} onChange={(e) => { setEmail(e.target.value); resetPrep(); }} placeholder="Email (for your receipt)" inputMode="email" />
 </section>

 <section className="mb-8">
 <span className={label}>Shipping address</span>
 {addrStripe ? (
 <Elements stripe={addrStripe} options={{ mode: "payment", amount: Math.max(50, info.subtotalCents), currency: cur.toLowerCase(), appearance }}>
 <ShippingAddress onChange={setA} />
 </Elements>
 ) : (
 <div className="border border-[#111111]/12 bg-white px-4 py-6 text-center text-[13px] text-[#111111]/40">Loading address…</div>
 )}
 </section>

 <section>
 <span className={label}>Payment</span>
 {!addrValid ? (
 <div className="border border-dashed border-[#111111]/20 bg-white/40 px-4 py-6 text-center text-[13px] text-[#111111]/50">Enter your shipping address above to continue to payment.</div>
 ) : clientSecret && stripeP ? (
 <Elements stripe={stripeP} options={{ clientSecret, appearance }}>
 <PayForm total={total} money={money} storeName={info.storeName} />
 </Elements>
 ) : (
 <div className="border border-[#111111]/12 bg-white px-4 py-6 text-center text-[13px] text-[#111111]/50">{err ? "" : "Preparing secure payment…"}</div>
 )}
 {err && <p className="mt-3 text-xs text-red-700">{err}</p>}
 <p className="mt-4 flex items-center gap-1.5 text-[11px] text-[#111111]/40"><Lock /> Payments are processed securely by Stripe — VYA never sees your card details.</p>
 </section>
 </div>

 {/* RIGHT — sticky order summary */}
 <aside className="order-1 lg:order-2">
 <div className="lg:sticky lg:top-8 border border-[#111111]/12 bg-white">
 <div className="divide-y divide-[#111111]/10">
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
 <div className="border-t border-[#111111]/10 p-4 space-y-1.5 text-sm">
 {!isCart && (
 <div className="mb-2.5 flex gap-2">
 <input className={input + " flex-1"} value={discountCode} onChange={(e) => { setDiscountCode(e.target.value); setDiscount(null); setDcErr(null); }} placeholder="Discount code" />
 <button onClick={applyDiscount} disabled={dcBusy || !discountCode.trim()} className="shrink-0 border border-[#111111]/25 px-3 text-[11px] uppercase tracking-[0.14em] text-[#111111] transition hover:bg-[#111111]/5 disabled:opacity-40">{dcBusy ? "…" : "Apply"}</button>
 </div>
 )}
 {dcErr && <p className="-mt-1 mb-2 text-[11px] text-red-700">{dcErr}</p>}
 {discount && <p className="-mt-1 mb-2 text-[11px] text-green-700">Code {discount.code} applied.</p>}
 <div className="flex justify-between"><span className="text-[#111111]/60">Subtotal</span><span>{money(info.subtotalCents)}</span></div>
 {!isCart && discount && (discountOff > 0 || discount.freeShipping) && (
 <div className="flex justify-between text-green-700"><span>Discount ({discount.code})</span><span>{discount.freeShipping && discountOff === 0 ? "Free shipping" : `−${money(discountOff)}`}</span></div>
 )}
 <div className="flex justify-between"><span className="text-[#111111]/60">Shipping</span><span>{info.freeShipping || codeFreeShip ? "Free" : shownShip === null ? <span className="text-[#111111]/40">Calculated at address</span> : money(shownShip)}</span></div>
 <div className="flex justify-between border-t border-[#111111]/10 pt-2 mt-1 text-base font-semibold"><span>Total</span><span>{money(total)}</span></div>
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

// Stripe's Address Element — one field with Google-powered autocomplete (free alongside the Payment
// Element, no API key). Collects name + full shipping address + phone; we mirror it into the page's
// address state so the existing shipping-quote + PaymentIntent flow is unchanged.
function ShippingAddress({ onChange }: { onChange: (a: Addr) => void }) {
 return (
 <AddressElement
 options={{ mode: "shipping", fields: { phone: "always" }, autocomplete: { mode: "automatic" } }}
 onChange={(e) => {
 if (!e.complete) return;
 const v = e.value;
 onChange({
 name: v.name || "",
 line1: v.address.line1 || "",
 line2: v.address.line2 || "",
 city: v.address.city || "",
 state: v.address.state || "",
 zip: v.address.postal_code || "",
 country: v.address.country || "US",
 phone: v.phone || "",
 });
 }}
 />
 );
}

// The embedded payment form: Apple Pay / Google Pay / card + billing via Stripe's Payment Element.
function PayForm({ total, money, storeName }: { total: number; money: (c: number) => string; storeName?: string }) {
 const stripe = useStripe();
 const elements = useElements();
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState<string | null>(null);

 async function submit(e: React.FormEvent) {
 e.preventDefault();
 if (!stripe || !elements) return;
 setBusy(true); setErr(null);
 // Carry the store name to the confirmation page so it can say who's shipping.
 const returnUrl = `${window.location.origin}/checkout/success${storeName ? `?store=${encodeURIComponent(storeName)}` : ""}`;
 const { error } = await stripe.confirmPayment({ elements, confirmParams: { return_url: returnUrl } });
 if (error) { setErr(error.message || "Payment failed."); setBusy(false); }
 }

 return (
 <form onSubmit={submit}>
 <PaymentElement options={{ layout: "tabs" }} />
 <button type="submit" disabled={!stripe || busy} className="mt-4 w-full bg-[#111111] text-[#ffffff] px-6 py-3.5 text-xs uppercase tracking-[0.15em] hover:bg-[#111111]/85 transition disabled:opacity-50">{busy ? "Processing…" : `Pay ${money(total)} →`}</button>
 {err && <p className="mt-3 text-xs text-red-700">{err}</p>}
 </form>
 );
}
