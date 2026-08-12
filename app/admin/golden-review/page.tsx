"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Build the golden answer key by AI-assisted labeling. Existing data has no real labels (brands are
// store names), so a human confirms/corrects the AI's proposal on diverse real photos. Each saved row
// keeps BOTH the verified label and the AI's guess — so it's an answer key AND a live accuracy read.

type Cand = { productId: number; storeSlug: string; storeName: string | null; title: string; image: string; priceCents: number | null };
type Fields = { brand: string; era: string; material: string; condition: string; category: string };
const EMPTY: Fields = { brand: "", era: "", material: "", condition: "", category: "" };
const FIELD_KEYS: (keyof Fields)[] = ["brand", "era", "material", "condition", "category"];

export default function GoldenLabelPage() {
 const [queue, setQueue] = useState<Cand[]>([]);
 const [idx, setIdx] = useState(0);
 const [fields, setFields] = useState<Fields>(EMPTY);
 const [ai, setAi] = useState<Fields>(EMPTY);
 const [drafting, setDrafting] = useState(false);
 const [saving, setSaving] = useState(false);
 const [golden, setGolden] = useState(0);
 const [loading, setLoading] = useState(true);
 const [done, setDone] = useState(0); // labeled this session
 const draftReq = useRef(0);

 const cur = queue[idx] || null;

 const draftFor = useCallback(async (c: Cand) => {
  const req = ++draftReq.current;
  setFields(EMPTY); setAi(EMPTY); setDrafting(true);
  const r = await fetch("/api/admin/golden-set", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: c.image }) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (req !== draftReq.current) return; // a newer item superseded this draft
  const p = r?.proposed || {};
  const f: Fields = { brand: p.brand || "", era: p.era || "", material: p.material || "", condition: p.condition || "", category: p.category || "" };
  setFields(f); setAi(f); setDrafting(false);
 }, []);

 const loadQueue = useCallback((first: boolean) => {
  fetch("/api/admin/golden-set?label=1&limit=20").then((x) => (x.ok ? x.json() : null)).then((r) => {
   const q: Cand[] = r?.candidates || [];
   setQueue(q); setIdx(0); if (first) setGolden(r?.stats?.total ?? 0); setLoading(false);
   if (q[0]) draftFor(q[0]);
  }).catch(() => setLoading(false));
 }, [draftFor]);

 useEffect(() => { loadQueue(true); }, [loadQueue]);

 function advance() {
  const ni = idx + 1;
  if (ni >= queue.length) { setLoading(true); loadQueue(false); return; }
  setIdx(ni); draftFor(queue[ni]);
 }

 async function save() {
  if (!cur) return;
  setSaving(true);
  const r = await fetch("/api/admin/golden-set", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
   saveGolden: {
    productId: cur.productId, storeSlug: cur.storeSlug, image: cur.image, title: cur.title, priceCents: cur.priceCents,
    brand: fields.brand || null, era: fields.era || null, material: fields.material || null, condition: fields.condition || null, category: fields.category || null,
    ai: { brand: ai.brand || null, era: ai.era || null, material: ai.material || null, condition: ai.condition || null, category: ai.category || null },
   },
  }) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  setSaving(false);
  if (r) { setGolden(r.stats?.total ?? golden + 1); setDone((d) => d + 1); }
  advance();
 }

 async function clearSeeded() {
  if (!window.confirm("Remove the auto-seeded rows (store-name brands, no real labels) from the golden set? Hand-labeled rows are kept.")) return;
  const r = await fetch("/api/admin/golden-set", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clearSeeded: true }) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (r) setGolden(r.stats?.total ?? golden);
 }

 const set = (k: keyof Fields, v: string) => setFields((f) => ({ ...f, [k]: v }));
 const money = (c: number | null) => (c == null ? "—" : `$${Math.round(c / 100).toLocaleString()}`);
 const edited = (k: keyof Fields) => fields[k].trim() !== ai[k].trim();

 return (
  <main className="min-h-screen bg-stone-50 p-6" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
   <div className="mx-auto max-w-4xl">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
     <div>
      <h1 className="text-lg font-semibold text-stone-900">Golden set — label an item</h1>
      <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-stone-500">
       The AI proposes labels from the photo — confirm what&apos;s right, fix what&apos;s wrong, save. Each becomes verified ground truth the accuracy exam grades against. <b className="text-stone-700">{golden}</b> golden · <b className="text-stone-700">{done}</b> this session.
      </p>
     </div>
     <button onClick={clearSeeded} className="rounded-lg border border-stone-300 px-3 py-1.5 text-[12px] text-stone-600 transition hover:bg-white">Clear auto-seeded rows</button>
    </div>

    {loading ? (
     <p className="py-20 text-center text-sm text-stone-400">Loading photos…</p>
    ) : !cur ? (
     <div className="rounded-xl border border-stone-200 bg-white p-12 text-center text-[13px] text-stone-500">No more items to label right now.</div>
    ) : (
     <div className="grid gap-5 md:grid-cols-2">
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
       {/* eslint-disable-next-line @next/next/no-img-element */}
       <img src={cur.image} alt={cur.title} className="aspect-square w-full bg-stone-100 object-cover" />
       <div className="p-3">
        <p className="line-clamp-2 text-[13px] font-medium text-stone-800">{cur.title}</p>
        <p className="mt-1 text-[12px] text-stone-400">{cur.storeName || cur.storeSlug} · {money(cur.priceCents)}</p>
       </div>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-5">
       {drafting ? (
        <p className="py-8 text-center text-[13px] text-stone-400">AI is reading the photo…</p>
       ) : (
        <div className="space-y-3">
         {FIELD_KEYS.map((k) => (
          <div key={k}>
           <div className="mb-1 flex items-center justify-between">
            <label className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{k}</label>
            {edited(k) ? <span className="text-[10px] font-medium text-amber-600">edited</span> : ai[k] ? <span className="text-[10px] text-emerald-600">AI ✓</span> : <span className="text-[10px] text-stone-300">AI: blank</span>}
           </div>
           <input value={fields[k]} onChange={(e) => set(k, e.target.value)} placeholder={k === "brand" ? "real brand (not the store name)" : "—"} className="w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none focus:border-stone-500" />
          </div>
         ))}
         <div className="flex items-center gap-2 pt-2">
          <button onClick={save} disabled={saving} className="flex-1 rounded-lg bg-stone-900 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50">{saving ? "Saving…" : "Save as golden →"}</button>
          <button onClick={advance} disabled={saving} className="rounded-lg border border-stone-300 px-4 py-2.5 text-[13px] text-stone-600 transition hover:bg-stone-50 disabled:opacity-50">Skip</button>
         </div>
         <p className="pt-1 text-center text-[11px] text-stone-400">Leave a field blank if the AI can&apos;t tell and you can&apos;t either — blank never counts against the model.</p>
        </div>
       )}
      </div>
     </div>
    )}
   </div>
  </main>
 );
}
