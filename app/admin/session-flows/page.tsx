"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ── Colour tokens ─────────────────────────────────────────────────────────────

const DARK = "#09090b";
const GRAY = "#71717a";
const MUTED = "#a1a1aa";
const BORDER = "#e4e4e7";
const BG_PAGE = "#f8f9fa";
const BG_CARD = "#ffffff";
const BG_HOVER = "#fafafa";
const PRIMARY = "#18181b";
const ACCENT = "#5D0F17";

// ── Types ─────────────────────────────────────────────────────────────────────

type DateRange = "7d" | "30d" | "all";

type Summary = {
 totalSessions: number;
 uniqueUsers: number;
 avgDepth: number;
 avgDurationSeconds: number;
 bounceRate: number;
};

type FunnelStage = {
 stage: string;
 sessions: number;
 pct: number;
};

type Transition = {
 fromPage: string;
 toPage: string;
 count: number;
};

type TopPath = {
 path: string;
 count: number;
};

type ExitRate = {
 page: string;
 exits: number;
 totalVisits: number;
 exitRate: number;
};

type TimeOnPage = {
 page: string;
 avgMs: number;
 sampleSize: number;
};

type SessionFlowsData = {
 summary: Summary;
 funnel: FunnelStage[];
 transitions: Transition[];
 topPaths: TopPath[];
 exitRates: ExitRate[];
 timeOnPage: TimeOnPage[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
 if (!seconds || isNaN(seconds)) return "0s";
 const s = Math.round(seconds);
 if (s < 60) return `${s}s`;
 const m = Math.floor(s / 60);
 const rem = s % 60;
 if (rem === 0) return `${m}m`;
 return `${m}m ${rem}s`;
}

function formatMs(ms: number): string {
 if (!ms || isNaN(ms)) return "0s";
 const s = Math.round(ms / 1000);
 if (s < 60) return `${s}s`;
 const m = Math.floor(s / 60);
 const rem = s % 60;
 if (rem === 0) return `${m}m`;
 return `${m}m ${rem}s`;
}

function formatPct(n: number): string {
 if (!n || isNaN(n)) return "0%";
 return `${Math.round(n * 100)}%`;
}

function capitalize(s: string): string {
 return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
 return (
 <h2
 style={{
 fontSize: 11,
 fontWeight: 500,
 color: MUTED,
 textTransform: "uppercase",
 letterSpacing: "0.1em",
 margin: "0 0 14px",
 }}
 >
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

function StatCard({
 label,
 value,
 sub,
}: {
 label: string;
 value: string | number;
 sub?: string;
}) {
 return (
 <div
 style={{
 backgroundColor: BG_HOVER,
 borderRadius: 8,
 padding: "16px 20px",
 minWidth: 140,
 flex: "1 1 160px",
 border: `1px solid ${BORDER}`,
 }}
 >
 <p
 style={{
 fontSize: 11,
 color: MUTED,
 textTransform: "uppercase",
 letterSpacing: "0.08em",
 margin: "0 0 6px",
 fontWeight: 500,
 }}
 >
 {label}
 </p>
 <p
 style={{
 fontSize: 24,
 fontWeight: 700,
 color: DARK,
 margin: 0,
 lineHeight: 1,
 }}
 >
 {value}
 </p>
 {sub && (
 <p style={{ fontSize: 10, color: MUTED, margin: "4px 0 0" }}>{sub}</p>
 )}
 </div>
 );
}

// ── Funnel Visualization ──────────────────────────────────────────────────────

function FunnelChart({ stages }: { stages: FunnelStage[] }) {
 if (!stages.length) return <p style={{ color: MUTED, fontSize: 13 }}>No data</p>;
 const maxSessions = stages[0]?.sessions ?? 1;

 return (
 <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
 {stages.map((stage, i) => {
 const barPct = maxSessions > 0 ? (stage.sessions / maxSessions) * 100 : 0;
 const dropOff =
 i < stages.length - 1
 ? stages[i].sessions - stages[i + 1].sessions
 : null;
 const dropOffPct =
 dropOff !== null && stages[i].sessions > 0
 ? Math.round((dropOff / stages[i].sessions) * 100)
 : null;
 // Opacity fades from 0.9 to 0.45 across stages
 const opacity = 0.9 - (i / Math.max(stages.length - 1, 1)) * 0.45;

 return (
 <div key={stage.stage}>
 <div
 style={{
 display: "flex",
 alignItems: "center",
 gap: 10,
 marginBottom: 3,
 }}
 >
 <div style={{ width: 130, flexShrink: 0 }}>
 <span style={{ fontSize: 12, fontWeight: 500, color: DARK }}>
 {stage.stage}
 </span>
 </div>
 <div
 style={{
 flex: 1,
 height: 28,
 background: BORDER,
 borderRadius: 4,
 overflow: "hidden",
 position: "relative",
 }}
 >
 <div
 style={{
 width: `${barPct}%`,
 height: "100%",
 backgroundColor: ACCENT,
 opacity,
 borderRadius: 4,
 transition: "width 0.4s ease",
 display: "flex",
 alignItems: "center",
 paddingLeft: barPct > 15 ? 10 : 0,
 boxSizing: "border-box",
 }}
 >
 {barPct > 15 && (
 <span
 style={{
 fontSize: 11,
 fontWeight: 600,
 color: "#fff",
 whiteSpace: "nowrap",
 }}
 >
 {stage.sessions.toLocaleString()}
 </span>
 )}
 </div>
 {barPct <= 15 && (
 <span
 style={{
 position: "absolute",
 left: `calc(${barPct}% + 8px)`,
 top: "50%",
 transform: "translateY(-50%)",
 fontSize: 11,
 fontWeight: 600,
 color: DARK,
 }}
 >
 {stage.sessions.toLocaleString()}
 </span>
 )}
 </div>
 <div
 style={{
 width: 60,
 textAlign: "right",
 fontSize: 12,
 fontWeight: 600,
 color: GRAY,
 flexShrink: 0,
 }}
 >
 {Math.round(stage.pct)}%
 </div>
 </div>
 {dropOff !== null && dropOffPct !== null && dropOff > 0 && (
 <div
 style={{
 marginLeft: 140,
 marginBottom: 4,
 display: "flex",
 alignItems: "center",
 gap: 4,
 }}
 >
 <span style={{ fontSize: 10, color: "#dc2626", fontWeight: 500 }}>
 ↓ {dropOff.toLocaleString()} dropped ({dropOffPct}%)
 </span>
 </div>
 )}
 </div>
 );
 })}
 </div>
 );
}

// ── Transitions ───────────────────────────────────────────────────────────────

function TransitionsSection({ transitions }: { transitions: Transition[] }) {
 if (!transitions.length)
 return <p style={{ color: MUTED, fontSize: 13 }}>No data</p>;

 // Group by fromPage
 const byPage: Record<string, Transition[]> = {};
 for (const t of transitions) {
 if (!byPage[t.fromPage]) byPage[t.fromPage] = [];
 byPage[t.fromPage].push(t);
 }

 // Sort pages by total outbound transitions
 const sortedPages = Object.entries(byPage)
 .map(([page, rows]) => ({
 page,
 rows,
 total: rows.reduce((s, r) => s + r.count, 0),
 }))
 .sort((a, b) => b.total - a.total);

 return (
 <div
 style={{
 display: "grid",
 gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
 gap: 16,
 }}
 >
 {sortedPages.map(({ page, rows, total }) => {
 // Top 5 destinations + exit
 const topRows = rows.slice(0, 6);
 const maxCount = topRows[0]?.count ?? 1;

 return (
 <div
 key={page}
 style={{
 backgroundColor: BG_CARD,
 border: `1px solid ${BORDER}`,
 borderRadius: 8,
 padding: "14px 16px",
 }}
 >
 <div
 style={{
 display: "flex",
 justifyContent: "space-between",
 alignItems: "center",
 marginBottom: 10,
 }}
 >
 <span
 style={{ fontSize: 13, fontWeight: 600, color: DARK }}
 >
 {capitalize(page)}
 </span>
 <span style={{ fontSize: 11, color: MUTED }}>
 {total.toLocaleString()} transitions
 </span>
 </div>
 <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
 {topRows.map((row) => {
 const isExit = row.toPage === "exit";
 const barW =
 maxCount > 0 ? (row.count / maxCount) * 100 : 0;
 return (
 <div key={row.toPage} style={{ display: "flex", alignItems: "center", gap: 8 }}>
 <div style={{ width: 76, flexShrink: 0 }}>
 <span
 style={{
 fontSize: 11,
 color: isExit ? MUTED : DARK,
 fontStyle: isExit ? "italic" : "normal",
 }}
 >
 {isExit ? "exit" : capitalize(row.toPage)}
 </span>
 </div>
 <div
 style={{
 flex: 1,
 height: 14,
 background: BORDER,
 borderRadius: 3,
 overflow: "hidden",
 }}
 >
 <div
 style={{
 width: `${barW}%`,
 height: "100%",
 backgroundColor: isExit ? MUTED : PRIMARY,
 borderRadius: 3,
 transition: "width 0.3s ease",
 }}
 />
 </div>
 <span
 style={{
 fontSize: 11,
 color: GRAY,
 width: 36,
 textAlign: "right",
 flexShrink: 0,
 }}
 >
 {row.count}
 </span>
 </div>
 );
 })}
 </div>
 </div>
 );
 })}
 </div>
 );
}

// ── Top Paths ─────────────────────────────────────────────────────────────────

function TopPathsSection({ paths }: { paths: TopPath[] }) {
 if (!paths.length) return <p style={{ color: MUTED, fontSize: 13 }}>No data</p>;
 const top15 = paths.slice(0, 15);
 const maxCount = top15[0]?.count ?? 1;

 return (
 <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
 {top15.map((p, i) => {
 const barW = maxCount > 0 ? (p.count / maxCount) * 100 : 0;
 return (
 <div
 key={i}
 style={{
 display: "flex",
 alignItems: "center",
 gap: 10,
 padding: "6px 0",
 borderBottom: i < top15.length - 1 ? `1px solid ${BORDER}` : "none",
 }}
 >
 <span
 style={{
 width: 22,
 fontSize: 11,
 color: MUTED,
 flexShrink: 0,
 textAlign: "right",
 }}
 >
 {i + 1}
 </span>
 <div
 style={{
 flex: 1,
 position: "relative",
 minWidth: 0,
 }}
 >
 <div
 style={{
 height: 22,
 background: BORDER,
 borderRadius: 3,
 overflow: "hidden",
 marginBottom: 3,
 }}
 >
 <div
 style={{
 width: `${barW}%`,
 height: "100%",
 backgroundColor: ACCENT,
 opacity: 0.7,
 borderRadius: 3,
 transition: "width 0.3s ease",
 }}
 />
 </div>
 <span
 style={{
 fontSize: 11,
 color: DARK,
 whiteSpace: "nowrap",
 overflow: "hidden",
 textOverflow: "ellipsis",
 display: "block",
 }}
 >
 {p.path}
 </span>
 </div>
 <span
 style={{
 fontSize: 12,
 fontWeight: 600,
 color: GRAY,
 width: 44,
 textAlign: "right",
 flexShrink: 0,
 }}
 >
 {p.count}
 </span>
 </div>
 );
 })}
 </div>
 );
}

// ── Exit Rates ────────────────────────────────────────────────────────────────

function ExitRatesSection({ exitRates }: { exitRates: ExitRate[] }) {
 if (!exitRates.length)
 return <p style={{ color: MUTED, fontSize: 13 }}>No data</p>;

 return (
 <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
 {exitRates.map((er, i) => {
 const pct = Math.round(er.exitRate * 100);
 const barColor =
 pct >= 70 ? "#dc2626" : pct >= 40 ? "#f59e0b" : "#16a34a";

 return (
 <div
 key={er.page}
 style={{
 display: "flex",
 alignItems: "center",
 gap: 10,
 padding: "5px 0",
 borderBottom:
 i < exitRates.length - 1 ? `1px solid ${BORDER}` : "none",
 }}
 >
 <div style={{ width: 110, flexShrink: 0 }}>
 <span style={{ fontSize: 12, fontWeight: 500, color: DARK }}>
 {capitalize(er.page)}
 </span>
 </div>
 <div
 style={{
 flex: 1,
 height: 18,
 background: BORDER,
 borderRadius: 3,
 overflow: "hidden",
 }}
 >
 <div
 style={{
 width: `${pct}%`,
 height: "100%",
 backgroundColor: barColor,
 opacity: 0.75,
 borderRadius: 3,
 transition: "width 0.3s ease",
 }}
 />
 </div>
 <div
 style={{
 width: 100,
 textAlign: "right",
 flexShrink: 0,
 display: "flex",
 gap: 8,
 justifyContent: "flex-end",
 alignItems: "center",
 }}
 >
 <span
 style={{
 fontSize: 12,
 fontWeight: 700,
 color: barColor,
 }}
 >
 {pct}%
 </span>
 <span style={{ fontSize: 11, color: MUTED }}>
 {er.exits}/{er.totalVisits}
 </span>
 </div>
 </div>
 );
 })}
 </div>
 );
}

// ── Time on Page ──────────────────────────────────────────────────────────────

function TimeOnPageSection({ items }: { items: TimeOnPage[] }) {
 const filtered = items.filter((i) => i.sampleSize > 0);
 if (!filtered.length)
 return <p style={{ color: MUTED, fontSize: 13 }}>No data yet — time-on-page tracking requires the new session flow columns.</p>;

 const maxMs = filtered[0]?.avgMs ?? 1;

 return (
 <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
 {filtered.map((item, i) => {
 const barW = maxMs > 0 ? (item.avgMs / maxMs) * 100 : 0;

 return (
 <div
 key={item.page}
 style={{
 display: "flex",
 alignItems: "center",
 gap: 10,
 padding: "5px 0",
 borderBottom:
 i < filtered.length - 1 ? `1px solid ${BORDER}` : "none",
 }}
 >
 <div style={{ width: 110, flexShrink: 0 }}>
 <span style={{ fontSize: 12, fontWeight: 500, color: DARK }}>
 {capitalize(item.page)}
 </span>
 </div>
 <div
 style={{
 flex: 1,
 height: 18,
 background: BORDER,
 borderRadius: 3,
 overflow: "hidden",
 }}
 >
 <div
 style={{
 width: `${barW}%`,
 height: "100%",
 backgroundColor: PRIMARY,
 opacity: 0.65,
 borderRadius: 3,
 transition: "width 0.3s ease",
 }}
 />
 </div>
 <div
 style={{
 width: 110,
 textAlign: "right",
 flexShrink: 0,
 display: "flex",
 gap: 6,
 justifyContent: "flex-end",
 alignItems: "center",
 }}
 >
 <span style={{ fontSize: 12, fontWeight: 600, color: DARK }}>
 {formatMs(item.avgMs)}
 </span>
 <span style={{ fontSize: 10, color: MUTED }}>
 n={item.sampleSize}
 </span>
 </div>
 </div>
 );
 })}
 </div>
 );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SessionFlowsPage() {
 const [range, setRange] = useState<DateRange>("all");
 const [data, setData] = useState<SessionFlowsData | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);

 const fetchData = useCallback(async (r: DateRange) => {
 setLoading(true);
 setError(null);
 try {
 const res = await fetch(`/api/admin/session-flows?range=${r}`, {
 credentials: "include",
 });
 if (!res.ok) {
 const body = await res.json().catch(() => ({}));
 throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
 }
 const json = await res.json();
 setData(json as SessionFlowsData);
 } catch (e) {
 setError(e instanceof Error ? e.message : "Unknown error");
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 fetchData(range);
 }, [range, fetchData]);

 return (
 <div
 style={{
 minHeight: "100vh",
 backgroundColor: BG_PAGE,
 padding: "32px 24px",
 fontFamily:
 '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
 color: DARK,
 }}
 >
 <div style={{ maxWidth: 1100, margin: "0 auto" }}>
 {/* Header */}
 <div
 style={{
 display: "flex",
 alignItems: "center",
 justifyContent: "space-between",
 marginBottom: 28,
 flexWrap: "wrap",
 gap: 12,
 }}
 >
 <div>
 <Link
 href="/admin/analytics"
 style={{
 fontSize: 12,
 color: MUTED,
 textDecoration: "none",
 display: "inline-flex",
 alignItems: "center",
 gap: 4,
 marginBottom: 6,
 }}
 >
 ← Analytics
 </Link>
 <h1
 style={{
 fontSize: 22,
 fontWeight: 700,
 margin: 0,
 color: DARK,
 }}
 >
 Session Flows
 </h1>
 </div>
 <div style={{ display: "flex", gap: 6 }}>
 {(["7d", "30d", "all"] as DateRange[]).map((r) => (
 <RangeButton
 key={r}
 label={r.toUpperCase()}
 active={range === r}
 onClick={() => setRange(r)}
 />
 ))}
 </div>
 </div>

 {/* Loading */}
 {loading && (
 <div
 style={{
 display: "flex",
 justifyContent: "center",
 alignItems: "center",
 minHeight: 200,
 color: MUTED,
 fontSize: 14,
 }}
 >
 Loading session flow data...
 </div>
 )}

 {/* Error */}
 {error && !loading && (
 <div
 style={{
 backgroundColor: "#fef2f2",
 border: "1px solid #fecaca",
 borderRadius: 8,
 padding: "16px 20px",
 color: "#dc2626",
 fontSize: 13,
 marginBottom: 24,
 }}
 >
 Error: {error}
 </div>
 )}

 {/* Content */}
 {data && !loading && (
 <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
 {/* Summary Stats */}
 <section>
 <SectionTitle>Overview</SectionTitle>
 <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
 <StatCard
 label="Total Sessions"
 value={data.summary.totalSessions.toLocaleString()}
 sub={`${data.summary.uniqueUsers.toLocaleString()} unique users`}
 />
 <StatCard
 label="Avg Depth"
 value={`${data.summary.avgDepth.toFixed(1)} pages`}
 />
 <StatCard
 label="Avg Duration"
 value={formatDuration(data.summary.avgDurationSeconds)}
 />
 <StatCard
 label="Bounce Rate"
 value={formatPct(data.summary.bounceRate)}
 sub="single-page sessions"
 />
 </div>
 </section>

 {/* Conversion Funnel */}
 <section>
 <SectionTitle>Conversion Funnel</SectionTitle>
 <div
 style={{
 backgroundColor: BG_CARD,
 border: `1px solid ${BORDER}`,
 borderRadius: 8,
 padding: "20px 24px",
 }}
 >
 <FunnelChart stages={data.funnel} />
 </div>
 </section>

 {/* Page Transitions */}
 <section>
 <SectionTitle>Page Transitions</SectionTitle>
 <TransitionsSection transitions={data.transitions} />
 </section>

 {/* Top Paths */}
 <section>
 <SectionTitle>Top Session Paths</SectionTitle>
 <div
 style={{
 backgroundColor: BG_CARD,
 border: `1px solid ${BORDER}`,
 borderRadius: 8,
 padding: "20px 24px",
 }}
 >
 <TopPathsSection paths={data.topPaths} />
 </div>
 </section>

 {/* Exit Rates */}
 <section>
 <SectionTitle>Exit Rates by Page</SectionTitle>
 <div
 style={{
 backgroundColor: BG_CARD,
 border: `1px solid ${BORDER}`,
 borderRadius: 8,
 padding: "20px 24px",
 }}
 >
 <ExitRatesSection exitRates={data.exitRates} />
 </div>
 </section>

 {/* Time on Page */}
 <section>
 <SectionTitle>Time on Page</SectionTitle>
 <div
 style={{
 backgroundColor: BG_CARD,
 border: `1px solid ${BORDER}`,
 borderRadius: 8,
 padding: "20px 24px",
 }}
 >
 <TimeOnPageSection items={data.timeOnPage} />
 </div>
 </section>
 </div>
 )}
 </div>
 </div>
 );
}
