"use client";

import { useEffect, useState } from "react";
import { Upload, Store, CreditCard, Sparkles, ArrowUp, type LucideIcon } from "lucide-react";
import { Card, Stat, cn } from "../ui";
import { useStoreBase } from "../nav-base";

type Item = { status: string };
type Order = { amountCents: number };

const BASE_CARDS: { href: string; icon: LucideIcon; title: string; body: string }[] = [
 { href: "/import", icon: Upload, title: "Import your store", body: "Bring everything over from your existing site, products, photos, and branding, in one paste." },
 { href: "/storefront", icon: Store, title: "Set up your storefront", body: "Choose your look, claim your URL, and flip it live." },
 { href: "/payments", icon: CreditCard, title: "Get ready to accept payments", body: "Connect Stripe so sales settle straight to your own bank." },
];

const ASK_SUGGESTIONS = ["Make my storefront more elegant", "Write a description for an item", "How do I get paid?", "Change my accent color"];

export default function StoreHome() {
 const base = useStoreBase();
 const [name, setName] = useState("");
 const [q, setQ] = useState("");
 const [stats, setStats] = useState({ active: 0, sold: 0, orders: 0, revenueCents: 0 });
 // Import is one-time: hide "Import your store" once this store already has a captured
 // site (unless admin, who keeps it for testing).
 const [cap, setCap] = useState({ captured: 0, isAdmin: false });

 function ask(text: string) {
 const t = text.trim();
 if (!t) return;
 window.dispatchEvent(new CustomEvent("vya:ask", { detail: t }));
 setQ("");
 }

 useEffect(() => {
 fetch("/api/store/me").then((r) => (r.ok ? r.json() : null)).then((d) => d && setName(d.storeName || "")).catch(() => {});
 fetch("/api/store/items").then((r) => (r.ok ? r.json() : null)).then((d) => {
 const items: Item[] = d?.items || [];
 setStats((s) => ({ ...s, active: items.filter((i) => i.status === "active").length, sold: items.filter((i) => i.status === "sold").length }));
 }).catch(() => {});
 fetch("/api/store/orders").then((r) => (r.ok ? r.json() : null)).then((d) => {
 const orders: Order[] = d?.orders || [];
 setStats((s) => ({ ...s, orders: orders.length, revenueCents: orders.reduce((a, o) => a + (o.amountCents || 0), 0) }));
 }).catch(() => {});
 fetch("/api/store/capture").then((r) => (r.ok ? r.json() : null)).then((d) => d && setCap({ captured: d.captured || 0, isAdmin: !!d.isAdmin })).catch(() => {});
 }, []);

 // Drop the one-time "Import your store" card once the store has a captured site (admin keeps it).
 const cards = BASE_CARDS.filter((c) => !(c.href === "/import" && cap.captured > 0 && !cap.isAdmin));

 const statCards = [
 { label: "Active listings", value: String(stats.active) },
 { label: "Sold", value: String(stats.sold) },
 { label: "Orders", value: String(stats.orders) },
 { label: "Revenue", value: `$${(stats.revenueCents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
 ];

 return (
 <div className="mx-auto max-w-6xl px-6 py-10 sm:px-8">
 {/* greeting */}
 <div className="pb-6">
 <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-stone-900">Welcome back{name ? `, ${name}` : ""}</h1>
 <p className="mt-1 text-sm text-stone-500">Here&rsquo;s what&rsquo;s happening with your store.</p>
 </div>

 {/* stats */}
 <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
 {statCards.map((s) => <Stat key={s.label} label={s.label} value={s.value} />)}
 </div>

 {/* Ask VYA */}
 <Card className="mb-3 overflow-hidden">
 <form onSubmit={(e) => { e.preventDefault(); ask(q); }}>
 <div className="flex items-center gap-3 px-4 py-3">
 <Sparkles size={18} className="shrink-0 text-[#5D0F17]" />
 <input
 value={q}
 onChange={(e) => setQ(e.target.value)}
 placeholder="Ask VYA anything. “write a description”, “make my store elegant”, “how do I get paid?”"
 className="flex-1 bg-transparent text-[14px] text-stone-900 outline-none placeholder:text-stone-400"
 />
 <button type="submit" disabled={!q.trim()} className="shrink-0 rounded-md bg-[#5D0F17] p-2 text-white transition hover:bg-[#4a0c12] disabled:opacity-40"><ArrowUp size={15} /></button>
 </div>
 </form>
 </Card>
 <div className="mb-9 flex flex-wrap gap-2">
 {ASK_SUGGESTIONS.map((s) => (
 <button key={s} onClick={() => ask(s)} className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 transition hover:border-stone-300 hover:text-stone-900">{s}</button>
 ))}
 </div>

 {/* getting started */}
 <h2 className="mb-3 text-[13px] font-semibold text-stone-900">Set up your store</h2>
 <div className="grid gap-3 sm:grid-cols-2">
 {cards.map((c) => {
 const Icon = c.icon;
 return (
 <a key={c.href} href={base + c.href} className={cn("group rounded-xl border border-stone-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-stone-300 hover:shadow-md")}>
 <div className="mb-2.5 flex items-center gap-2.5">
 <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#5D0F17]/[0.07] text-[#5D0F17]"><Icon size={16} /></span>
 <h3 className="text-[13px] font-semibold text-stone-900">{c.title}</h3>
 </div>
 <p className="text-[13px] leading-relaxed text-stone-500">{c.body}</p>
 </a>
 );
 })}
 </div>
 </div>
 );
}
