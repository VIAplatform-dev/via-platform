"use client";

import { useEffect, useState } from "react";
import { CreditCard, Landmark, ShieldCheck } from "lucide-react";
import { Card, PageHeader, Badge, Button } from "../ui";
import EmbeddedPayments from "./EmbeddedPayments";

type Status = {
 configured: boolean;
 connected: boolean;
 chargesEnabled: boolean;
 payoutsEnabled: boolean;
 detailsSubmitted: boolean;
 /** How long Stripe holds a payout — the store's return window plus the return's journey back. */
 payoutDelayDays?: number | "minimum";
 returnWindowDays?: number;
 /** Set only when their policy promises buyers longer than Stripe will hold the money. */
 payoutNotice?: string | null;
};

export default function PaymentsPage() {
 const [loading, setLoading] = useState(true);
 const [authErr, setAuthErr] = useState<string | null>(null);
 const [s, setS] = useState<Status | null>(null);
 // Which embedded surface (if any) is open — onboarding replaces the Stripe redirect; manage
 // replaces the Stripe-hosted Express dashboard. Both render inside getvya.ai.
 const [embed, setEmbed] = useState<null | "onboarding" | "manage">(null);
 // Extra checkout methods the store offers (card + wallets are always on, not shown here).
 const [methods, setMethods] = useState<{ cashapp: boolean; affirm: boolean; klarna: boolean } | null>(null);

 async function load() {
 try {
 const r = await fetch("/api/store/payments");
 if (!r.ok) {
 setAuthErr(r.status === 401 ? "Sign in as your store to set up payments." : "Couldn’t load payment status.");
 setLoading(false);
 return;
 }
 setS(await r.json());
 const m = await fetch("/api/store/payments/methods").then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (m?.settings) setMethods(m.settings);
 } catch {
 setAuthErr("Couldn’t load payment status.");
 }
 setLoading(false);
 }

 async function toggle(k: "cashapp" | "affirm" | "klarna") {
 if (!methods) return;
 const next = { ...methods, [k]: !methods[k] };
 setMethods(next); // optimistic
 await fetch("/api/store/payments/methods", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => {});
 }
 useEffect(() => {
 (async () => { await load(); })();
 }, []);

 // When the seller finishes embedded onboarding, refresh status (charges/payouts may now be on).
 function onOnboardingComplete() {
 setEmbed(null);
 load();
 }

 const active = s?.chargesEnabled && s?.payoutsEnabled;

 if (loading) return <div className="flex items-center justify-center py-32 text-sm text-stone-400">Loading…</div>;
 if (authErr) return <div className="flex items-center justify-center py-32 text-sm text-stone-500">{authErr}</div>;

 return (
 <div className="mx-auto max-w-2xl px-6 py-10 sm:px-8">
 <PageHeader title="Payments" subtitle="Accept payments on your storefront and settle to your own bank. You’re the merchant of record — VYA just powers the checkout." />

 {!s?.configured ? (
 <Card className="p-6 text-sm text-stone-500">Payments aren’t enabled on the server yet.</Card>
 ) : (
 <Card className="p-6">
 <div className="flex items-start gap-4">
 <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#5D0F17]/[0.07] text-[#5D0F17]"><CreditCard size={18} /></span>
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2.5">
 <h3 className="text-[15px] font-semibold text-stone-900">{active ? "Payments active" : s?.connected ? "Finish setting up payments" : "Connect payments"}</h3>
 <Badge tone={active ? "success" : "warning"} dot>{active ? "Active" : s?.connected ? "Action needed" : "Not connected"}</Badge>
 </div>
 <p className="mt-1.5 text-[13px] leading-relaxed text-stone-500">
 {active
 ? "You can accept payments and receive payouts to your bank."
 : s?.connected
 ? "Stripe still needs a few details before you can accept payments."
 : "Set up payments with Stripe — takes a couple of minutes. You’ll add your bank and a few business details."}
 </p>

 {active && (
 <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-[13px] text-stone-600">
 <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} className="text-emerald-600" /> Charges enabled</span>
 <span className="inline-flex items-center gap-1.5"><Landmark size={14} className="text-emerald-600" /> Payouts enabled</span>
 </div>
 )}

 {/* Why the money waits. Sellers notice a delayed first payout and assume something is wrong, so
     say plainly that it tracks their own returns policy and where to change it. */}
 {s?.connected && s.payoutDelayDays !== undefined && (
 <p className="mt-3 text-[12px] leading-relaxed text-stone-500">
 {s.payoutDelayDays === "minimum"
 ? "Your sales are final, so payouts reach your bank as fast as Stripe allows."
 : `Payouts reach your bank ${s.payoutDelayDays} days after a sale — your ${s.returnWindowDays}-day return window, plus time for a return to arrive. Until then the money sits in your Stripe balance, so a refund never comes out of your bank account.`}
 {" "}Change it in your <a className="underline underline-offset-2 hover:text-stone-700" href="/store/settings?tab=policy">returns policy</a>.
 </p>
 )}

 {s?.payoutNotice && (
 <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">{s.payoutNotice}</p>
 )}

 <div className="mt-5">
 {active ? (
 <Button variant="secondary" onClick={() => setEmbed((e) => (e === "manage" ? null : "manage"))}>{embed === "manage" ? "Hide payouts" : "Manage payouts"}</Button>
 ) : (
 <Button onClick={() => setEmbed("onboarding")} disabled={embed === "onboarding"}>{s?.connected ? "Finish setup" : "Set up payments"}</Button>
 )}
 </div>
 </div>
 </div>

 {/* Embedded Connect surfaces — rendered right here inside getvya.ai, no redirect to Stripe. */}
 {embed && (
 <div className="mt-6 border-t border-stone-100 pt-6">
 <EmbeddedPayments mode={embed} onComplete={embed === "onboarding" ? onOnboardingComplete : undefined} />
 </div>
 )}
 </Card>
 )}

 {/* Which methods buyers see at checkout. Card + wallets always on; the rest are opt-in. */}
 {s?.configured && active && methods && (
 <Card className="mt-4 p-6">
 <h3 className="text-[15px] font-semibold text-stone-900">Checkout payment methods</h3>
 <p className="mt-1.5 text-[13px] leading-relaxed text-stone-500">Turn on the extras you want buyers to see at checkout. Everything else stays clean and card-first.</p>
 <div className="mt-4 space-y-2">
 <MethodRow label="Card · Apple Pay · Google Pay · Link" desc="Always on — wallets show automatically on supported devices." locked />
 <MethodRow label="Cash App Pay" desc="Pay from a Cash App balance — popular with younger US buyers." on={methods.cashapp} onToggle={() => toggle("cashapp")} />
 <MethodRow label="Affirm — buy now, pay later" desc="Buyer pays over time; you’re still paid in full up front." on={methods.affirm} onToggle={() => toggle("affirm")} />
 <MethodRow label="Klarna — buy now, pay later" desc="Pay in 4 or financing, at no cost to you." on={methods.klarna} onToggle={() => toggle("klarna")} />
 </div>
 <p className="mt-3 text-[11px] text-stone-400">Each extra must also be activated on your Stripe account. If one isn’t, checkout quietly falls back to card.</p>
 </Card>
 )}

 <p className="mt-4 text-xs text-stone-400">Payments are processed securely by Stripe.</p>
 </div>
 );
}

// A method row with a toggle (or an "always on" lock for card + wallets).
function MethodRow({ label, desc, on, onToggle, locked }: { label: string; desc: string; on?: boolean; onToggle?: () => void; locked?: boolean }) {
 return (
 <div className="flex items-center justify-between gap-4 rounded-lg border border-stone-200 bg-white px-3.5 py-3">
 <div className="min-w-0">
 <p className="text-[13px] font-medium text-stone-800">{label}</p>
 <p className="mt-0.5 text-[12px] leading-snug text-stone-500">{desc}</p>
 </div>
 {locked ? (
 <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Always on</span>
 ) : (
 <button type="button" onClick={onToggle} aria-pressed={!!on} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-stone-300"}`}>
 <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
 </button>
 )}
 </div>
 );
}
