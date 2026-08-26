"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type DateRange = "7d" | "30d" | "all";

type KPIs = {
 totalClicks: number;
 totalViews: number;
 totalRevenue: number;
 totalConversions: number;
 matchedConversions: number;
 unmatchedConversions: number;
 totalCustomers: number;
 approvedCustomers: number;
 pilotTotal: number;
 waitlistOnly: number;
 newSignupsThisWeek: number;
 collabsTotalOrders?: number;
 collabsEstimatedRevenue?: number;
 collabsTotalCommission?: number;
 totalCommission?: number;
};

type ConversionRow = {
 conversionId: string;
 timestamp: string;
 orderId: string;
 orderTotal: number;
 storeSlug: string;
 storeName: string;
 matched: boolean;
 viaClickId: string | null;
 clickedProduct: string | null;
 userId: string | null;
 buyerEmail: string | null;
 buyerName: string | null;
 returned: boolean;
 returnedAt: string | null;
};

type TopProduct = {
 productId: string;
 name: string | null;
 store: string | null;
 clicks?: number;
 views?: number;
};

type TopStore = {
 store: string;
 clicks: number;
 conversions: number;
 revenue: number;
};

type SignupDay = {
 date: string;
 count: number;
};

type ReferralEntry = {
 name: string;
 email: string;
 code: string;
 referralCount: number;
};

type ActivityItem = {
 type: "click";
 timestamp: string;
 productName: string | null;
 store: string | null;
 productId: string | null;
};

type InventoryStoreRow = {
 storeSlug: string;
 productCount: number;
 inventoryValue: number;
 potentialCommission: number;
};

type InventoryStats = {
 productCount: number;
 inventoryValue: number;
 potentialCommission: number;
 tier1Count: number;
 tier2Count: number;
 tier3Count: number;
 byStore: InventoryStoreRow[];
};

type SearchEntry = {
 query: string;
 count: number;
};

type TrafficSource = {
 source: string;
 medium: string | null;
 campaign: string | null;
 visits: number;
 knownUsers: number;
};

type ClicksBySource = {
 source: string;
 clicks: number;
};

type ConversionsBySource = {
 source: string;
 conversions: number;
 revenue: number;
};

type AnalyticsData = {
 kpis: KPIs;
 topProductsByClicks: TopProduct[];
 topProductsByViews: TopProduct[];
 topStores: TopStore[];
 signupsByDay: SignupDay[];
 referralLeaderboard: ReferralEntry[];
 recentActivity: ActivityItem[];
 recentConversions: ConversionRow[];
 inventory: InventoryStats;
 topSearches: SearchEntry[];
 trafficSources: TrafficSource[];
 clicksBySource: ClicksBySource[];
 conversionsBySource: ConversionsBySource[];
 conversionsByFirstTouch: ConversionsBySource[];
 conversionsByLastTouch: ConversionsBySource[];
};


// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRevenue(n: number): string {
 return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatRevenueShort(n: number): string {
 if (n === 0) return "—";
 return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function relativeTime(iso: string): string {
 const diff = Date.now() - new Date(iso).getTime();
 const mins = Math.floor(diff / 60000);
 if (mins < 1) return "just now";
 if (mins < 60) return `${mins} min ago`;
 const hrs = Math.floor(mins / 60);
 if (hrs < 24) return `${hrs} hr ago`;
 const days = Math.floor(hrs / 24);
 return `${days} day${days === 1 ? "" : "s"} ago`;
}

// ── Colour tokens ─────────────────────────────────────────────────────────────

const DARK = "#09090b";
const GRAY = "#71717a";
const MUTED = "#a1a1aa";
const BORDER = "#e4e4e7";
const BG_PAGE = "#f8f9fa";
const BG_CARD = "#ffffff";
const BG_HOVER = "#fafafa";
const PRIMARY = "#18181b";

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, href }: { label: string; value: string | number; sub?: string; href?: string }) {
 const inner = (
 <>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
 <p style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px", fontWeight: 500 }}>
 {label}
 </p>
 {href && <span style={{ fontSize: 11, color: MUTED }}>→</span>}
 </div>
 <p style={{ fontSize: 24, fontWeight: 700, color: DARK, margin: 0, lineHeight: 1 }}>
 {value}
 </p>
 {sub && (
 <p style={{ fontSize: 10, color: MUTED, margin: "4px 0 0" }}>{sub}</p>
 )}
 </>
 );
 if (href) {
 return (
 <Link href={href} style={{ backgroundColor: BG_HOVER, borderRadius: 8, padding: "16px 20px", minWidth: 120, flex: "1 1 140px", textDecoration: "none", display: "block", transition: "opacity 0.15s", border: `1px solid ${BORDER}` }} onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")} onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
 {inner}
 </Link>
 );
 }
 return (
 <div style={{ backgroundColor: BG_HOVER, borderRadius: 8, padding: "16px 20px", minWidth: 120, flex: "1 1 140px", border: `1px solid ${BORDER}` }}>
 {inner}
 </div>
 );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
 return (
 <h2 style={{ fontSize: 11, fontWeight: 500, color: MUTED, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 14px" }}>
 {children}
 </h2>
 );
}

function RangeButton({
 label,
 active,
 onClick,
}: {
 label: string;
 active: boolean;
 onClick: () => void;
}) {
 return (
 <button
 onClick={onClick}
 style={{
 padding: "5px 14px",
 fontSize: 12,
 fontWeight: 500,
 borderRadius: 6,
 border: `1px solid ${BORDER}`,
 backgroundColor: active ? PRIMARY : BG_CARD,
 color: active ? "#fff" : DARK,
 cursor: "pointer",
 letterSpacing: "0.04em",
 }}
 >
 {label}
 </button>
 );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "overview" | "inventory" | "collabs";

type CollabsPartnership = {
 id: string;
 name: string;
 logoUrl: string | null;
 totalCommissionEarned: string;
 currency: string;
 totalLinkVisits: number;
 totalOrders: number;
};

export default function DeepAnalyticsPage() {
 const [range, setRange] = useState<DateRange>("all");
 // Which attribution model the table sorts by, and which one reads as primary.
 // Both column groups stay visible — the toggle changes emphasis and ordering,
 // because the whole point is being able to compare them.
 const [touchModel, setTouchModel] = useState<"first" | "last">("first");
 const [tab, setTab] = useState<Tab>("overview");
 const [data, setData] = useState<AnalyticsData | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);

 const fetchData = useCallback(async (r: DateRange, silent = false) => {
 if (!silent) setLoading(true);
 setError(null);
 try {
 const res = await fetch(`/api/admin/analytics-deep?range=${r}&t=${Date.now()}`);
 if (!res.ok) {
 const body = await res.json().catch(() => ({}));
 throw new Error(body.error ?? `HTTP ${res.status}`);
 }
 const json = await res.json();
 setData(json);
 } catch (e: unknown) {
 setError(e instanceof Error ? e.message : String(e));
 } finally {
 if (!silent) setLoading(false);
 }
 }, []);

 useEffect(() => {
 fetchData(range);
 }, [range, fetchData]);

 // Auto-refresh every 30 seconds (silent — no loading spinner)
 useEffect(() => {
 const interval = setInterval(() => fetchData(range, true), 30_000);
 return () => clearInterval(interval);
 }, [range, fetchData]);

 // Re-fetch silently when the tab becomes visible again (e.g. after matching in Conversions)
 useEffect(() => {
 function onVisible() {
 if (document.visibilityState === "visible") fetchData(range, true);
 }
 document.addEventListener("visibilitychange", onVisible);
 return () => document.removeEventListener("visibilitychange", onVisible);
 }, [range, fetchData]);


 // ── Render ────────────────────────────────────────────────────────────────

 return (
 <div style={{ minHeight: "100vh", backgroundColor: BG_PAGE, color: DARK, fontFamily: "system-ui, -apple-system, sans-serif" }}>

 {/* Page title + tabs + range picker */}
 <div style={{ background: BG_CARD, borderBottom: `1px solid ${BORDER}` }}>
 <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
 <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: DARK }}>Analytics</h1>
 <div style={{ display: "flex", gap: 8 }}>
 {(["7d", "30d", "all"] as DateRange[]).map((r) => (
 <RangeButton key={r} label={r.toUpperCase()} active={range === r} onClick={() => setRange(r)} />
 ))}
 </div>
 </div>
 <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px", display: "flex", gap: 0 }}>
 {(["overview", "inventory", "collabs"] as Tab[]).map((t) => (
 <button
 key={t}
 onClick={() => setTab(t)}
 style={{
 padding: "12px 20px",
 fontSize: 13,
 fontWeight: 500,
 border: "none",
 borderBottom: tab === t ? `2px solid ${DARK}` : "2px solid transparent",
 background: "transparent",
 color: tab === t ? DARK : GRAY,
 cursor: "pointer",
 textTransform: "capitalize",
 letterSpacing: "0.04em",
 }}
 >
 {t === "inventory" ? "Inventory" : t === "collabs" ? "Shopify Collabs" : "Overview"}
 </button>
 ))}
 </div>
 </div>

 {/* Main content */}
 <div style={{ padding: "28px 24px", maxWidth: 1280, margin: "0 auto" }}>
 {loading && (
 <div style={{ textAlign: "center", padding: "80px 0", opacity: 0.5, fontSize: 14 }}>
 Loading analytics…
 </div>
 )}

 {error && (
 <div style={{ padding: 16, backgroundColor: "#fef2f2", borderRadius: 8, color: "#b91c1c", fontSize: 13 }}>
 Error: {error}
 </div>
 )}

 {tab === "collabs" && <CollabsTab />}

 {!loading && !error && data && tab === "inventory" && (
 <InventoryTab inv={data.inventory} />
 )}

 {!loading && !error && data && tab === "overview" && (
 <>
 {/* ── KPI Bar ─────────────────────────────────────────────────── */}
 {/* Signups group */}
 <p style={{ fontSize: 11, fontWeight: 500, color: MUTED, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>Signups</p>
 <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 28 }}>
 <StatCard label="Registered Accounts" value={data.kpis.totalCustomers.toLocaleString()} href="/admin/customers" />
<StatCard label="Pilot Users" value={data.kpis.pilotTotal.toLocaleString()} href="/admin/customers" />
 <StatCard label="Approved" value={data.kpis.approvedCustomers.toLocaleString()} href="/admin/customers" />
 <StatCard label="Waitlist Only" value={data.kpis.waitlistOnly.toLocaleString()} href="/admin/customers" />
 <StatCard
 label={range === "7d" ? "New This Week" : range === "30d" ? "New This Month" : "New (All Time)"}
 value={data.kpis.newSignupsThisWeek.toLocaleString()}
 href="/admin/customers"
 />
 </div>
 {/* Activity group */}
 <p style={{ fontSize: 11, fontWeight: 500, color: MUTED, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>Activity</p>
 <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 36 }}>
 <StatCard label="Store Click-throughs" value={data.kpis.totalClicks.toLocaleString()} sub="clicks out to store pages" />
 <StatCard label="Product Views" value={data.kpis.totalViews.toLocaleString()} />
 <StatCard
 label="Orders"
 value={data.kpis.totalConversions.toLocaleString()}
 sub={data.kpis.collabsTotalOrders ? `${data.kpis.collabsTotalOrders} via Shopify Collabs` : undefined}
 href="/admin/conversions"
 />
 <StatCard
 label="Revenue"
 value={formatRevenue(data.kpis.totalRevenue)}
 sub={data.kpis.collabsEstimatedRevenue ? `~${formatRevenue(data.kpis.collabsEstimatedRevenue)} est. from Collabs` : "All time"}
 href="/admin/key-metrics"
 />
 <StatCard
 label="Total Commission"
 value={data.kpis.totalCommission ? formatRevenue(data.kpis.totalCommission) : "—"}
 sub="All time · 7/5/3% tiers"
 href="/admin/conversions"
 />
 </div>


 {/* ── Source Attribution ───────────────────────────────────────────
     Two attribution models side by side, because they disagree and the
     disagreement is the point.

     FIRST TOUCH — the earliest real channel this customer ever arrived
     through. Same rule the customer list uses, so the two pages agree.
     Answers "what brought them to VYA at all".

     LAST TOUCH — the click that carried them to the order, else their most
     recent visit. This is what the panel used to show, and all it showed.
     Answers "what closed the sale".

     Both are computed from the SAME order rows, so both columns always total
     the same order count and revenue as the Orders KPI. There is deliberately
     no "Conv %": visits, clicks and orders are three separately-derived
     numbers joined by a source label, not stages of one funnel, so dividing
     them produced rates that looked real and were not. ── */}
 {data.trafficSources && data.trafficSources.length > 0 && (
 <div style={{ marginBottom: 36 }}>
 <SectionTitle>Source Attribution</SectionTitle>

 {/* Group header — which columns belong to which model */}
 {/* 164px, not 152px: each group spans TWO 76px data columns PLUS the 12px gap
     between them. At 152px the group headers drifted 24px left of the columns they
     label, so "First touch" sat over the last-touch orders column. */}
 <div style={{ display: "grid", gridTemplateColumns: "150px 76px 76px 164px 164px", gap: 12, padding: "0 12px 6px" }}>
 <span /><span /><span />
 {(["first", "last"] as const).map((m) => {
 const active = touchModel === m;
 return (
 <button
 key={m}
 onClick={() => setTouchModel(m)}
 title={m === "first" ? "Sort by the channel that first brought the customer to VYA" : "Sort by the channel that carried them to the order"}
 style={{
 fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em",
 color: active ? "#5D0F17" : MUTED,
 textAlign: "center", paddingBottom: 4, paddingTop: 2,
 background: "transparent", cursor: "pointer",
 border: "none", borderBottom: `2px solid ${active ? "#5D0F17" : BORDER}`,
 }}
 >
 {m === "first" ? "First touch" : "Last touch"}
 </button>
 );
 })}
 </div>

 <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
 {/* Column header */}
 <div style={{ display: "grid", gridTemplateColumns: "150px 76px 76px 76px 76px 76px 76px", gap: 12, padding: "0 12px 8px", borderBottom: `1px solid ${BORDER}` }}>
 {[
 { label: "Source", align: "left" },
 { label: "Visits", align: "right" },
 { label: "Clicks", align: "right" },
 { label: "Orders", align: "right" },
 { label: "Revenue", align: "right" },
 { label: "Orders", align: "right" },
 { label: "Revenue", align: "right" },
 ].map((h, i) => (
 <span key={i} style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED, textAlign: h.align as "left" | "right" }}>{h.label}</span>
 ))}
 </div>

 {(() => {
 const first = data.conversionsByFirstTouch ?? [];
 const last = data.conversionsByLastTouch ?? data.conversionsBySource ?? [];
 const allSources = Array.from(new Set([
 ...data.trafficSources.map((r) => r.source),
 ...(data.clicksBySource ?? []).map((r) => r.source),
 ...first.map((r) => r.source),
 ...last.map((r) => r.source),
 ]));

 const rows = allSources.map((source) => {
 const visitRow = data.trafficSources.find((r) => r.source === source);
 const clickRow = data.clicksBySource?.find((r) => r.source === source);
 const f = first.find((r) => r.source === source);
 const l = last.find((r) => r.source === source);
 return {
 source,
 visits: visitRow?.visits ?? 0,
 clicks: clickRow?.clicks ?? 0,
 firstOrders: f?.conversions ?? 0,
 firstRevenue: f?.revenue ?? 0,
 lastOrders: l?.conversions ?? 0,
 lastRevenue: l?.revenue ?? 0,
 };
 }).sort((a, b) => (touchModel === "first"
 ? b.firstRevenue - a.firstRevenue
 : b.lastRevenue - a.lastRevenue) || b.visits - a.visits);

 const maxVisits = Math.max(...rows.map((r) => r.visits), 1);
 const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
 // `dim` fades the model that isn't selected, so the active one reads first
 // without either set of numbers disappearing.
 const num = (n: number, bold = false, dim = false) => (
 <span style={{ fontSize: 13, fontWeight: bold ? 700 : 600, color: n > 0 ? "#15803d" : MUTED, opacity: dim ? 0.45 : 1, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
 {n > 0 ? (bold ? money(n) : n.toLocaleString()) : "\u2014"}
 </span>
 );

 return rows.map((row, i) => (
 <div key={row.source} style={{ display: "grid", gridTemplateColumns: "150px 76px 76px 76px 76px 76px 76px", gap: 12, padding: "10px 12px", backgroundColor: i % 2 === 0 ? BG_HOVER : "transparent", borderRadius: 6, alignItems: "center" }}>
 <div style={{ minWidth: 0 }}>
 <div style={{ fontSize: 13, fontWeight: 700, color: DARK, marginBottom: 3 }}>{row.source}</div>
 <div style={{ height: 3, backgroundColor: BORDER, borderRadius: 2 }}>
 <div style={{ height: "100%", backgroundColor: "#5D0F17", borderRadius: 2, width: `${(row.visits / maxVisits) * 100}%`, opacity: 0.6 }} />
 </div>
 </div>
 <span style={{ fontSize: 13, fontWeight: 600, color: DARK, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.visits.toLocaleString()}</span>
 <span style={{ fontSize: 13, fontWeight: 600, color: row.clicks > 0 ? DARK : MUTED, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.clicks > 0 ? row.clicks.toLocaleString() : "\u2014"}</span>
 {num(row.firstOrders, false, touchModel !== "first")}
 {num(row.firstRevenue, true, touchModel !== "first")}
 {num(row.lastOrders, false, touchModel !== "last")}
 {num(row.lastRevenue, true, touchModel !== "last")}
 </div>
 ));
 })()}
 </div>

 <p style={{ fontSize: 11, color: MUTED, margin: "10px 12px 0", lineHeight: 1.5, maxWidth: 760 }}>
 Both models cover the same orders, so each pair of columns totals the same as the Orders KPI &mdash;
 they only disagree about which channel gets the credit. Where first touch is much higher than last
 touch, that channel is <strong>finding</strong> customers who convert later through something else.
 </p>
 </div>
 )}

 {/* ── Top Products grid ────────────────────────────────────────── */}
 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 36 }}>
 {/* By Clicks */}
 <div>
 <SectionTitle>Top Products by Clicks</SectionTitle>
 <ProductList
 items={data.topProductsByClicks.map((p) => ({
 productId: p.productId,
 name: p.name,
 store: p.store,
 count: p.clicks ?? 0,
 countLabel: "click",
 }))}
 />
 </div>

 {/* By Views */}
 <div>
 <SectionTitle>Top Products by Views</SectionTitle>
 <ProductList
 items={data.topProductsByViews.map((p) => ({
 productId: p.productId,
 name: p.name,
 store: p.store,
 count: p.views ?? 0,
 countLabel: "view",
 }))}
 />
 </div>
 </div>

 {/* Top Searches lived here AND on /admin/search-analytics, which has the full
     breakdown plus its own range picker. One link instead of a second copy. */}

 {/* ── Top Stores ───────────────────────────────────────────────── */}
 <div style={{ marginBottom: 36 }}>
 <SectionTitle>Top Stores</SectionTitle>
 <StoresTable stores={data.topStores} />
 </div>

 {/* Buyer Cohort Retention removed — the same chart, from the same
     /api/admin/cohort-retention endpoint, is on /admin/summary. */}

 {/* ── Conversions ──────────────────────────────────────────────── */}
 <div style={{ marginBottom: 36 }}>
 <SectionTitle>Orders</SectionTitle>

 {/* Matched / unmatched split */}
 <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
 {[
 { label: "Total Orders", value: data.kpis.totalConversions, sub: null, href: "/admin/conversions?filter=all" },
 { label: "Attributed to VYA Click", value: data.kpis.matchedConversions, sub: "matched", href: "/admin/conversions?filter=all" },
 { label: "Unattributed", value: data.kpis.unmatchedConversions, sub: "unmatched", href: "/admin/conversions?filter=unmatched" },
 ].map((s) => (
 <Link
 key={s.label}
 href={s.href}
 style={{
 flex: "1 1 140px",
 background: s.sub === "matched" ? "#dcfce7" : s.sub === "unmatched" ? "#fef9c3" : BG_HOVER,
 borderRadius: 8,
 padding: "14px 18px",
 textDecoration: "none",
 display: "block",
 transition: "opacity 0.15s",
 border: `1px solid ${BORDER}`,
 }}
 onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
 onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
 >
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
 <p style={{ fontSize: 24, fontWeight: 700, color: DARK, margin: "0 0 4px", lineHeight: 1 }}>
 {s.value}
 </p>
 <span style={{ fontSize: 11, color: MUTED }}>→</span>
 </div>
 <p style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0, fontWeight: 500 }}>
 {s.label}
 </p>
 </Link>
 ))}
 </div>

 {/* The full order table used to render here as well. It is the same data as
     /admin/conversions, which has filtering and the unmatched queue — the three
     cards above already link into it, so the second copy was noise. */}
 <Link href="/admin/conversions?filter=all" style={{ fontSize: 12, color: GRAY, textDecoration: "none", borderBottom: `1px solid ${BORDER}`, paddingBottom: 1 }}>
 View full order history &rarr;
 </Link>
 </div>


 {/* ── Recent Activity ──────────────────────────────────────────── */}
 <div style={{ marginBottom: 36 }}>
 <SectionTitle>Recent Activity</SectionTitle>
 {data.recentActivity.length === 0 ? (
 <p style={{ fontSize: 13, color: MUTED }}>No recent activity.</p>
 ) : (
 <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
 {data.recentActivity.map((item, i) => (
 <div
 key={i}
 style={{
 display: "flex",
 alignItems: "center",
 gap: 12,
 padding: "9px 14px",
 border: `1px solid ${BORDER}`,
 borderRadius: 6,
 fontSize: 13,
 background: BG_CARD,
 }}
 >
 <span
 style={{
 fontSize: 10,
 fontWeight: 500,
 textTransform: "uppercase",
 letterSpacing: "0.06em",
 backgroundColor: "#f4f4f5",
 color: DARK,
 padding: "2px 7px",
 borderRadius: 4,
 whiteSpace: "nowrap",
 }}
 >
 VIEW
 </span>
 <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500, color: DARK }}>
 {item.productName ?? item.productId ?? "Unknown product"}
 </span>
 {item.store && (
 <span style={{ fontSize: 11, color: GRAY, whiteSpace: "nowrap" }}>
 {item.store}
 </span>
 )}
 <span style={{ fontSize: 11, color: MUTED, whiteSpace: "nowrap" }}>
 {relativeTime(item.timestamp)}
 </span>
 </div>
 ))}
 </div>
 )}
 </div>
 </>
 )}
 </div>
 </div>
 );
}

// ── CollabsTab ───────────────────────────────────────────────────────────────

function CollabsTab() {
 const [partnerships, setPartnerships] = React.useState<CollabsPartnership[]>([]);
 const [syncedAt, setSyncedAt] = React.useState<string | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [syncing, setSyncing] = React.useState(false);
 const [error, setError] = React.useState<string | null>(null);
 const [showCreds, setShowCreds] = React.useState(false);
 const [cookie, setCookie] = React.useState("");
 const [csrfToken, setCsrfToken] = React.useState("");
 const [savingCreds, setSavingCreds] = React.useState(false);
 const [credsMsg, setCredsMsg] = React.useState<string | null>(null);
 const [revenueSyncing, setRevenueSyncing] = React.useState(false);
 const [revenueSyncMsg, setRevenueSyncMsg] = React.useState<string | null>(null);

 const load = React.useCallback(async (forceSync = false) => {
 forceSync ? setSyncing(true) : setLoading(true);
 setError(null);
 try {
 const res = await fetch("/api/admin/sync-collabs" + (forceSync ? "?sync=1" : ""));
 const json = await res.json();
 if (!res.ok) {
 setError(json.error ?? `Error ${res.status}`);
 return;
 }
 setPartnerships(json.partnerships ?? []);
 setSyncedAt(json.syncedAt ?? null);
 } catch (e) {
 setError(String(e));
 } finally {
 setSyncing(false);
 setLoading(false);
 }
 }, []);

 React.useEffect(() => { load(); }, [load]);

 async function handleSync() {
 setSyncing(true);
 setError(null);
 try {
 const res = await fetch("/api/admin/sync-collabs");
 const json = await res.json();
 if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
 setPartnerships(json.partnerships ?? []);
 setSyncedAt(json.syncedAt ?? null);
 } catch (e) {
 setError(String(e));
 } finally {
 setSyncing(false);
 }
 }

 async function handleRevenueSync() {
 setRevenueSyncing(true);
 setRevenueSyncMsg(null);
 try {
 const res = await fetch("/api/admin/run-collabs-revenue-sync");
 const json = await res.json();
 if (!res.ok) {
 setRevenueSyncMsg(json.error ?? `Error ${res.status}`);
 } else {
 const recorded = json.newOrdersRecorded ?? 0;
 const retro = json.retroMatched ?? 0;
 setRevenueSyncMsg(
 recorded > 0
 ? `${recorded} new conversion${recorded !== 1 ? "s" : ""} recorded${retro > 0 ? ` · ${retro} retro-matched` : ""}`
 : `Up to date — no new conversions${retro > 0 ? ` · ${retro} retro-matched` : ""}`
 );
 }
 } catch (e) {
 setRevenueSyncMsg(String(e));
 } finally {
 setRevenueSyncing(false);
 }
 }

 async function handleSaveCreds() {
 if (!cookie.trim() || !csrfToken.trim()) return;
 setSavingCreds(true);
 setCredsMsg(null);
 try {
 const res = await fetch("/api/admin/sync-collabs", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ cookie: cookie.trim(), csrfToken: csrfToken.trim() }),
 });
 const json = await res.json();
 if (res.ok) {
 setCredsMsg("Credentials saved. Syncing now…");
 setCookie(""); setCsrfToken(""); setShowCreds(false);
 await handleSync();
 } else {
 setCredsMsg(json.error ?? "Failed to save credentials.");
 }
 } finally {
 setSavingCreds(false);
 }
 }

 const totalCommission = partnerships.reduce((sum, p) => {
 const val = parseFloat(p.totalCommissionEarned.replace(/[^0-9.]/g, "")) || 0;
 return sum + val;
 }, 0);
 const totalOrders = partnerships.reduce((sum, p) => sum + p.totalOrders, 0);
 const totalVisits = partnerships.reduce((sum, p) => sum + p.totalLinkVisits, 0);

 return (
 <div>
 {/* Header row */}
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
 <div>
 {syncedAt && (
 <p style={{ fontSize: 12, color: MUTED }}>
 Last synced {relativeTime(syncedAt)}
 </p>
 )}
 </div>
 <div style={{ display: "flex", gap: 8 }}>
 <button
 onClick={() => setShowCreds((v) => !v)}
 style={{ padding: "7px 16px", fontSize: 12, fontWeight: 500, border: `1px solid ${BORDER}`, background: "#fff", color: DARK, cursor: "pointer", borderRadius: 6 }}
 >
 Update Credentials
 </button>
 <button
 onClick={handleSync}
 disabled={syncing}
 style={{ padding: "7px 16px", fontSize: 12, fontWeight: 500, border: "none", background: PRIMARY, color: "#fff", cursor: syncing ? "not-allowed" : "pointer", opacity: syncing ? 0.6 : 1, borderRadius: 6 }}
 >
 {syncing ? "Syncing…" : "Sync Now"}
 </button>
 <button
 onClick={handleRevenueSync}
 disabled={revenueSyncing}
 style={{ padding: "7px 16px", fontSize: 12, fontWeight: 500, border: "none", background: "#16a34a", color: "#fff", cursor: revenueSyncing ? "not-allowed" : "pointer", opacity: revenueSyncing ? 0.6 : 1, borderRadius: 6 }}
 >
 {revenueSyncing ? "Recording…" : "Sync Conversions"}
 </button>
 </div>
 </div>

 {revenueSyncMsg && (
 <p style={{ fontSize: 13, color: revenueSyncMsg.includes("Error") || revenueSyncMsg.includes("failed") ? "#dc2626" : "#16a34a", marginBottom: 16 }}>
 {revenueSyncMsg}
 </p>
 )}

 {/* Credentials form */}
 {showCreds && (
 <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 20, marginBottom: 24 }}>
 <p style={{ fontSize: 13, fontWeight: 600, color: DARK, marginBottom: 12 }}>Update Shopify Collabs Session</p>
 <p style={{ fontSize: 12, color: GRAY, marginBottom: 16, lineHeight: 1.6 }}>
 Go to <strong>collabs.shopify.com</strong>, open DevTools → Network, click any request, and copy the <code style={{ background: "#f4f4f5", color: DARK, padding: "1px 4px", borderRadius: 4 }}>cookie</code> and <code style={{ background: "#f4f4f5", color: DARK, padding: "1px 4px", borderRadius: 4 }}>x-csrf-token</code> headers.
 </p>
 <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
 <textarea
 placeholder="Cookie string (starts with _shopify_y=...)"
 value={cookie}
 onChange={(e) => setCookie(e.target.value)}
 rows={3}
 style={{ width: "100%", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "8px 12px", fontSize: 12, color: DARK, fontFamily: "monospace", resize: "vertical" }}
 />
 <input
 placeholder="x-csrf-token"
 value={csrfToken}
 onChange={(e) => setCsrfToken(e.target.value)}
 style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: "8px 12px", fontSize: 12, color: DARK, fontFamily: "monospace" }}
 />
 <button
 onClick={handleSaveCreds}
 disabled={savingCreds || !cookie.trim() || !csrfToken.trim()}
 style={{ alignSelf: "flex-start", padding: "8px 20px", fontSize: 12, fontWeight: 500, background: PRIMARY, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", opacity: savingCreds ? 0.6 : 1 }}
 >
 {savingCreds ? "Saving…" : "Save & Sync"}
 </button>
 {credsMsg && <p style={{ fontSize: 12, color: GRAY }}>{credsMsg}</p>}
 </div>
 </div>
 )}

 {error && (
 <div style={{ padding: 14, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, color: "#b91c1c", fontSize: 13, marginBottom: 20 }}>
 {error}
 {error.toLowerCase().includes("expired") || error.toLowerCase().includes("credential") ? (
 <button onClick={() => setShowCreds(true)} style={{ marginLeft: 12, fontSize: 12, color: "#b91c1c", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}>
 Update credentials
 </button>
 ) : null}
 </div>
 )}

 {loading ? (
 <div style={{ textAlign: "center", padding: "60px 0", color: MUTED, fontSize: 14 }}>Loading…</div>
 ) : partnerships.length === 0 && !error ? (
 <div style={{ textAlign: "center", padding: "60px 0", color: MUTED, fontSize: 14 }}>
 No partnerships found. Try syncing or updating your credentials.
 </div>
 ) : (
 <>
 {/* Summary cards */}
 <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 28 }}>
 <StatCard label="Total Commission" value={`$${totalCommission.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
 <StatCard label="Total Orders" value={totalOrders.toLocaleString()} />
 <StatCard label="Total Link Visits" value={totalVisits.toLocaleString()} />
 <StatCard label="Active Partnerships" value={partnerships.length.toString()} />
 </div>

 {/* Partnerships table */}
 <div style={{ overflowX: "auto", border: `1px solid ${BORDER}`, borderRadius: 8 }}>
 <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
 <thead>
 <tr style={{ background: BG_HOVER }}>
 {["Store", "Link Visits", "Orders", "Commission Earned"].map((h) => (
 <th key={h} style={{ fontSize: 11, fontWeight: 500, color: MUTED, textTransform: "uppercase", letterSpacing: "0.07em", padding: "8px 12px", textAlign: h === "Store" ? "left" : "right", borderBottom: `1px solid ${BORDER}` }}>
 {h}
 </th>
 ))}
 </tr>
 </thead>
 <tbody>
 {partnerships
 .slice()
 .sort((a, b) => {
 const av = parseFloat(a.totalCommissionEarned.replace(/[^0-9.]/g, "")) || 0;
 const bv = parseFloat(b.totalCommissionEarned.replace(/[^0-9.]/g, "")) || 0;
 return bv - av;
 })
 .map((p, i) => (
 <tr key={p.id} style={{ backgroundColor: i % 2 === 0 ? BG_CARD : BG_HOVER, borderBottom: `1px solid ${BORDER}` }}>
 <td style={{ padding: "10px 12px", fontWeight: 600, color: DARK }}>
 <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
 {p.logoUrl && (
 <img src={p.logoUrl} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
 )}
 {p.name}
 </div>
 </td>
 <td style={{ padding: "10px 12px", textAlign: "right", color: GRAY }}>{p.totalLinkVisits.toLocaleString()}</td>
 <td style={{ padding: "10px 12px", textAlign: "right", color: GRAY }}>{p.totalOrders.toLocaleString()}</td>
 <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: DARK }}>{p.totalCommissionEarned}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </>
 )}
 </div>
 );
}

// ── InventoryTab ─────────────────────────────────────────────────────────────

function InventoryTab({ inv }: { inv: InventoryStats }) {
 const fmt = (n: number) =>
 "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

 return (
 <div>
 {/* Summary cards */}
 <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 36 }}>
 <StatCard label="Total Products" value={inv.productCount.toLocaleString()} />
 <StatCard label="Inventory Value" value={fmt(inv.inventoryValue)} />
 <StatCard label="Potential Commission" value={fmt(inv.potentialCommission)} />
 </div>

 {/* Commission tier breakdown */}
 <div style={{ marginBottom: 36 }}>
 <SectionTitle>Commission Tiers</SectionTitle>
 <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
 {[
 { label: "Under $1k · 7%", count: inv.tier1Count },
 { label: "$1k–$5k · 5%", count: inv.tier2Count },
 { label: "Over $5k · 3%", count: inv.tier3Count },
 ].map((tier) => (
 <div
 key={tier.label}
 style={{
 background: BG_CARD,
 border: `1px solid ${BORDER}`,
 borderRadius: 8,
 padding: "16px 24px",
 flex: "1 1 160px",
 }}
 >
 <p style={{ fontSize: 28, fontWeight: 700, color: DARK, margin: "0 0 4px", lineHeight: 1 }}>
 {tier.count.toLocaleString()}
 </p>
 <p style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0, fontWeight: 500 }}>
 {tier.label}
 </p>
 </div>
 ))}
 </div>
 </div>

 {/* Per-store table */}
 <div style={{ marginBottom: 36 }}>
 <SectionTitle>Inventory by Store</SectionTitle>
 {inv.byStore.length === 0 ? (
 <p style={{ fontSize: 13, color: MUTED }}>No inventory data.</p>
 ) : (
 <div style={{ overflowX: "auto", border: `1px solid ${BORDER}`, borderRadius: 8 }}>
 <table style={{ width: "100%", borderCollapse: "collapse" }}>
 <thead>
 <tr style={{ background: BG_HOVER }}>
 {["Store", "Products", "Inventory Value", "Potential Commission"].map((h) => (
 <th
 key={h}
 style={{
 fontSize: 11,
 fontWeight: 500,
 color: MUTED,
 textTransform: "uppercase",
 letterSpacing: "0.07em",
 padding: "8px 12px",
 textAlign: h === "Store" ? "left" : "right",
 borderBottom: `1px solid ${BORDER}`,
 }}
 >
 {h}
 </th>
 ))}
 </tr>
 </thead>
 <tbody>
 {inv.byStore.map((row, i) => (
 <tr key={row.storeSlug} style={{ backgroundColor: i % 2 === 0 ? BG_CARD : BG_HOVER }}>
 <td style={{ fontSize: 13, color: DARK, padding: "9px 12px", fontWeight: 600, borderBottom: `1px solid ${BORDER}` }}>
 {row.storeSlug}
 </td>
 <td style={{ fontSize: 13, color: DARK, padding: "9px 12px", textAlign: "right", borderBottom: `1px solid ${BORDER}` }}>
 {row.productCount.toLocaleString()}
 </td>
 <td style={{ fontSize: 13, color: DARK, padding: "9px 12px", textAlign: "right", borderBottom: `1px solid ${BORDER}` }}>
 {fmt(row.inventoryValue)}
 </td>
 <td style={{ fontSize: 13, color: DARK, padding: "9px 12px", textAlign: "right", borderBottom: `1px solid ${BORDER}` }}>
 {fmt(row.potentialCommission)}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>
 </div>
 );
}

// ── CohortRetentionChart ──────────────────────────────────────────────────────





// ── ProductList ───────────────────────────────────────────────────────────────

type ProductListItem = {
 productId: string;
 name: string | null;
 store: string | null;
 count: number;
 countLabel: string;
};

function ProductList({ items }: { items: ProductListItem[] }) {
 if (items.length === 0) {
 return <p style={{ fontSize: 13, color: MUTED }}>No data for this period.</p>;
 }

 return (
 <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
 {items.map((item, i) => {
 const displayName = item.name ?? item.productId ?? "Unknown";
 // Link to /products/[id] if productId looks like store-slug-number
 const linkHref = item.productId ? `/products/${item.productId}` : undefined;

 return (
 <div
 key={`${item.productId ?? "unknown"}-${i}`}
 style={{
 display: "flex",
 alignItems: "center",
 gap: 10,
 padding: "8px 12px",
 backgroundColor: i === 0 ? BG_HOVER : BG_CARD,
 border: `1px solid ${BORDER}`,
 borderRadius: 6,
 }}
 >
 <span style={{ fontSize: 11, fontWeight: 500, color: MUTED, width: 18, textAlign: "right", flexShrink: 0 }}>
 {i + 1}
 </span>
 <div style={{ flex: 1, minWidth: 0 }}>
 {linkHref ? (
 <Link
 href={linkHref}
 style={{
 fontSize: 13,
 color: DARK,
 fontWeight: 500,
 overflow: "hidden",
 textOverflow: "ellipsis",
 whiteSpace: "nowrap",
 display: "block",
 textDecoration: "none",
 }}
 title={displayName}
 >
 {displayName}
 </Link>
 ) : (
 <span
 style={{
 fontSize: 13,
 color: DARK,
 fontWeight: 500,
 overflow: "hidden",
 textOverflow: "ellipsis",
 whiteSpace: "nowrap",
 display: "block",
 }}
 title={displayName}
 >
 {displayName}
 </span>
 )}
 {item.store && (
 <span style={{ fontSize: 11, color: MUTED }}>{item.store}</span>
 )}
 </div>
 <span
 style={{
 fontSize: 12,
 fontWeight: 700,
 color: DARK,
 backgroundColor: "#f4f4f5",
 borderRadius: 999,
 padding: "2px 9px",
 whiteSpace: "nowrap",
 flexShrink: 0,
 }}
 >
 {item.count.toLocaleString()}
 </span>
 </div>
 );
 })}
 </div>
 );
}

// ── ConversionsTable ──────────────────────────────────────────────────────────



// ── StoresTable ───────────────────────────────────────────────────────────────

function StoresTable({ stores }: { stores: TopStore[] }) {
 if (stores.length === 0) {
 return <p style={{ fontSize: 13, color: MUTED }}>No store data for this period.</p>;
 }

 const headerStyle: React.CSSProperties = {
 fontSize: 11,
 fontWeight: 500,
 color: MUTED,
 textTransform: "uppercase",
 letterSpacing: "0.07em",
 padding: "8px 12px",
 textAlign: "left",
 borderBottom: `1px solid ${BORDER}`,
 background: BG_HOVER,
 };

 const cellStyle: React.CSSProperties = {
 fontSize: 13,
 color: DARK,
 padding: "9px 12px",
 borderBottom: `1px solid ${BORDER}`,
 };

 return (
 <div style={{ overflowX: "auto", border: `1px solid ${BORDER}`, borderRadius: 8 }}>
 <table style={{ width: "100%", borderCollapse: "collapse" }}>
 <thead>
 <tr>
 <th style={headerStyle}>Store</th>
 <th style={{ ...headerStyle, textAlign: "right" }}>Revenue</th>
 <th style={{ ...headerStyle, textAlign: "right" }}>Orders</th>
 <th style={{ ...headerStyle, textAlign: "right" }}>Views on VYA</th>
 </tr>
 </thead>
 <tbody>
 {stores.map((s, i) => (
 <tr key={s.store ?? i} style={{ backgroundColor: i % 2 === 0 ? BG_CARD : BG_HOVER }}>
 <td style={{ ...cellStyle, fontWeight: 600 }}>{s.store ?? "—"}</td>
 <td style={{ ...cellStyle, textAlign: "right", fontWeight: 600 }}>{formatRevenueShort(s.revenue)}</td>
 <td style={{ ...cellStyle, textAlign: "right" }}>{s.conversions.toLocaleString()}</td>
 <td style={{ ...cellStyle, textAlign: "right" }}>{s.clicks.toLocaleString()}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 );
}
