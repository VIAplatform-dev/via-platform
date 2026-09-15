"use client";

import Link from "next/link";
import { stores } from "@/app/lib/stores";

export default function AdminStoresPage() {
 return (
 <div style={{ minHeight: "100vh", background: "#f8f9fa", fontFamily: "system-ui, sans-serif" }}>
 <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
 <h1 style={{ fontSize: 20, fontWeight: 600, color: "#09090b", margin: "0 0 4px" }}>Store Portals</h1>
 <p style={{ fontSize: 14, color: "#71717a", margin: "0 0 24px" }}>{stores.length} registered stores</p>

 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, overflow: "hidden" }}>
 <table style={{ width: "100%", borderCollapse: "collapse" }}>
 <thead>
 <tr style={{ background: "#fafafa", borderBottom: "1px solid #e4e4e7" }}>
 {["Store", "Location", "Commission", ""].map((h) => (
 <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500 }}>
 {h}
 </th>
 ))}
 </tr>
 </thead>
 <tbody>
 {stores.map((store, i) => (
 <tr key={store.slug} style={{ borderBottom: i < stores.length - 1 ? "1px solid #f4f4f5" : "none" }}
 onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
 onMouseLeave={(e) => (e.currentTarget.style.background = "")}
 >
 <td style={{ padding: "12px 16px" }}>
 <div style={{ fontSize: 14, fontWeight: 600, color: "#09090b" }}>{store.name}</div>
 <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>{store.slug}</div>
 </td>
 <td style={{ padding: "12px 16px", fontSize: 13, color: "#71717a" }}>{store.location || "-"}</td>
 <td style={{ padding: "12px 16px" }}>
 <span style={{
 fontSize: 11, fontWeight: 500,
 padding: "2px 8px", borderRadius: 99,
 background: store.commissionType === "shopify-collabs" ? "#dcfce7" : "#fef9c3",
 color: store.commissionType === "shopify-collabs" ? "#15803d" : "#854d0e",
 }}>
 {store.commissionType === "shopify-collabs" ? "Shopify Collabs" : "Manual"}
 </span>
 </td>
 <td style={{ padding: "12px 16px", textAlign: "right" }}>
 <Link
 href={`/admin/stores/${store.slug}`}
 style={{
 fontSize: 12, fontWeight: 500, color: "#09090b",
 textDecoration: "none", border: "1px solid #e4e4e7",
 padding: "4px 12px", borderRadius: 6, background: "#fff",
 }}
 >
 View Portal →
 </Link>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 );
}
