"use client";

import { useEffect, useState, useCallback } from "react";
import { AdminPage, AdminHeader, TechCard, MetricCard, SegmentedControl, TH, TD } from "../../ui";

type ChannelRow = { channel: string; clicks: number; orders: number; sales: number; convPct: number; aov: number };
type Trend = { days: string[]; series: { channel: string; counts: number[] }[] };
type Attribution = { rows: ChannelRow[]; totals: { clicks: number; orders: number; sales: number; convPct: number; aov: number }; newCustomers: number; returningCustomers: number; trend?: Trend };

const TREND_COLORS = ["var(--accent,#0e9f76)", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6"];
function TrendChart({ days, series }: Trend) {
 if (!series.length || !days.length || series.every((s) => s.counts.every((c) => c === 0))) return null;
 const max = Math.max(1, ...series.flatMap((s) => s.counts));
 const W = 100, H = 36;
 const xAt = (i: number) => (days.length > 1 ? (i / (days.length - 1)) * W : 0);
 const yAt = (v: number) => H - (v / max) * H;
 return (
 <div className="mb-5">
 <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-28 w-full">
 {series.map((s, si) => (
 <polyline key={s.channel} fill="none" stroke={TREND_COLORS[si % TREND_COLORS.length]} strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" points={s.counts.map((c, i) => `${xAt(i)},${yAt(c)}`).join(" ")} />
 ))}
 </svg>
 <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
 {series.map((s, si) => (
 <span key={s.channel} className="flex items-center gap-1.5 text-[11px] text-stone-500"><i className="h-2 w-2 rounded-full" style={{ background: TREND_COLORS[si % TREND_COLORS.length] }} />{s.channel}</span>
 ))}
 </div>
 <div className="mt-0.5 flex justify-between text-[10px] text-stone-400"><span>{days[0]}</span><span>{days[days.length - 1]}</span></div>
 </div>
 );
}

export default function AudiencePage() {
 const [range, setRange] = useState<"30" | "all">("30");
 const [aud, setAud] = useState<Attribution | null>(null);

 const load = useCallback(async () => {
 try { const r = await fetch(`/api/store/audience?days=${range}`); if (r.ok) setAud(await r.json()); } catch { /* ignore */ }
 }, [range]);
 useEffect(() => { (async () => { await load(); })(); }, [load]);

 return (
 <AdminPage className="max-w-2xl">
 <AdminHeader
 eyebrow="Store · Marketing · Audience"
 title="Audience"
 subtitle="Where your shoppers come from — attribution by channel."
 actions={
 <SegmentedControl
 options={["30d", "All"]}
 value={range === "30" ? "30d" : "All"}
 onChange={(v) => setRange(v === "30d" ? "30" : "all")}
 />
 }
 />

 {aud && aud.totals.clicks > 0 && (
 <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
 <MetricCard label="Clicks" value={aud.totals.clicks.toLocaleString()} />
 <MetricCard label="Orders" value={aud.totals.orders.toLocaleString()} />
 <MetricCard label="Sales" value={`$${aud.totals.sales.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
 <MetricCard label="Conv" value={`${aud.totals.convPct}%`} />
 </div>
 )}

 <TechCard className="overflow-hidden">
 <div className="border-b border-stone-100 px-5 py-4">
 <p className="text-[13.5px] font-medium text-stone-900">By channel</p>
 <p className="mt-0.5 text-[12px] text-stone-400">Clicks, orders, revenue</p>
 </div>
 <div className="px-5 py-4">
 {!aud || aud.totals.clicks === 0 ? (
 <p className="py-6 text-center text-[13px] text-stone-400">No traffic data yet for this period. Once shoppers click through from your channels, you’ll see the breakdown here.</p>
 ) : (
 <>
 {aud.trend && <TrendChart {...aud.trend} />}
 <p className="mb-4 text-[13px] text-stone-600">
 <b className="text-stone-900 tabular-nums">{aud.newCustomers}</b> new · <b className="text-stone-900 tabular-nums">{aud.returningCustomers}</b> returning
 </p>
 <div className="overflow-x-auto">
 <table className="w-full text-[13px]">
 <thead>
 <tr>
 <TH className="pr-3">Channel</TH>
 <TH right className="px-3">Clicks</TH>
 <TH right className="px-3">Orders</TH>
 <TH right className="px-3">Sales</TH>
 <TH right className="px-3">Conv</TH>
 <TH right className="pl-3">AOV</TH>
 </tr>
 </thead>
 <tbody>
 {aud.rows.map((r) => (
 <tr key={r.channel}>
 <TD className="pr-3 font-medium text-stone-800">{r.channel}</TD>
 <TD right className="px-3">{r.clicks.toLocaleString()}</TD>
 <TD right className="px-3">{r.orders.toLocaleString()}</TD>
 <TD right className="px-3 text-stone-900">${r.sales.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TD>
 <TD right className="px-3">{r.convPct}%</TD>
 <TD right className="pl-3">${r.aov.toLocaleString()}</TD>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 <p className="pt-3 text-[11px] text-stone-400">VYA-attributed click-throughs + orders {range === "30" ? "in the last 30 days" : "all time"}.</p>
 </>
 )}
 </div>
 </TechCard>
 </AdminPage>
 );
}
