"use client";

import { useCallback, useEffect, useState } from "react";

// Internal tool: spot-check the intake exam's answer key. The accuracy number is only as honest as
// these labels, so a human confirms the labels match the photos and removes any that are wrong.
type Row = {
 id: number; source: string; imageUrls: string[];
 brand: string | null; era: string | null; material: string | null;
 condition: string | null; category: string | null; priceCents: number | null; title: string | null;
};

export default function GoldenReviewPage() {
 const [rows, setRows] = useState<Row[]>([]);
 const [count, setCount] = useState(0);
 const [loading, setLoading] = useState(true);
 const [busy, setBusy] = useState<number | null>(null);
 const [seeding, setSeeding] = useState(false);
 const [msg, setMsg] = useState("");

 const load = useCallback(async () => {
  const r = await fetch("/api/admin/golden-set?review=1&limit=60").then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (r) { setRows(r.rows || []); setCount(r.stats?.total ?? (r.rows?.length || 0)); }
  setLoading(false);
 }, []);
 useEffect(() => {
  let alive = true;
  fetch("/api/admin/golden-set?review=1&limit=60")
   .then((x) => (x.ok ? x.json() : null))
   .then((r) => {
    if (!alive) return;
    if (r) { setRows(r.rows || []); setCount(r.stats?.total ?? (r.rows?.length || 0)); }
    setLoading(false);
   })
   .catch(() => { if (alive) setLoading(false); });
  return () => { alive = false; };
 }, []);

 async function remove(id: number) {
  setBusy(id);
  const r = await fetch("/api/admin/golden-set", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id], on: false }) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  setBusy(null);
  if (r) { setRows((prev) => prev.filter((x) => x.id !== id)); setCount(r.goldenCount ?? Math.max(0, count - 1)); }
 }
 async function seed() {
  setSeeding(true); setMsg("");
  const r = await fetch("/api/admin/golden-set", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seed: true, limit: 150 }) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  setSeeding(false);
  if (r?.ok) { setMsg(`Seeded ${r.seeded} → ${r.goldenCount} golden`); await load(); } else setMsg("Seed failed.");
 }

 const money = (c: number | null) => (c == null ? "—" : `$${Math.round(c / 100).toLocaleString()}`);
 const Label = ({ k, v }: { k: string; v: string | null }) => (
  <div className="flex justify-between gap-2 text-[12px] leading-5">
   <span className="text-stone-400">{k}</span>
   <span className="text-right font-medium text-stone-800">{v ? v : <span className="text-stone-300">—</span>}</span>
  </div>
 );

 return (
  <main className="min-h-screen bg-stone-50 p-6" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
   <div className="mx-auto max-w-6xl">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
     <div>
      <h1 className="text-lg font-semibold text-stone-900">Golden set review</h1>
      <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-stone-500">
       The intake exam&apos;s answer key. The accuracy number is only as honest as these labels — spot-check each against its photo and remove any that are wrong. <b className="text-stone-700">{count}</b> golden rows.
      </p>
     </div>
     <div className="flex items-center gap-2">
      {msg && <span className="text-[12px] text-emerald-700">{msg}</span>}
      <button onClick={seed} disabled={seeding} className="rounded-lg bg-stone-900 px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-stone-800 disabled:opacity-50">{seeding ? "Seeding…" : "Seed from most-trusted"}</button>
      <button onClick={() => { setLoading(true); load(); }} className="rounded-lg border border-stone-300 px-3 py-1.5 text-[13px] text-stone-700 transition hover:bg-white">Refresh</button>
     </div>
    </div>

    {loading ? (
     <p className="py-16 text-center text-sm text-stone-400">Loading…</p>
    ) : rows.length === 0 ? (
     <div className="rounded-xl border border-stone-200 bg-white p-12 text-center text-[13px] text-stone-500">
      No golden rows yet. Click <b>Seed from most-trusted</b> to build the answer key, then spot-check it here.
     </div>
    ) : (
     <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {rows.map((row) => (
       <div key={row.id} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={row.imageUrls[0] || ""} alt={row.brand || "item"} className="h-44 w-full bg-stone-100 object-cover" loading="lazy" />
        <div className="space-y-0.5 p-3">
         <Label k="Brand" v={row.brand} />
         <Label k="Era" v={row.era} />
         <Label k="Material" v={row.material} />
         <Label k="Condition" v={row.condition} />
         <Label k="Category" v={row.category} />
         <Label k="Price" v={money(row.priceCents)} />
         <div className="mt-2 flex items-center justify-between border-t border-stone-100 pt-2">
          <span className="text-[10px] uppercase tracking-wide text-stone-400">{row.source}</span>
          <button onClick={() => remove(row.id)} disabled={busy === row.id} className="text-[12px] font-medium text-rose-600 transition hover:text-rose-700 disabled:opacity-50">{busy === row.id ? "Removing…" : "Wrong — remove"}</button>
         </div>
        </div>
       </div>
      ))}
     </div>
    )}
   </div>
  </main>
 );
}
