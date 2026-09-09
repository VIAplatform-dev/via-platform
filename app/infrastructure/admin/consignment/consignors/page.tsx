"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, ArrowLeft } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, TechEmpty, StatusPill, SectionLabel, TH, TD } from "../../ui";

type Consignor = { id: number; name: string; email: string | null; phone: string | null; defaultSplitPct: number | null; payoutMethod: string | null; status: string; balanceCents: number; stripeAccountId: string | null; portalToken: string | null };

const label = "block text-[11px] font-medium uppercase tracking-wide text-stone-500 mb-1";
const input = "w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none focus:border-stone-400";
const money = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export default function ConsignorsPage() {
 const [rows, setRows] = useState<Consignor[]>([]);
 const [loading, setLoading] = useState(true);
 const [form, setForm] = useState({ name: "", email: "", phone: "", defaultSplitPct: "" });
 const [saving, setSaving] = useState(false);
 const [err, setErr] = useState<string | null>(null);
 const [copiedId, setCopiedId] = useState<number | null>(null);

 // Migrate from another consignment platform (ConsignCloud/SimpleConsign/etc.) — paste or upload
 // their consignor export; balances come over as a stated opening figure, never a replay of sales.
 const [imp, setImp] = useState({ csv: "", source: "" });
 const [importing, setImporting] = useState(false);
 const [impResult, setImpResult] = useState<{ found: number; added: number; updated: number; balancesSet: number; openingBalanceCents: number } | null>(null);
 const [impErr, setImpErr] = useState<string | null>(null);

 function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
 const file = e.target.files?.[0];
 if (!file) return;
 const src = imp.source || file.name.replace(/\.[a-z]+$/i, "");
 file.text().then((t) => setImp({ csv: t, source: src }));
 }

 async function runImport() {
 if (!imp.csv.trim()) { setImpErr("Paste or upload your consignor export first."); return; }
 setImporting(true); setImpErr(null); setImpResult(null);
 const r = await fetch("/api/store/consignment/import", {
 method: "POST", headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ csv: imp.csv, source: imp.source || "csv" }),
 });
 const d = await r.json().catch(() => null);
 setImporting(false);
 if (!r.ok || !d?.ok) { setImpErr(d?.error || "Couldn’t import that file."); return; }
 setImpResult({ found: d.found, added: d.added, updated: d.updated, balancesSet: d.balancesSet, openingBalanceCents: d.openingBalanceCents });
 setImp({ csv: "", source: "" });
 reload();
 }

 // Consignors connect their own bank in the consignor portal (Stripe Express, /api/consignor/connect) —
 // the store never touches bank details. This copies the portal link so the store can nudge someone
 // who hasn't set up direct deposit yet.
 function copySetupLink(id: number) {
 const url = `${window.location.origin}/consignor`;
 navigator.clipboard?.writeText(url).then(() => { setCopiedId(id); setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500); }).catch(() => {});
 }

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
 <Link href="/admin/consignment" className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-stone-500 hover:text-stone-800"><ArrowLeft size={13} /> Consignment</Link>
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

 <TechCard id="import" className="mt-4 scroll-mt-6 p-4">
 <SectionLabel className="mb-1">Switching from another consignment tool?</SectionLabel>
 <p className="mb-3 text-[12px] text-stone-500">Move your consignor book over from <strong>ConsignCloud, SimpleConsign, Ricochet</strong>, or a spreadsheet — export your consignors there and drop the CSV here. (This is just your consignor list + balances, not your store or products.) We map the columns automatically. Balances come over as a stated opening figure — we never replay old sales, so nothing gets double-counted or double-paid.</p>
 <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
 <div>
 <label className={label}>Upload CSV</label>
 <input type="file" accept=".csv,.tsv,text/csv,text/plain" onChange={onImportFile} className="w-full text-[12px] text-stone-600 file:mr-3 file:rounded-lg file:border file:border-stone-200 file:bg-stone-50 file:px-3 file:py-1.5 file:text-[12px] file:text-stone-700 hover:file:bg-stone-100" />
 </div>
 <div><label className={label}>From (platform)</label><input className={input} value={imp.source} onChange={(e) => setImp({ ...imp, source: e.target.value })} placeholder="e.g. ConsignCloud" /></div>
 <div className="flex items-end"><TechButton type="button" onClick={runImport} disabled={importing || !imp.csv.trim()}>{importing ? "Importing…" : "Import consignors"}</TechButton></div>
 </div>
 <div className="mt-3">
 <label className={label}>…or paste the CSV</label>
 <textarea className={`${input} font-mono text-[11px]`} rows={imp.csv ? 4 : 2} value={imp.csv} onChange={(e) => setImp({ ...imp, csv: e.target.value })} placeholder="Name,Email,Split %,Balance Owed&#10;Jane Doe,jane@example.com,60,124.50" />
 </div>
 {impErr && <p className="mt-2 text-[12px] text-rose-600">{impErr}</p>}
 {impResult && (
 <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">
 Imported {impResult.found} row{impResult.found === 1 ? "" : "s"}: {impResult.added} added, {impResult.updated} updated
 {impResult.balancesSet > 0 && <> · {impResult.balancesSet} opening balance{impResult.balancesSet === 1 ? "" : "s"} set ({money(impResult.openingBalanceCents)})</>}.
 </div>
 )}
 <p className="mt-2 text-[11px] text-stone-400">Re-running is safe: consignors are matched by email then name, and each opening balance is written only once.</p>
 </TechCard>

 {loading ? (
 <div className="mt-6 flex items-center justify-center rounded-2xl border border-stone-200 bg-white py-16 text-[13px] text-stone-400">Loading…</div>
 ) : rows.length === 0 ? (
 <TechEmpty
 className="mt-6"
 icon={<Users size={28} strokeWidth={1.5} />}
 title="No consignors yet"
 body="Add your first consignor above to start tracking what they’re owed."
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
 <TH className="px-4">Direct deposit</TH>
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
 {c.stripeAccountId ? (
 <StatusPill tone="live" dot>Ready</StatusPill>
 ) : (
 <button type="button" onClick={() => copySetupLink(c.id)} className="inline-flex items-center gap-1.5" title="Copy the consignor portal link so they can connect their bank">
 <StatusPill tone="neutral">Not set up</StatusPill>
 <span className="text-[11px] text-stone-400 underline">{copiedId === c.id ? "Copied!" : "Copy setup link"}</span>
 </button>
 )}
 </TD>
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
