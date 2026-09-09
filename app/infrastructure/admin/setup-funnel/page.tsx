"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPage, AdminHeader, TechCard, TH, TD, StatusPill } from "../ui";
import type { FunnelStep, FunnelStore } from "@/app/lib/setup-funnel-core";

// Where stores get stuck — the owner's view of "Set up your store" across every store.
//
// "If 3 sellers out of 10 get stuck somewhere, we need to explain better." One bar per required
// step (count and percent of all stores), then every store, longest-stuck first, with the step it
// is on and a link into its Home as the owner sees it. Owner-only: the route answers 401 to anyone
// else and the row is hidden from sellers' sidebars (nav.ts INTERNAL).

type Funnel = { stores: (FunnelStore & { nextLabel: string | null })[]; byStep: FunnelStep[]; total: number; complete: number };

export default function SetupFunnelPage() {
 const [data, setData] = useState<Funnel | null>(null);
 const [err, setErr] = useState<string | null>(null);
 useEffect(() => {
  fetch("/api/admin/setup-funnel").then(async (r) => {
   const d = await r.json().catch(() => null);
   if (!r.ok) { setErr(r.status === 401 ? "Owner only." : d?.error || "Couldn’t load the funnel."); return; }
   setData(d);
  }).catch(() => setErr("Couldn’t load the funnel."));
 }, []);

 const stuck = data ? data.total - data.complete : 0;
 const maxCount = data ? Math.max(1, ...data.byStep.map((b) => b.count)) : 1;

 return (
  <AdminPage>
   <AdminHeader eyebrow="Platform" title="Where stores get stuck" subtitle="If 3 sellers out of 10 get stuck somewhere, we need to explain better." />
   {err && <p className="text-[13px] text-stone-500">{err}</p>}
   {!data && !err && <p className="text-[13px] text-stone-400">Reading every store’s checklist…</p>}
   {data && (
    <>
     <div className="mb-4 grid grid-cols-3 gap-3">
      <TechCard className="p-4"><p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Stores</p><p className="mt-1 text-2xl font-medium">{data.total}</p></TechCard>
      <TechCard className="p-4"><p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Set up</p><p className="mt-1 text-2xl font-medium">{data.complete}</p></TechCard>
      <TechCard className="p-4"><p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Stuck</p><p className="mt-1 text-2xl font-medium">{stuck}</p></TechCard>
     </div>

     <TechCard className="mb-4 p-5" data-testid="funnel-bars">
      <p className="text-[14px] font-semibold text-stone-900">Stuck on</p>
      <p className="text-[12px] text-stone-500">Each store counts once, against the step it is on. Percent is of all {data.total} stores.</p>
      <ul className="mt-4 space-y-3">
       {data.byStep.map((b) => (
        <li key={b.id} data-testid="funnel-bar" data-step={b.id}>
         <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="min-w-0 truncate text-stone-800">{b.label}</span>
          <span className="shrink-0 tabular-nums text-stone-500"><b className="font-semibold text-stone-900">{b.count}</b> · {b.pct}%{b.count > 0 && <span className="text-stone-400"> · {b.avgStuckDays}d avg</span>}</span>
         </div>
         <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
          <div className={`h-full rounded-full ${b.count > 0 ? "bg-amber-400" : "bg-stone-200"}`} style={{ width: `${b.count > 0 ? Math.max(2, Math.round((b.count / maxCount) * 100)) : 0}%` }} />
         </div>
        </li>
       ))}
      </ul>
     </TechCard>

     <TechCard className="p-5">
      <p className="text-[14px] font-semibold text-stone-900">Every store</p>
      <p className="text-[12px] text-stone-500">Longest stuck first. Days since the store’s workspace was created.</p>
      <div className="overflow-x-auto">
       <table className="mt-2 w-full">
        <thead><tr><TH>Store</TH><TH>Stuck on</TH><TH right>Done</TH><TH right>Days</TH><TH right></TH></tr></thead>
        <tbody>
         {data.stores.map((s) => (
          <tr key={s.slug} data-testid="funnel-store">
           <TD><span className="font-medium text-stone-900">{s.name}</span><span className="ml-2 font-mono text-[11px] text-stone-400">{s.slug}</span></TD>
           <TD>{s.complete ? <StatusPill tone="live" dot>Set up</StatusPill> : <span className="text-stone-700">{s.nextLabel ?? s.next}</span>}</TD>
           <TD right className="tabular-nums">{s.done}/{s.total}</TD>
           <TD right className="tabular-nums">{s.complete ? "—" : s.stuckSinceDays}</TD>
           <TD right><Link href={`/admin/home?store=${encodeURIComponent(s.slug)}`} className="text-[12.5px] font-medium text-[var(--accent-ink,#0b7a5c)] hover:underline">Open Home ›</Link></TD>
          </tr>
         ))}
        </tbody>
       </table>
      </div>
     </TechCard>
    </>
   )}
  </AdminPage>
 );
}
