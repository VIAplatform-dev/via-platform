"use client";

import { useEffect, useState } from "react";
import { AdminPage, AdminHeader, TechCard, TechEmpty, TechButton, StatusPill, TH, TD } from "../ui";
import { ShoppingCart } from "lucide-react";

type Attempt = {
 id: number;
 email: string;
 name: string | null;
 itemId: string;
 itemTitle: string | null;
 itemImage: string | null;
 status: "pending" | "emailed" | "recovered";
 createdAt: string;
 emailedAt: string | null;
};

function ago(iso: string): string {
 const t = new Date(iso).getTime();
 if (!t) return "";
 const s = Math.max(0, Math.round((Date.now() - t) / 1000));
 if (s < 60) return "just now";
 const m = Math.round(s / 60);
 if (m < 60) return `${m}m ago`;
 const h = Math.round(m / 60);
 if (h < 24) return `${h}h ago`;
 const d = Math.round(h / 24);
 return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

const STATUS: Record<Attempt["status"], { tone: "pending" | "neutral" | "live"; label: string }> = {
 pending: { tone: "pending", label: "Not contacted" },
 emailed: { tone: "neutral", label: "Reminder sent" },
 recovered: { tone: "live", label: "Recovered" },
};

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
 return (
 <TechCard className="p-4">
 <div className={`text-[26px] font-semibold tabular-nums ${tone || "text-stone-900"}`}>{value}</div>
 <div className="mt-0.5 text-[12px] text-stone-500">{label}</div>
 </TechCard>
 );
}

export default function RecoveryPage() {
 const [attempts, setAttempts] = useState<Attempt[]>([]);
 const [summary, setSummary] = useState({ pending: 0, emailed: 0, recovered: 0 });
 const [loading, setLoading] = useState(true);
 const [sending, setSending] = useState<number | null>(null);
 const [err, setErr] = useState<string | null>(null);

 async function load() {
 const r = await fetch("/api/store/abandoned-carts").then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (r) { setAttempts(r.attempts || []); setSummary(r.summary || { pending: 0, emailed: 0, recovered: 0 }); }
 setLoading(false);
 }
 useEffect(() => { (async () => { await load(); })(); }, []);

 async function remind(id: number) {
 setSending(id); setErr(null);
 const r = await fetch("/api/store/abandoned-carts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).then((x) => x.json()).catch(() => null);
 setSending(null);
 if (r?.ok) load();
 else setErr(r?.error || "Couldn’t send the reminder.");
 }

 if (loading) return <div className="flex items-center justify-center py-32 text-sm text-stone-400">Loading…</div>;

 return (
 <AdminPage>
 <AdminHeader
 eyebrow="Audience · Recovery"
 title="Cart recovery"
 subtitle="Shoppers who started checkout but didn’t finish. One-of-one pieces sell fast — a quick nudge can bring them back."
 />

 {!attempts.length ? (
 <TechEmpty
 icon={<ShoppingCart size={26} strokeWidth={1.5} />}
 title="No abandoned checkouts yet"
 body="When a shopper enters their email at checkout but doesn’t complete, they’ll show up here so you can follow up."
 />
 ) : (
 <>
 <div className="mb-4 grid grid-cols-3 gap-3">
 <Stat label="Not contacted" value={summary.pending} tone="text-amber-600" />
 <Stat label="Reminder sent" value={summary.emailed} />
 <Stat label="Recovered" value={summary.recovered} tone="text-emerald-600" />
 </div>

 {err && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{err}</div>}

 <TechCard className="overflow-hidden p-0">
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead><tr><TH className="pl-4">Item</TH><TH>Shopper</TH><TH>Started</TH><TH>Status</TH><TH right className="pr-4">Action</TH></tr></thead>
 <tbody>
 {attempts.map((a) => {
 const st = STATUS[a.status];
 return (
 <tr key={a.id}>
 <TD className="pl-4">
 <div className="flex items-center gap-2.5">
 <span className="h-9 w-9 shrink-0 rounded bg-stone-100 bg-cover bg-center ring-1 ring-black/5" style={a.itemImage ? { backgroundImage: `url("${a.itemImage.replace(/"/g, "%22")}")` } : undefined} />
 <span className="block max-w-[220px] truncate font-medium text-stone-800">{a.itemTitle || "Item"}</span>
 </div>
 </TD>
 <TD>
 <span className="block font-medium text-stone-800">{a.name || "—"}</span>
 <a href={`mailto:${a.email}`} className="block text-[12px] text-stone-400 hover:text-stone-600 hover:underline">{a.email}</a>
 </TD>
 <TD><span className="text-stone-500">{ago(a.createdAt)}</span></TD>
 <TD><StatusPill tone={st.tone} dot>{st.label}</StatusPill></TD>
 <TD right className="pr-4">
 {a.status === "recovered" ? (
 <span className="text-[12px] text-emerald-600">Purchased ✓</span>
 ) : (
 <TechButton variant="secondary" onClick={() => remind(a.id)} disabled={sending === a.id}>
 {sending === a.id ? "Sending…" : a.status === "emailed" ? "Remind again" : "Send reminder"}
 </TechButton>
 )}
 </TD>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 </TechCard>
 <p className="mt-3 text-[12px] text-stone-400">Only shoppers who entered their email at checkout appear here. Reminders send from your store’s email — set it up in Settings → Email. The automated version runs on your Marketing → Automations “abandoned cart” toggle.</p>
 </>
 )}
 </AdminPage>
 );
}
