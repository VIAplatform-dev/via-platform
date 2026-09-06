"use client";

import { useEffect, useState } from "react";
import { AdminPage, AdminHeader, TechCard, TechButton, StatusPill, SegmentedControl } from "../ui";
import { Check } from "lucide-react";

type Price = { amount: number; currency: string } | null;
type TierCard = {
 id: string; name: string; tagline: string; order: number; priced: boolean;
 price: { month: Price; year: Price }; features: string[];
};
type Billing = {
 configured: boolean; trialDays: number; annualDiscountPct: number;
 current: { tier: string | null; interval: string | null; status: string | null; plan: string; currentPeriodEnd: string | null };
 tiers: TierCard[];
};

const DEAD = ["canceled", "unpaid", "incomplete_expired", "incomplete"];

function money(cents: number, currency: string) {
 return new Intl.NumberFormat("en-US", {
  style: "currency", currency: (currency || "usd").toUpperCase(),
  maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
 }).format(cents / 100);
}

export default function BillingPage() {
 const [d, setD] = useState<Billing | null>(null);
 const [interval, setIntervalState] = useState<"month" | "year">("month");
 const [busy, setBusy] = useState("");
 const [notice, setNotice] = useState("");

 useEffect(() => {
 (async () => {
 const r = await fetch("/api/store/billing").then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (r) setD(r);
 const q = new URLSearchParams(window.location.search).get("sub");
 if (q === "success") setNotice("You're on your free trial — welcome to VYA. No charge for 30 days.");
 else if (q === "cancelled") setNotice("Checkout cancelled — you weren't charged.");
 if (q) window.history.replaceState({}, "", window.location.pathname);
 })();
 }, []);

 async function start(tier: string) {
 setBusy(tier); setNotice("");
 const r = await fetch("/api/store/billing/checkout", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ tier, interval }),
 });
 const j = await r.json().catch(() => ({}));
 setBusy("");
 if (j.url) window.location.href = j.url;
 else setNotice(j.error || "Couldn't start checkout — try again.");
 }

 async function manage() {
 setBusy("portal"); setNotice("");
 const r = await fetch("/api/store/billing/portal", { method: "POST" });
 const j = await r.json().catch(() => ({}));
 setBusy("");
 if (j.url) window.location.href = j.url;
 else setNotice(j.error || "Couldn't open billing.");
 }

 const cur = d?.current;
 const entitled = !!(cur?.tier && !DEAD.includes(cur.status || ""));
 const curName = d?.tiers.find((t) => t.id === cur?.tier)?.name;
 const tiers = (d?.tiers ?? []).slice().sort((a, b) => a.order - b.order);

 return (
 <AdminPage className="max-w-5xl">
 <AdminHeader
 eyebrow="Business · Billing"
 title="Plans & billing"
 subtitle="Your VYA subscription. Free for 30 days, and you can cancel at any time."
 actions={entitled ? <TechButton variant="secondary" onClick={manage} disabled={busy === "portal"}>Manage subscription</TechButton> : undefined}
 />

 {notice && <div className="mb-4 rounded-lg bg-[var(--accent-soft,#eafaf3)] px-4 py-2.5 text-[13px] font-medium text-[var(--accent-ink,#0b7a5c)]">{notice}</div>}

 {entitled && (
 <div className="mb-5 flex flex-wrap items-center gap-2.5 rounded-xl border border-stone-200/70 bg-white px-4 py-3">
 <StatusPill tone="live" dot>{cur?.status === "trialing" ? "Free trial" : "Active"}</StatusPill>
 <span className="text-[13.5px] text-stone-700">You're on <b className="font-semibold">{curName}</b>{cur?.interval ? `, billed ${cur.interval === "year" ? "annually" : "monthly"}` : ""}.</span>
 {cur?.currentPeriodEnd && <span className="text-[12px] text-stone-400">Renews {new Date(cur.currentPeriodEnd).toLocaleDateString()}</span>}
 </div>
 )}

 {/* Monthly / Annual toggle */}
 <div className="mb-5 flex items-center gap-3">
 <SegmentedControl
 options={["Monthly", "Annual"]}
 value={interval === "year" ? "Annual" : "Monthly"}
 onChange={(v) => setIntervalState(v === "Annual" ? "year" : "month")}
 />
 {interval === "year" && d && (
 <span className="rounded-full bg-[var(--accent-soft,#eafaf3)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--accent-ink,#0b7a5c)]">Save {d.annualDiscountPct}%</span>
 )}
 </div>

 {/* Tier cards */}
 <div className="grid gap-4 md:grid-cols-3">
 {tiers.map((t) => {
 const p = interval === "year" ? t.price.year : t.price.month;
 const isCurrent = entitled && cur?.tier === t.id;
 const featured = t.order === 2;
 return (
 <TechCard key={t.id} className={`flex flex-col p-5 ${featured ? "ring-1 ring-[var(--accent,#0e9f76)]" : ""}`}>
 <div className="flex items-center gap-2">
 <p className="text-[15px] font-semibold text-stone-900">{t.name}</p>
 {featured && <span className="rounded-full bg-stone-900 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-white">Popular</span>}
 </div>
 <p className="mt-1 text-[12.5px] text-stone-500">{t.tagline}</p>

 <div className="mt-4 flex items-baseline gap-1.5">
 {p ? (
 <>
 <span className="text-[30px] font-semibold tracking-tight text-stone-900" style={{ fontVariantNumeric: "tabular-nums" }}>{money(p.amount, p.currency)}</span>
 <span className="text-[13px] text-stone-400">/{interval === "year" ? "yr" : "mo"}</span>
 </>
 ) : (
 <span className="text-[15px] font-medium text-stone-400">{t.priced ? "—" : "Price set in Stripe"}</span>
 )}
 </div>
 {p && interval === "year" && <p className="mt-0.5 text-[11.5px] text-stone-400">≈ {money(Math.round(p.amount / 12), p.currency)}/mo, billed annually</p>}

 <div className="mt-4 flex-1 space-y-2">
 {t.features.map((f) => (
 <div key={f} className="flex items-start gap-2 text-[12.5px] text-stone-600">
 <Check size={14} className="mt-0.5 shrink-0 text-[var(--accent,#0e9f76)]" /> <span>{f}</span>
 </div>
 ))}
 </div>

 <div className="mt-5">
 {isCurrent ? (
 <div className="flex items-center justify-center gap-1.5 rounded-lg bg-stone-100 py-2.5 text-[12.5px] font-medium text-stone-500"><Check size={14} /> Current plan</div>
 ) : (
 <TechButton onClick={() => start(t.id)} disabled={busy === t.id || !p} className="w-full justify-center">
 {busy === t.id ? "Starting…" : !p ? "Not priced yet" : "Start 30-day free trial"}
 </TechButton>
 )}
 </div>
 </TechCard>
 );
 })}
 </div>

 {d && !d.configured && (
 <div className="mt-5 rounded-xl border border-amber-200/70 bg-amber-50/60 px-4 py-3 text-[12.5px] leading-relaxed text-amber-800">
 <b>Prices aren't set yet.</b> Create the Products + Prices in Stripe (a monthly and an annual per tier), then set the <code className="font-mono text-[11.5px]">STRIPE_PRICE_&lt;TIER&gt;_MONTHLY</code> / <code className="font-mono text-[11.5px]">…_ANNUAL</code> env vars. The trial, tiers, and gating already work — this page fills in the live numbers automatically.
 </div>
 )}

 <p className="mt-4 text-[12px] leading-relaxed text-stone-400">Billing covers your VYA operating system (getvya.ai). Every plan includes the full 30-day trial; you can switch or cancel anytime from Manage subscription.</p>
 </AdminPage>
 );
}
