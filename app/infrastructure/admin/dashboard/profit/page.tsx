"use client";

// Profit & loss, as a spreadsheet.
//
// The Analytics tab shows one column for one period, which answers "how did this quarter go" and
// nothing else. A shop keeps books to see the shape of a year — which months carry it, when costs
// jumped, whether last March beat this one — and that is a grid, which is why every seller already
// has one in Excel. This is that grid, over VYA's own records plus whatever she brings across from
// the spreadsheet she was keeping before.

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Upload, Trash2, AlertTriangle } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, cn } from "../../ui";

type GridRow = { key: string; label: string; direction: "in" | "out" | "net"; cells: number[]; total: number };
type Grid = { months: string[]; monthLabels: string[]; rows: GridRow[]; overlapMonths: string[] };
type Batch = { batchId: string; fileName: string | null; rows: number; inCents: number; outCents: number; from: string; to: string; createdAt: string };
type Preview = {
 summary: { count: number; inCents: number; outCents: number; from: string | null; to: string | null };
 dayFirst: boolean; headers: string[];
 sample: { date: string; label: string; amountCents: number; direction: "in" | "out" }[];
 skipped: { line: number; reason: string; raw: string }[]; skippedTotal: number;
};

const money = (c: number) =>
 `${c < 0 ? "−" : ""}$${Math.abs(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function withStore(path: string): string {
 if (typeof window === "undefined") return path;
 const s = new URLSearchParams(window.location.search).get("store");
 return s ? `${path}${path.includes("?") ? "&" : "?"}store=${encodeURIComponent(s)}` : path;
}

export default function ProfitPage() {
 const [grid, setGrid] = useState<Grid | null>(null);
 const [batches, setBatches] = useState<Batch[]>([]);
 const [loading, setLoading] = useState(true);
 const [preview, setPreview] = useState<Preview | null>(null);
 const [pending, setPending] = useState<{ csv: string; fileName: string } | null>(null);
 const [err, setErr] = useState<string | null>(null);
 const [busy, setBusy] = useState(false);
 const fileRef = useRef<HTMLInputElement>(null);

 const load = useCallback(async () => {
  const d = await fetch(withStore("/api/store/analytics/pnl")).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (d?.ok) { setGrid(d.grid); setBatches(d.batches || []); }
  setLoading(false);
 }, []);
 useEffect(() => { void load(); }, [load]);

 async function readFile(f: File) {
  setErr(null);
  const csv = await f.text();
  setPending({ csv, fileName: f.name });
  await send(csv, f.name, false);
 }

 async function send(csv: string, fileName: string, commit: boolean, dayFirst?: boolean) {
  setBusy(true);
  const r = await fetch(withStore("/api/store/analytics/pnl"), {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ csv, fileName, commit, ...(dayFirst === undefined ? {} : { dayFirst }) }),
  });
  const d = await r.json().catch(() => null);
  setBusy(false);
  if (!r.ok || !d?.ok) { setErr(d?.error || "We couldn’t read that file."); setPreview(null); return; }
  if (d.committed) { setPreview(null); setPending(null); void load(); return; }
  setPreview(d as Preview);
 }

 async function removeBatch(batchId: string) {
  if (!window.confirm("Take this upload back out? The rows it added stop counting.")) return;
  await fetch(withStore("/api/store/analytics/pnl"), {
   method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId }),
  }).catch(() => {});
  void load();
 }

 const empty = !grid || grid.months.length === 0;

 return (
  <AdminPage>
   <AdminHeader
    eyebrow="Business · Analytics"
    title="Profit & loss"
    subtitle="Every month side by side, the way your spreadsheet has it. Bring your old sheet across and it sits alongside what VYA records."
    actions={
     <span className="flex gap-2">
      <TechButton variant="ghost" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import a sheet</TechButton>
      <a href={withStore("/api/store/analytics/pnl?format=csv")} className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-[12.5px] font-medium text-stone-600 transition hover:border-black/25">
       <Download size={14} /> Export
      </a>
     </span>
    }
   />
   <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden"
    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void readFile(f); }} />

   {err && <TechCard className="mb-4 border-rose-200 bg-rose-50/60 p-4 text-[13px] text-rose-800">{err}</TechCard>}

   {/* What we read, before any of it counts. An import that writes first and explains later is one
       she can't trust with her own books. */}
   {preview && pending && (
    <TechCard className="mb-4 p-5">
     <p className="text-[13px] font-semibold text-stone-800">Ready to bring across</p>
     <p className="mt-1 text-[12.5px] text-stone-500">
      {preview.summary.count} rows from <span className="font-medium text-stone-700">{pending.fileName}</span>
      {preview.summary.from ? <> · {preview.summary.from} to {preview.summary.to}</> : null}
      {" · "}{money(preview.summary.inCents)} in, {money(preview.summary.outCents)} out
     </p>
     <label className="mt-2 flex items-center gap-2 text-[12px] text-stone-500">
      <input type="checkbox" checked={preview.dayFirst} onChange={(e) => void send(pending.csv, pending.fileName, false, e.target.checked)} className="accent-[#5D0F17]" />
      Dates are day first (14/03 = 14 March)
     </label>

     {preview.sample.length > 0 && (
      <div className="mt-3 overflow-hidden rounded-lg border border-stone-200">
       <table className="w-full text-[12.5px]">
        <tbody className="divide-y divide-stone-100">
         {preview.sample.map((r, i) => (
          <tr key={i}>
           <td className="px-3 py-1.5 text-stone-500 tabular-nums">{r.date}</td>
           <td className="px-3 py-1.5 text-stone-700">{r.label}</td>
           <td className={cn("px-3 py-1.5 text-right tabular-nums", r.direction === "in" ? "text-emerald-700" : "text-stone-600")}>
            {r.direction === "in" ? "" : "−"}{money(r.amountCents)}
           </td>
          </tr>
         ))}
        </tbody>
       </table>
      </div>
     )}

     {preview.skippedTotal > 0 && (
      <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900 ring-1 ring-amber-200">
       <p className="font-medium">{preview.skippedTotal} {preview.skippedTotal === 1 ? "row" : "rows"} we couldn&rsquo;t read — they won&rsquo;t be brought across.</p>
       <ul className="mt-1 space-y-0.5">
        {preview.skipped.slice(0, 4).map((s) => (
         <li key={s.line} className="truncate">Line {s.line}: {s.reason} — <span className="font-mono opacity-70">{s.raw.slice(0, 60)}</span></li>
        ))}
       </ul>
      </div>
     )}

     <div className="mt-3 flex gap-2">
      <TechButton disabled={busy} onClick={() => void send(pending.csv, pending.fileName, true, preview.dayFirst)}>{busy ? "Bringing it across…" : "Bring it across"}</TechButton>
      <TechButton variant="ghost" onClick={() => { setPreview(null); setPending(null); }}>Cancel</TechButton>
     </div>
    </TechCard>
   )}

   {grid && grid.overlapMonths.length > 0 && (
    <TechCard className="mb-4 flex items-start gap-2.5 border-amber-200 bg-amber-50/70 p-4 text-[12.5px] text-amber-900">
     <AlertTriangle size={15} className="mt-0.5 shrink-0" />
     <span>
      {grid.overlapMonths.join(", ")} {grid.overlapMonths.length === 1 ? "holds" : "hold"} both your imported rows and VYA&rsquo;s own —
      those months are counted twice. Take the upload back out below, or trim those months from your sheet and import it again.
     </span>
    </TechCard>
   )}

   {loading ? (
    <TechCard className="px-5 py-10 text-center text-[13px] text-stone-400">Loading…</TechCard>
   ) : empty ? (
    <TechCard className="px-5 py-12 text-center">
     <p className="text-[13.5px] font-medium text-stone-700">Nothing to add up yet</p>
     <p className="mx-auto mt-1.5 max-w-[52ch] text-[12.5px] leading-relaxed text-stone-500">
      Sales you make on VYA appear here on their own. If you kept a spreadsheet before, bring it across
      and the months you already traded show up alongside them.
     </p>
     <span className="mt-3 inline-block"><TechButton onClick={() => fileRef.current?.click()}><Upload size={14} /> Import a sheet</TechButton></span>
    </TechCard>
   ) : (
    <TechCard className="overflow-hidden">
     {/* Wide by nature — a year is twelve columns — so the grid scrolls inside its own card and the
         first column stays put, the way a spreadsheet freezes panes. */}
     <div className="overflow-x-auto">
      <table className="w-full min-w-max text-[13px] tabular-nums">
       <thead>
        <tr className="border-b border-stone-200">
         <th className="sticky left-0 z-10 bg-white px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-[0.13em] text-stone-400">Line</th>
         {grid.monthLabels.map((m, i) => (
          <th key={grid.months[i]} className="px-4 py-2.5 text-right font-mono text-[10px] uppercase tracking-[0.13em] text-stone-400">{m}</th>
         ))}
         <th className="px-4 py-2.5 text-right font-mono text-[10px] uppercase tracking-[0.13em] text-stone-500">Total</th>
        </tr>
       </thead>
       <tbody>
        {grid.rows.map((r) => {
         const isNet = r.direction === "net";
         return (
          <tr key={r.key} className={cn(isNet ? "border-t-2 border-stone-900" : "border-b border-stone-100")}>
           <td className={cn("sticky left-0 z-10 bg-white px-4 py-2.5 text-left", isNet ? "font-semibold text-stone-900" : "text-stone-700")}>{r.label}</td>
           {r.cells.map((c, i) => (
            <td key={i} className={cn("px-4 py-2.5 text-right", isNet ? "font-semibold" : c === 0 ? "text-stone-300" : c < 0 ? "text-stone-500" : "text-stone-800",
             isNet && c < 0 && "text-rose-700")}>
             {c === 0 ? "—" : money(c)}
            </td>
           ))}
           <td className={cn("px-4 py-2.5 text-right", isNet ? "font-semibold" : "font-medium text-stone-700", isNet && r.total < 0 && "text-rose-700")}>
            {money(r.total)}
           </td>
          </tr>
         );
        })}
       </tbody>
      </table>
     </div>
    </TechCard>
   )}

   {batches.length > 0 && (
    <TechCard className="mt-4 overflow-hidden">
     <div className="border-b border-stone-100 px-5 py-3">
      <h2 className="text-[13px] font-semibold text-stone-800">Sheets you&rsquo;ve brought across</h2>
      <p className="mt-0.5 text-[12px] text-stone-500">Each one can be taken back out whole — the rows it added stop counting.</p>
     </div>
     <div className="divide-y divide-stone-100">
      {batches.map((b) => (
       <div key={b.batchId} className="flex flex-wrap items-center gap-3 px-5 py-3">
        <div className="min-w-0 flex-1">
         <p className="truncate text-[13px] font-medium text-stone-800">{b.fileName || "Imported sheet"}</p>
         <p className="mt-0.5 text-[12px] text-stone-500 tabular-nums">
          {b.rows} rows · {b.from} to {b.to} · {money(b.inCents)} in, {money(b.outCents)} out
         </p>
        </div>
        <button type="button" onClick={() => void removeBatch(b.batchId)} className="shrink-0 text-stone-400 transition hover:text-rose-600" aria-label="Remove this upload">
         <Trash2 size={14} />
        </button>
       </div>
      ))}
     </div>
    </TechCard>
   )}
  </AdminPage>
 );
}
