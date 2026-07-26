"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, ArrowLeft } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, TechEmpty, StatusPill, SectionLabel, TH, TD } from "../../ui";

type Consignor = { id: number; name: string; email: string | null; phone: string | null; defaultSplitPct: number | null; payoutMethod: string | null; status: string; balanceCents: number };

const label = "block text-[11px] font-medium uppercase tracking-wide text-stone-500 mb-1";
const input = "w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none focus:border-stone-400";
const money = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export default function ConsignorsPage() {
 const [rows, setRows] = useState<Consignor[]>([]);
 const [loading, setLoading] = useState(true);
 const [form, setForm] = useState({ name: "", email: "", phone: "", defaultSplitPct: "" });
 const [saving, setSaving] = useState(false);
 const [err, setErr] = useState<string | null>(null);

 async function reload() {
 const r = await fetch("/api/store/consignment/consignors");
 const d = await r.json().catch(() => null);
 if (r.ok && d) setRows(d.consignors || []);
 }
 useEffect(() => {
 fetch("/api/store/consignment/consignors").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setRows(d.consignors || []); }).catch(() => {}).finally(() => setLoading(false));
 }, []);

 async function add(e: React.FormEvent) {
 e.preventDefault();
 if (!form.name.trim()) { setErr("A name is required."); return; }
 setSaving(true); setErr(null);
 const r = await fetch("/api/store/consignment/consignors", {
 method: "POST", headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ name: form.name.trim(), email: form.email.trim() || null, phone: form.phone.trim() || null, defaultSplitPct: form.defaultSplitPct ? Number(form.defaultSplitPct) : null }),
 });
 const d = await r.json().catch(() => null);
 setSaving(false);
 if (!r.ok) { setErr(d?.error || "Couldn't add the consignor."); return; }
 setForm({ name: "", email: "", phone: "", defaultSplitPct: "" });
 reload();
 }

 async function patchConsignor(id: number, patch: Record<string, unknown>) {
 await fetch("/api/store/consignment/consignors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
 reload();
 }

 async function removeConsignor(id: number, name: string) {
 if (!window.confirm(`Remove ${name}? This deletes their consignment records. To just hide them instead, click their status to deactivate.`)) return;
 await fetch(`/api/store/consignment/consignors?id=${id}`, { method: "DELETE" });
 reload();
 }

 return (
 <AdminPage>
 <Link href="/infrastructure/admin/consignment" className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-stone-500 hover:text-stone-800"><ArrowLeft size={13} /> Consignment</Link>
 <AdminHeader eyebrow="Sell · Consignment · Consignors" title="Consignors" subtitle="Your consignors, their splits, and what they’re owed." />

 <TechCard className="p-4">
 <form onSubmit={add}>
 <SectionLabel className="mb-3">Add a consignor</SectionLabel>
 <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
 <div><label className={label}>Name</label><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" /></div>
 <div><label className={label}>Email</label><input className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="optional" /></div>
 <div><label className={label}>Phone</label><input className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="optional" /></div>
 <div><label className={label}>Default split %</label><input className={input} value={form.defaultSplitPct} onChange={(e) => setForm({ ...form, defaultSplitPct: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder="e.g. 60" /></div>
 </div>
 {err && <p className="mt-2 text-[12px] text-rose-600">{err}</p>}
 <div className="mt-3"><TechButton type="submit" disabled={saving}>{saving ? "Adding…" : "Add consignor"}</TechButton></div>
 <p className="mt-2 text-[11px] text-stone-400">Leave the split blank to use your store rules. Set it here to override for this person.</p>
 </form>
 </TechCard>

 {loading ? (
 <div className="mt-6 flex items-center justify-center rounded-2xl border border-stone-200 bg-white py-16 text-[13px] text-stone-400">Loading…</div>
 ) : rows.length === 0 ? (
 <TechEmpty
 className="mt-6"
 icon={<Users size={28} strokeWidth={1.5} />}
 title="No consignors yet"
 body="Add your first consignor above to start tracking splits and payouts."
 />
 ) : (
 <TechCard className="mt-6 overflow-hidden">
 <div className="overflow-x-auto">
 <table className="w-full text-[13px]">
 <thead>
 <tr>
 <TH className="px-4">Consignor</TH>
 <TH className="px-4">Default split</TH>
 <TH right className="px-4">Balance owed</TH>
 <TH className="px-4">Status</TH>
 </tr>
 </thead>
 <tbody>
 {rows.map((c) => (
 <tr key={c.id} className="transition hover:bg-stone-50/70">
 <TD className="px-4">
 <div className="font-medium text-stone-900">{c.name}</div>
 <div className="text-[12px] text-stone-400">{[c.email, c.phone].filter(Boolean).join(" · ") || "—"}</div>
 </TD>
 <TD className="px-4">
 <input
 defaultValue={c.defaultSplitPct ?? ""}
 onBlur={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); patchConsignor(c.id, { defaultSplitPct: v ? Number(v) : null }); }}
 className="w-16 rounded border border-stone-200 px-2 py-1 text-[13px] tabular-nums outline-none focus:border-stone-400"
 inputMode="numeric" placeholder="store rule" aria-label={`Default split for ${c.name}`}
 />
 {c.defaultSplitPct != null && <span className="ml-1 text-stone-400">%</span>}
 </TD>
 <TD right className="px-4 font-medium text-stone-900">{money(c.balanceCents)}</TD>
 <TD className="px-4">
 <div className="flex items-center gap-3">
 <button type="button" onClick={() => patchConsignor(c.id, { status: c.status === "active" ? "inactive" : "active" })} className="inline-flex" title={`Toggle ${c.name}'s status`}>
 <StatusPill tone={c.status === "active" ? "live" : "neutral"} dot={c.status === "active"}>{c.status}</StatusPill>
 </button>
 <button onClick={() => removeConsignor(c.id, c.name)} className="text-[16px] leading-none text-stone-300 transition hover:text-rose-500" title="Remove consignor" aria-label={`Remove ${c.name}`}>&times;</button>
 </div>
 </TD>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </TechCard>
 )}
 </AdminPage>
 );
}
