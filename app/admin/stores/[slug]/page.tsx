"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type StorePortalData = {
 store: { slug: string; name: string; location: string; currency: string; website: string; commissionType: string };
 totalInventoryValue: number;
 viaCommissionPotential: number;
 storeFollowers: number;
 topFavoritedProducts: { title: string; price: number; favoriteCount: number }[];
 analytics: {
 totalClicks: number;
 totalViews?: number;
 totalConversions: number;
 totalRevenue: number;
 topProducts: { name: string; count: number }[];
 recentConversions: {
 conversionId: string;
 timestamp: string;
 orderId: string;
 orderTotal: number;
 matched: boolean;
 viaClickId: string | null;
 }[];
 range: string;
 };
};

type Range = "7d" | "30d" | "all";

function fmt(n: number, currency = "USD") {
 return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}
function fmtDate(ts: string) {
 return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminStorePortalPage() {
 const params = useParams();
 const slug = params.slug as string;
 const [range, setRange] = useState<Range>("all");
 const [data, setData] = useState<StorePortalData | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);

 useEffect(() => {
 setLoading(true);
 fetch(`/api/admin/stores/${slug}?range=${range}`)
 .then((r) => r.json())
 .then((d) => { setData(d); setLoading(false); })
 .catch(() => { setError("Failed to load"); setLoading(false); });
 }, [slug, range]);

 const card = { background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: "16px 20px" };

 return (
 <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "system-ui, sans-serif" }}>
 <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px" }}>
 <Link href="/admin/stores" style={{ fontSize: 12, color: "#9ca3af", textDecoration: "none", display: "inline-block", marginBottom: 16 }}>
 ← All Stores
 </Link>

 {loading && <p style={{ color: "#9ca3af", fontSize: 14 }}>Loading…</p>}
 {error && <p style={{ color: "#dc2626", fontSize: 14 }}>{error}</p>}

 {data && (
 <>
 {/* Header */}
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
 <div>
 <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>{data.store.name}</h1>
 <p style={{ fontSize: 13, color: "#71717a", margin: 0 }}>{data.store.location} · <a href={data.store.website} target="_blank" rel="noreferrer" style={{ color: "#09090b" }}>{data.store.website}</a></p>
 <Link
 href={`/store/dashboard?store=${slug}`}
 style={{ display: "inline-block", marginTop: 12, padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 6, background: "#5D0F17", color: "#FFFDF8", textDecoration: "none" }}
 >
 Open the store&apos;s live dashboard →
 </Link>
 <p style={{ fontSize: 11, color: "#9ca3af", margin: "6px 0 0" }}>The exact seller portal, Overview, Performance, Audience &amp; Market Insights. Always up to date.</p>
 </div>
 <div style={{ display: "flex", gap: 6 }}>
 {(["7d", "30d", "all"] as Range[]).map((r) => (
 <button key={r} onClick={() => setRange(r)} style={{
 padding: "5px 12px", fontSize: 12, borderRadius: 6, border: "1px solid",
 borderColor: range === r ? "#18181b" : "#e4e4e7",
 background: range === r ? "#18181b" : "#fff",
 color: range === r ? "#fff" : "#71717a",
 cursor: "pointer",
 }}>{r === "all" ? "All time" : r}</button>
 ))}
 </div>
 </div>

 {/* KPI row */}
 <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 24 }}>
 {[
 { label: "Inventory Value", value: fmt(data.totalInventoryValue) },
 { label: "Commission Potential", value: fmt(data.viaCommissionPotential) },
 { label: "Store Followers", value: data.storeFollowers.toLocaleString() },
 { label: "Views on VYA", value: (data.analytics.totalViews ?? 0).toLocaleString() },
 { label: "Clicks to Store", value: data.analytics.totalClicks.toLocaleString() },
 { label: "Orders", value: data.analytics.totalConversions.toLocaleString() },
 ].map(({ label, value }) => (
 <div key={label} style={card}>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", margin: "0 0 6px" }}>{label}</p>
 <p style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0 }}>{value}</p>
 </div>
 ))}
 </div>

 {/* Revenue */}
 <div style={{ ...card, marginBottom: 24 }}>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", margin: "0 0 4px" }}>Total Revenue</p>
 <p style={{ fontSize: 28, fontWeight: 600, color: "#09090b", margin: 0 }}>{fmt(data.analytics.totalRevenue, data.store.currency)}</p>
 </div>

 {/* Orders table */}
 <div style={{ ...card, marginBottom: 24, padding: 0 }}>
 <div style={{ padding: "14px 20px", borderBottom: "1px solid #e5e7eb" }}>
 <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827" }}>Orders ({data.analytics.recentConversions.length})</p>
 </div>
 {data.analytics.recentConversions.length === 0 ? (
 <p style={{ padding: "16px 20px", color: "#9ca3af", fontSize: 13 }}>No orders in this period.</p>
 ) : (
 <table style={{ width: "100%", borderCollapse: "collapse" }}>
 <thead>
 <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
 {["Date", "Order ID", "Amount", "Attributed", "Click ID"].map((h) => (
 <th key={h} style={{ padding: "8px 16px", textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af", fontWeight: 600 }}>{h}</th>
 ))}
 </tr>
 </thead>
 <tbody>
 {data.analytics.recentConversions.map((c, i) => (
 <tr key={c.conversionId} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
 <td style={{ padding: "10px 16px", fontSize: 13, color: "#374151" }}>{fmtDate(c.timestamp)}</td>
 <td style={{ padding: "10px 16px", fontSize: 12, color: "#6b7280", fontFamily: "monospace" }}>{c.orderId}</td>
 <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600, color: "#111827" }}>{fmt(c.orderTotal, data.store.currency)}</td>
 <td style={{ padding: "10px 16px" }}>
 <span style={{
 fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4,
 background: c.matched ? "rgba(16,185,129,0.1)" : "rgba(156,163,175,0.15)",
 color: c.matched ? "#065f46" : "#6b7280",
 }}>
 {c.matched ? "Matched" : "Unmatched"}
 </span>
 </td>
 <td style={{ padding: "10px 16px", fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{c.viaClickId ?? "-"}</td>
 </tr>
 ))}
 </tbody>
 </table>
 )}
 </div>

 {/* Top products + top favorited */}
 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
 <div style={{ ...card, padding: 0 }}>
 <div style={{ padding: "14px 20px", borderBottom: "1px solid #e5e7eb" }}>
 <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827" }}>Top Clicked Products</p>
 </div>
 {data.analytics.topProducts.length === 0 ? (
 <p style={{ padding: "16px 20px", color: "#9ca3af", fontSize: 13 }}>No clicks yet.</p>
 ) : (
 data.analytics.topProducts.map((p, i) => (
 <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 20px", borderBottom: "1px solid #f3f4f6" }}>
 <span style={{ fontSize: 13, color: "#374151" }}>{p.name || "-"}</span>
 <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{p.count}</span>
 </div>
 ))
 )}
 </div>

 <div style={{ ...card, padding: 0 }}>
 <div style={{ padding: "14px 20px", borderBottom: "1px solid #e5e7eb" }}>
 <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827" }}>Top Favorited Products</p>
 </div>
 {data.topFavoritedProducts.length === 0 ? (
 <p style={{ padding: "16px 20px", color: "#9ca3af", fontSize: 13 }}>No favorites yet.</p>
 ) : (
 data.topFavoritedProducts.map((p, i) => (
 <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 20px", borderBottom: "1px solid #f3f4f6" }}>
 <span style={{ fontSize: 13, color: "#374151" }}>{p.title}</span>
 <span style={{ fontSize: 12, color: "#6b7280" }}>{p.favoriteCount} ♥ · {fmt(p.price)}</span>
 </div>
 ))
 )}
 </div>
 </div>
 </>
 )}
 </div>
 </div>
 );
}
