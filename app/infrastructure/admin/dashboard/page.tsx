"use client";

import { Fragment, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3 } from "lucide-react";
import type { AnalyticsSuite } from "@/app/lib/analytics/suite";
import { AdminPage, AdminHeader, TechCard, TechEmpty, MetricCard, AreaChart, DonutChart, StatusPill, TechButton, TH, TD, DONUT_COLORS, cn } from "../ui";
import { PeriodPicker, type PeriodValue } from "./PeriodPicker";

// The store analytics suite. Everything on this page comes from one endpoint and
// one resolved period, so every number on screen is measuring the same window —
// including the two comparisons (prior period and year-over-year) that turn a
// figure into a direction.

const money = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const moneyExact = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n % 1 === 0 ? n : n.toFixed(1)}%`);
const num = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());
const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—");
const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

const TABS = [
 { key: "overview", label: "Overview" },
 { key: "sales", label: "Sales" },
 { key: "customers", label: "Customers" },
 { key: "catalog", label: "Pricing & catalog" },
 { key: "products", label: "Products" },
 { key: "traffic", label: "Traffic" },
 { key: "quality", label: "What sells" },
 { key: "margin", label: "Profit & loss" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function CardTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
 return (
  <div className="mb-3">
   <p className="text-[13px] font-medium text-stone-700">{children}</p>
   {hint && <p className="mt-0.5 text-[11px] text-stone-400">{hint}</p>}
  </div>
 );
}

/** A KPI whose delta pill is the prior period and whose sub-line carries year-over-year. */
function Kpi({ label, value, delta, yoy, hint, data }: {
 label: string; value: React.ReactNode; delta?: number | null; yoy?: number | null; hint?: string; data?: number[];
}) {
 const sub = yoy != null ? `${yoy >= 0 ? "+" : ""}${yoy}% vs last year` : hint;
 return (
  <MetricCard
   label={label}
   value={value}
   delta={delta != null ? `${Math.abs(delta)}%` : undefined}
   up={delta == null ? true : delta >= 0}
   sub={delta != null && !sub ? "vs prior period" : sub}
   data={data}
  />
 );
}

function Funnel({ steps }: { steps: { label: string; count: number; ofPreviousPct: number }[] }) {
 const top = Math.max(1, steps[0]?.count ?? 1);
 return (
  <div className="space-y-3">
   {steps.map((s, i) => (
    <div key={s.label}>
     <div className="mb-1 flex items-baseline justify-between text-[12px]">
      <span className="text-stone-600">{s.label}</span>
      <span className="tabular-nums text-stone-500">
       {s.count.toLocaleString()}
       {i > 0 && <span className="ml-1.5 text-stone-400">{s.ofPreviousPct}% of prior</span>}
      </span>
     </div>
     <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
      <div className="h-full rounded-full bg-[var(--accent,#0e9f76)]" style={{ width: `${Math.max(2, (s.count / top) * 100)}%` }} />
     </div>
    </div>
   ))}
  </div>
 );
}

/** A leaderboard of named rows with a proportional bar. */
function Leaderboard({ rows, unit = "money" }: { rows: { name: string; value: number; sub?: string }[]; unit?: "money" | "count" }) {
 if (!rows.length) return <p className="py-4 text-center text-[12px] text-stone-400">Nothing in this period.</p>;
 const max = Math.max(1, ...rows.map((r) => r.value));
 return (
  <div className="space-y-2.5">
   {rows.map((r) => (
    <div key={r.name}>
     <div className="mb-1 flex items-center justify-between text-[13px]">
      <span className="truncate text-stone-700">{r.name}</span>
      <span className="shrink-0 tabular-nums text-stone-900">
       {unit === "money" ? money(r.value) : r.value.toLocaleString()}
       {r.sub && <span className="text-stone-400"> · {r.sub}</span>}
      </span>
     </div>
     <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
      <div className="h-full rounded-full bg-[var(--accent,#0e9f76)]" style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} />
     </div>
    </div>
   ))}
  </div>
 );
}

function ProductTable({ rows, columns }: {
 rows: { itemId: string; title: string; image: string | null; priceCents: number; status: string; views: number; favorites: number; revenueCents: number; daysLive: number | null; daysToSell: number | null }[];
 columns: ("views" | "favorites" | "revenue" | "daysLive" | "daysToSell")[];
}) {
 if (!rows.length) return <p className="py-4 text-center text-[12px] text-stone-400">Nothing to show yet.</p>;
 const head: Record<string, string> = { views: "Views", favorites: "Saves", revenue: "Revenue", daysLive: "Days live", daysToSell: "Days to sell" };
 return (
  <div className="overflow-x-auto">
   <table className="w-full">
    <thead><tr><TH>Item</TH>{columns.map((c) => <TH key={c} right>{head[c]}</TH>)}</tr></thead>
    <tbody>
     {rows.map((r) => (
      <tr key={r.itemId}>
       <TD>
        <div className="flex items-center gap-2.5">
         <span className="h-9 w-9 shrink-0 rounded bg-stone-100 bg-cover bg-center ring-1 ring-black/5" style={r.image ? { backgroundImage: `url("${r.image.replace(/"/g, "%22")}")` } : undefined} />
         <span className="min-w-0">
          <span className="block max-w-[240px] truncate font-medium text-stone-800">{r.title}</span>
          <span className="block text-[11px] text-stone-400">{money(r.priceCents)}{r.status === "sold" ? " · sold" : ""}</span>
         </span>
        </div>
       </TD>
       {columns.map((c) => (
        <TD key={c} right>
         {c === "revenue" ? money(r.revenueCents)
          : c === "daysLive" ? num(r.daysLive)
          : c === "daysToSell" ? (r.daysToSell == null ? "—" : r.daysToSell)
          : num(r[c])}
        </TD>
       ))}
      </tr>
     ))}
    </tbody>
   </table>
  </div>
 );
}

/**
 * The P&L. Reads as a statement rather than a grid, and every operating-cost line
 * — including the empty ones — is the control that fills it. Adding a cost where
 * you noticed it was missing is the whole idea.
 */
function ProfitAndLoss({ margin, period, onAdded }: {
 margin: NonNullable<AnalyticsSuite["margin"]>;
 period: AnalyticsSuite["period"];
 onAdded: () => void;
}) {
 const [openCat, setOpenCat] = useState<string | null>(null);
 const [amount, setAmount] = useState("");
 const [label, setLabel] = useState("");
 const [when, setWhen] = useState("");
 const [saving, setSaving] = useState(false);
 const [err, setErr] = useState<string | null>(null);

 const cur = margin.current;
 const op = margin.operating;

 function openFor(cat: string) {
  setOpenCat((c) => (c === cat ? null : cat));
  setAmount(""); setLabel(""); setWhen(""); setErr(null);
 }

 async function save(category: string) {
  const amountUsd = Number(amount);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) { setErr("Enter an amount above zero."); return; }
  setSaving(true); setErr(null);
  try {
   const r = await fetch("/api/store/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountUsd, label, category, occurredOn: when || null, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
   });
   const d = await r.json();
   if (!r.ok) throw new Error(d.error || "Couldn't save that cost.");
   setOpenCat(null); setAmount(""); setLabel(""); setWhen("");
   onAdded();
  } catch (e) {
   setErr(e instanceof Error ? e.message : "Couldn't save that cost.");
  }
  setSaving(false);
 }

 return (
  <TechCard className="p-5">
   <CardTitle hint={`${period.label} · ${num(cur.totalSales)} ${cur.totalSales === 1 ? "sale" : "sales"}`}>Profit &amp; loss</CardTitle>

   <table className="w-full text-[13.5px] tabular-nums">
    <tbody>
     <tr>
      <td className="border-b border-stone-100 py-2.5 text-stone-700">Revenue</td>
      <td className="border-b border-stone-100 py-2.5 text-right font-medium">{money(cur.revenueCents)}</td>
     </tr>
     <tr>
      <td className="border-b border-stone-100 py-2.5 text-stone-700">Cost of goods</td>
      <td className="border-b border-stone-100 py-2.5 text-right font-medium text-stone-500">−{money(cur.costCents)}</td>
     </tr>
     <tr>
      <td className="border-t border-stone-200 pt-3 font-semibold text-stone-900">Gross profit</td>
      <td className="border-t border-stone-200 pt-3 text-right font-semibold">
       {money(cur.grossProfitCents)} <span className="ml-1 text-[12px] font-normal text-stone-400">{pct(cur.grossMarginPct)}</span>
      </td>
     </tr>

     <tr>
      <td colSpan={2} className="pb-1 pt-6 font-mono text-[10px] uppercase tracking-[0.13em] text-stone-400">Operating costs</td>
     </tr>
     {op.byCategory.map((c) => (
      <Fragment key={c.category}>
       <tr>
        <td className="border-b border-stone-100 py-2.5 pl-4">
         <button
          onClick={() => openFor(c.category)}
          className={cn("rounded-md text-left transition", c.amountCents > 0
           ? "text-stone-500 hover:text-stone-800"
           : "border border-dashed border-[var(--accent,#0e9f76)]/45 bg-[var(--accent-soft,#eafaf3)] px-2 py-0.5 text-[12.5px] text-[var(--accent-ink,#0b7a5c)]")}
         >
          {c.amountCents > 0 ? c.label : `+ ${c.label}`}
         </button>
        </td>
        <td className="border-b border-stone-100 py-2.5 text-right font-medium text-stone-500">
         {c.amountCents > 0 ? <>−{money(c.amountCents)}</> : <span className="font-normal text-stone-300">not tracked</span>}
        </td>
       </tr>
       {openCat === c.category && (
        <tr>
         <td colSpan={2} className="pb-3">
          <div className="ml-4 max-w-sm rounded-xl border border-stone-200 bg-white p-3.5 shadow-sm">
           <p className="mb-2.5 text-[12.5px] font-semibold text-stone-800">Add a {c.label.toLowerCase()} cost</p>
           <div className="space-y-2">
            <input autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Amount, e.g. 84"
             className="w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none placeholder:text-stone-400 focus:border-stone-400" />
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What was it? e.g. poly mailers + tissue"
             className="w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none placeholder:text-stone-400 focus:border-stone-400" />
            <input value={when} onChange={(e) => setWhen(e.target.value)} type="date"
             className="w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px] text-stone-600 outline-none focus:border-stone-400" />
           </div>
           {err && <p className="mt-2 text-[12px] text-rose-600">{err}</p>}
           <div className="mt-3 flex items-center gap-2">
            <TechButton className="px-3 py-1.5 text-[12px]" disabled={saving} onClick={() => save(c.category)}>{saving ? "Adding…" : "Add"}</TechButton>
            <button onClick={() => setOpenCat(null)} className="text-[12px] text-stone-400 hover:text-stone-600">Cancel</button>
            <span className="ml-auto text-[11px] text-stone-400">Leave the date blank for today</span>
           </div>
          </div>
         </td>
        </tr>
       )}
      </Fragment>
     ))}
     <tr>
      <td className="border-t border-stone-200 pt-3 font-semibold text-stone-900">Total operating costs</td>
      <td className="border-t border-stone-200 pt-3 text-right font-semibold text-stone-500">−{money(op.totalCents)}</td>
     </tr>

     <tr>
      <td className="border-t-2 border-stone-900 pt-3.5 text-[15px] font-semibold text-stone-900">Net profit</td>
      <td className="border-t-2 border-stone-900 pt-3.5 text-right text-[15px] font-semibold">
       {margin.netProfitCents == null ? <span className="text-stone-300">—</span> : (
        <span className={margin.netProfitCents < 0 ? "text-rose-600" : undefined}>
         {money(margin.netProfitCents)} <span className="ml-1 text-[12px] font-normal text-stone-400">{pct(margin.netMarginPct)}</span>
        </span>
       )}
      </td>
     </tr>
    </tbody>
   </table>

   <ImportCosts onImported={onAdded} />

   <p className="mt-4 text-[11px] leading-relaxed text-stone-400">
    You can also just tell VYA — &ldquo;spent 84 on poly mailers&rdquo; — and it files the cost for you.
    {cur.coveragePct < 100 && cur.totalSales > 0 && (
     <> Revenue and cost of goods cover the {pct(cur.coveragePct)} of sales with a cost recorded; operating costs are counted in full.</>
    )}
    {/* On a tax-inclusive store the listed price already contains VAT, which is never the seller's
        money. Say what was taken out — and, where no tax was recorded, say that too rather than
        letting a gross figure pass for revenue. */}
    {cur.taxCents > 0 && <> Revenue excludes {moneyExact(cur.taxCents)} of tax collected.</>}
    {cur.salesWithoutTax > 0 && (
     <> {cur.salesWithoutTax} {cur.salesWithoutTax === 1 ? "sale has" : "sales have"} no tax recorded, so {cur.salesWithoutTax === 1 ? "it is" : "they are"} shown as charged &mdash; if your prices include VAT, that much is still in this figure.</>
    )}
   </p>
  </TechCard>
 );
}

type ImportPreview = {
 headers: string[];
 mapping: Partial<Record<"date" | "label" | "amount" | "category", number>>;
 counts: { ready: number; problems: number; skipped: number };
 totalCents: number;
 preview: { row: number; occurredOn: string; label: string; amountCents: number; category: string }[];
 problems: { row: number; reason: string; raw: string }[];
};

const FIELD_LABEL: Record<string, string> = { date: "Date", label: "Description", amount: "Amount", category: "Category" };

/**
 * Bring a costs spreadsheet in.
 *
 * Two steps on purpose: the parser is guessing at somebody else's columns, so it shows what it read
 * and lets her correct the mapping BEFORE anything is written. Rows it couldn't read are listed with
 * the reason and the row number rather than dropped, because a silently short import is worse than
 * an obvious one — she'd never know which costs were missing from her P&L.
 */
function ImportCosts({ onImported }: { onImported: () => void }) {
 const [open, setOpen] = useState(false);
 const [text, setText] = useState<string | null>(null);
 const [fileName, setFileName] = useState("");
 const [preview, setPreview] = useState<ImportPreview | null>(null);
 const [mapping, setMapping] = useState<Record<string, number>>({});
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState<string | null>(null);
 const [done, setDone] = useState<string | null>(null);

 function reset() {
  setText(null); setFileName(""); setPreview(null); setMapping({}); setErr(null); setDone(null);
 }

 async function post(body: Record<string, unknown>) {
  setBusy(true); setErr(null);
  const r = await fetch("/api/store/expenses/import", {
   method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(false);
  if (!r || !r.ok) { setErr(r?.d?.error || "Couldn’t read that file."); return null; }
  return r.d;
 }

 async function pick(file: File) {
  reset();
  setFileName(file.name);
  const raw = await file.text().catch(() => "");
  setText(raw);
  const d = await post({ text: raw, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
  if (d) { setPreview(d as ImportPreview); setMapping((d.mapping || {}) as Record<string, number>); }
 }

 async function remap(field: string, col: number) {
  const next = { ...mapping, [field]: col };
  setMapping(next);
  if (!text) return;
  const d = await post({ text, mapping: next, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
  if (d) setPreview(d as ImportPreview);
 }

 async function commit() {
  if (!text) return;
  const d = await post({ text, mapping, commit: true, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
  if (!d) return;
  setDone(`Imported ${d.imported} cost${d.imported === 1 ? "" : "s"}${d.failedCount ? `, ${d.failedCount} couldn’t be saved` : ""}.`);
  setPreview(null); setText(null);
  onImported();
 }

 if (!open) {
  return (
   <button onClick={() => setOpen(true)} className="mt-4 text-[12px] font-medium text-stone-500 underline underline-offset-2 hover:text-stone-800">
    Import costs from a spreadsheet
   </button>
  );
 }

 return (
  <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50/60 p-4">
   <div className="mb-3 flex items-center justify-between gap-3">
    <p className="text-[13px] font-semibold text-stone-800">Import costs from a spreadsheet</p>
    <button onClick={() => { setOpen(false); reset(); }} className="text-[12px] text-stone-400 hover:text-stone-700">Close</button>
   </div>

   {done ? (
    <div className="flex flex-wrap items-center gap-3">
     <p className="text-[13px] text-emerald-700">{done}</p>
     <button onClick={reset} className="text-[12px] text-stone-500 underline underline-offset-2">Import another</button>
    </div>
   ) : (
    <>
     <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-[12px] font-medium text-stone-700 hover:border-stone-400">
      <input
       type="file"
       accept=".csv,.tsv,.txt,text/csv,text/plain"
       className="hidden"
       onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }}
      />
      {fileName || "Choose a file"}
     </label>
     <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
      A CSV with a date, a description and an amount. In Excel or Numbers: File &rarr; Save As &rarr; CSV.
      Nothing is saved until you press Import.
     </p>

     {busy && <p className="mt-3 text-[12px] text-stone-400">Reading&hellip;</p>}
     {err && <p className="mt-3 text-[12px] text-rose-700">{err}</p>}

     {preview && (
      <div className="mt-4">
       <p className="text-[13px] text-stone-700">
        <span className="font-semibold">{preview.counts.ready}</span> cost{preview.counts.ready === 1 ? "" : "s"} ready
        &nbsp;&middot;&nbsp; {moneyExact(preview.totalCents)} total
        {preview.counts.problems > 0 && <> &middot; <span className="text-rose-700">{preview.counts.problems} couldn&rsquo;t be read</span></>}
        {preview.counts.skipped > 0 && <> &middot; {preview.counts.skipped} total row{preview.counts.skipped === 1 ? "" : "s"} skipped</>}
       </p>

       {/* Column mapping — only worth showing when there's more than one column to choose from. */}
       {preview.headers.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-3">
         {(["date", "label", "amount", "category"] as const).map((f) => (
          <label key={f} className="text-[11px] text-stone-500">
           <span className="mr-1.5">{FIELD_LABEL[f]}</span>
           <select
            value={mapping[f] ?? -1}
            onChange={(e) => remap(f, Number(e.target.value))}
            className="rounded border border-stone-300 bg-white px-1.5 py-1 text-[11px] text-stone-700"
           >
            <option value={-1}>&mdash;</option>
            {preview.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
           </select>
          </label>
         ))}
        </div>
       )}

       {preview.preview.length > 0 && (
        <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-stone-200 bg-white">
         <table className="w-full text-[12px] tabular-nums">
          <tbody>
           {preview.preview.map((e) => (
            <tr key={e.row} className="border-b border-stone-100 last:border-0">
             <td className="px-2.5 py-1.5 text-stone-400">{e.occurredOn}</td>
             <td className="px-2.5 py-1.5 text-stone-700">{e.label}</td>
             <td className="px-2.5 py-1.5 text-stone-400">{e.category}</td>
             <td className="px-2.5 py-1.5 text-right font-medium">{moneyExact(e.amountCents)}</td>
            </tr>
           ))}
          </tbody>
         </table>
        </div>
       )}

       {preview.problems.length > 0 && (
        <div className="mt-3 max-h-32 overflow-auto rounded-lg border border-rose-200 bg-rose-50/50 px-3 py-2">
         {preview.problems.map((p) => (
          <p key={p.row} className="text-[11px] leading-relaxed text-rose-700">Row {p.row}: {p.reason}</p>
         ))}
        </div>
       )}

       <button
        onClick={commit}
        disabled={busy || preview.counts.ready === 0}
        className="mt-3 rounded-md bg-stone-900 px-3.5 py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
       >
        {busy ? "Importing…" : `Import ${preview.counts.ready} cost${preview.counts.ready === 1 ? "" : "s"}`}
       </button>
      </div>
     )}
    </>
   )}
  </div>
 );
}

type Rate = { id: string; label: string; amountCents: number; category: string; recurs: "monthly" | "per_order" };

/**
 * The two setup cards from approach two: what one order costs to pack, and what
 * goes out every month regardless. Filled once, then counted automatically —
 * which is what stops a P&L from becoming a bookkeeping chore.
 */
function RecurringCosts({ margin, onChanged }: { margin: NonNullable<AnalyticsSuite["margin"]>; onChanged: () => void }) {
 const [rates, setRates] = useState<Rate[] | null>(null);
 const [adding, setAdding] = useState<"per_order" | "monthly" | null>(null);
 const [label, setLabel] = useState("");
 const [amount, setAmount] = useState("");
 const [category, setCategory] = useState("packaging");
 const [busy, setBusy] = useState(false);

 const load = () => {
  fetch("/api/store/expenses?period=30d")
   .then((r) => (r.ok ? r.json() : null))
   .then((d) => setRates(d?.recurring ?? []))
   .catch(() => setRates([]));
 };
 useEffect(load, []);

 async function add(recurs: "per_order" | "monthly") {
  const amountUsd = Number(amount);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0 || !label.trim()) return;
  setBusy(true);
  await fetch("/api/store/expenses", {
   method: "POST",
   headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ amountUsd, label, category, recurs, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  }).catch(() => {});
  setBusy(false); setAdding(null); setLabel(""); setAmount("");
  load(); onChanged();
 }

 async function remove(id: string) {
  setRates((rs) => (rs ?? []).filter((r) => r.id !== id));
  await fetch(`/api/store/expenses?id=${id}`, { method: "DELETE" }).catch(() => {});
  onChanged();
 }

 const rec = margin.operating.recurring;
 const perOrder = (rates ?? []).filter((r) => r.recurs === "per_order");
 const monthly = (rates ?? []).filter((r) => r.recurs === "monthly");

 const form = (kind: "per_order" | "monthly") => adding === kind && (
  <div className="mt-2.5 rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
   <div className="flex flex-wrap gap-2">
    <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)}
     placeholder={kind === "per_order" ? "e.g. Poly mailer" : "e.g. Studio rent"}
     className="min-w-[150px] flex-1 rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none placeholder:text-stone-400 focus:border-stone-400" />
    <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
     placeholder={kind === "per_order" ? "0.38" : "850"}
     className="w-24 rounded-lg border border-stone-200 px-3 py-2 text-[13px] tabular-nums outline-none placeholder:text-stone-400 focus:border-stone-400" />
    <select value={category} onChange={(e) => setCategory(e.target.value)}
     className="rounded-lg border border-stone-200 px-2 py-2 text-[12px] text-stone-600 outline-none focus:border-stone-400">
     {margin.operating.byCategory.map((c) => <option key={c.category} value={c.category}>{c.label}</option>)}
    </select>
   </div>
   <div className="mt-2.5 flex items-center gap-2">
    <TechButton className="px-3 py-1.5 text-[12px]" disabled={busy} onClick={() => add(kind)}>{busy ? "Adding…" : "Add"}</TechButton>
    <button onClick={() => setAdding(null)} className="text-[12px] text-stone-400 hover:text-stone-600">Cancel</button>
    <span className="ml-auto text-[11px] text-stone-400">
     {kind === "per_order" ? "Cost of one, not the box" : "The monthly amount"}
    </span>
   </div>
  </div>
 );

 const rows = (list: Rate[], empty: string) => (
  list.length === 0
   ? <p className="py-3 text-[12px] text-stone-400">{empty}</p>
   : <table className="w-full text-[13px] tabular-nums">
      <tbody>
       {list.map((r) => (
        <tr key={r.id}>
         <td className="border-b border-stone-100 py-2 text-stone-700">{r.label}</td>
         <td className="border-b border-stone-100 py-2 text-right text-stone-600">${(r.amountCents / 100).toFixed(2)}</td>
         <td className="w-8 border-b border-stone-100 py-2 text-right">
          <button onClick={() => remove(r.id)} aria-label={`Remove ${r.label}`} className="text-stone-300 transition hover:text-rose-500">×</button>
         </td>
        </tr>
       ))}
      </tbody>
     </table>
 );

 return (
  <div className="grid gap-4 sm:grid-cols-2">
   <TechCard className="p-5">
    <CardTitle hint="counted against every sale in the period">What it costs to pack one order</CardTitle>
    {rows(perOrder, "Nothing yet — add a mailer, tissue, a dust bag.")}
    <div className="mt-2.5 flex items-center justify-between border-t border-stone-200 pt-2.5 text-[13px]">
     <span className="font-semibold text-stone-900">Per order</span>
     <span className="font-semibold tabular-nums">${(rec.perOrder.rateCents / 100).toFixed(2)}</span>
    </div>
    {rec.perOrder.rateCents > 0 && (
     <p className="mt-2 rounded-lg bg-[var(--accent-soft,#eafaf3)] px-3 py-2 text-[12px] text-[var(--accent-ink,#0b7a5c)]">
      × {num(rec.perOrder.sales)} {rec.perOrder.sales === 1 ? "sale" : "sales"} this period → <strong>{money(rec.perOrder.appliedCents)}</strong>
     </p>
    )}
    {!adding && <button onClick={() => { setAdding("per_order"); setCategory("packaging"); }} className="mt-3 text-[12.5px] font-medium text-[var(--accent-ink,#0b7a5c)]">+ Add a supply</button>}
    {form("per_order")}
   </TechCard>

   <TechCard className="p-5">
    <CardTitle hint="charged to each period automatically">Every month, regardless</CardTitle>
    {rows(monthly, "Nothing yet — studio rent, insurance, subscriptions.")}
    <div className="mt-2.5 flex items-center justify-between border-t border-stone-200 pt-2.5 text-[13px]">
     <span className="font-semibold text-stone-900">Per month</span>
     <span className="font-semibold tabular-nums">${(rec.monthly.rateCents / 100).toFixed(2)}</span>
    </div>
    {rec.monthly.rateCents > 0 && (
     <p className="mt-2 rounded-lg bg-[var(--accent-soft,#eafaf3)] px-3 py-2 text-[12px] text-[var(--accent-ink,#0b7a5c)]">
      × {rec.monthly.months} months in this period → <strong>{money(rec.monthly.appliedCents)}</strong>
     </p>
    )}
    {!adding && <button onClick={() => { setAdding("monthly"); setCategory("studio"); }} className="mt-3 text-[12.5px] font-medium text-[var(--accent-ink,#0b7a5c)]">+ Add a monthly cost</button>}
    {form("monthly")}
   </TechCard>
  </div>
 );
}

export default function AnalyticsPage() {
 // useSearchParams needs a boundary; the fallback is the same spinner the fetch uses.
 return (
  <Suspense fallback={<AdminPage><div className="flex items-center justify-center py-32 text-sm text-stone-400">Loading…</div></AdminPage>}>
   <Analytics />
  </Suspense>
 );
}

function Analytics() {
 // Deep-link a tab via ?tab= (the older Audience / Performance pages redirect here).
 const params = useSearchParams();
 const linked = params.get("tab");
 const initialTab: TabKey = TABS.some((x) => x.key === linked) ? (linked as TabKey) : "overview";

 const [period, setPeriod] = useState<PeriodValue>({ period: "30d" });
 const [tab, setTab] = useState<TabKey>(initialTab);
 const [data, setData] = useState<AnalyticsSuite | null>(null);
 const [loading, setLoading] = useState(true);
 // Bumped after a cost is added, so the statement re-reads instead of guessing.
 const [reload, setReload] = useState(0);

 useEffect(() => {
  let active = true;
  (async () => {
   setLoading(true);
   const q = new URLSearchParams({ period: period.period });
   if (period.from) q.set("from", period.from);
   if (period.to) q.set("to", period.to);
   // The store's own clock decides where a day starts, so "best day" is their day.
   q.set("tz", Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
   try {
    const r = await fetch(`/api/store/analytics/suite?${q}`);
    const j = r.ok ? await r.json() : null;
    if (active && j?.ok) setData(j as AnalyticsSuite);
   } catch { /* keep whatever is on screen */ }
   if (active) setLoading(false);
  })();
  return () => { active = false; };
 }, [period, reload]);

 const sales = data?.sales;
 const customers = data?.customers;
 const catalog = data?.catalog;
 const products = data?.products;
 const engagement = data?.engagement;
 const quality = data?.quality;
 const margin = data?.margin;

 const nothing = data && !sales?.current.orders && !catalog?.activeListings && !catalog?.soldAllTime && !engagement?.sessions;

 return (
  <AdminPage>
   <AdminHeader
    eyebrow="Business · Analytics"
    title="Analytics"
    subtitle={data ? `${data.period.label} — sales, profit, customers, demand and what makes a piece sell.` : "Your store's business, end to end."}
    actions={<PeriodPicker value={period} onChange={setPeriod} />}
   />

   {loading && !data ? (
    <div className="flex items-center justify-center py-32 text-sm text-stone-400">Loading…</div>
   ) : data ? (
    <>
     {/* A store with no sales yet gets the WHOLE page at zero, not a blank card where the page
         should be. `nothing` only ever becomes true when `data` has already arrived — it is a store
         whose every figure is 0, not a store we failed to load — so the real layout renders
         perfectly well. Replacing it with one empty state meant a seller's first look at Analytics
         taught her nothing about what she was going to get, on the screen most likely to sell her
         on staying. The tabs, the cards and the charts are all here; they are simply empty. */}
     {nothing && (
      <TechCard className="mb-4 flex items-start gap-3 p-4">
       <BarChart3 size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-stone-400" />
       <div>
        <p className="text-[13px] font-semibold text-stone-900">Nothing to measure yet — here’s what will be</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-stone-500">
         Every figure below is zero until your first listing and your first sale. Nothing needs setting
         up: revenue, profit, repeat customers, where your traffic comes from and which pieces move
         fastest all fill in on their own as you sell. Have a look through the tabs to see what’s coming.
        </p>
       </div>
      </TechCard>
     )}
     <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-stone-400">
      <span>{new Date(data.period.startISO).toLocaleDateString()} – {new Date(data.period.endISO).toLocaleDateString()}</span>
      {data.period.comparisons.prior && <span>· compared with {data.period.comparisons.prior.label.toLowerCase()}</span>}
      {loading && <span className="text-stone-300">· refreshing</span>}
     </div>

     <div className="mb-6 flex gap-1 overflow-x-auto border-b border-stone-200">
      {TABS.map((t) => (
       <button key={t.key} onClick={() => setTab(t.key)} className={cn("relative shrink-0 px-3.5 py-2 text-[13px] font-medium transition", tab === t.key ? "text-stone-900" : "text-stone-400 hover:text-stone-600")}>
        {t.label}
        {tab === t.key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-stone-900" />}
       </button>
      ))}
     </div>

     {/* ── OVERVIEW ── */}
     {tab === "overview" && sales && catalog && engagement && (
      <div className="space-y-6">
       <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Revenue" value={money(sales.current.gmvCents)} delta={sales.vsPrior?.gmvPct} yoy={sales.vsYoy?.gmvPct} data={sales.series.length >= 2 ? sales.series.map((s) => s.cents) : undefined} />
        <Kpi label="Sales" value={num(sales.current.orders)} delta={sales.vsPrior?.ordersPct} yoy={sales.vsYoy?.ordersPct} />
        <Kpi label="Avg. order" value={sales.current.orders ? money(sales.current.aovCents) : "—"} delta={sales.vsPrior?.aovPct} yoy={sales.vsYoy?.aovPct} />
        <Kpi label="Sell-through" value={pct(catalog.sellThroughPct)} delta={catalog.vsPrior?.sellThroughPct} hint="sold ÷ sold + listed" />
       </div>

       <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Avg. item price" value={catalog.activeListings ? money(catalog.avgListedPriceCents) : "—"} hint="what you ask" />
        <Kpi label="Avg. sold price" value={catalog.soldInPeriod ? money(catalog.avgSoldPriceCents) : "—"} hint="what it goes for" />
        <Kpi label="Days to sell" value={catalog.medianDaysToSell == null ? "—" : `${catalog.medianDaysToSell}`} delta={catalog.vsPrior?.daysToSellPct} hint="median" />
        <Kpi label="Inventory value" value={money(catalog.inventoryValueCents)} hint={`${num(catalog.activeListings)} active listings`} />
       </div>

       {sales.undatedSales.count > 0 && (
        <TechCard className="p-4">
         <p className="text-[12px] text-stone-600">
          <StatusPill tone="pending">Heads up</StatusPill>{" "}
          {num(sales.undatedSales.count)} sold {sales.undatedSales.count === 1 ? "piece has" : "pieces have"} no sale date on record ({money(sales.undatedSales.valueCents)} at list price),
          so they count in your catalog totals but can&apos;t appear in any date range. Usually items imported or marked sold in bulk.
         </p>
        </TechCard>
       )}

       {sales.series.length >= 2 && (
        <TechCard className="p-5">
         <CardTitle hint={`by ${sales.granularity}`}>Revenue over time</CardTitle>
         <AreaChart data={sales.series.map((s) => s.cents / 100)} />
         <div className="mt-1.5 flex justify-between text-[10px] text-stone-400"><span>{sales.series[0].bucket}</span><span>{sales.series[sales.series.length - 1].bucket}</span></div>
        </TechCard>
       )}

       <div className="grid gap-4 sm:grid-cols-2">
        <TechCard className="p-5">
         <CardTitle hint="views → saves → checkout → sold">Demand funnel</CardTitle>
         <Funnel steps={engagement.funnel.map((f) => ({ label: f.label, count: f.count, ofPreviousPct: f.ofPreviousPct }))} />
        </TechCard>
        <TechCard className="p-5">
         <CardTitle>Best stretch</CardTitle>
         <div className="space-y-2 text-[13px]">
          <div className="flex justify-between"><span className="text-stone-500">Best day</span><span className="font-medium tabular-nums text-stone-900">{sales.bestDay ? `${longDate(sales.bestDay.day)} · ${money(sales.bestDay.cents)}` : "—"}</span></div>
          <div className="flex justify-between"><span className="text-stone-500">Best week</span><span className="font-medium tabular-nums text-stone-900">{sales.bestWeek ? `${longDate(sales.bestWeek.weekStart)} · ${money(sales.bestWeek.cents)}` : "—"}</span></div>
          <div className="flex justify-between"><span className="text-stone-500">Sessions</span><span className="font-medium tabular-nums text-stone-900">{num(engagement.sessions)}</span></div>
          <div className="flex justify-between"><span className="text-stone-500">Session → sale</span><span className="font-medium tabular-nums text-stone-900">{pct(engagement.rates.sessionToOrderPct)}</span></div>
         </div>
        </TechCard>
       </div>

       <div className="grid gap-4 sm:grid-cols-2">
        <TechCard className="p-5">
         <CardTitle hint="revenue in this period">Top brands</CardTitle>
         <Leaderboard rows={(catalog.topBrands ?? []).map((b) => ({ name: b.name, value: b.revenueCents, sub: `${b.sold} sold` }))} />
        </TechCard>
        <TechCard className="p-5">
         <CardTitle hint="revenue in this period">Top categories</CardTitle>
         <Leaderboard rows={(catalog.topCategories ?? []).map((c) => ({ name: c.name, value: c.revenueCents, sub: `${c.sold} sold` }))} />
        </TechCard>
       </div>
      </div>
     )}

     {/* ── SALES ── */}
     {tab === "sales" && sales && catalog && (
      <div className="space-y-6">
       <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Revenue" value={money(sales.current.gmvCents)} delta={sales.vsPrior?.gmvPct} yoy={sales.vsYoy?.gmvPct} />
        <Kpi label="Sales" value={num(sales.current.orders)} delta={sales.vsPrior?.ordersPct} yoy={sales.vsYoy?.ordersPct} />
        <Kpi label="Avg. order" value={sales.current.orders ? money(sales.current.aovCents) : "—"} delta={sales.vsPrior?.aovPct} yoy={sales.vsYoy?.aovPct} />
        <Kpi label="Items sold" value={num(sales.current.unitsSold)} />
       </div>

       <TechCard className="p-5">
        <CardTitle hint={`prior period and the same period last year, by ${sales.granularity}`}>How this period compares</CardTitle>
        <div className="overflow-x-auto">
         <table className="w-full">
          <thead><tr><TH>Window</TH><TH right>Revenue</TH><TH right>Sales</TH><TH right>Avg. order</TH></tr></thead>
          <tbody>
           <tr><TD><span className="font-medium text-stone-800">{data.period.label}</span></TD><TD right>{money(sales.current.gmvCents)}</TD><TD right>{num(sales.current.orders)}</TD><TD right>{money(sales.current.aovCents)}</TD></tr>
           {sales.prior && <tr><TD>{data.period.comparisons.prior?.label ?? "Prior period"}</TD><TD right>{money(sales.prior.gmvCents)}</TD><TD right>{num(sales.prior.orders)}</TD><TD right>{money(sales.prior.aovCents)}</TD></tr>}
           {sales.yoy && <tr><TD>{data.period.comparisons.yoy?.label ?? "Last year"}</TD><TD right>{money(sales.yoy.gmvCents)}</TD><TD right>{num(sales.yoy.orders)}</TD><TD right>{money(sales.yoy.aovCents)}</TD></tr>}
          </tbody>
         </table>
        </div>
       </TechCard>

       {sales.series.length >= 2 && (
        <TechCard className="p-5">
         <CardTitle>Revenue trend</CardTitle>
         <AreaChart data={sales.series.map((s) => s.cents / 100)} />
         <div className="mt-1.5 flex justify-between text-[10px] text-stone-400"><span>{sales.series[0].bucket}</span><span>{sales.series[sales.series.length - 1].bucket}</span></div>
        </TechCard>
       )}

       {sales.taxCollectedCents > 0 && (
        <TechCard className="p-4">
         <p className="text-[12px] text-stone-600">
          <StatusPill tone="info">Held for tax</StatusPill>{" "}
          {money(sales.taxCollectedCents)} of sales tax was collected from buyers this period. It isn&apos;t revenue —
          it&apos;s held on their behalf until you file, so it&apos;s excluded from the totals above.
         </p>
        </TechCard>
       )}

       {sales.returns.orders > 0 && (
        <TechCard className="p-4">
         <p className="text-[12px] text-stone-600">
          <StatusPill tone="down">Returns</StatusPill>{" "}
          {num(sales.returns.orders)} refunded {sales.returns.orders === 1 ? "order" : "orders"} worth {money(sales.returns.valueCents)} in this period
          — a {pct(sales.returns.ratePct)} return rate. Refunds are already excluded from the revenue above.
         </p>
        </TechCard>
       )}

       <TechCard className="p-5">
        <CardTitle hint="the price bands your sales actually land in">Where the money comes from</CardTitle>
        <Leaderboard rows={(catalog.priceBands ?? []).filter((b) => b.sold > 0).map((b) => ({ name: b.label, value: b.revenueCents, sub: `${b.sold} sold` }))} />
       </TechCard>

       <TechCard className="p-5">
        <CardTitle>Recent sales</CardTitle>
        {sales.recentSales.length ? (
         <div className="overflow-x-auto">
          <table className="w-full">
           <thead><tr><TH>Item</TH><TH>When</TH><TH>Buyer</TH><TH right>Amount</TH></tr></thead>
           <tbody>
            {sales.recentSales.map((s, i) => (
             <tr key={`${s.title}-${i}`}>
              <TD><span className="block max-w-[260px] truncate font-medium text-stone-800">{s.title}</span></TD>
              <TD>{shortDate(s.at)}</TD>
              <TD>{s.buyerEmail ?? <span className="text-stone-300">not recorded</span>}</TD>
              <TD right>{moneyExact(s.amountCents)}</TD>
             </tr>
            ))}
           </tbody>
          </table>
         </div>
        ) : <p className="py-4 text-center text-[12px] text-stone-400">No sales in this period.</p>}
       </TechCard>
      </div>
     )}

     {/* ── CUSTOMERS ── */}
     {tab === "customers" && customers && (
      <div className="space-y-6">
       <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Customers" value={num(customers.totalContacts)} hint={`${num(customers.buyersAllTime)} have bought`} />
        <Kpi label="Avg. lifetime spend" value={customers.buyersAllTime ? money(customers.avgLifetimeSpendCents) : "—"} hint="per buyer, all time" />
        <Kpi label="Repeat rate" value={customers.buyersAllTime ? pct(customers.repeatPurchaseRatePct) : "—"} hint="buyers with 2+ orders" />
        <Kpi label="Orders per customer" value={customers.buyersAllTime ? customers.avgOrdersPerCustomer.toFixed(2) : "—"} />
       </div>

       {customers.identifiedRevenuePct < 100 && (
        <TechCard className="p-4">
         <p className="text-[12px] text-stone-600">
          <StatusPill tone="info">Coverage</StatusPill>{" "}
          {pct(customers.identifiedRevenuePct)} of this period&apos;s revenue is tied to a named buyer. Sales recorded by hand carry no email,
          so customer numbers below describe only the part of your business that came through checkout.
         </p>
        </TechCard>
       )}

       <div className="grid gap-4 sm:grid-cols-2">
        <TechCard className="p-5">
         <CardTitle hint="buyers in this period">New vs returning</CardTitle>
         {customers.buyersInPeriod ? (
          <div className="flex items-center gap-5">
           <DonutChart data={[{ label: "New", value: customers.newCustomers }, { label: "Returning", value: customers.returningCustomers }]} />
           <div className="space-y-2 text-[13px]">
            <div className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ background: DONUT_COLORS[0] }} /><span className="text-stone-600">New</span><span className="tabular-nums text-stone-900">{num(customers.newCustomers)} · {pct(customers.newVsReturningPct.newPct)}</span></div>
            <div className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ background: DONUT_COLORS[1] }} /><span className="text-stone-600">Returning</span><span className="tabular-nums text-stone-900">{num(customers.returningCustomers)} · {pct(customers.newVsReturningPct.returningPct)}</span></div>
           </div>
          </div>
         ) : <p className="py-4 text-center text-[12px] text-stone-400">No identified buyers in this period.</p>}
        </TechCard>

        <TechCard className="p-5">
         <CardTitle hint="lifetime spend">Top customers</CardTitle>
         {customers.topCustomers.length ? (
          <div className="overflow-x-auto">
           <table className="w-full">
            <thead><tr><TH>Customer</TH><TH right>Orders</TH><TH right>Spent</TH></tr></thead>
            <tbody>
             {customers.topCustomers.map((c) => (
              <tr key={c.email}>
               <TD>
                <span className="block max-w-[200px] truncate font-medium text-stone-800">{c.name || c.email}</span>
                <span className="block text-[11px] text-stone-400">last {shortDate(c.lastOrderAt)}</span>
               </TD>
               <TD right>{c.orders}</TD>
               <TD right>{money(c.spentCents)}</TD>
              </tr>
             ))}
            </tbody>
           </table>
          </div>
         ) : <p className="py-4 text-center text-[12px] text-stone-400">No named buyers yet.</p>}
        </TechCard>
       </div>

       <TechCard className="p-5">
        <CardTitle hint="everyone grouped by the month of their first order, and the share who came back">Acquisition cohorts</CardTitle>
        {customers.cohorts.length ? (
         <div className="overflow-x-auto">
          <table className="w-full">
           <thead><tr><TH>First bought</TH><TH right>Customers</TH><TH right>Came back</TH><TH right>Repeat rate</TH><TH right>Lifetime revenue</TH></tr></thead>
           <tbody>
            {customers.cohorts.map((c) => (
             <tr key={c.month}>
              <TD>{c.month}</TD>
              <TD right>{c.customers}</TD>
              <TD right>{c.repeatCustomers}</TD>
              <TD right>{pct(c.repeatPct)}</TD>
              <TD right>{money(c.revenueCents)}</TD>
             </tr>
            ))}
           </tbody>
          </table>
         </div>
        ) : <p className="py-4 text-center text-[12px] text-stone-400">Cohorts appear once buyers have emails on record.</p>}
       </TechCard>
      </div>
     )}

     {/* ── PRICING & CATALOG ── */}
     {tab === "catalog" && catalog && (
      <div className="space-y-6">
       <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Avg. listed" value={catalog.activeListings ? money(catalog.avgListedPriceCents) : "—"} hint={`median ${money(catalog.medianListedPriceCents)}`} />
        <Kpi label="Avg. sold" value={catalog.soldInPeriod ? money(catalog.avgSoldPriceCents) : "—"} hint={catalog.soldInPeriod ? `median ${money(catalog.medianSoldPriceCents)}` : undefined} delta={catalog.vsPrior?.avgSoldPricePct} />
        <Kpi label="Realisation" value={pct(catalog.realisationPct)} hint="sold ÷ asking" />
        <Kpi label="Sell-through" value={pct(catalog.sellThroughPct)} delta={catalog.vsPrior?.sellThroughPct} />
       </div>

       <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Active listings" value={num(catalog.activeListings)} />
        <Kpi label="Inventory value" value={money(catalog.inventoryValueCents)} />
        <Kpi label="Listed this period" value={num(catalog.listedInPeriod)} />
        <Kpi label="Days to sell" value={catalog.medianDaysToSell == null ? "—" : `${catalog.medianDaysToSell}`} hint={catalog.avgDaysToSell == null ? "median" : `median · ${catalog.avgDaysToSell} avg`} />
       </div>

       <TechCard className="p-5">
        <CardTitle hint="how your live catalog is spread across price, and what each band actually sold">Price distribution</CardTitle>
        <div className="overflow-x-auto">
         <table className="w-full">
          <thead><tr><TH>Band</TH><TH right>Listed</TH><TH right>Share</TH><TH right>Sold</TH><TH right>Revenue</TH></tr></thead>
          <tbody>
           {catalog.priceBands.map((b) => (
            <tr key={b.label}>
             <TD><span className="font-medium text-stone-800">{b.label}</span></TD>
             <TD right>{num(b.listed)}</TD>
             <TD right>{pct(b.listedPct)}</TD>
             <TD right>{num(b.sold)}</TD>
             <TD right>{money(b.revenueCents)}</TD>
            </tr>
           ))}
          </tbody>
         </table>
        </div>
       </TechCard>

       {(["topBrands", "topCategories"] as const).map((key) => (
        <TechCard key={key} className="p-5">
         <CardTitle hint="what you stock against what sells">{key === "topBrands" ? "Brand mix" : "Category mix"}</CardTitle>
         <div className="overflow-x-auto">
          <table className="w-full">
           <thead><tr><TH>{key === "topBrands" ? "Brand" : "Category"}</TH><TH right>Listed</TH><TH right>Sold</TH><TH right>Sell-through</TH><TH right>Avg. sold</TH><TH right>Revenue</TH></tr></thead>
           <tbody>
            {catalog[key].map((r) => (
             <tr key={r.name}>
              <TD><span className="font-medium text-stone-800">{r.name}</span></TD>
              <TD right>{num(r.listed)}</TD>
              <TD right>{num(r.sold)}</TD>
              <TD right>{pct(r.sellThroughPct)}</TD>
              <TD right>{r.sold ? money(r.avgSoldPriceCents) : "—"}</TD>
              <TD right>{money(r.revenueCents)}</TD>
             </tr>
            ))}
           </tbody>
          </table>
         </div>
        </TechCard>
       ))}
      </div>
     )}

     {/* ── PRODUCTS ── */}
     {tab === "products" && products && (
      <div className="space-y-6">
       {products.aging.count > 0 && (
        <TechCard className="p-4">
         <p className="text-[12px] text-stone-600">
          <StatusPill tone="pending">Aging</StatusPill>{" "}
          {num(products.aging.count)} listings ({pct(products.aging.shareOfActivePct)} of your active catalog, {money(products.aging.valueCents)} at list)
          have been live more than {products.aging.thresholdDays} days. Repricing or restaging these is usually the fastest revenue you have.
         </p>
        </TechCard>
       )}

       <TechCard className="p-5">
        <CardTitle hint="what earned the most in this period">Best sellers</CardTitle>
        <ProductTable rows={products.bestSellers} columns={["revenue", "daysToSell", "views"]} />
       </TechCard>

       <div className="grid gap-4 sm:grid-cols-2">
        <TechCard className="p-5">
         <CardTitle>Most viewed</CardTitle>
         <ProductTable rows={products.mostViewed} columns={["views"]} />
        </TechCard>
        <TechCard className="p-5">
         <CardTitle>Most saved</CardTitle>
         <ProductTable rows={products.mostFavorited} columns={["favorites"]} />
        </TechCard>
       </div>

       <TechCard className="p-5">
        <CardTitle hint="Listed for at least two weeks and getting the fewest views a day. These are the ones to re-shoot, retitle or reprice">Getting the least attention</CardTitle>
        <ProductTable rows={products.worstPerformers} columns={["views", "daysLive"]} />
       </TechCard>

       {products.aging.items.length > 0 && (
        <TechCard className="p-5">
         <CardTitle hint={`unsold for more than ${products.aging.thresholdDays} days`}>Aging inventory</CardTitle>
         <ProductTable rows={products.aging.items} columns={["daysLive", "views", "favorites"]} />
        </TechCard>
       )}
      </div>
     )}

     {/* ── TRAFFIC ── */}
     {tab === "traffic" && engagement && (
      <div className="space-y-6">
       <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Sessions" value={num(engagement.sessions)} delta={engagement.vsPrior?.sessionsPct} />
        <Kpi label="Session → sale" value={pct(engagement.rates.sessionToOrderPct)} />
        <Kpi label="Pages per session" value={engagement.pagesPerSession || "—"} hint={`${num(engagement.pageviews)} page views`} />
        <Kpi label="Bounce rate" value={pct(engagement.bounceRatePct)} hint="left after one page" />
       </div>

       <div className="grid gap-4 sm:grid-cols-2">
        <TechCard className="p-5">
         <CardTitle hint="where visitors arrive from">Traffic sources</CardTitle>
         {engagement.trafficByType.length ? (
          <div className="flex items-center gap-5">
           <DonutChart data={engagement.trafficByType.map((t) => ({ label: t.type, value: t.sessions }))} />
           <div className="space-y-1.5 text-[13px]">
            {engagement.trafficByType.map((t, i) => (
             <div key={t.type} className="flex items-center gap-2">
              <i className="h-2.5 w-2.5 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
              <span className="text-stone-600">{t.type}</span>
              <span className="tabular-nums text-stone-900">{num(t.sessions)} · {pct(t.sharePct)}</span>
             </div>
            ))}
           </div>
          </div>
         ) : <p className="py-4 text-center text-[12px] text-stone-400">No visits recorded in this period.</p>}
         {(() => {
          const direct = engagement.trafficByType.find((t) => t.type === "Direct");
          if (!direct || direct.sharePct < 25) return null;
          return (
           <p className="mt-3 border-t border-stone-100 pt-3 text-[11px] leading-relaxed text-stone-500">
            <span className="font-medium text-stone-700">{pct(direct.sharePct)} is direct</span> — that&apos;s visits that arrived with no source attached, not a channel.
            Tapping a link inside Instagram or TikTok often sends nothing we can read.{" "}
            <a href="/admin/marketing/share-links" className="font-medium text-[var(--accent-ink,#0b7a5c)] underline underline-offset-2">Use tagged share links</a>{" "}
            and every post gets credited properly.
           </p>
          );
         })()}
        </TechCard>

        <TechCard className="p-5">
         <CardTitle>Top sources</CardTitle>
         <Leaderboard unit="count" rows={engagement.topSources.map((s) => ({ name: s.source, value: s.sessions, sub: s.type }))} />
        </TechCard>
       </div>

       <TechCard className="p-5">
        <CardTitle hint="which channel the shopper came from on the visit that sold the piece">Revenue by channel</CardTitle>
        {engagement.channels.length ? (
         <div className="overflow-x-auto">
          <table className="w-full">
           <thead><tr><TH>Channel</TH><TH right>Sessions</TH><TH right>Sales</TH><TH right>Conversion</TH><TH right>Avg. order</TH><TH right>Revenue</TH></tr></thead>
           <tbody>
            {engagement.channels.map((c) => (
             <tr key={c.channel}>
              <TD><span className="font-medium text-stone-800">{c.channel}</span></TD>
              <TD right>{num(c.sessions)}</TD>
              <TD right>{num(c.orders)}</TD>
              <TD right>{pct(c.convPct)}</TD>
              <TD right>{money(c.aovCents)}</TD>
              <TD right>{money(c.revenueCents)}</TD>
             </tr>
            ))}
           </tbody>
          </table>
         </div>
        ) : (
         <p className="py-4 text-[12px] text-stone-500">
          None of this period&apos;s {num(engagement.totalOrders)} sales could be traced back to a visit yet — channel revenue fills in as
          shoppers browse and buy in the same tracked session. Sessions and sources above are recorded regardless.
         </p>
        )}
        {engagement.channels.length > 0 && engagement.attributionCoveragePct < 100 && (
         <p className="mt-3 text-[11px] text-stone-400">Covers {pct(engagement.attributionCoveragePct)} of sales in this period; the rest had no traceable visit.</p>
        )}
       </TechCard>

       <div className="grid gap-4 sm:grid-cols-2">
        <TechCard className="p-5">
         <CardTitle>Most visited pages</CardTitle>
         {engagement.topPages.length ? (
          <div className="overflow-x-auto">
           <table className="w-full">
            <thead><tr><TH>Page</TH><TH right>Views</TH><TH right>Visitors</TH></tr></thead>
            <tbody>
             {engagement.topPages.map((p) => (
              <tr key={p.path}>
               <TD><span className="block max-w-[240px] truncate">{p.title || p.path}</span><span className="block text-[11px] text-stone-400">{p.type}</span></TD>
               <TD right>{num(p.views)}</TD>
               <TD right>{num(p.visitors)}</TD>
              </tr>
             ))}
            </tbody>
           </table>
          </div>
         ) : <p className="py-4 text-center text-[12px] text-stone-400">No page views in this period.</p>}
        </TechCard>

        <TechCard className="p-5">
         <CardTitle hint="What people searched for on your store. If something comes up a lot and you don't stock it, that's worth knowing">Top searches</CardTitle>
         <Leaderboard unit="count" rows={engagement.topSearches.map((s) => ({ name: s.query, value: s.count }))} />
        </TechCard>
       </div>

       {(engagement.devices.length > 0 || engagement.countries.length > 0) ? (
        <div className="grid gap-4 sm:grid-cols-2">
         <TechCard className="p-5">
          <CardTitle hint="What people browse on. Worth knowing before you decide how to shoot and crop photos">Devices</CardTitle>
          {engagement.devices.length ? (
           <Leaderboard unit="count" rows={engagement.devices.map((d) => ({ name: d.device[0].toUpperCase() + d.device.slice(1), value: d.sessions, sub: pct(d.sharePct) }))} />
          ) : <p className="py-4 text-center text-[12px] text-stone-400">No device data in this period.</p>}
         </TechCard>
         <TechCard className="p-5">
          <CardTitle hint="where your shoppers are">Locations</CardTitle>
          {engagement.countries.length ? (
           <>
            <Leaderboard unit="count" rows={engagement.countries.map((c) => ({ name: c.country, value: c.sessions, sub: pct(c.sharePct) }))} />
            {engagement.cities.length > 0 && (
             <p className="mt-3 text-[11px] text-stone-400">Top cities: {engagement.cities.slice(0, 5).map((c) => c.city).join(", ")}</p>
            )}
           </>
          ) : <p className="py-4 text-center text-[12px] text-stone-400">No location data in this period.</p>}
         </TechCard>
        </div>
       ) : (
        <TechCard className="p-4">
         <p className="text-[12px] text-stone-600">
          <StatusPill tone="info">New</StatusPill>{" "}
          Device and location are now recorded on every visit. They&apos;ll appear here once shoppers arrive — earlier visits didn&apos;t capture them.
         </p>
        </TechCard>
       )}

       <TechCard className="p-5">
        <CardTitle hint="The first page people land on when they arrive">Landing pages</CardTitle>
        <Leaderboard unit="count" rows={engagement.landingPages.map((p) => ({ name: p.title || p.path, value: p.sessions }))} />
       </TechCard>

       <TechCard className="p-5">
        <CardTitle hint="revenue on pieces a shopper first met on the VYA marketplace">Attributed to VYA</CardTitle>
        <div className="flex items-baseline gap-3">
         <span className="text-[26px] font-semibold tabular-nums text-stone-900">{money(engagement.vyaAttributed.revenueCents)}</span>
         <span className="text-[12px] text-stone-400">of {money(engagement.totalRevenueCents)} total · {pct(engagement.vyaAttributed.sharePct)}</span>
        </div>
       </TechCard>
      </div>
     )}


     {/* ── WHAT SELLS ── */}
     {tab === "quality" && quality && (
      <div className="space-y-6">
       <TechCard className="p-4">
        <p className="text-[12px] text-stone-600">
         <StatusPill tone="info">Whole catalog</StatusPill>{" "}
         This tab compares your own listings against each other across the {num(quality.catalogSize)} pieces that have been live
         long enough to judge — it ignores the date filter, because &ldquo;do measurements help?&rdquo; needs every listing it can get.
         {quality.excludedImports > 0 && <> {num(quality.excludedImports)} imported {quality.excludedImports === 1 ? "piece that arrived" : "pieces that arrived"} already sold {quality.excludedImports === 1 ? "is" : "are"} left out — they never sat on a shelf here, so they can&apos;t tell you anything.</>}{" "}
         These are associations, not proof: a piece you measured carefully was probably photographed carefully too.
        </p>
       </TechCard>

       {!quality.enoughData ? (
        <TechEmpty icon={<BarChart3 size={28} strokeWidth={1.5} />} title="Not enough listings yet"
         body="Once you’ve listed enough pieces and made a few sales, this shows what your fastest-selling listings have in common." />
       ) : (
        <>
         <TechCard className="p-5">
          <CardTitle hint="sell-through for your listings with each signal against your listings without it">What moves your pieces</CardTitle>
          <div className="overflow-x-auto">
           <table className="w-full">
            <thead><tr><TH>Signal</TH><TH right>With</TH><TH right>Without</TH><TH right>Lift</TH><TH right>Days to sell</TH><TH right>Live listings missing it</TH></tr></thead>
            <tbody>
             {quality.signals.map((sg) => (
              <tr key={sg.key}>
               <TD>
                <span className="block font-medium text-stone-800">{sg.label}</span>
                <span className="block text-[11px] text-stone-400">{sg.action}</span>
               </TD>
               <TD right>{sg.verdict === "not-enough-data" ? "—" : <>{pct(sg.with.sellThroughPct)}<span className="block text-[11px] text-stone-400">{num(sg.with.items)} listings</span></>}</TD>
               <TD right>{sg.verdict === "not-enough-data" ? "—" : <>{pct(sg.without.sellThroughPct)}<span className="block text-[11px] text-stone-400">{num(sg.without.items)} listings</span></>}</TD>
               <TD right>
                {sg.verdict === "not-enough-data" ? <span className="text-stone-300">too few</span>
                 : sg.verdict === "no-clear-effect" ? <StatusPill tone="neutral">no clear effect</StatusPill>
                 : <StatusPill tone={sg.verdict === "helps" ? "live" : "down"}>{sg.liftPct != null && sg.liftPct > 0 ? "+" : ""}{sg.liftPct}%</StatusPill>}
               </TD>
               <TD right>{sg.daysDeltaPct == null || sg.verdict === "not-enough-data" ? "—" : <span className={sg.daysDeltaPct < 0 ? "text-[var(--accent-ink,#0b7a5c)]" : "text-stone-500"}>{sg.daysDeltaPct > 0 ? "+" : ""}{sg.daysDeltaPct}%</span>}</TD>
               <TD right>{sg.verdict === "helps" && sg.activeMissing > 0 ? <span className="font-semibold text-amber-600">{num(sg.activeMissing)}</span> : num(sg.activeMissing)}</TD>
              </tr>
             ))}
            </tbody>
           </table>
          </div>
          <p className="mt-3 text-[11px] text-stone-400">
           Lift is the relative difference in sell-through. A negative days-to-sell figure means those pieces move faster.
           Every verdict has to clear a 95% significance test first, so a gap that could be luck is reported as
           no clear effect rather than dressed up as advice.
          </p>
         </TechCard>

         <TechCard className="p-5">
          <CardTitle hint="sell-through by how many photos the listing carries">How far photos take you</CardTitle>
          <div className="space-y-2.5">
           {quality.photoLadder.map((r) => (
            <div key={r.bucket} className={r.sparse ? "opacity-45" : undefined}>
             <div className="mb-1 flex items-center justify-between text-[13px]">
              <span className="text-stone-700">{r.bucket} photo{r.bucket === "1" ? "" : "s"}</span>
              <span className="tabular-nums text-stone-900">{pct(r.sellThroughPct)}<span className="text-stone-400"> · {num(r.items)} listings{r.sparse ? " · too few to read" : ""}</span></span>
             </div>
             <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-[var(--accent,#0e9f76)]" style={{ width: `${Math.max(2, Math.min(100, r.sellThroughPct))}%` }} />
             </div>
            </div>
           ))}
          </div>
         </TechCard>

         <TechCard className="p-5">
          <CardTitle hint="how complete your live listings are right now">Catalog completeness</CardTitle>
          <div className="space-y-2.5">
           {quality.completeness.map((c) => (
            <div key={c.key}>
             <div className="mb-1 flex items-center justify-between text-[13px]">
              <span className="text-stone-700">{c.label}</span>
              <span className="tabular-nums text-stone-900">{pct(c.pct)}<span className="text-stone-400"> · {num(c.filled)} of {num(c.total)}</span></span>
             </div>
             <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-[var(--accent,#0e9f76)]" style={{ width: `${Math.max(2, c.pct)}%` }} />
             </div>
            </div>
           ))}
          </div>
         </TechCard>
        </>
       )}
      </div>
     )}

     {/* ── PROFIT ── */}
     {tab === "margin" && margin && (
      <div className="space-y-6">
       <ProfitAndLoss margin={margin} period={data.period} onAdded={() => setReload((n) => n + 1)} />

       <RecurringCosts margin={margin} onChanged={() => setReload((n) => n + 1)} />

       {!margin.available ? (
        <TechEmpty icon={<BarChart3 size={28} strokeWidth={1.5} />} title="Add what your pieces cost"
         body={`The statement above is ready for your running costs. To fill in cost of goods and gross margin too, add what you paid for a piece — ${num(margin.activeWithoutCost)} of your ${num(margin.activeTotal)} live listings don't have it yet.`} />
       ) : (
        <>
         {margin.current.coveragePct < 100 && (
          <TechCard className="p-4">
           <p className="text-[12px] text-stone-600">
            <StatusPill tone="info">Coverage</StatusPill>{" "}
            Every figure here covers the {pct(margin.current.coveragePct)} of this period&apos;s sales ({num(margin.current.coveredSales)} of {num(margin.current.totalSales)})
            where a cost was recorded. Extrapolating across the rest would be inventing profit, so we don&apos;t.
           </p>
          </TechCard>
         )}

         <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Gross profit" value={money(margin.current.grossProfitCents)} delta={margin.vsPrior?.profitPct} />
          <Kpi label="Gross margin" value={pct(margin.current.grossMarginPct)} delta={margin.vsPrior?.marginPct} />
          <Kpi label="Return on cost" value={pct(margin.current.roiPct)} hint="profit ÷ what you paid" />
          <Kpi label="Profit per sale" value={money(margin.current.avgProfitPerSaleCents)} />
         </div>

         <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi label="Revenue (costed)" value={money(margin.current.revenueCents)} />
          <Kpi label="Cost of goods" value={money(margin.current.costCents)} />
          <Kpi label="Stock at cost" value={money(margin.inventoryCostCents)} hint="unsold, at what you paid" />
         </div>

         {(["byBrand", "byCategory"] as const).map((key) => (
          <TechCard key={key} className="p-5">
           <CardTitle hint="ranked by profit, not revenue">{key === "byBrand" ? "Profit by brand" : "Profit by category"}</CardTitle>
           <div className="overflow-x-auto">
            <table className="w-full">
             <thead><tr><TH>{key === "byBrand" ? "Brand" : "Category"}</TH><TH right>Sales</TH><TH right>Revenue</TH><TH right>Cost</TH><TH right>Profit</TH><TH right>Margin</TH></tr></thead>
             <tbody>
              {margin[key].map((r) => (
               <tr key={r.name}>
                <TD><span className="font-medium text-stone-800">{r.name}</span></TD>
                <TD right>{num(r.sales)}</TD>
                <TD right>{money(r.revenueCents)}</TD>
                <TD right>{money(r.costCents)}</TD>
                <TD right><span className={r.profitCents < 0 ? "text-rose-500" : undefined}>{money(r.profitCents)}</span></TD>
                <TD right>{pct(r.marginPct)}</TD>
               </tr>
              ))}
             </tbody>
            </table>
           </div>
          </TechCard>
         ))}

         <div className="grid gap-4 sm:grid-cols-2">
          {([["Best margin", margin.bestMargin], ["Thinnest margin", margin.worstMargin]] as const).map(([title, rows]) => (
           <TechCard key={title} className="p-5">
            <CardTitle>{title}</CardTitle>
            {rows.length ? (
             <div className="overflow-x-auto">
              <table className="w-full">
               <thead><tr><TH>Item</TH><TH right>Sold</TH><TH right>Cost</TH><TH right>Profit</TH></tr></thead>
               <tbody>
                {rows.map((i) => (
                 <tr key={i.itemId}>
                  <TD>
                   <span className="block max-w-[200px] truncate font-medium text-stone-800">{i.title}</span>
                   <span className="block text-[11px] text-stone-400">{pct(i.marginPct)} margin</span>
                  </TD>
                  <TD right>{money(i.priceCents)}</TD>
                  <TD right>{money(i.costCents)}</TD>
                  <TD right><span className={i.profitCents < 0 ? "text-rose-500" : undefined}>{money(i.profitCents)}</span></TD>
                 </tr>
                ))}
               </tbody>
              </table>
             </div>
            ) : <p className="py-4 text-center text-[12px] text-stone-400">Nothing to show yet.</p>}
           </TechCard>
          ))}
         </div>
        </>
       )}
      </div>
     )}

    </>
   ) : (
    <TechEmpty icon={<BarChart3 size={28} strokeWidth={1.5} />} title="Can’t load your numbers right now" body="We couldn’t load your numbers just now. Try refreshing the page." />
   )}
  </AdminPage>
 );
}
