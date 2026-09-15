"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const DARK = "#09090b";
const GRAY = "#71717a";
const MUTED_TEXT = "#a1a1aa";
const BORDER = "#e4e4e7";
const BG_CARD = "#ffffff";
const UP_COLOR = "#16a34a";
const UP_BG = "#f0fdf4";
const DN_COLOR = "#dc2626";
const DN_BG = "#fef2f2";
const PRIMARY_BTN = "#18181b";

function fmt$(n: number) {
 return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtPct(n: number) {
 return (n * 100).toFixed(1) + "%";
}
function fmtNum(n: number) {
 return new Intl.NumberFormat("en-US").format(Math.round(n));
}

type Trend = "up" | "down" | "flat";
function trend(current: number, prev: number): Trend {
 if (prev === 0) return current > 0 ? "up" : "flat";
 const delta = (current - prev) / prev;
 if (delta > 0.02) return "up";
 if (delta < -0.02) return "down";
 return "flat";
}
function trendLabel(current: number, prev: number, fmtFn: (n: number) => string) {
 if (prev === 0) return null;
 const delta = current - prev;
 const pct = ((current - prev) / prev) * 100;
 // Cap at ±999% larger swings mean the comparison window has bad/missing data
 if (Math.abs(pct) > 999) return null;
 const sign = delta >= 0 ? "+" : "";
 return `${sign}${fmtFn(delta)} (${sign}${pct.toFixed(0)}%) vs prev period`;
}

function TrendBadge({ current, prev, fmtFn }: { current: number; prev: number; fmtFn: (n: number) => string }) {
 const t = trend(current, prev);
 if (t === "flat" || prev === 0) return null;
 const label = trendLabel(current, prev, fmtFn);
 const color = t === "up" ? UP_COLOR : DN_COLOR;
 const bg = t === "up" ? UP_BG : DN_BG;
 const arrow = t === "up" ? "↑" : "↓";
 return (
 <span style={{ fontSize: 11, background: bg, color, padding: "2px 7px", borderRadius: 4, fontWeight: 500 }}>
 {arrow} {label}
 </span>
 );
}

function MetricCard({
 label,
 value,
 sub,
 trend: trendEl,
 note,
 wide,
 href,
}: {
 label: string;
 value: string;
 sub?: string;
 trend?: React.ReactNode;
 note?: string;
 wide?: boolean;
 href?: string;
}) {
 const inner = (
 <>
 <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, margin: 0 }}>{label}</p>
 {href && <span style={{ fontSize: 11, color: MUTED_TEXT }}>→</span>}
 </div>
 <p style={{ fontSize: 32, fontWeight: 600, color: DARK, margin: 0, lineHeight: 1 }}>{value}</p>
 {sub && <p style={{ fontSize: 12, color: GRAY, margin: 0 }}>{sub}</p>}
 {trendEl && <div style={{ marginTop: 2 }}>{trendEl}</div>}
 {note && <p style={{ fontSize: 11, color: MUTED_TEXT, margin: 0, marginTop: 4, borderTop: `1px solid #f4f4f5`, paddingTop: 8 }}>{note}</p>}
 </>
 );
 const cardStyle: React.CSSProperties = {
 background: BG_CARD,
 border: `1px solid ${BORDER}`,
 borderRadius: 8,
 padding: "24px 28px",
 display: "flex",
 flexDirection: "column",
 gap: 6,
 gridColumn: wide ? "span 2" : undefined,
 textDecoration: "none",
 color: "inherit",
 transition: "box-shadow 0.15s, border-color 0.15s",
 cursor: href ? "pointer" : "default",
 };
 if (href) {
 return (
 <Link href={href} style={cardStyle} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 8px rgba(0,0,0,0.06)"; (e.currentTarget as HTMLElement).style.borderColor = "#d4d4d8"; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = ""; (e.currentTarget as HTMLElement).style.borderColor = BORDER; }}>
 {inner}
 </Link>
 );
 }
 return <div style={cardStyle}>{inner}</div>;
}

function WeeklyGmvChart({ data }: { data: { week: string; gmv: number }[] }) {
 if (data.length < 2) return null;
 const max = Math.max(...data.map((d) => d.gmv), 1);
 const W = 600, BAR_H = 90, LABEL_TOP = 22, LABEL_BOT = 20;
 const TOTAL_H = LABEL_TOP + BAR_H + LABEL_BOT;
 const slotW = W / data.length;
 const barW = slotW * 0.55;
 return (
 <svg viewBox={`0 0 ${W} ${TOTAL_H}`} style={{ width: "100%", display: "block" }} aria-hidden>
 {/* Baseline */}
 <line x1={0} y1={LABEL_TOP + BAR_H} x2={W} y2={LABEL_TOP + BAR_H} stroke="#e4e4e7" strokeWidth={1} />
 {data.map((d, i) => {
 const barH = Math.max((d.gmv / max) * BAR_H, d.gmv > 0 ? 3 : 0);
 const x = i * slotW + (slotW - barW) / 2;
 const y = LABEL_TOP + BAR_H - barH;
 const isLatest = i === data.length - 1;
 const rawDate = d.week.includes("T") ? d.week : d.week + "T00:00:00Z";
 const dateLabel = new Date(rawDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
 const valueLabel = d.gmv >= 1000 ? `$${(d.gmv / 1000).toFixed(1)}k` : d.gmv > 0 ? `$${Math.round(d.gmv)}` : "";
 return (
 <g key={i}>
 <rect x={x} y={y} width={barW} height={barH} fill={isLatest ? PRIMARY_BTN : "#d4d4d8"} rx={2} />
 {d.gmv > 0 && (
 <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize={9} fill={isLatest ? DARK : MUTED_TEXT} fontFamily="system-ui, sans-serif" fontWeight={isLatest ? 600 : 400}>
 {valueLabel}
 </text>
 )}
 <text x={x + barW / 2} y={LABEL_TOP + BAR_H + 14} textAnchor="middle" fontSize={9} fill={isLatest ? DARK : MUTED_TEXT} fontFamily="system-ui, sans-serif" fontWeight={isLatest ? 600 : 400}>
 {dateLabel}
 </text>
 </g>
 );
 })}
 </svg>
 );
}

type Metrics = {
 gmv: { total: number; last7d: number; prev7d: number; last30d: number; prev30d: number };
 clicks?: { total: number; last7d: number; prev7d: number; last30d: number; prev30d: number };
 totalOrders: { allTime: number; last7d: number; prev7d: number; last30d: number; prev30d: number };
 conversionRate: { allTime: number; last7d: number; prev7d: number; totalVisitors: number; totalConversions: number; periodVisitors: number; periodConversions: number; periodRate: number };
 wau: { current: number; prev: number };
 mau: { current: number; prev: number; totalEverActive: number; rolling30d?: number };
 stickiness: { current: number; prev: number; mauUsed?: number };
 returningUsers: { last7d: number; last30d: number };
 buyerRetention: { totalBuyers: number; returnedAfterPurchase: number; boughtAgain: number; returnRate: number | null; repeatPurchaseRate: number | null };
 retentionByWindow: { window: string; label: string; cohort: number; retained: number; rate: number | null }[];
 saveToPurchase: { rate: number; totalSavers: number; saversBought: number };
 revenuePerUser: { value: number; orders: number; buyingUsers: number; allTimeValue: number; allTimeOrders: number; allTimeBuyingUsers: number; prevPeriodValue?: number; prevPeriodOrders?: number; prevPeriodBuyingUsers?: number };
 gmvByWeek: { week: string; gmv: number }[];
 totalCommission: number;
 users: { registered: number; waitlist: number; approved: number };
 newUsers?: { period: number; prevPeriod: number; week: number; prevWeek: number };
 favoritesVolume?: { period: number; prevPeriod: number; week: number; prevWeek: number };
 waitlistByMonth: { month: string; signups: number; approved: number }[];
 activityBreakdown?: { clickers: number; productSavers: number; storeSavers: number; buyers: number };
 emailCtr?: { opens7d: number; clicks7d: number; delivered7d: number; ctr7d: number; opensPrev7d: number; clicksPrev7d: number; ctrPrev7d: number; opensPeriod: number; clicksPeriod: number; deliveredPeriod: number; ctrPeriod: number; opensAll: number; clicksAll: number; deliveredAll: number; ctrAll: number };
 emailSales?: { ordersPeriod: number; revenuePeriod: number; ordersAll: number; revenueAll: number };
 approvalToPurchase?: { buyers: number; avgDays: number | null; medianDays: number | null };
 period?: { start: string; end: string; isMonth: boolean; isAllTime: boolean; label: string };
};

// Launch date: March 19, 2026
const LAUNCH_YEAR = 2026;
const LAUNCH_MONTH = 3; // March (1-indexed)

function getMonthOptions() {
 const now = new Date();
 const options: { label: string; value: string }[] = [
 { label: "All Time", value: "alltime" },
 ];
 // Generate months from current back to March 2026
 let y = now.getUTCFullYear();
 let m = now.getUTCMonth() + 1; // 1-indexed
 while (y > LAUNCH_YEAR || (y === LAUNCH_YEAR && m >= LAUNCH_MONTH)) {
 const value = `${y}-${String(m).padStart(2, "0")}`;
 const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
 options.push({ label, value });
 m--;
 if (m === 0) { m = 12; y--; }
 }
 options.push({ label: "Rolling (30d)", value: "" });
 return options;
}

export default function KeyMetricsPage() {
 const [data, setData] = useState<Metrics | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [selectedMonth, setSelectedMonth] = useState("");
 const monthOptions = getMonthOptions();

 useEffect(() => {
 setLoading(true);
 setData(null);
 const url = selectedMonth === "alltime"
 ? "/api/admin/key-metrics?alltime=true"
 : selectedMonth
 ? `/api/admin/key-metrics?month=${selectedMonth}`
 : "/api/admin/key-metrics";
 fetch(url)
 .then((r) => {
 if (r.status === 401) { window.location.href = "/admin/login"; throw new Error("Unauthorized"); }
 return r.json();
 })
 .then((d) => { setData(d); setLoading(false); })
 .catch((e) => { setError(e.message); setLoading(false); });
 }, [selectedMonth]);

 return (
 <div style={{ minHeight: "100vh", background: "#f8f9fa", fontFamily: "system-ui, sans-serif" }}>
 <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
 <div style={{ marginBottom: 24 }}>
 <h1 style={{ fontSize: 22, fontWeight: 600, color: DARK, margin: 0 }}>Key Metrics</h1>
 <p style={{ fontSize: 13, color: GRAY, margin: "6px 0 16px" }}>Platform health at a glance. Trends compare to the previous equivalent period.</p>
 <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
 {monthOptions.map((opt) => (
 <button
 key={opt.value}
 onClick={() => setSelectedMonth(opt.value)}
 style={{
 padding: "5px 12px",
 borderRadius: 6,
 border: `1px solid ${selectedMonth === opt.value ? PRIMARY_BTN : BORDER}`,
 background: selectedMonth === opt.value ? PRIMARY_BTN : "#fff",
 color: selectedMonth === opt.value ? "#fff" : GRAY,
 fontSize: 12,
 fontWeight: selectedMonth === opt.value ? 500 : 400,
 cursor: "pointer",
 transition: "all 0.15s",
 }}
 >
 {opt.label}
 </button>
 ))}
 </div>
 </div>

 {loading && (
 <div style={{ textAlign: "center", padding: 80, color: MUTED_TEXT }}>Loading…</div>
 )}
 {error && !loading && (
 <div style={{ textAlign: "center", padding: 80, color: DN_COLOR }}>{error}</div>
 )}

 {data && (
 <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

 {/* ── All-Time Totals ──────────────────────────────────── */}
 {data.period?.isAllTime && (
 <section>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, fontWeight: 500, margin: "0 0 14px" }}>All-Time Totals</h2>
 <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "24px 28px" }}>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "20px 32px", marginBottom: 24 }}>
 {[
 { label: "Total GMV", value: fmt$(data.gmv.total), note: "All orders attributed to VYA since launch" },
 { label: "Total Orders", value: fmtNum(data.totalOrders.allTime), note: "Orders placed through VYA links" },
 { label: "Total Commission", value: fmt$(data.totalCommission), note: "VYA earnings at 7/5/3% tiers" },
 { label: "Total Clicks", value: fmtNum(data.clicks?.total ?? 0), note: "Product link clicks since launch" },
 { label: "Registered Users", value: fmtNum(data.users.registered), note: "Created a VYA account" },
 { label: "Ever Active", value: fmtNum(data.mau.totalEverActive), note: "Clicked, saved, or ordered at least once" },
 { label: "Waitlist Total", value: fmtNum(data.users.waitlist), note: "Total waitlist signups since launch" },
 { label: "Total Favorites", value: fmtNum(data.favoritesVolume?.period ?? 0), note: "Products saved to wishlists since launch" },
 ].map(({ label, value, note }) => (
 <div key={label}>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED_TEXT, margin: "0 0 4px", fontWeight: 500 }}>{label}</p>
 <p style={{ fontSize: 28, fontWeight: 700, color: DARK, margin: "0 0 4px", lineHeight: 1 }}>{value}</p>
 <p style={{ fontSize: 11, color: GRAY, margin: 0 }}>{note}</p>
 </div>
 ))}
 </div>
 <div style={{ borderTop: `1px solid #f4f4f5`, paddingTop: 20 }}>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, margin: "0 0 14px", fontWeight: 500 }}>Current Pulse</p>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px 32px" }}>
 {[
 { label: "WAU (last 7d)", value: fmtNum(data.wau.current) },
 { label: "MAU", value: fmtNum(data.mau.current) },
 { label: "Stickiness", value: fmtPct(data.stickiness.current) },
 { label: "Rev / Buying User", value: fmt$(data.revenuePerUser.allTimeValue) },
 ].map(({ label, value }) => (
 <div key={label}>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED_TEXT, margin: "0 0 3px", fontWeight: 500 }}>{label}</p>
 <p style={{ fontSize: 22, fontWeight: 700, color: DARK, margin: 0, lineHeight: 1 }}>{value}</p>
 </div>
 ))}
 </div>
 </div>
 <p style={{ fontSize: 11, color: MUTED_TEXT, margin: "16px 0 0", borderTop: `1px solid #f4f4f5`, paddingTop: 10 }}>
 Cumulative totals since launch (March 19, 2026). Current Pulse reflects the most recent rolling windows.
 </p>
 </div>
 </section>
 )}

 {/* ── Growth at a Glance ──────────────────────────────── */}
 {!data.period?.isAllTime && (() => {
 const isMonth = data.period?.isMonth;
 const periodGmv = isMonth ? data.gmv.last30d : data.gmv.last30d;
 const prevGmv = isMonth ? data.gmv.prev30d : data.gmv.prev30d;
 const periodOrders = isMonth ? data.totalOrders.last30d : data.totalOrders.last30d;
 const prevOrders = isMonth ? data.totalOrders.prev30d : data.totalOrders.prev30d;

 const metrics: { label: string; current: number; prev: number; fmt: (n: number) => string; note?: string }[] = [
 { label: "GMV", current: periodGmv, prev: prevGmv, fmt: fmt$ },
 { label: "Orders", current: periodOrders, prev: prevOrders, fmt: fmtNum },
 { label: "New Users", current: data.newUsers?.period ?? 0, prev: data.newUsers?.prevPeriod ?? 0, fmt: fmtNum },
 { label: "Clicks", current: data.clicks?.last30d ?? 0, prev: data.clicks?.prev30d ?? 0, fmt: fmtNum },
 { label: "WAU", current: data.wau.current, prev: data.wau.prev, fmt: fmtNum },
 { label: "MAU", current: data.mau.current, prev: data.mau.prev, fmt: fmtNum },
 { label: "Stickiness", current: data.stickiness.current, prev: data.stickiness.prev, fmt: fmtPct, note: `${fmtNum(data.wau.current)} WAU ÷ ${fmtNum(data.stickiness.mauUsed ?? data.mau.current)} MAU` },
 { label: "Rev / Buyer", current: data.revenuePerUser.value, prev: data.revenuePerUser.prevPeriodValue ?? 0, fmt: fmt$ },
 { label: "Favorites", current: data.favoritesVolume?.period ?? 0, prev: data.favoritesVolume?.prevPeriod ?? 0, fmt: fmtNum },
 ];

 return (
 <section>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, fontWeight: 500, margin: "0 0 14px" }}>
 Growth at a Glance. {data.period?.label ?? "This Period"} vs Previous Period
 </h2>
 <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "24px 28px" }}>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px 32px" }}>
 {metrics.map(({ label, current, prev, fmt, note }) => {
 const hasPrev = prev > 0 || current > 0;
 const rawPct = prev > 0 ? ((current - prev) / prev) * 100 : null;
 const pctLabel = rawPct === null ? null : `${rawPct >= 0 ? "+" : ""}${rawPct.toFixed(1)}%`;
 const pctColor = rawPct === null ? GRAY : rawPct > 2 ? UP_COLOR : rawPct < -2 ? DN_COLOR : GRAY;
 const pctBg = rawPct === null ? "transparent" : rawPct > 2 ? UP_BG : rawPct < -2 ? DN_BG : "transparent";
 return (
 <div key={label} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
 <div>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED_TEXT, margin: "0 0 3px", fontWeight: 500 }}>{label}</p>
 <p style={{ fontSize: 22, fontWeight: 700, color: DARK, margin: 0, lineHeight: 1 }}>{fmt(current)}</p>
 {hasPrev && <p style={{ fontSize: 11, color: GRAY, margin: "3px 0 0" }}>prev {fmt(prev)}</p>}
 {note && <p style={{ fontSize: 11, color: MUTED_TEXT, margin: "2px 0 0" }}>{note}</p>}
 </div>
 {pctLabel && (
 <span style={{ fontSize: 13, fontWeight: 700, color: pctColor, background: pctBg, padding: "3px 8px", borderRadius: 5, whiteSpace: "nowrap", marginTop: 2 }}>
 {pctLabel}
 </span>
 )}
 </div>
 );
 })}
 </div>
 <p style={{ fontSize: 11, color: MUTED_TEXT, margin: "16px 0 0", borderTop: `1px solid #f4f4f5`, paddingTop: 10 }}>
 {isMonth
 ? `Comparing ${data.period?.label} to the prior calendar month.`
 : "Comparing the rolling 30-day window to the previous 30-day window."}
 {" "}WAU and MAU use a 7-day vs 30-day rolling window within the period.
 </p>
 </div>
 </section>
 );
 })()}

 {/* ── GMV ─────────────────────────────────────────────── */}
 <section>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, fontWeight: 500, margin: "0 0 14px" }}>Gross Merchandise Value</h2>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
 <Link href="/admin/analytics" style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "24px 28px", gridColumn: "span 1", textDecoration: "none", display: "block", transition: "box-shadow 0.15s, border-color 0.15s" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 1px 8px rgba(0,0,0,0.06)"; e.currentTarget.style.borderColor = "#d4d4d8"; }} onMouseLeave={e => { e.currentTarget.style.boxShadow = ""; e.currentTarget.style.borderColor = BORDER; }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, margin: "0 0 8px" }}>
 {data.period?.isAllTime ? "All-Time GMV" : data.period?.isMonth ? `GMV: ${data.period.label}` : "All-Time GMV"}
 </p>
 <span style={{ fontSize: 11, color: MUTED_TEXT }}>→</span>
 </div>
 <p style={{ fontSize: 40, fontWeight: 600, color: DARK, margin: "0 0 12px", lineHeight: 1 }}>
 {data.period?.isMonth ? fmt$(data.gmv.last30d) : fmt$(data.gmv.total)}
 </p>
 <WeeklyGmvChart data={data.gmvByWeek} />
 <p style={{ fontSize: 11, color: MUTED_TEXT, margin: "10px 0 0" }}>Weekly GMV. Last 10 weeks</p>
 </Link>
 <MetricCard
 label={data.period?.isMonth ? `Last Week of ${data.period.label}` : data.period?.isAllTime ? "GMV: Last 7 Days" : "GMV: Last 7 Days"}
 value={fmt$(data.gmv.last7d)}
 trend={<TrendBadge current={data.gmv.last7d} prev={data.gmv.prev7d} fmtFn={fmt$} />}
 note={`Previous period: ${fmt$(data.gmv.prev7d)}`}
 href="/admin/analytics"
 />
 <MetricCard
 label={data.period?.isMonth ? `vs Previous Month` : data.period?.isAllTime ? "Since Launch" : "GMV: Last 30 Days"}
 value={data.period?.isMonth ? fmt$(data.gmv.prev30d) : fmt$(data.gmv.last30d)}
 trend={data.period?.isMonth ? undefined : <TrendBadge current={data.gmv.last30d} prev={data.gmv.prev30d} fmtFn={fmt$} />}
 note={data.period?.isMonth ? `${data.period.label} total: ${fmt$(data.gmv.last30d)}` : `Previous 30 days: ${fmt$(data.gmv.prev30d)}`}
 href="/admin/analytics"
 />
 <MetricCard
 label="Total Commission"
 value={fmt$(data.totalCommission)}
 sub="All time · 7/5/3% tiers"
 note="VYA earnings on attributed orders, excluding returns"
 href="/admin/conversions"
 />
 </div>
 </section>

 {/* ── Total Orders ─────────────────────────────────────── */}
 {data.totalOrders && (
 <section>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, fontWeight: 500, margin: "0 0 14px" }}>Total Orders</h2>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
 <MetricCard
 label={data.period?.isAllTime ? "All-Time Orders" : data.period?.isMonth ? `Orders. ${data.period.label}` : "All-Time Orders"}
 value={fmtNum(data.period?.isMonth ? data.totalOrders.last30d : data.totalOrders.allTime)}
 note="Total orders placed through VYA, excluding returns"
 href="/admin/conversions"
 />
 <MetricCard
 label="Orders. Last 7 Days"
 value={fmtNum(data.totalOrders.last7d)}
 trend={<TrendBadge current={data.totalOrders.last7d} prev={data.totalOrders.prev7d} fmtFn={fmtNum} />}
 note={`Previous 7 days: ${fmtNum(data.totalOrders.prev7d)}`}
 href="/admin/conversions"
 />
 <MetricCard
 label={data.period?.isMonth ? `vs Previous Month` : "Orders. Last 30 Days"}
 value={data.period?.isMonth ? fmtNum(data.totalOrders.prev30d) : fmtNum(data.totalOrders.last30d)}
 trend={data.period?.isMonth ? undefined : <TrendBadge current={data.totalOrders.last30d} prev={data.totalOrders.prev30d} fmtFn={fmtNum} />}
 note={data.period?.isMonth ? `${data.period.label} orders: ${fmtNum(data.totalOrders.last30d)}` : `Previous 30 days: ${fmtNum(data.totalOrders.prev30d)}`}
 href="/admin/conversions"
 />
 </div>
 </section>
 )}

 {/* ── Conversion & Revenue ────────────────────────────── */}
 <section>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, fontWeight: 500, margin: "0 0 14px" }}>Conversion & Revenue</h2>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
 <MetricCard
 label={data.period?.isMonth || data.period?.isAllTime ? `Conversion Rate: ${data.period.label}` : "Conversion Rate (7d)"}
 value={data.period?.isMonth || data.period?.isAllTime ? fmtPct(data.conversionRate.periodRate) : fmtPct(data.conversionRate.last7d)}
 sub={data.period?.isMonth || data.period?.isAllTime
 ? `${fmtNum(data.conversionRate.periodConversions)} orders from ${fmtNum(data.conversionRate.periodVisitors)} visitors in ${data.period?.label}`
 : `${fmtNum(data.conversionRate.totalConversions)} orders from ${fmtNum(data.conversionRate.totalVisitors)} visitors (all time)`}
 trend={data.period?.isMonth ? <TrendBadge current={data.conversionRate.periodRate} prev={data.conversionRate.prev7d} fmtFn={fmtPct} /> : <TrendBadge current={data.conversionRate.last7d} prev={data.conversionRate.prev7d} fmtFn={fmtPct} />}
 note="Active users who placed an order in the period"
 href="/admin/conversions"
 />
 <MetricCard
 label={data.period?.isMonth || data.period?.isAllTime ? `Email CTR: ${data.period.label}` : "Email CTR (7d)"}
 value={data.period?.isMonth || data.period?.isAllTime
 ? fmtPct(data.emailCtr?.ctrPeriod ?? 0)
 : fmtPct(data.emailCtr?.ctr7d ?? 0)}
 sub={data.period?.isMonth || data.period?.isAllTime
 ? `${fmtNum(data.emailCtr?.clicksPeriod ?? 0)} clicks / ${fmtNum(data.emailCtr?.deliveredPeriod ?? 0)} delivered in ${data.period?.label}`
 : `${fmtNum(data.emailCtr?.clicks7d ?? 0)} clicks / ${fmtNum(data.emailCtr?.delivered7d ?? 0)} delivered (7d)`}
 trend={data.period?.isMonth
 ? undefined
 : <TrendBadge current={data.emailCtr?.ctr7d ?? 0} prev={data.emailCtr?.ctrPrev7d ?? 0} fmtFn={fmtPct} />}
 note="Click-through rate. ⚠️ Email-link click tracking only works from Jun 23, 2026. Links errored before then, so earlier clicks weren't recorded. CTR is only meaningful from that date."
 href="/admin/emails"
 />
 <MetricCard
 label={data.period?.isMonth || data.period?.isAllTime ? `Email Sales. ${data.period.label}` : "Email Sales (all-time)"}
 value={fmt$(data.period?.isMonth || data.period?.isAllTime ? (data.emailSales?.revenuePeriod ?? 0) : (data.emailSales?.revenueAll ?? 0))}
 sub={`${fmtNum(data.period?.isMonth || data.period?.isAllTime ? (data.emailSales?.ordersPeriod ?? 0) : (data.emailSales?.ordersAll ?? 0))} orders from email · ${fmt$(data.emailSales?.revenueAll ?? 0)} / ${fmtNum(data.emailSales?.ordersAll ?? 0)} orders all-time`}
 note="Sales whose originating click came from an email link (utm_source=email)"
 href="/admin/emails"
 />
 <MetricCard
 label="Approval → First Purchase"
 value={data.approvalToPurchase?.avgDays != null ? `${data.approvalToPurchase.avgDays.toFixed(1)} days` : "-"}
 sub={data.approvalToPurchase?.medianDays != null
 ? `Median ${data.approvalToPurchase.medianDays.toFixed(1)} days · ${fmtNum(data.approvalToPurchase?.buyers ?? 0)} buyers`
 : `${fmtNum(data.approvalToPurchase?.buyers ?? 0)} buyers`}
 note="Avg time from pilot approval to a user's first order"
 href="/admin/conversions"
 />
 <MetricCard
 label="Revenue per Order (AOV)"
 value={fmt$(data.revenuePerUser.value)}
 sub={`${fmtNum(data.revenuePerUser.orders)} orders in ${data.period?.label ?? "this period"}`}
 trend={data.revenuePerUser.prevPeriodValue != null && data.revenuePerUser.prevPeriodValue > 0
 ? <TrendBadge current={data.revenuePerUser.value} prev={data.revenuePerUser.prevPeriodValue} fmtFn={fmt$} />
 : undefined}
 note={`Period GMV ÷ orders · Prev period: ${fmt$(data.revenuePerUser.prevPeriodValue ?? 0)} · All time: ${fmt$(data.revenuePerUser.allTimeValue)}`}
 href="/admin/conversions"
 />
 <MetricCard
 label="Save-to-Purchase Rate"
 value={fmtPct(data.saveToPurchase.rate)}
 sub={`${fmtNum(data.saveToPurchase.saversBought)} of ${fmtNum(data.saveToPurchase.totalSavers)} who saved also bought`}
 note={`In ${data.period?.label ?? "this period"}: users who favorited a product and also placed an order`}
 href="/admin/customers"
 />
 </div>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 16 }}>
 <MetricCard
 label={data.period?.isMonth || data.period?.isAllTime ? `Clicks. ${data.period.label}` : "Clicks. Last 30 Days"}
 value={fmtNum(data.clicks?.last30d ?? 0)}
 trend={<TrendBadge current={data.clicks?.last30d ?? 0} prev={data.clicks?.prev30d ?? 0} fmtFn={fmtNum} />}
 note={`Previous period: ${fmtNum(data.clicks?.prev30d ?? 0)} · Last 7 days: ${fmtNum(data.clicks?.last7d ?? 0)} (prev: ${fmtNum(data.clicks?.prev7d ?? 0)})`}
 href="/admin/analytics"
 />
 <MetricCard
 label={data.period?.isMonth || data.period?.isAllTime ? `Favorites Added. ${data.period.label}` : "Favorites Added. 30d"}
 value={fmtNum(data.favoritesVolume?.period ?? 0)}
 trend={<TrendBadge current={data.favoritesVolume?.period ?? 0} prev={data.favoritesVolume?.prevPeriod ?? 0} fmtFn={fmtNum} />}
 note={`Previous period: ${fmtNum(data.favoritesVolume?.prevPeriod ?? 0)} · Last 7 days: ${fmtNum(data.favoritesVolume?.week ?? 0)}`}
 href="/admin/customers"
 />
 </div>
 </section>

 {/* ── Users ───────────────────────────────────────────── */}
 <section>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, fontWeight: 500, margin: "0 0 14px" }}>Users</h2>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
 <MetricCard
 label="Registered Accounts"
 value={fmtNum(data.users.registered)}
 note="Total users who have created an account"
 href="/admin/customers"
 />
 <MetricCard
 label="Waitlist Signups"
 value={fmtNum(data.users.waitlist)}
 note="Total entries in pilot_access (pending + approved)"
 href="/admin/customers"
 />
 <MetricCard
 label={`New Accounts. ${data.period?.label ?? "This Period"}`}
 value={fmtNum(data.newUsers?.period ?? 0)}
 trend={<TrendBadge current={data.newUsers?.period ?? 0} prev={data.newUsers?.prevPeriod ?? 0} fmtFn={fmtNum} />}
 note={`Previous period: ${fmtNum(data.newUsers?.prevPeriod ?? 0)} · Last 7 days: ${fmtNum(data.newUsers?.week ?? 0)} (prev: ${fmtNum(data.newUsers?.prevWeek ?? 0)})`}
 href="/admin/customers"
 />
 </div>
 </section>

 {/* ── Waitlist Growth ─────────────────────────────────── */}
 {data.waitlistByMonth.length > 0 && (
 <section>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, fontWeight: 500, margin: "0 0 14px" }}>Waitlist Growth</h2>
 <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "24px 28px" }}>
 {(() => {
 // Filter months to match selected period
 const visibleMonths = data.period?.isMonth
 ? data.waitlistByMonth.filter((m) => m.month === selectedMonth)
 : data.waitlistByMonth;

 const currentMonthData = visibleMonths[visibleMonths.length - 1];
 const prevMonthData = data.period?.isMonth
 ? data.waitlistByMonth[data.waitlistByMonth.findIndex((m) => m.month === selectedMonth) - 1]
 : visibleMonths[visibleMonths.length - 2];

 const totalApproved = data.waitlistByMonth.reduce((s, m) => s + m.approved, 0);
 const totalPending = data.users.waitlist - totalApproved;

 return (
 <>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
 {data.period?.isMonth ? (
 <>
 <div>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, margin: "0 0 6px" }}>Signups. {data.period.label}</p>
 <p style={{ fontSize: 32, fontWeight: 600, color: DARK, margin: "0 0 4px", lineHeight: 1 }}>{fmtNum(currentMonthData?.signups ?? 0)}</p>
 {prevMonthData && <TrendBadge current={currentMonthData?.signups ?? 0} prev={prevMonthData.signups} fmtFn={fmtNum} />}
 </div>
 <div>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, margin: "0 0 6px" }}>Approved. {data.period.label}</p>
 <p style={{ fontSize: 32, fontWeight: 600, color: DARK, margin: "0 0 4px", lineHeight: 1 }}>{fmtNum(currentMonthData?.approved ?? 0)}</p>
 <p style={{ fontSize: 12, color: GRAY, margin: 0 }}>of {fmtNum(currentMonthData?.signups ?? 0)} signups</p>
 </div>
 <div>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, margin: "0 0 6px" }}>All-Time Waitlist</p>
 <p style={{ fontSize: 32, fontWeight: 600, color: DARK, margin: "0 0 4px", lineHeight: 1 }}>{fmtNum(data.users.waitlist)}</p>
 <p style={{ fontSize: 12, color: GRAY, margin: 0 }}>{fmtNum(totalApproved)} approved · {fmtNum(totalPending)} pending</p>
 </div>
 </>
 ) : (
 <>
 <div>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, margin: "0 0 6px" }}>Total on Waitlist</p>
 <p style={{ fontSize: 32, fontWeight: 600, color: DARK, margin: "0 0 4px", lineHeight: 1 }}>{fmtNum(data.users.waitlist)}</p>
 <p style={{ fontSize: 12, color: GRAY, margin: 0 }}>{fmtNum(totalApproved)} approved · {fmtNum(totalPending)} pending</p>
 </div>
 <div>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, margin: "0 0 6px" }}>This Month</p>
 <p style={{ fontSize: 32, fontWeight: 600, color: DARK, margin: "0 0 4px", lineHeight: 1 }}>{fmtNum(currentMonthData?.signups ?? 0)}</p>
 {prevMonthData && <TrendBadge current={currentMonthData?.signups ?? 0} prev={prevMonthData.signups} fmtFn={fmtNum} />}
 </div>
 <div>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, margin: "0 0 6px" }}>Avg / Month</p>
 <p style={{ fontSize: 32, fontWeight: 600, color: DARK, margin: "0 0 4px", lineHeight: 1 }}>
 {fmtNum(Math.round(data.users.waitlist / Math.max(data.waitlistByMonth.length, 1)))}
 </p>
 <p style={{ fontSize: 12, color: GRAY, margin: 0 }}>across {data.waitlistByMonth.length} month{data.waitlistByMonth.length !== 1 ? "s" : ""}</p>
 </div>
 </>
 )}
 </div>

 {/* Bar chart, only show when not filtered to a single month */}
 {!data.period?.isMonth && (
 <div style={{ overflowX: "auto" }}>
 <div style={{ display: "flex", alignItems: "flex-end", gap: 8, minWidth: visibleMonths.length * 56, height: 80 }}>
 {(() => {
 const maxVal = Math.max(...visibleMonths.map((m) => m.signups), 1);
 return visibleMonths.map((m) => {
 const barH = Math.max((m.signups / maxVal) * 64, 4);
 const label = new Date(m.month + "-02").toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
 return (
 <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
 <span style={{ fontSize: 10, color: MUTED_TEXT, fontWeight: 600 }}>{m.signups}</span>
 <div style={{ width: "100%", height: barH, background: PRIMARY_BTN, borderRadius: "3px 3px 0 0", opacity: 0.8 }} title={`${label}: ${m.signups} signups, ${m.approved} approved`} />
 <span style={{ fontSize: 9, color: MUTED_TEXT, whiteSpace: "nowrap" }}>{label}</span>
 </div>
 );
 });
 })()}
 </div>
 </div>
 )}
 <p style={{ fontSize: 11, color: MUTED_TEXT, margin: "12px 0 0", borderTop: `1px solid #f4f4f5`, paddingTop: 10 }}>
 {data.period?.isMonth ? `Waitlist activity for ${data.period.label}.` : "Signups per month since launch. Hover bars for approved count."}
 </p>
 </>
 );
 })()}
 </div>
 </section>
 )}

 {/* ── Waitlist Funnel ─────────────────────────────────── */}
 <section>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, fontWeight: 500, margin: "0 0 14px" }}>Waitlist Funnel</h2>
 <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "24px 28px" }}>
 {(() => {
 const steps = [
 { label: "Waitlist Signups", value: data.users.waitlist, note: "Total entries in pilot_access" },
 { label: "Approved", value: data.users.approved, note: "Granted platform access" },
 { label: "Registered Accounts", value: data.users.registered, note: "Created a VYA account" },
 { label: "Ever Active", value: data.mau.totalEverActive, note: "Clicked, saved, or ordered at least once" },
 ];
 return (
 <div style={{ display: "grid", gridTemplateColumns: `repeat(${steps.length}, 1fr)`, gap: 0 }}>
 {steps.map((step, i) => {
 const prev = i > 0 ? steps[i - 1].value : null;
 const pct = prev && prev > 0 ? ((step.value / prev) * 100).toFixed(0) : null;
 return (
 <div key={step.label} style={{ display: "flex", alignItems: "stretch" }}>
 <div style={{ flex: 1, padding: "0 20px", borderRight: i < steps.length - 1 ? "1px solid #f4f4f5" : "none" }}>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, margin: "0 0 6px" }}>{step.label}</p>
 <p style={{ fontSize: 32, fontWeight: 600, color: DARK, margin: "0 0 4px", lineHeight: 1 }}>{fmtNum(step.value)}</p>
 {pct !== null && (
 <span style={{ fontSize: 11, background: UP_BG, color: UP_COLOR, padding: "2px 7px", borderRadius: 4, fontWeight: 500 }}>
 {pct}% of prev
 </span>
 )}
 <p style={{ fontSize: 11, color: MUTED_TEXT, margin: "8px 0 0" }}>{step.note}</p>
 </div>
 </div>
 );
 })}
 </div>
 );
 })()}
 </div>
 </section>

 {/* ── Engagement ──────────────────────────────────────── */}
 <section>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, fontWeight: 500, margin: "0 0 14px" }}>Engagement & Retention</h2>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
 <MetricCard
 label="Weekly Active Users"
 value={fmtNum(data.wau.current)}
 trend={<TrendBadge current={data.wau.current} prev={data.wau.prev} fmtFn={fmtNum} />}
 note={`Registered users who clicked a product, saved something, viewed a page, or placed an order ${data.period?.isMonth ? `in the last 7 days of ${data.period.label}` : "this week"}.`}
 href="/admin/analytics"
 />
 <MetricCard
 label={data.period?.isAllTime ? "Total Active Users" : "Monthly Active Users"}
 value={fmtNum(data.mau.current)}
 sub={`${fmtNum(data.users.registered)} total registered users`}
 trend={data.period?.isAllTime ? undefined : <TrendBadge current={data.mau.current} prev={data.mau.prev} fmtFn={fmtNum} />}
 note={`Registered users who clicked a product, saved something, viewed a page, or placed an order ${data.period?.isAllTime ? "since launch" : data.period?.isMonth ? `in ${data.period.label}` : "this month"}.`}
 href="/admin/analytics"
 />
 <MetricCard
 label="Returning Users (30d)"
 value={fmtNum(data.returningUsers.last30d)}
 sub={`${fmtNum(data.returningUsers.last7d)} returned this week`}
 note="Registered users active in the period who have visited on 2+ different days"
 href="/admin/customers"
 />
 </div>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 16 }}>
 <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "24px 28px" }}>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, margin: "0 0 8px" }}>Stickiness (WAU/MAU)</p>
 <p style={{ fontSize: 32, fontWeight: 600, color: DARK, margin: "0 0 4px", lineHeight: 1 }}>{fmtPct(data.stickiness.current)}</p>
 <p style={{ fontSize: 13, color: GRAY, margin: "0 0 6px" }}>
 <span style={{ fontWeight: 600, color: DARK }}>{fmtNum(data.wau.current)}</span> WAU ÷ <span style={{ fontWeight: 600, color: DARK }}>{fmtNum(data.stickiness.mauUsed ?? data.mau.current)}</span> MAU
 {data.stickiness.prev > 0 && (
 <span style={{ color: MUTED_TEXT }}> · prev {fmtPct(data.stickiness.prev)}</span>
 )}
 </p>
 <TrendBadge current={data.stickiness.current} prev={data.stickiness.prev} fmtFn={fmtPct} />
 <div style={{ marginTop: 12, background: "#f4f4f5", borderRadius: 8, padding: "10px 14px" }}>
 <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: GRAY }}>
 <span>Below 10%</span><span style={{ color: "#b91c1c" }}>Needs work</span>
 </div>
 <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: GRAY, marginTop: 2 }}>
 <span>10–25%</span><span style={{ color: "#92400e" }}>Okay</span>
 </div>
 <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: GRAY, marginTop: 2 }}>
 <span>Above 25%</span><span style={{ color: "#15803d" }}>Healthy</span>
 </div>
 </div>
 <p style={{ fontSize: 11, color: MUTED_TEXT, margin: "10px 0 0", borderTop: `1px solid #f4f4f5`, paddingTop: 8 }}>
 How often monthly users come back weekly. WAU = last 7 days, MAU = full period window.
 </p>
 </div>

 <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "24px 28px" }}>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, margin: "0 0 16px" }}>
 Buyer Retention: {data.period?.label ?? "Last 30 Days"}
 </p>

 {/* Came back after purchase */}
 <div style={{ marginBottom: 14 }}>
 <p style={{ fontSize: 12, color: GRAY, margin: "0 0 4px" }}>Came back after buying</p>
 <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
 <p style={{ fontSize: 30, fontWeight: 600, color: DARK, margin: 0, lineHeight: 1 }}>
 {data.buyerRetention.returnRate === null ? "-" : fmtPct(data.buyerRetention.returnRate)}
 </p>
 <p style={{ fontSize: 12, color: MUTED_TEXT, margin: 0 }}>
 {fmtNum(data.buyerRetention.returnedAfterPurchase)} of {fmtNum(data.buyerRetention.totalBuyers)} buyers
 </p>
 </div>
 <div style={{ background: "#f4f4f5", borderRadius: 6, padding: "8px 12px" }}>
 {[
 { label: "Below 30%", verdict: "Needs work", color: "#b91c1c", threshold: null },
 { label: "30–60%", verdict: "Okay", color: "#92400e", threshold: null },
 { label: "Above 60%", verdict: "Healthy", color: "#15803d", threshold: null },
 ].map((row) => (
 <div key={row.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: GRAY, marginBottom: 2 }}>
 <span>{row.label}</span><span style={{ color: row.color, fontWeight: 600 }}>{row.verdict}</span>
 </div>
 ))}
 </div>
 </div>

 <div style={{ height: 1, background: "#f4f4f5", margin: "0 0 14px" }} />

 {/* Bought again */}
 <div>
 <p style={{ fontSize: 12, color: GRAY, margin: "0 0 4px" }}>Bought again</p>
 <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
 <p style={{ fontSize: 30, fontWeight: 600, color: DARK, margin: 0, lineHeight: 1 }}>
 {data.buyerRetention.repeatPurchaseRate === null ? "-" : fmtPct(data.buyerRetention.repeatPurchaseRate)}
 </p>
 <p style={{ fontSize: 12, color: MUTED_TEXT, margin: 0 }}>
 {fmtNum(data.buyerRetention.boughtAgain)} of {fmtNum(data.buyerRetention.totalBuyers)} buyers
 </p>
 </div>
 <div style={{ background: "#f4f4f5", borderRadius: 6, padding: "8px 12px" }}>
 {[
 { label: "Below 5%", verdict: "Needs work", color: "#b91c1c" },
 { label: "5–15%", verdict: "Okay", color: "#92400e" },
 { label: "Above 15%", verdict: "Healthy", color: "#15803d" },
 ].map((row) => (
 <div key={row.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: GRAY, marginBottom: 2 }}>
 <span>{row.label}</span><span style={{ color: row.color, fontWeight: 600 }}>{row.verdict}</span>
 </div>
 ))}
 </div>
 </div>

 <p style={{ fontSize: 11, color: MUTED_TEXT, margin: "12px 0 0", borderTop: `1px solid #f4f4f5`, paddingTop: 10 }}>
 Of buyers in this period. Higher is better.
 </p>
 </div>
 </div>
 </section>

 {/* ── Retention by window ──────────────────────────────── */}
 {data.retentionByWindow && data.retentionByWindow.length > 0 && (
 <section>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, fontWeight: 500, margin: "0 0 14px" }}>
 N-Day Retention
 </h2>
 <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "20px 28px" }}>
 <p style={{ fontSize: 13, color: GRAY, margin: "0 0 16px" }}>
 % of buyers (whose first purchase was N+ days ago) who made a second purchase within N days. Since-launch is all-time repeat rate.
 </p>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
 {data.retentionByWindow.map((r) => {
 const color =
  r.rate == null ? MUTED_TEXT :
  r.rate >= 0.15 ? "#15803d" :
  r.rate >= 0.05 ? "#92400e" :
  "#b91c1c";
 return (
  <div key={r.window} style={{ background: "#fafafa", borderRadius: 8, padding: "16px 18px" }}>
  <p style={{ fontSize: 11, color: MUTED_TEXT, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>
   {r.label}
  </p>
  <p style={{ fontSize: 26, fontWeight: 700, color: r.rate == null ? MUTED_TEXT : DARK, margin: "0 0 4px", lineHeight: 1 }}>
   {r.rate == null ? "-" : fmtPct(r.rate)}
  </p>
  <p style={{ fontSize: 11, color: GRAY, margin: 0 }}>
   {r.retained} of {r.cohort} buyer{r.cohort === 1 ? "" : "s"}
  </p>
  <p style={{ fontSize: 10, color, marginTop: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
   {r.rate == null ? "" : r.rate >= 0.15 ? "Healthy" : r.rate >= 0.05 ? "Okay" : "Needs work"}
  </p>
  </div>
 );
 })}
 </div>
 </div>
 </section>
 )}

 {/* ── Activity breakdown ──────────────────────────────── */}
 {data.activityBreakdown && (
 <section>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED_TEXT, fontWeight: 500, margin: "0 0 14px" }}>
 Active User Breakdown: {data.period?.label ?? "Last 30 Days"}
 </h2>
 <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "20px 28px" }}>
 <p style={{ fontSize: 12, color: MUTED_TEXT, margin: "0 0 16px" }}>
 Distinct logged-in users who took each action during this period. A user can appear in multiple categories. "Clicked a product link" = tapped through to a store; "Favorited" = saved to their wishlist.
 </p>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
 {[
 { label: "Clicked a product link", value: data.activityBreakdown.clickers, href: "/admin/analytics" },
 { label: "Favorited a product", value: data.activityBreakdown.productSavers, href: "/admin/customers" },
 { label: "Favorited a store", value: data.activityBreakdown.storeSavers, href: "/admin/customers" },
 { label: "Placed an order", value: data.activityBreakdown.buyers, href: "/admin/conversions" },
 ].map((s) => (
 <Link key={s.label} href={s.href} style={{ textDecoration: "none", display: "block", padding: "8px", borderRadius: 8, transition: "background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background = "#f4f4f5")} onMouseLeave={e => (e.currentTarget.style.background = "")}>
 <p style={{ fontSize: 28, fontWeight: 600, color: DARK, lineHeight: 1, margin: "0 0 4px" }}>{fmtNum(s.value)}</p>
 <p style={{ fontSize: 12, color: MUTED_TEXT, margin: 0 }}>{s.label} →</p>
 </Link>
 ))}
 </div>
 </div>
 </section>
 )}


 </div>
 )}
 </div>
 </div>
 );
}
