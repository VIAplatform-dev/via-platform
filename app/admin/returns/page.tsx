"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type WindowStats = {
 totalOrders: number;
 totalReturns: number;
 totalGmv: number;
 returnedValue: number;
 returnRate: number;
};

type StoreReturn = {
 storeSlug: string;
 storeName: string;
 totalOrders: number;
 returnCount: number;
 returnedValue: number;
 totalValue: number;
 returnRate: number;
};

type ReturnRecord = {
 conversionId: string;
 orderId: string;
 orderTotal: number;
 currency: string;
 storeSlug: string;
 storeName: string;
 timestamp: string;
 returnedAt: string | null;
 items: { productName: string; quantity: number; price: number }[];
 userEmail: string | null;
 userName: string | null;
};

type Data = {
 summary: {
 allTime: WindowStats;
 thirtyDay: WindowStats;
 sevenDay: WindowStats;
 };
 byStore: StoreReturn[];
 recent: ReturnRecord[];
};

function fmt(n: number, currency = "USD") {
 return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}
function fmtDate(ts: string) {
 return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function pct(n: number) {
 return n.toFixed(1) + "%";
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
 return (
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", padding: "20px 24px", borderRadius: 8 }}>
 <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 6 }}>{label}</div>
 <div style={{ fontSize: 28, fontWeight: 600, color: "#09090b", lineHeight: 1 }}>{value}</div>
 {sub && <div style={{ fontSize: 11, color: "#71717a", marginTop: 6 }}>{sub}</div>}
 </div>
 );
}

function WindowSection({ label, stats }: { label: string; stats: WindowStats }) {
 return (
 <div style={{ marginBottom: 32 }}>
 <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 12 }}>{label}</div>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
 <StatCard label="Return Rate" value={pct(stats.returnRate)} sub={`${stats.totalReturns} of ${stats.totalOrders} orders`} />
 <StatCard label="Returned Value" value={fmt(stats.returnedValue)} />
 <StatCard label="Net GMV" value={fmt(stats.totalGmv)} sub="after returns" />
 <StatCard label="Returns" value={String(stats.totalReturns)} />
 </div>
 </div>
 );
}

export default function AdminReturnsPage() {
 const [data, setData] = useState<Data | null>(null);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 fetch("/api/admin/returns")
 .then((r) => r.json())
 .then((d) => { setData(d); setLoading(false); })
 .catch(() => setLoading(false));
 }, []);

 return (
 <div style={{ minHeight: "100vh", background: "#f8f9fa" }}>
 <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
 <div style={{ marginBottom: 32 }}>
 <h1 style={{ fontSize: 20, fontWeight: 600, color: "#09090b", marginBottom: 4 }}>Returns</h1>
 <p style={{ fontSize: 13, color: "#71717a" }}>
 Return rate and value across all tracked orders.{" "}
 <Link href="/admin/conversions?filter=all" style={{ color: "#09090b", textDecoration: "underline" }}>
 Mark returns in Conversions →
 </Link>
 </p>
 </div>

 {loading && (
 <div style={{ color: "#a1a1aa", fontSize: 13 }}>Loading...</div>
 )}

 {!loading && data && (
 <>
 <WindowSection label="Last 7 Days" stats={data.summary.sevenDay} />
 <WindowSection label="Last 30 Days" stats={data.summary.thirtyDay} />
 <WindowSection label="All Time" stats={data.summary.allTime} />

 {/* By store */}
 {data.byStore.length > 0 && (
 <div style={{ marginBottom: 40 }}>
 <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 12 }}>
 Returns by Store
 </div>
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, overflow: "hidden" }}>
 <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
 <thead>
 <tr style={{ background: "#fafafa", borderBottom: "1px solid #e4e4e7" }}>
 {["Store", "Orders", "Returns", "Return Rate", "Returned Value", "Total GMV"].map((h) => (
 <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
 ))}
 </tr>
 </thead>
 <tbody>
 {data.byStore.map((s, i) => (
 <tr key={s.storeSlug} style={{ borderBottom: i < data.byStore.length - 1 ? "1px solid #f4f4f5" : "none" }}
 onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
 onMouseLeave={(e) => (e.currentTarget.style.background = "")}
 >
 <td style={{ padding: "12px 16px", color: "#09090b", fontWeight: 500 }}>
 <Link href={`/admin/stores/${s.storeSlug}`} style={{ color: "#09090b", textDecoration: "none" }}>
 {s.storeName || s.storeSlug}
 </Link>
 </td>
 <td style={{ padding: "12px 16px", color: "#71717a" }}>{s.totalOrders}</td>
 <td style={{ padding: "12px 16px", color: "#71717a" }}>{s.returnCount}</td>
 <td style={{ padding: "12px 16px", color: s.returnRate > 15 ? "#dc2626" : s.returnRate > 8 ? "#854d0e" : "#71717a", fontWeight: s.returnRate > 8 ? 600 : 400 }}>
 {pct(s.returnRate)}
 </td>
 <td style={{ padding: "12px 16px", color: "#71717a" }}>{fmt(s.returnedValue)}</td>
 <td style={{ padding: "12px 16px", color: "#71717a" }}>{fmt(s.totalValue)}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}

 {/* Recent returns list */}
 {data.recent.length > 0 ? (
 <div>
 <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 12 }}>
 Recent Returns
 </div>
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, overflow: "hidden" }}>
 <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
 <thead>
 <tr style={{ background: "#fafafa", borderBottom: "1px solid #e4e4e7" }}>
 {["Returned", "Store", "Order", "Amount", "Customer", "Ordered"].map((h) => (
 <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
 ))}
 </tr>
 </thead>
 <tbody>
 {data.recent.map((r, i) => (
 <tr key={r.conversionId} style={{ borderBottom: i < data.recent.length - 1 ? "1px solid #f4f4f5" : "none" }}
 onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
 onMouseLeave={(e) => (e.currentTarget.style.background = "")}
 >
 <td style={{ padding: "12px 16px", color: "#71717a", whiteSpace: "nowrap" }}>
 {r.returnedAt ? fmtDate(r.returnedAt) : "-"}
 </td>
 <td style={{ padding: "12px 16px", color: "#09090b", fontWeight: 500 }}>
 <Link href={`/admin/stores/${r.storeSlug}`} style={{ color: "#09090b", textDecoration: "none" }}>
 {r.storeName || r.storeSlug}
 </Link>
 </td>
 <td style={{ padding: "12px 16px", fontSize: 12 }}>
 <span style={{ background: "#f4f4f5", color: "#09090b", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace" }}>
 {r.orderId}
 </span>
 </td>
 <td style={{ padding: "12px 16px", color: "#09090b", fontWeight: 600, whiteSpace: "nowrap" }}>
 {fmt(r.orderTotal, r.currency)}
 </td>
 <td style={{ padding: "12px 16px", color: "#71717a" }}>
 {r.userName || r.userEmail || <span style={{ color: "#a1a1aa" }}>Unknown</span>}
 </td>
 <td style={{ padding: "12px 16px", color: "#a1a1aa", whiteSpace: "nowrap" }}>
 {fmtDate(r.timestamp)}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 ) : (
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: "40px 24px", textAlign: "center", color: "#71717a", fontSize: 13 }}>
 No returns recorded yet. Mark orders as returned from the{" "}
 <Link href="/admin/conversions?filter=all" style={{ color: "#09090b" }}>Conversions</Link> page.
 </div>
 )}
 </>
 )}
 </div>
 </div>
 );
}
