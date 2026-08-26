"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type DateRange = "7d" | "30d" | "all";

type Summary = {
 totalSearches: number;
 uniqueQueries: number;
 avgResults: number;
 zeroResultCount: number;
 zeroResultPct: number;
};

type QueryRow = {
 query: string;
 searchCount: number;
 avgResults: number;
 zeroHits: number;
 lastSearched: string;
};

type ZeroRow = {
 query: string;
 searchCount: number;
 lastSearched: string;
};

type LowRow = {
 query: string;
 searchCount: number;
 avgResults: number;
 lastSearched: string;
};

type Data = {
 summary: Summary;
 topQueries: QueryRow[];
 zeroResults: ZeroRow[];
 lowResults: LowRow[];
};

const DARK = "#09090b";
const GRAY = "#71717a";
const MUTED = "#a1a1aa";
const BORDER = "#e4e4e7";
const BG_PAGE = "#f8f9fa";
const BG_CARD = "#ffffff";
const PRIMARY = "#18181b";
const ACCENT = "#5D0F17";
const RED = "#dc2626";
const AMBER = "#d97706";
const GREEN = "#16a34a";

function fmt(d: string) {
 return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
 return (
 <div style={{ backgroundColor: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "16px 20px", flex: "1 1 160px", minWidth: 140 }}>
 <p style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px", fontWeight: 500 }}>{label}</p>
 <p style={{ fontSize: 24, fontWeight: 700, color: color ?? DARK, margin: 0, lineHeight: 1 }}>{value}</p>
 {sub && <p style={{ fontSize: 10, color: MUTED, margin: "4px 0 0" }}>{sub}</p>}
 </div>
 );
}

function RangeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
 return (
 <button onClick={onClick} style={{ padding: "5px 14px", fontSize: 12, fontWeight: 500, borderRadius: 6, border: `1px solid ${BORDER}`, backgroundColor: active ? PRIMARY : BG_CARD, color: active ? "#fff" : DARK, cursor: "pointer" }}>
 {label}
 </button>
 );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
 return <h2 style={{ fontSize: 11, fontWeight: 500, color: MUTED, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 14px" }}>{children}</h2>;
}

export default function SearchAnalyticsPage() {
 const [range, setRange] = useState<DateRange>("all");
 const [data, setData] = useState<Data | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);

 const fetchData = useCallback(async (r: DateRange) => {
 setLoading(true);
 setError(null);
 try {
 const res = await fetch(`/api/admin/search-analytics?range=${r}`, { credentials: "include" });
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 setData(await res.json());
 } catch (e) {
 setError(e instanceof Error ? e.message : "Unknown error");
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => { fetchData(range); }, [range, fetchData]);

 return (
 <div style={{ minHeight: "100vh", backgroundColor: BG_PAGE, padding: "32px 24px", fontFamily: "Arial, sans-serif", color: DARK }}>
 <div style={{ maxWidth: 1100, margin: "0 auto" }}>

 {/* Header */}
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
 <div>
 <Link href="/admin/analytics" style={{ fontSize: 12, color: MUTED, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
 ← Analytics
 </Link>
 <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Search Analytics</h1>
 <p style={{ fontSize: 13, color: GRAY, margin: "4px 0 0" }}>What people are searching — and where results fall short</p>
 </div>
 <div style={{ display: "flex", gap: 6 }}>
 {(["7d", "30d", "all"] as DateRange[]).map((r) => (
 <RangeButton key={r} label={r.toUpperCase()} active={range === r} onClick={() => setRange(r)} />
 ))}
 </div>
 </div>

 {loading && <div style={{ textAlign: "center", padding: 60, color: MUTED, fontSize: 14 }}>Loading...</div>}
 {error && <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "16px 20px", color: RED, fontSize: 13 }}>Error: {error}</div>}

 {data && !loading && (
 <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>

 {/* Summary */}
 <section>
 <SectionTitle>Overview</SectionTitle>
 <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
 <StatCard label="Total Searches" value={data.summary.totalSearches.toLocaleString()} sub={`${data.summary.uniqueQueries.toLocaleString()} unique queries`} />
 <StatCard label="Avg Results" value={data.summary.avgResults.toFixed(1)} sub="products per search" />
 <StatCard label="Zero-Result Searches" value={data.summary.zeroResultCount.toLocaleString()} color={data.summary.zeroResultPct > 20 ? RED : data.summary.zeroResultPct > 10 ? AMBER : GREEN} sub={`${data.summary.zeroResultPct.toFixed(1)}% of all searches`} />
 </div>
 </section>

 {/* Zero Results — most actionable */}
 <section>
 <SectionTitle>Searches with Zero Results — add inventory or fix keywords</SectionTitle>
 <div style={{ backgroundColor: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
 {data.zeroResults.length === 0 ? (
 <p style={{ color: MUTED, fontSize: 13, padding: "20px 24px", margin: 0 }}>No zero-result searches in this period.</p>
 ) : (
 <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
 <thead>
 <tr style={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: BG_PAGE }}>
 <th style={{ textAlign: "left", padding: "10px 20px", fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>Query</th>
 <th style={{ textAlign: "right", padding: "10px 20px", fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>Searches</th>
 <th style={{ textAlign: "right", padding: "10px 20px", fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>Last Searched</th>
 </tr>
 </thead>
 <tbody>
 {data.zeroResults.map((row, i) => (
 <tr key={row.query} style={{ borderBottom: i < data.zeroResults.length - 1 ? `1px solid ${BORDER}` : "none" }}>
 <td style={{ padding: "10px 20px", fontWeight: 500, color: RED }}>{row.query}</td>
 <td style={{ padding: "10px 20px", textAlign: "right", color: GRAY }}>{row.searchCount}</td>
 <td style={{ padding: "10px 20px", textAlign: "right", color: MUTED, fontSize: 12 }}>{fmt(row.lastSearched)}</td>
 </tr>
 ))}
 </tbody>
 </table>
 )}
 </div>
 </section>

 {/* Low Results */}
 {data.lowResults.length > 0 && (
 <section>
 <SectionTitle>Searches with Very Few Results (1–4) — poor coverage</SectionTitle>
 <div style={{ backgroundColor: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
 <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
 <thead>
 <tr style={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: BG_PAGE }}>
 <th style={{ textAlign: "left", padding: "10px 20px", fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>Query</th>
 <th style={{ textAlign: "right", padding: "10px 20px", fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>Searches</th>
 <th style={{ textAlign: "right", padding: "10px 20px", fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>Avg Results</th>
 <th style={{ textAlign: "right", padding: "10px 20px", fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>Last Searched</th>
 </tr>
 </thead>
 <tbody>
 {data.lowResults.map((row, i) => (
 <tr key={row.query} style={{ borderBottom: i < data.lowResults.length - 1 ? `1px solid ${BORDER}` : "none" }}>
 <td style={{ padding: "10px 20px", fontWeight: 500, color: AMBER }}>{row.query}</td>
 <td style={{ padding: "10px 20px", textAlign: "right", color: GRAY }}>{row.searchCount}</td>
 <td style={{ padding: "10px 20px", textAlign: "right", color: GRAY }}>{row.avgResults.toFixed(1)}</td>
 <td style={{ padding: "10px 20px", textAlign: "right", color: MUTED, fontSize: 12 }}>{fmt(row.lastSearched)}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </section>
 )}

 {/* Top Queries */}
 <section>
 <SectionTitle>Top Queries</SectionTitle>
 <div style={{ backgroundColor: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
 <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
 <thead>
 <tr style={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: BG_PAGE }}>
 <th style={{ textAlign: "left", padding: "10px 20px", fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>Query</th>
 <th style={{ textAlign: "right", padding: "10px 20px", fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>Searches</th>
 <th style={{ textAlign: "right", padding: "10px 20px", fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>Avg Results</th>
 <th style={{ textAlign: "right", padding: "10px 20px", fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>Zero Hits</th>
 <th style={{ textAlign: "right", padding: "10px 20px", fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>Last Searched</th>
 </tr>
 </thead>
 <tbody>
 {data.topQueries.map((row, i) => {
 const zeroRatio = row.searchCount > 0 ? row.zeroHits / row.searchCount : 0;
 const resultsColor = row.avgResults === 0 ? RED : row.avgResults < 5 ? AMBER : GREEN;
 const maxCount = data.topQueries[0]?.searchCount ?? 1;
 const barW = (row.searchCount / maxCount) * 100;
 return (
 <tr key={row.query} style={{ borderBottom: i < data.topQueries.length - 1 ? `1px solid ${BORDER}` : "none" }}>
 <td style={{ padding: "10px 20px" }}>
 <div style={{ fontWeight: 500, color: DARK, marginBottom: 4 }}>{row.query}</div>
 <div style={{ height: 4, backgroundColor: BORDER, borderRadius: 2, width: 160 }}>
 <div style={{ height: "100%", width: `${barW}%`, backgroundColor: ACCENT, opacity: 0.6, borderRadius: 2 }} />
 </div>
 </td>
 <td style={{ padding: "10px 20px", textAlign: "right", color: GRAY, fontWeight: 600 }}>{row.searchCount}</td>
 <td style={{ padding: "10px 20px", textAlign: "right", fontWeight: 600, color: resultsColor }}>{row.avgResults}</td>
 <td style={{ padding: "10px 20px", textAlign: "right", color: zeroRatio > 0.5 ? RED : GRAY, fontSize: 12 }}>
 {row.zeroHits > 0 ? `${row.zeroHits} (${Math.round(zeroRatio * 100)}%)` : "—"}
 </td>
 <td style={{ padding: "10px 20px", textAlign: "right", color: MUTED, fontSize: 12 }}>{fmt(row.lastSearched)}</td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 </section>

 </div>
 )}
 </div>
 </div>
 );
}
