"use client";

import { useMemo, useState } from "react";
import { SegmentedControl, TechButton, cn } from "../ui";

// The period control for the analytics suite. Emits exactly what
// /api/store/analytics/suite takes — a period key plus, for a custom range, the
// two dates — so the URL, the request and the label all stay in step.
//
// Three ways in, because sellers think about time in three ways: a rolling
// window ("last 30 days"), a calendar period they close their books on ("Q3",
// "August"), and an arbitrary range they picked for a reason of their own.

export type PeriodValue = { period: string; from?: string; to?: string };

const PRESETS: { label: string; period: string }[] = [
 { label: "30d", period: "30d" },
 { label: "90d", period: "90d" },
 { label: "QTD", period: "qtd" },
 { label: "YTD", period: "ytd" },
 { label: "All", period: "all" },
];

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The last 8 quarters and 12 months, newest first — everything a store closes books on. */
function calendarOptions(now: Date): { value: string; label: string; group: string }[] {
 const out: { value: string; label: string; group: string }[] = [];
 const y = now.getFullYear();
 const m = now.getMonth() + 1;
 let q = Math.floor((m - 1) / 3) + 1;
 let qy = y;
 for (let i = 0; i < 8; i++) {
  out.push({ value: `${qy}-Q${q}`, label: `Q${q} ${qy}`, group: "Quarter" });
  q -= 1;
  if (q === 0) { q = 4; qy -= 1; }
 }
 let mm = m;
 let my = y;
 for (let i = 0; i < 12; i++) {
  out.push({ value: `${my}-${String(mm).padStart(2, "0")}`, label: `${MONTH_NAMES[mm - 1]} ${my}`, group: "Month" });
  mm -= 1;
  if (mm === 0) { mm = 12; my -= 1; }
 }
 for (let i = 0; i < 3; i++) out.push({ value: String(y - i), label: String(y - i), group: "Year" });
 return out;
}

export function PeriodPicker({ value, onChange, className }: { value: PeriodValue; onChange: (v: PeriodValue) => void; className?: string }) {
 const [customOpen, setCustomOpen] = useState(value.period === "custom");
 const [from, setFrom] = useState(value.from ?? "");
 const [to, setTo] = useState(value.to ?? "");
 // Rebuilt only on mount — the option list doesn't need to chase the clock mid-session.
 const options = useMemo(() => calendarOptions(new Date()), []);

 const presetLabel = PRESETS.find((p) => p.period === value.period)?.label;
 const grouped = ["Quarter", "Month", "Year"] as const;

 return (
  <div className={cn("flex flex-wrap items-center justify-end gap-2", className)}>
   <SegmentedControl
    options={PRESETS.map((p) => p.label)}
    value={presetLabel ?? ""}
    onChange={(label) => {
     const p = PRESETS.find((x) => x.label === label);
     if (p) { setCustomOpen(false); onChange({ period: p.period }); }
    }}
   />

   <select
    aria-label="Jump to a calendar period"
    className="h-[30px] rounded-lg border border-stone-200 bg-white px-2 text-[12px] text-stone-600 outline-none focus:border-stone-400"
    value={presetLabel || value.period === "custom" ? "" : value.period}
    onChange={(e) => { if (e.target.value) { setCustomOpen(false); onChange({ period: e.target.value }); } }}
   >
    <option value="">Jump to…</option>
    {grouped.map((g) => (
     <optgroup key={g} label={g}>
      {options.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
     </optgroup>
    ))}
   </select>

   <button
    type="button"
    onClick={() => setCustomOpen((v) => !v)}
    className={cn("h-[30px] rounded-lg border px-2.5 text-[12px] transition",
     value.period === "custom" ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400")}
   >
    Custom
   </button>

   {customOpen && (
    <div className="flex items-center gap-1.5">
     <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-[30px] rounded-lg border border-stone-200 px-2 text-[12px] text-stone-600 outline-none focus:border-stone-400" />
     <span className="text-[12px] text-stone-400">→</span>
     <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-[30px] rounded-lg border border-stone-200 px-2 text-[12px] text-stone-600 outline-none focus:border-stone-400" />
     <TechButton
      className="h-[30px] px-2.5 py-0 text-[12px]"
      disabled={!from || !to || from > to}
      onClick={() => onChange({ period: "custom", from, to })}
     >
      Apply
     </TechButton>
    </div>
   )}
  </div>
 );
}
