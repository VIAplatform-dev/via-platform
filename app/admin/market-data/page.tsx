"use client";

import { useState, useEffect } from "react";
import type {
 MarketSummary,
 DesignerStat,
 BrandStat,
 CategoryStat,
 PriceTierStat,
 StoreVelocityStat,
 WeeklyTrendPoint,
 RecentSale,
 PriceChangeEntry,
} from "@/app/lib/market-data-db";

type PlatformData = {
 gmvCur: number; gmvPrev: number;
 ordersCur: number; ordersPrev: number;
 newUsersCur: number; newUsersPrev: number; totalUsers: number;
 activeUsersCur: number; activeUsersPrev: number;
 repeatBuyers: number;
 topStoresByGmv: { store_name: string; store_slug: string; gmv: number; orders: number }[];
 dayOfWeek: { label: string; clicks: number; pct: number }[];
};

type DemandData = {
 totalClicks: number;
 uniqueUsers: number;
 storesActive: number;
 uniqueProducts: number;
 topProducts: { product_name: string; store_slug: string; clicks: number; unique_users: number }[];
 topStores: { store_slug: string; store_name: string; clicks: number; unique_users: number; unique_products: number }[];
 weeklyTrend: { week: string; clicks: number; unique_users: number }[];
 topDesigners: { designer: string; clicks: number; unique_users: number; unique_products: number }[];
};

type ConversionStore = { store_name: string; store_slug: string; gmv: number; orders: number; avg_order: number };
type RecentOrder = { conversion_id: string; store_name: string; store_slug: string; order_total: number; currency: string; timestamp: string; order_id: string };
type ConversionTier = { tier: string; count: number; total_gmv: number; avg_order: number };
type ConversionWeekPoint = { week: string; orders: number; gmv: number };

type MarketData = {
 summary: MarketSummary;
 designers: DesignerStat[];
 topBrands: BrandStat[];
 topCategories: CategoryStat[];
 tiers: PriceTierStat[];
 storeVelocity: StoreVelocityStat[];
 weeklyTrend: WeeklyTrendPoint[];
 recentSales: RecentSale[];
 priceChanges: PriceChangeEntry[];
 totalAllTime: number;
 platform: PlatformData;
 demand: DemandData;
 days: number;
 conversionStores: ConversionStore[];
 recentOrders: RecentOrder[];
 conversionTiers: ConversionTier[];
 conversionWeekly: ConversionWeekPoint[];
};

function fmt(n: number, currency = true) {
 if (currency) return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
 return new Intl.NumberFormat("en-US").format(n);
}

function fmtWeekLabel(dateStr: string) {
 const d = new Date(dateStr + "T00:00:00Z");
 return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function niceMax(v: number) {
 if (v <= 0) return 1;
 const mag = Math.pow(10, Math.floor(Math.log10(v)));
 const steps = [1, 2, 2.5, 5, 10];
 for (const s of steps) {
 if (s * mag >= v) return s * mag;
 }
 return 10 * mag;
}

function WeeklyChart({ rows, barColor = "#18181b", fmtY }: {
 rows: { week: string; value: number }[];
 barColor?: string;
 fmtY: (v: number) => string;
}) {
 const BAR_H = 130;
 const rawMax = Math.max(...rows.map((r) => r.value), 1);
 const yMax = niceMax(rawMax);
 const yMid = yMax / 2;
 const skipLabel = rows.length > 14;

 return (
 <div style={{ display: "flex", gap: 12 }}>
 {/* Y-axis */}
 <div style={{ width: 52, flexShrink: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", height: BAR_H, fontSize: 10, color: "#a1a1aa", textAlign: "right", paddingRight: 4 }}>
 <span>{fmtY(yMax)}</span>
 <span>{fmtY(yMid)}</span>
 <span>0</span>
 </div>
 {/* Bars + x labels */}
 <div style={{ flex: 1, minWidth: 0 }}>
 {/* Gridlines */}
 <div style={{ position: "relative", height: BAR_H, borderLeft: "1px solid #f4f4f5", borderBottom: "1px solid #f4f4f5" }}>
 <div style={{ position: "absolute", top: 0, left: 0, right: 0, borderTop: "1px dashed #f4f4f5" }} />
 <div style={{ position: "absolute", top: "50%", left: 0, right: 0, borderTop: "1px dashed #f4f4f5" }} />
 {/* Bars */}
 <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 3, padding: "0 2px" }}>
 {rows.map((r) => (
 <div
 key={r.week}
 title={fmtY(r.value)}
 style={{
 flex: 1,
 minWidth: 0,
 background: barColor,
 height: `${Math.max(2, (r.value / yMax) * 100)}%`,
 opacity: 0.6 + 0.4 * (r.value / yMax),
 transition: "height 0.2s",
 }}
 />
 ))}
 </div>
 </div>
 {/* X-axis labels */}
 <div style={{ display: "flex", gap: 3, marginTop: 4, padding: "0 2px" }}>
 {rows.map((r, i) => (
 <div key={r.week} style={{ flex: 1, minWidth: 0, fontSize: 9, color: "#a1a1aa", textAlign: "center", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "clip" }}>
 {skipLabel && i % 2 !== 0 ? "" : fmtWeekLabel(r.week)}
 </div>
 ))}
 </div>
 </div>
 </div>
 );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
 return (
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: "20px 24px" }}>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 6 }}>{label}</p>
 <p style={{ fontSize: 28, fontWeight: 600, color: "#09090b", marginBottom: sub ? 2 : 0 }}>{value}</p>
 {sub && <p style={{ fontSize: 12, color: "#71717a" }}>{sub}</p>}
 </div>
 );
}

function DeltaBadge({ cur, prev }: { cur: number; prev: number }) {
 if (!prev) return null;
 const pct = Math.round(((cur - prev) / prev) * 100);
 const up = cur >= prev;
 return (
 <span style={{ fontSize: 11, marginLeft: 8, color: up ? "#16a34a" : "#dc2626", fontWeight: 500 }}>
 {up ? "▲" : "▼"} {Math.abs(pct)}%
 </span>
 );
}

function BarChart({ rows, labelKey, valueKey, fmtValue }: {
 rows: Record<string, unknown>[];
 labelKey: string;
 valueKey: string;
 fmtValue?: (v: number) => string;
}) {
 const max = Math.max(...rows.map((r) => r[valueKey] as number), 1);
 return (
 <div style={{ display: "grid", gap: 8 }}>
 {rows.map((r, i) => {
 const val = r[valueKey] as number;
 const label = r[labelKey] as string;
 return (
 <div key={i}>
 <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
 <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>{label}</span>
 <span style={{ color: "#71717a", whiteSpace: "nowrap" }}>{fmtValue ? fmtValue(val) : fmt(val, false)}</span>
 </div>
 <div style={{ background: "#f4f4f5", height: 4 }}>
 <div style={{ background: "#18181b", height: 4, width: `${(val / max) * 100}%`, opacity: 0.75 }} />
 </div>
 </div>
 );
 })}
 </div>
 );
}

const PERIOD_OPTIONS = [
 { label: "30 days", value: 30 },
 { label: "90 days", value: 90 },
 { label: "180 days", value: 180 },
 { label: "All time", value: 3650 },
];

const TABS = ["overview", "demand", "platform", "designers", "tiers", "prices"] as const;
type Tab = typeof TABS[number];

export default function MarketDataPage() {
 const [data, setData] = useState<MarketData | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [backfilling, setBackfilling] = useState(false);
 const [backfillResult, setBackfillResult] = useState<string | null>(null);
 const [days, setDays] = useState(3650); // default: all time
 const [tab, setTab] = useState<Tab>("demand");

 useEffect(() => {
 setLoading(true);
 setError(null);
 fetch(`/api/admin/market-data?days=${days}`)
 .then((r) => r.json())
 .then((d) => {
 if (d?.error) { setError(d.error); setLoading(false); return; }
 if (!d?.summary) { setError(`Unexpected response: ${JSON.stringify(d)}`); setLoading(false); return; }
 setData(d);
 setLoading(false);
 })
 .catch((e) => { setError(String(e)); setLoading(false); });
 }, [days]);

 async function handleBackfill() {
 setBackfilling(true);
 setBackfillResult(null);
 try {
 const r = await fetch("/api/admin/market-data/backfill", { method: "POST" });
 const d = await r.json();
 if (d.error) { setBackfillResult(`Error: ${d.error}`); }
 else {
 setBackfillResult(`Done: ${d.inserted} items imported. Reloading…`);
 setTimeout(() => { setDays((v) => { fetch(`/api/admin/market-data?days=${v}`).then(r => r.json()).then(d => { if (!d?.error && d?.summary) setData(d); }); return v; }); }, 800);
 }
 } catch (e) {
 setBackfillResult(`Error: ${String(e)}`);
 }
 setBackfilling(false);
 }

 const tabLabel: Record<Tab, string> = {
 overview: "Overview", demand: "Demand", platform: "Platform",
 designers: "Designers", tiers: "Price Tiers", prices: "Price Changes",
 };

 const tabStyle = (t: Tab) => ({
 padding: "8px 16px",
 fontSize: 13,
 background: "transparent",
 color: tab === t ? "#09090b" : "#71717a",
 borderBottom: tab === t ? "2px solid #09090b" : "2px solid transparent",
 borderTop: "none",
 borderLeft: "none",
 borderRight: "none",
 cursor: "pointer",
 whiteSpace: "nowrap" as const,
 fontWeight: tab === t ? 500 : 400,
 });

 const noSellThrough = (
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 32, textAlign: "center" }}>
 <p style={{ fontSize: 16, color: "#09090b", marginBottom: 8 }}>No sell-through data yet</p>
 <p style={{ fontSize: 13, color: "#71717a" }}>
 Use &ldquo;Import from conversions&rdquo; above to backfill, or run a sync to capture as items sell.
 </p>
 </div>
 );

 return (
 <main style={{ background: "#f8f9fa", minHeight: "100vh" }}>

 <section style={{ background: "#fff", borderBottom: "1px solid #e4e4e7" }}>
 <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px 0" }}>
 <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
 <div>
 <h1 style={{ fontSize: 20, fontWeight: 600, color: "#09090b", marginBottom: 4 }}>Market Data</h1>
 <p style={{ fontSize: 14, color: "#71717a" }}>
 Sell-through, demand signals, and platform trends across all stores.
 {data && <span style={{ marginLeft: 8 }}>{fmt(data.totalAllTime, false)} sold items recorded.</span>}
 </p>
 {backfillResult && (
 <p style={{ fontSize: 12, color: backfillResult.startsWith("Error") ? "#dc2626" : "#16a34a", marginTop: 6 }}>
 {backfillResult}
 </p>
 )}
 </div>
 <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
 <div style={{ display: "flex", gap: 4 }}>
 {PERIOD_OPTIONS.map((o) => (
 <button
 key={o.value}
 onClick={() => setDays(o.value)}
 style={{
 padding: "6px 14px", fontSize: 12, borderRadius: 6, border: "1px solid",
 borderColor: days === o.value ? "#18181b" : "#e4e4e7",
 background: days === o.value ? "#18181b" : "#fff",
 color: days === o.value ? "#fff" : "#71717a",
 cursor: "pointer", fontWeight: 500,
 }}
 >
 {o.label}
 </button>
 ))}
 </div>
 <button
 onClick={handleBackfill}
 disabled={backfilling}
 style={{
 padding: "6px 14px", fontSize: 12, borderRadius: 6,
 border: "1px solid #e4e4e7", background: "#fff",
 color: backfilling ? "#a1a1aa" : "#09090b",
 cursor: backfilling ? "not-allowed" : "pointer", whiteSpace: "nowrap", fontWeight: 500,
 }}
 >
 {backfilling ? "Importing…" : "Import from conversions"}
 </button>
 </div>
 </div>

 <div style={{ display: "flex", gap: 0, borderTop: "1px solid #e4e4e7", overflowX: "auto" }}>
 {TABS.map((t) => (
 <button key={t} onClick={() => setTab(t)} style={tabStyle(t)}>{tabLabel[t]}</button>
 ))}
 </div>
 </div>
 </section>

 <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>
 {loading && <p style={{ color: "#a1a1aa", fontSize: 14 }}>Loading…</p>}

 {error && (
 <div style={{ background: "#fff", border: "1px solid #dc2626", borderRadius: 8, padding: 20 }}>
 <p style={{ color: "#dc2626", fontSize: 13, fontFamily: "monospace" }}>{error}</p>
 </div>
 )}

 {!loading && data && (
 <>
 {/* ── Overview ── */}
 {tab === "overview" && (() => {
 const totalGmv = data.platform.gmvCur;
 const totalOrders = data.platform.ordersCur;
 const avgOrder = totalOrders > 0 ? totalGmv / totalOrders : 0;
 const weekly = data.conversionWeekly ?? [];
 return (
 <div>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
 <StatCard label="Total GMV" value={fmt(totalGmv)} sub={days >= 3650 ? "All time" : `Last ${days} days`} />
 <StatCard label="Total Orders" value={fmt(totalOrders, false)} sub={days >= 3650 ? "All time" : `Last ${days} days`} />
 <StatCard label="Avg Order Value" value={avgOrder > 0 ? fmt(avgOrder) : "-"} sub="Per conversion" />
 </div>

 {weekly.length > 0 && (
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 24, marginBottom: 24 }}>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 16 }}>Weekly GMV</h2>
 <WeeklyChart
 rows={weekly.map((w) => ({ week: w.week, value: w.gmv }))}
 fmtY={(v) => fmt(v)}
 />
 </div>
 )}

 {(data.conversionStores ?? []).length > 0 && (
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 24 }}>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 16 }}>Top Stores by GMV</h2>
 <BarChart
 rows={(data.conversionStores ?? []).map((s) => ({ label: s.store_name, value: s.gmv, orders: s.orders }))}
 labelKey="label" valueKey="value"
 fmtValue={(v) => fmt(v)}
 />
 </div>
 )}
 </div>
 );
 })()}

 {/* ── Demand ── */}
 {tab === "demand" && (() => {
 const d = data.demand;
 return (
 <div style={{ display: "grid", gap: 24 }}>
 {/* Stats row */}
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
 <StatCard label="Product Views on VYA" value={fmt(d.totalClicks, false)} sub={days >= 3650 ? "All time" : `Last ${days} days`} />
 <StatCard label="Unique Shoppers" value={fmt(d.uniqueUsers, false)} sub="Logged-in users only. Most browsing is anonymous" />
 <StatCard label="Stores Browsed" value={fmt(d.storesActive, false)} sub="Active in period" />
 <StatCard label="Unique Products Viewed" value={fmt(d.uniqueProducts, false)} sub="Distinct items browsed" />
 </div>

 {/* Weekly click trend */}
 {d.weeklyTrend.length > 0 && (
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 24 }}>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 16 }}>Weekly Views on VYA</h2>
 <WeeklyChart
 rows={d.weeklyTrend.map((w) => ({ week: w.week, value: w.clicks }))}
 fmtY={(v) => fmt(v, false)}
 />
 </div>
 )}

 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
 {/* Top stores by traffic */}
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 24 }}>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 4 }}>Top Stores by Views</h2>
 <p style={{ fontSize: 12, color: "#71717a", marginBottom: 16 }}>Which stores shoppers browse most on VYA</p>
 {d.topStores.length === 0
 ? <p style={{ fontSize: 13, color: "#a1a1aa" }}>No click data yet.</p>
 : <BarChart
 rows={d.topStores.map(s => ({ label: s.store_name || s.store_slug, value: s.clicks }))}
 labelKey="label"
 valueKey="value"
 fmtValue={(v) => `${fmt(v, false)} views`}
 />
 }
 </div>

 {/* Most wanted products */}
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 24 }}>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 4 }}>Most-Viewed Items</h2>
 <p style={{ fontSize: 12, color: "#71717a", marginBottom: 16 }}>Products viewed most on VYA. Source more like these</p>
 {d.topProducts.length === 0
 ? <p style={{ fontSize: 13, color: "#a1a1aa" }}>No click data yet.</p>
 : (
 <div style={{ display: "grid", gap: 0, maxHeight: 380, overflowY: "auto" }}>
 {d.topProducts.slice(0, 20).map((p, i) => (
 <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 0", borderBottom: "1px solid #f4f4f5" }}>
 <div style={{ overflow: "hidden", marginRight: 12 }}>
 <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.product_name}</div>
 <div style={{ fontSize: 11, color: "#a1a1aa" }}>{p.store_slug}</div>
 </div>
 <div style={{ whiteSpace: "nowrap", textAlign: "right", color: "#71717a" }}>
 <div style={{ fontWeight: 600, color: "#09090b" }}>{fmt(p.clicks, false)} views</div>
 </div>
 </div>
 ))}
 </div>
 )
 }
 </div>
 </div>

 {/* Trending designers by click */}
 {d.topDesigners.length > 0 && (
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 24 }}>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 4 }}>Trending Designers / Brands</h2>
 <p style={{ fontSize: 12, color: "#71717a", marginBottom: 16 }}>Based on product views on VYA. Source more from these labels</p>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
 {d.topDesigners.map((des, i) => {
 const maxClicks = d.topDesigners[0]?.clicks ?? 1;
 return (
 <div key={i} style={{ padding: "12px 16px", background: "#fafafa", border: "1px solid #e4e4e7", borderRadius: 8 }}>
 <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
 <span style={{ fontWeight: 600, fontSize: 14 }}>{des.designer}</span>
 <span style={{ fontWeight: 600, color: "#09090b", fontSize: 14 }}>{fmt(des.clicks, false)} views</span>
 </div>
 <div style={{ background: "#e4e4e7", height: 3, marginBottom: 6 }}>
 <div style={{ background: "#18181b", height: 3, width: `${(des.clicks / maxClicks) * 100}%`, opacity: 0.7 }} />
 </div>
 <span style={{ fontSize: 11, color: "#a1a1aa" }}>{fmt(des.unique_products, false)} products listed</span>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* Full most-wanted table */}
 {d.topProducts.length > 20 && (
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, overflow: "hidden" }}>
 <div style={{ padding: "16px 20px", borderBottom: "1px solid #e4e4e7" }}>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500 }}>All Most-Viewed Products</h2>
 </div>
 <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
 <thead>
 <tr style={{ background: "#fafafa", borderBottom: "1px solid #e4e4e7" }}>
 {["#", "Product", "Store", "Views"].map((h) => (
 <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500 }}>{h}</th>
 ))}
 </tr>
 </thead>
 <tbody>
 {d.topProducts.map((p, i) => (
 <tr key={i} style={{ borderBottom: "1px solid #f4f4f5" }}
 onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
 onMouseLeave={(e) => (e.currentTarget.style.background = "")}
 >
 <td style={{ padding: "8px 16px", color: "#a1a1aa", fontSize: 12 }}>{i + 1}</td>
 <td style={{ padding: "8px 16px", fontWeight: 500 }}>{p.product_name}</td>
 <td style={{ padding: "8px 16px", color: "#71717a" }}>{p.store_slug}</td>
 <td style={{ padding: "8px 16px", fontWeight: 600, color: "#09090b" }}>{fmt(p.clicks, false)}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>
 );
 })()}

 {/* ── Platform ── */}
 {tab === "platform" && (() => {
 const p = data.platform;
 return (
 <div style={{ display: "grid", gap: 24 }}>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
 {[
 { label: "GMV", cur: p.gmvCur, prev: p.gmvPrev, isCurrency: true },
 { label: "Orders", cur: p.ordersCur, prev: p.ordersPrev, isCurrency: false },
 { label: "New Users", cur: p.newUsersCur, prev: p.newUsersPrev, isCurrency: false },
 { label: "Active Users", cur: p.activeUsersCur, prev: p.activeUsersPrev, isCurrency: false },
 ].map((kpi) => (
 <div key={kpi.label} style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: "20px 24px" }}>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 6 }}>{kpi.label}</p>
 <p style={{ fontSize: 26, fontWeight: 600, color: "#09090b" }}>
 {kpi.isCurrency ? fmt(kpi.cur) : fmt(kpi.cur, false)}
 <DeltaBadge cur={kpi.cur} prev={kpi.prev} />
 </p>
 <p style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>
 vs {kpi.isCurrency ? fmt(kpi.prev) : fmt(kpi.prev, false)} prior period
 </p>
 </div>
 ))}
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: "20px 24px" }}>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 6 }}>Repeat Buyers</p>
 <p style={{ fontSize: 26, fontWeight: 600, color: "#09090b" }}>{fmt(p.repeatBuyers, false)}</p>
 <p style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>Bought before + during period</p>
 </div>
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: "20px 24px" }}>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 6 }}>Total Users</p>
 <p style={{ fontSize: 26, fontWeight: 600, color: "#09090b" }}>{fmt(p.totalUsers, false)}</p>
 <p style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>All time</p>
 </div>
 </div>

 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 24 }}>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 16 }}>Top Stores by GMV</h2>
 {p.topStoresByGmv.length === 0
 ? <p style={{ fontSize: 13, color: "#a1a1aa" }}>No conversion data yet.</p>
 : <BarChart
 rows={p.topStoresByGmv.map(s => ({ label: s.store_name, value: s.gmv }))}
 labelKey="label" valueKey="value"
 fmtValue={(v) => fmt(v)}
 />
 }
 </div>

 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 24 }}>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 16 }}>Clicks by Day of Week</h2>
 {p.dayOfWeek.length === 0
 ? <p style={{ fontSize: 13, color: "#a1a1aa" }}>No data.</p>
 : (
 <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 100 }}>
 {p.dayOfWeek.map((d) => (
 <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
 <div style={{ width: "100%", background: "#18181b", height: `${Math.max(4, d.pct)}px`, opacity: 0.6 + 0.4 * (d.pct / 100) }} />
 <span style={{ fontSize: 10, color: "#a1a1aa" }}>{d.label}</span>
 </div>
 ))}
 </div>
 )
 }
 </div>
 </div>
 </div>
 );
 })()}

 {/* ── Designers ── */}
 {tab === "designers" && (() => {
 const brands = data.topBrands ?? [];
 const categories = data.topCategories ?? [];
 const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
 const thStyle: React.CSSProperties = { padding: "10px 16px", textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500 };
 const tdBase: React.CSSProperties = { padding: "10px 16px" };
 const engCol = (n: number) => (
 <td style={{ ...tdBase, color: n > 0 ? "#09090b" : "#d4d4d8" }}>{n > 0 ? fmt(n, false) : "-"}</td>
 );

 const InventoryTable = ({ label, note, nameKey, rows }: {
 label: string; note: string; nameKey: string;
 rows: { name: string; items: number; avgPrice: number; minPrice: number; maxPrice: number; totalValue: number; clicks: number; hearts: number; purchases: number }[];
 }) => (
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, overflow: "hidden" }}>
 <div style={{ padding: "14px 20px", borderBottom: "1px solid #e4e4e7", background: "#fafafa" }}>
 <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#09090b" }}>{label}</p>
 <p style={{ margin: "2px 0 0", fontSize: 12, color: "#a1a1aa" }}>{note}</p>
 </div>
 {rows.length === 0 ? (
 <p style={{ padding: "20px", color: "#a1a1aa", fontSize: 13 }}>No data yet.</p>
 ) : (
 <table style={tableStyle}>
 <thead>
 <tr style={{ borderBottom: "1px solid #e4e4e7" }}>
 <th style={thStyle}>{nameKey}</th>
 {["Items", "Clicks", "Hearts", "Purchases", "Avg Price", "Min", "Max", "Total Value"].map((h) => (
 <th key={h} style={thStyle}>{h}</th>
 ))}
 </tr>
 </thead>
 <tbody>
 {rows.map((r) => (
 <tr key={r.name} style={{ borderBottom: "1px solid #f4f4f5" }}
 onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
 onMouseLeave={(e) => (e.currentTarget.style.background = "")}
 >
 <td style={{ ...tdBase, fontWeight: 500 }}>{r.name}</td>
 <td style={tdBase}>{fmt(r.items, false)}</td>
 {engCol(r.clicks)}
 {engCol(r.hearts)}
 {engCol(r.purchases)}
 <td style={tdBase}>{fmt(r.avgPrice)}</td>
 <td style={{ ...tdBase, color: "#71717a" }}>{fmt(r.minPrice)}</td>
 <td style={{ ...tdBase, color: "#71717a" }}>{fmt(r.maxPrice)}</td>
 <td style={{ ...tdBase, fontWeight: 600, color: "#09090b" }}>{fmt(r.totalValue)}</td>
 </tr>
 ))}
 </tbody>
 </table>
 )}
 </div>
 );

 return (
 <div style={{ display: "grid", gap: 24 }}>
 <InventoryTable
 label="Designers / Brands"
 note="From Shopify vendor field. Sorted by most viewed on VYA"
 nameKey="Designer"
 rows={brands.map((b) => ({ name: b.brand, ...b }))}
 />
 <InventoryTable
 label="Categories"
 note="From Shopify product type field. Sorted by most viewed on VYA"
 nameKey="Category"
 rows={categories.map((c) => ({ name: c.category, ...c }))}
 />
 </div>
 );
 })()}

 {/* ── Price Tiers ── */}
 {tab === "tiers" && (() => {
 const tiers = data.conversionTiers ?? [];
 if (tiers.length === 0) return <p style={{ color: "#a1a1aa", fontSize: 13 }}>No order data yet.</p>;
 const maxCount = Math.max(...tiers.map((t) => t.count), 1);
 return (
 <div style={{ display: "grid", gap: 16 }}>
 {tiers.map((t) => (
 <div key={t.tier} style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 20 }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
 <span style={{ fontWeight: 600, fontSize: 15 }}>{t.tier}</span>
 <div style={{ display: "flex", gap: 24, fontSize: 13, color: "#71717a" }}>
 <span><strong style={{ color: "#09090b" }}>{t.count}</strong> orders</span>
 <span><strong style={{ color: "#09090b" }}>{fmt(t.avg_order)}</strong> avg order</span>
 <span style={{ fontWeight: 600, color: "#09090b" }}>{fmt(t.total_gmv)} GMV</span>
 </div>
 </div>
 <div style={{ background: "#f4f4f5", height: 6, borderRadius: 3 }}>
 <div style={{ background: "#18181b", height: 6, borderRadius: 3, width: `${(t.count / maxCount) * 100}%`, opacity: 0.8 }} />
 </div>
 </div>
 ))}
 </div>
 );
 })()}



 {/* ── Price Changes ── */}
 {tab === "prices" && (
 <div>
 <p style={{ fontSize: 13, color: "#71717a", marginBottom: 16 }}>Price drops detected at sync time across all stores.</p>
 {data.priceChanges.length === 0
 ? <p style={{ color: "#a1a1aa", fontSize: 13 }}>No price drops recorded yet.</p>
 : (
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, overflow: "hidden" }}>
 <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
 <thead>
 <tr style={{ background: "#fafafa", borderBottom: "1px solid #e4e4e7" }}>
 {["Item", "Designer", "Was", "Now", "Drop", "Date"].map((h) => (
 <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500 }}>{h}</th>
 ))}
 </tr>
 </thead>
 <tbody>
 {data.priceChanges.map((p, i) => (
 <tr key={p.id} style={{ borderBottom: "1px solid #f4f4f5" }}
 onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
 onMouseLeave={(e) => (e.currentTarget.style.background = "")}
 >
 <td style={{ padding: "10px 16px", maxWidth: 280 }}>
 <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
 <div style={{ fontSize: 11, color: "#a1a1aa" }}>{p.storeSlug}</div>
 </td>
 <td style={{ padding: "10px 16px", color: "#71717a" }}>{p.designer ?? "-"}</td>
 <td style={{ padding: "10px 16px", color: "#a1a1aa", textDecoration: "line-through" }}>{fmt(p.oldPrice)}</td>
 <td style={{ padding: "10px 16px", fontWeight: 600 }}>{fmt(p.newPrice)}</td>
 <td style={{ padding: "10px 16px", color: "#dc2626", fontWeight: 600 }}>
 -{fmt(Math.abs(p.priceDelta))} ({Math.round(Math.abs(p.priceDelta) / p.oldPrice * 100)}%)
 </td>
 <td style={{ padding: "10px 16px", color: "#71717a", whiteSpace: "nowrap" }}>
 {new Date(p.changedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )
 }
 </div>
 )}
 </>
 )}
 </div>
 </main>
 );
}
