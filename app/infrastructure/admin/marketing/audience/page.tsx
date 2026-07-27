"use client";

import { useEffect, useState, useCallback } from "react";
import { AdminPage, AdminHeader, TechCard, MetricCard, SegmentedControl, TH, TD } from "../../ui";

type ChannelRow = { channel: string; clicks: number; orders: number; sales: number; convPct: number; aov: number };
type Trend = { days: string[]; series: { channel: string; counts: number[] }[] };
type Traffic = { total: number; byType: { type: string; sessions: number }[]; topSources: { source: string; type: string; sessions: number }[] };
type TopPages = { total: number; byType: { type: string; views: number }[]; pages: { path: string; type: string; title: string | null; views: number; visitors: number }[] };
type Attribution = { rows: ChannelRow[]; totals: { clicks: number; orders: number; sales: number; convPct: number; aov: number }; newCustomers: number; returningCustomers: number; trend?: Trend; traffic?: Traffic; topPages?: TopPages };

// Semantic colour per source type — search vs social vs marketplace read at a glance.
const TYPE_COLOR: Record<string, string> = { Marketplace: "var(--accent,#0e9f76)", Search: "#0ea5e9", Social: "#8b5cf6", Direct: "#78716c", Referral: "#f59e0b", Email: "#10b981", Paid: "#ef4444" };

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
 subtitle="How shoppers find your store — search, social & referrals — plus what converts."
 actions={
 <SegmentedControl
 options={["30d", "All"]}
 value={range === "30" ? "30d" : "All"}
 onChange={(v) => setRange(v === "30d" ? "30" : "all")}
 />
 }
 />

 {/* Where visitors come from — the headline answer, referrer-classified per store (no UTM needed). */}
 {aud?.traffic && aud.traffic.total > 0 && (
 <TechCard className="mb-5 overflow-hidden">
 <div className="border-b border-stone-100 px-5 py-4">
 <p className="text-[13.5px] font-medium text-stone-900">Where visitors come from</p>
 <p className="mt-0.5 text-[12px] text-stone-400">{aud.traffic.total.toLocaleString()} storefront visit{aud.traffic.total === 1 ? "" : "s"} · classified by search, social &amp; referrals</p>
 </div>
 <div className="space-y-2.5 px-5 py-4">
 {aud.traffic.byType.map((t) => {
 const pct = Math.round((t.sessions / aud.traffic!.total) * 100);
 return (
 <div key={t.type} className="flex items-center gap-3">
 <span className="w-16 shrink-0 text-[12px] font-medium text-stone-600">{t.type}</span>
 <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
 <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: TYPE_COLOR[t.type] || "#78716c" }} />
 </div>
 <span className="w-24 shrink-0 text-right text-[12px] tabular-nums text-stone-500">{t.sessions.toLocaleString()} · {pct}%</span>
 </div>
 );
 })}
 {aud.traffic.topSources.length > 0 && (
 <div className="pt-2.5">
 <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-stone-400">Top sources</p>
 <div className="flex flex-wrap gap-1.5">
 {aud.traffic.topSources.map((s) => (
 <span key={`${s.source}-${s.type}`} className="inline-flex items-center gap-1.5 rounded-full bg-stone-50 px-2.5 py-1 text-[12px] text-stone-700 ring-1 ring-stone-200">
 <i className="h-1.5 w-1.5 rounded-full" style={{ background: TYPE_COLOR[s.type] || "#78716c" }} />
 {s.source} <span className="tabular-nums text-stone-400">{s.sessions.toLocaleString()}</span>
 </span>
 ))}
 </div>
 </div>
 )}
 </div>
 </TechCard>
 )}

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

 {/* Top pages — what shoppers actually browse, across the marketplace + the store's own storefront. */}
 {aud?.topPages && aud.topPages.total > 0 && (
 <TechCard className="mt-5 overflow-hidden">
 <div className="border-b border-stone-100 px-5 py-4">
 <p className="text-[13.5px] font-medium text-stone-900">Top pages</p>
 <p className="mt-0.5 text-[12px] text-stone-400">{aud.topPages.total.toLocaleString()} page view{aud.topPages.total === 1 ? "" : "s"} · what shoppers browse</p>
 </div>
 <div className="px-5 py-4">
 {aud.topPages.byType.length > 0 && (
 <div className="mb-3 flex flex-wrap gap-1.5">
 {aud.topPages.byType.map((t) => (
 <span key={t.type} className="inline-flex items-center gap-1.5 rounded-full bg-stone-50 px-2.5 py-1 text-[12px] text-stone-600 ring-1 ring-stone-200">
 <span className="capitalize">{t.type}</span> <span className="tabular-nums text-stone-400">{t.views.toLocaleString()}</span>
 </span>
 ))}
 </div>
 )}
 <div className="overflow-x-auto">
 <table className="w-full text-[13px]">
 <thead>
 <tr>
 <TH className="pr-3">Page</TH>
 <TH className="px-3">Type</TH>
 <TH right className="px-3">Views</TH>
 <TH right className="pl-3">Visitors</TH>
 </tr>
 </thead>
 <tbody>
 {aud.topPages.pages.map((p) => (
 <tr key={`${p.path}-${p.type}`}>
 <TD className="max-w-[240px] truncate pr-3 font-medium text-stone-800">{p.title || p.path}</TD>
 <TD className="px-3 capitalize text-stone-500">{p.type}</TD>
 <TD right className="px-3">{p.views.toLocaleString()}</TD>
 <TD right className="pl-3">{p.visitors.toLocaleString()}</TD>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 <p className="pt-3 text-[11px] text-stone-400">Marketplace + storefront page views {range === "30" ? "in the last 30 days" : "all time"}.</p>
 </div>
 </TechCard>
 )}
 </AdminPage>
 );
}
