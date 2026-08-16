"use client";

import { useEffect, useState } from "react";
import { Users, Settings2, UserPlus } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButtonLink, TechEmpty, StatusPill, MetricCard, AreaChart, TH, TD, cn } from "../ui";

type Activity = { payee: string; type: string; item: string; grossCents: number; netCents: number; status: "payable" | "hold" };
type Summary = {
 availableCents: number; owedCents: number; onHoldCents: number;
 paid7dCents: number; paidDeltaPct: number | null;
 weeks: { label: string; value: number }[];
 activity: Activity[];
};
type Consignor = { id: number; name: string; email: string | null; defaultSplitPct: number | null; status: string; balanceCents: number };

const money = (c: number) => `$${Math.round(c / 100).toLocaleString()}`;
const initials = (n: string) => (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export default function ConsignmentPage() {
 const [sum, setSum] = useState<Summary | null>(null);
 const [consignors, setConsignors] = useState<Consignor[]>([]);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
  let active = true;
  Promise.all([
   fetch("/api/store/consignment/summary").then((r) => (r.ok ? r.json() : null)).catch(() => null),
   fetch("/api/store/consignment/consignors").then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]).then(([s, c]) => {
   if (!active) return;
   if (s?.ok) setSum(s);
   if (Array.isArray(c?.consignors)) setConsignors(c.consignors);
  }).finally(() => { if (active) setLoading(false); });
  return () => { active = false; };
 }, []);

 const actions = (
  <>
   <TechButtonLink variant="secondary" href="/admin/consignment/settings"><Settings2 size={14} /> Settings</TechButtonLink>
   <TechButtonLink href="/admin/consignment/consignors"><UserPlus size={14} /> Consignors</TechButtonLink>
  </>
 );

 const weeks = sum?.weeks ?? [];
 const hasData = !!sum && (sum.owedCents !== 0 || sum.paid7dCents !== 0 || sum.activity.length > 0 || weeks.some((w) => w.value > 0));

 return (
  <AdminPage>
   <AdminHeader
    eyebrow="Sell · Consignment"
    title="Consignment"
    subtitle="What you owe your consignors, what’s cleared to pay out, and where the sales are coming from."
    actions={actions}
   />

   {loading ? (
    <div className="flex items-center justify-center py-32 text-sm text-stone-400">Loading…</div>
   ) : consignors.length === 0 && !hasData ? (
    <TechEmpty
     icon={<Users size={28} strokeWidth={1.5} />}
     title="No consignors yet"
     body="Add your consignors and mark their pieces sold — balances, payouts and sales volume all show up here. Already run consignment somewhere else? Bring your whole book over in one import."
     action={
      <>
       <TechButtonLink href="/admin/consignment/consignors">Add a consignor</TechButtonLink>
       <TechButtonLink variant="secondary" href="/admin/consignment/consignors#import">Import from another tool</TechButtonLink>
      </>
     }
    />
   ) : (
    <>
     {/* Consignors — shown whenever there are any, so the owner sees who's on their roster
         even before the first sale (which is when the metrics/chart below light up). */}
     {consignors.length > 0 && (
      <TechCard className="mb-5 overflow-hidden">
       <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <div>
         <h3 className="text-[13px] font-semibold text-stone-900">Consignors</h3>
         <p className="mt-0.5 text-[12px] text-stone-500">Everyone consigning with you, their split, and what they’re owed.</p>
        </div>
        <TechButtonLink variant="secondary" href="/admin/consignment/consignors" className="text-[12px]">Manage →</TechButtonLink>
       </div>
       <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
         <thead>
          <tr>
           <TH className="px-5">Consignor</TH>
           <TH className="px-4">Default split</TH>
           <TH right className="px-4">Balance owed</TH>
           <TH className="px-5">Status</TH>
          </tr>
         </thead>
         <tbody>
          {consignors.map((c) => (
           <tr key={c.id} className="transition hover:bg-stone-50/70">
            <TD className="px-5">
             <span className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--accent-soft,#eafaf3)] text-[10px] font-semibold text-[var(--accent-ink,#0b7a5c)]">{initials(c.name)}</span>
              <span>
               <span className="block font-medium text-stone-800">{c.name}</span>
               {c.email && <span className="block text-[11px] text-stone-400">{c.email}</span>}
              </span>
             </span>
            </TD>
            <TD className="px-4 text-stone-500">{c.defaultSplitPct != null ? `${c.defaultSplitPct}%` : "Store rule"}</TD>
            <TD right className="px-4 font-medium text-stone-800">{money(c.balanceCents)}</TD>
            <TD className="px-5"><StatusPill tone={c.status === "active" ? "live" : "neutral"} dot={c.status === "active"}>{c.status}</StatusPill></TD>
           </tr>
          ))}
         </tbody>
        </table>
       </div>
      </TechCard>
     )}

     {hasData && (
      <>
       {/* Balances — all real, from the consignor ledger + payouts. */}
       <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Available balance" value={money(sum!.availableCents)} sub="Cleared the return hold" />
        <MetricCard label="Paid · 7 days" value={money(sum!.paid7dCents)} delta={sum!.paidDeltaPct != null ? `${Math.abs(sum!.paidDeltaPct)}%` : undefined} up={sum!.paidDeltaPct == null || sum!.paidDeltaPct >= 0} sub="Payouts made" />
        <MetricCard label="Pending" value={money(sum!.onHoldCents)} sub="Owed, still within hold" />
       </div>

       {/* Sales volume — net-to-consignor by week (more meaningful early than payout volume). */}
       <TechCard className="mb-5 p-5">
        <div className="mb-3 flex items-baseline justify-between">
         <div>
          <h3 className="text-[13px] font-semibold text-stone-900">Consignment sales</h3>
          <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-stone-400">Net to consignors · last 8 weeks</p>
         </div>
         <span className="text-[13px] font-semibold tabular-nums text-stone-500">{money(weeks.reduce((s, w) => s + w.value, 0) * 100)}</span>
        </div>
        <AreaChart data={weeks.map((w) => w.value)} />
        <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-[0.08em] text-stone-300">
         <span>{weeks[0]?.label}</span>
         <span>{weeks[weeks.length - 1]?.label}</span>
        </div>
       </TechCard>

       {/* Payout activity */}
       <TechCard className="overflow-hidden">
        <div className="border-b border-stone-100 px-5 py-4">
         <h3 className="text-[13px] font-semibold text-stone-900">Recent payouts</h3>
         <p className="mt-0.5 text-[12px] text-stone-500">Each sold consignment piece — the consignor’s cut and whether it’s cleared to pay.</p>
        </div>
        {sum!.activity.length === 0 ? (
         <div className="px-5 py-10 text-center text-[13px] text-stone-400">No sold consignment pieces yet.</div>
        ) : (
         <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
           <thead>
            <tr>
             <TH className="px-5">Payee</TH>
             <TH className="px-4">Type</TH>
             <TH className="px-4">Item</TH>
             <TH right className="px-4">Gross</TH>
             <TH right className="px-4">Net</TH>
             <TH className="px-5">Status</TH>
            </tr>
           </thead>
           <tbody>
            {sum!.activity.map((a, i) => (
             <tr key={i} className="transition hover:bg-stone-50/70">
              <TD className="px-5">
               <span className="flex items-center gap-2.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--accent-soft,#eafaf3)] text-[10px] font-semibold text-[var(--accent-ink,#0b7a5c)]">{initials(a.payee)}</span>
                <span className="font-medium text-stone-800">{a.payee}</span>
               </span>
              </TD>
              <TD className="px-4 text-stone-500">{a.type}</TD>
              <TD className="px-4 text-stone-600">{a.item}</TD>
              <TD right className="px-4 text-stone-500">{money(a.grossCents)}</TD>
              <TD right className="px-4"><span className="font-semibold text-[var(--accent-ink,#0b7a5c)]">+{money(a.netCents)}</span></TD>
              <TD className="px-5"><StatusPill tone={a.status === "payable" ? "live" : "pending"} dot={a.status === "payable"}>{a.status === "payable" ? "Payable" : "On hold"}</StatusPill></TD>
             </tr>
            ))}
           </tbody>
          </table>
         </div>
        )}
        <div className="flex items-center justify-end border-t border-stone-100 px-5 py-3">
         <TechButtonLink variant="secondary" href="/admin/consignment/payouts" className={cn("text-[12px]")}>Pay out consignors →</TechButtonLink>
        </div>
       </TechCard>
      </>
     )}
    </>
   )}
  </AdminPage>
 );
}
