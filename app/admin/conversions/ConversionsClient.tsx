"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type Conversion = {
 conversionId: string;
 timestamp: string;
 orderId: string;
 orderTotal: number;
 currency: string;
 storeSlug: string;
 storeName: string;
 matched: boolean;
 viaClickId: string | null;
 userId: string | null;
 userEmail: string | null;
 userName: string | null;
 matchedClickData: { clickId?: string; productName?: string; source?: string } | null;
 items: { productName: string; quantity: number; price: number }[];
 returned: boolean;
 returnedAt: string | null;
 utmSource: string | null;
 utmCampaign: string | null;
};

type CandidateClick = {
 clickId: string;
 timestamp: string;
 productName: string;
 storeSlug: string;
 userId: string | null;
 userEmail: string | null;
 userName: string | null;
 productSoldOut?: boolean;
};

function fmt(n: number, currency = "USD") {
 return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}
function fmtDate(ts: string) {
 return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function minsApart(a: string, b: string) {
 return Math.round(Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000);
}

function acquisitionLabel(c: Conversion): { label: string; color: string; bg: string } {
 const collabsSource = (c.matchedClickData as { source?: string } | null)?.source;
 if (collabsSource === "shopify-collabs") return { label: "Shopify Collabs", color: "#065f46", bg: "rgba(16,185,129,0.08)" };
 if (c.utmSource === "email") {
 const campaign = c.utmCampaign ? c.utmCampaign.replace(/_/g, " ") : "email";
 return { label: `Email · ${campaign}`, color: "#1e40af", bg: "rgba(59,130,246,0.08)" };
 }
 if (c.utmSource === "instagram") return { label: "Instagram", color: "#7c3aed", bg: "rgba(124,58,237,0.08)" };
 if (c.utmSource === "google") return { label: "Google", color: "#92400e", bg: "rgba(245,158,11,0.08)" };
 if (c.utmSource) return { label: c.utmSource, color: "#71717a", bg: "#f4f4f5" };
 if (c.userId) return { label: "Browsing", color: "#71717a", bg: "#f4f4f5" };
 return { label: "Unknown", color: "#71717a", bg: "#f4f4f5" };
}

export default function AdminConversionsPage() {
 const searchParams = useSearchParams();
 const [conversions, setConversions] = useState<Conversion[]>([]);
 const [loading, setLoading] = useState(true);
 const initialFilter = searchParams.get("filter") === "unmatched" ? "unmatched" : "all";
 const [filter, setFilter] = useState<"unmatched" | "all">(initialFilter);
 const [selected, setSelected] = useState<Conversion | null>(null);
 const [candidates, setCandidates] = useState<CandidateClick[]>([]);
 const [userClicks, setUserClicks] = useState<CandidateClick[]>([]);
 const [sameOrderSiblings, setSameOrderSiblings] = useState<{ conversionId: string; orderId: string; orderTotal: number; currency: string; timestamp: string; productName: string | null }[]>([]);
 const [nearbyOrders, setNearbyOrders] = useState<{ conversionId: string; orderId: string; orderTotal: number; currency: string; timestamp: string; productName: string | null }[]>([]);
 const [candidatesLoading, setCandidatesLoading] = useState(false);
 const [matching, setMatching] = useState<string | null>(null);
 const [manualUserInput, setManualUserInput] = useState("");
 const [productQuery, setProductQuery] = useState("");
 const [productResults, setProductResults] = useState<{ title: string; price: number; image: string | null; source: string }[]>([]);
 const [productSearchLoading, setProductSearchLoading] = useState(false);
 const [settingProduct, setSettingProduct] = useState(false);
 const [sendingEmail, setSendingEmail] = useState(false);
 const [emailStatus, setEmailStatus] = useState<"sent" | "error" | null>(null);
 const [emailErrorMsg, setEmailErrorMsg] = useState<string | null>(null);
 const [addingOrder, setAddingOrder] = useState(false);
 const [newOrder, setNewOrder] = useState({ storeSlug: "", storeName: "", orderId: "", orderTotal: "", currency: "USD", userEmail: "", timestamp: "" });
 const [savingOrder, setSavingOrder] = useState(false);
 const [saveOrderError, setSaveOrderError] = useState<string | null>(null);
 const [liveSoldOut, setLiveSoldOut] = useState<{ title: string; price: number; currency: string; image: string | null; url: string }[]>([]);
 const [liveSoldOutLoading, setLiveSoldOutLoading] = useState(false);
 const [liveSoldOutFetched, setLiveSoldOutFetched] = useState(false);

 const load = useCallback(() => {
 setLoading(true);
 fetch(`/api/admin/conversions?filter=${filter}`)
 .then((r) => r.json())
 .then((d) => { setConversions(d.conversions ?? []); setLoading(false); })
 .catch(() => setLoading(false));
 }, [filter]);

 useEffect(() => { load(); }, [load]);

 async function fetchLiveSoldOut(conv: Conversion) {
 setLiveSoldOutLoading(true);
 setLiveSoldOutFetched(false);
 const params = new URLSearchParams({ store: conv.storeSlug, currency: conv.currency });
 if (conv.orderTotal > 0) params.set("price", String(conv.orderTotal));
 const res = await fetch(`/api/admin/shopify-soldout?${params}`).then((r) => r.json()).catch(() => ({ products: [] }));
 setLiveSoldOut(res.products ?? []);
 setLiveSoldOutLoading(false);
 setLiveSoldOutFetched(true);
 }

 function openPanel(conv: Conversion) {
 setSelected(conv);
 setManualUserInput(conv.userEmail ?? conv.userId ?? "");
 setProductQuery("");
 setProductResults([]);
 setCandidates([]);
 setUserClicks([]);
 setSameOrderSiblings([]);
 setNearbyOrders([]);
 setEmailStatus(null);
 setEmailErrorMsg(null);
 setLiveSoldOut([]);
 setLiveSoldOutFetched(false);
 setCandidatesLoading(true);
 setProductSearchLoading(true);

 Promise.all([
 fetch(`/api/admin/conversions/${conv.conversionId}`).then((r) => r.json()),
 fetch(`/api/admin/products/search?store=${encodeURIComponent(conv.storeSlug)}&q=`).then((r) => r.json()),
 ]).then(([convData, productData]) => {
 setCandidates(convData.clicks ?? []);
 setUserClicks(convData.userClicks ?? []);
 setSameOrderSiblings(convData.sameOrderSiblings ?? []);
 setNearbyOrders(convData.nearbyOrders ?? []);
 setCandidatesLoading(false);
 setProductResults(productData.products ?? []);
 setProductSearchLoading(false);
 }).catch(() => { setCandidatesLoading(false); setProductSearchLoading(false); });
 }

 async function matchToClick(clickId: string) {
 if (!selected) return;
 setMatching(clickId);
 await fetch(`/api/admin/conversions/${selected.conversionId}`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ clickId }),
 });
 setMatching(null);
 setSelected(null);
 load();
 }

 async function matchToUser() {
 if (!selected || !manualUserInput.trim()) return;
 setMatching("user");
 const input = manualUserInput.trim();
 // Detect if input is an email or a user ID
 const body = input.includes("@") ? { userEmail: input } : { userId: input };
 const res = await fetch(`/api/admin/conversions/${selected.conversionId}`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(body),
 });
 if (!res.ok) {
 const d = await res.json();
 alert(d.error ?? "Failed to match");
 }
 setMatching(null);
 setSelected(null);
 load();
 }

 async function saveManualOrder() {
 if (!newOrder.storeSlug || !newOrder.orderId || !newOrder.orderTotal) return;
 setSavingOrder(true);
 setSaveOrderError(null);
 const res = await fetch("/api/admin/conversions", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(newOrder),
 });
 const d = await res.json();
 if (!res.ok) {
 setSaveOrderError(d.error ?? "Failed to save");
 setSavingOrder(false);
 return;
 }
 setSavingOrder(false);
 setAddingOrder(false);
 setNewOrder({ storeSlug: "", storeName: "", orderId: "", orderTotal: "", currency: "USD", userEmail: "", timestamp: "" });
 load();
 }

 async function unmatch(conversionId: string) {
 await fetch(`/api/admin/conversions/${conversionId}`, { method: "PATCH" });
 load();
 }

 async function deleteConversion(conversionId: string) {
 if (!confirm("Permanently delete this conversion record? This cannot be undone.")) return;
 await fetch(`/api/admin/conversions/${conversionId}`, { method: "DELETE" });
 load();
 }

 async function searchProducts(query: string) {
 if (!selected) return;
 setProductQuery(query);
 setProductSearchLoading(true);
 fetch(`/api/admin/products/search?store=${encodeURIComponent(selected.storeSlug)}&q=${encodeURIComponent(query)}`)
 .then((r) => r.json())
 .then((d) => { setProductResults(d.products ?? []); setProductSearchLoading(false); })
 .catch(() => setProductSearchLoading(false));
 }

 async function setProduct(productName: string) {
 if (!selected) return;
 setSettingProduct(true);
 await fetch(`/api/admin/conversions/${selected.conversionId}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "set_product", productName }),
 });
 setSettingProduct(false);
 setProductQuery("");
 setProductResults([]);
 // Update selected in place so the panel reflects the new name immediately
 setSelected((prev) => prev ? {
 ...prev,
 matchedClickData: { ...(prev.matchedClickData ?? {}), productName },
 } : null);
 load();
 }

 async function sendStoreEmail() {
 if (!selected) return;
 setSendingEmail(true);
 setEmailStatus(null);
 try {
 const res = await fetch(`/api/admin/conversions/${selected.conversionId}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "send_email" }),
 });
 const d = await res.json();
 setEmailStatus(d.emailSent ? "sent" : "error");
 setEmailErrorMsg(d.emailError ?? (d.emailSent ? null : "No matching store config. Check store slug"));
 } catch (err) {
 setEmailStatus("error");
 setEmailErrorMsg(String(err));
 }
 setSendingEmail(false);
 }

 async function editAmount(conversionId: string, currentTotal: number) {
 const input = prompt("Enter corrected order total:", String(currentTotal));
 if (!input || isNaN(Number(input))) return;
 await fetch(`/api/admin/conversions/${conversionId}`, {
 method: "PUT",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ orderTotal: Number(input) }),
 });
 load();
 }

 return (
 <div style={{ background: "#f8f9fa", fontFamily: "system-ui, sans-serif" }}>
 <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
 <div>
 <h1 style={{ fontSize: 20, fontWeight: 600, color: "#09090b", margin: "0 0 4px" }}>Conversions</h1>
 <p style={{ fontSize: 14, color: "#71717a", margin: 0 }}>
 Match purchases to VYA clicks and customers.{" "}
 <Link href="/admin/analytics" style={{ color: "#09090b", textDecoration: "underline" }}>View revenue in Analytics →</Link>
 {" · "}
 <Link href="/admin/key-metrics" style={{ color: "#09090b", textDecoration: "underline" }}>Key Metrics →</Link>
 </p>
 </div>
 <div style={{ display: "flex", gap: 6 }}>
 <button
 onClick={async () => {
 const r = await fetch("/api/admin/fix-collabs-slugs", { method: "POST" }).then(r => r.json());
 alert(`Fixed ${r.fixed} conversions.${r.unresolvable?.length ? ` Unresolvable: ${r.unresolvable.join(", ")}` : ""}`);
 load();
 }}
 style={{ padding: "6px 14px", fontSize: 12, borderRadius: 6, border: "1px solid #e4e4e7", background: "#fff", color: "#09090b", cursor: "pointer", fontWeight: 500 }}
 >
 Fix store slugs
 </button>
 <button
 onClick={async () => {
 const r = await fetch("/api/admin/backfill-collabs-products", { method: "POST" }).then(r => r.json());
 if (r.error) { alert(`Error: ${r.error}`); return; }
 alert(`Backfilled product names on ${r.updated} of ${r.total} Collabs conversions (${r.noProductName ?? 0} had no product data in Collabs API).`);
 load();
 }}
 style={{ padding: "6px 14px", fontSize: 12, borderRadius: 6, border: "1px solid #e4e4e7", background: "#fff", color: "#09090b", cursor: "pointer", fontWeight: 500 }}
 >
 Backfill product names
 </button>
 <button
 onClick={() => setAddingOrder(true)}
 style={{ padding: "6px 14px", fontSize: 12, borderRadius: 6, border: "none", background: "#18181b", color: "#fff", cursor: "pointer", fontWeight: 500 }}
 >
 + Record Order
 </button>
 {(["unmatched", "all"] as const).map((f) => (
 <button key={f} onClick={() => setFilter(f)} style={{
 padding: "6px 14px", fontSize: 12, borderRadius: 6, border: "1px solid",
 borderColor: filter === f ? "#18181b" : "#e4e4e7",
 background: filter === f ? "#18181b" : "#fff",
 color: filter === f ? "#fff" : "#71717a", cursor: "pointer", fontWeight: filter === f ? 500 : 400,
 }}>
 {f === "unmatched" ? "Unmatched" : "All"}
 </button>
 ))}
 </div>
 </div>

 {!loading && conversions.length > 0 && (() => {
 const realOrders = conversions.filter(c => c.orderTotal > 0 && !c.returned);
 const matched = realOrders.filter(c => c.userId != null || c.viaClickId != null);
 const unmatched = realOrders.filter(c => c.userId == null && c.viaClickId == null);
 const missingAmount = conversions.filter(c => c.orderTotal === 0 && !c.returned);
 const returned = conversions.filter(c => c.returned);
 return (
 <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
 {[
 { label: "Real orders", value: realOrders.length, note: "(analytics count)", highlight: true },
 { label: "Matched", value: matched.length, note: null, highlight: false },
 { label: "Unmatched", value: unmatched.length, note: null, highlight: false },
 ...(missingAmount.length > 0 ? [{ label: "Missing amount", value: missingAmount.length, note: null, highlight: false }] : []),
 ...(returned.length > 0 ? [{ label: "Returned", value: returned.length, note: null, highlight: false }] : []),
 ].map((s) => (
 <div key={s.label} style={{ background: "#fff", border: `1px solid ${s.highlight ? "#09090b" : "#e4e4e7"}`, borderRadius: 8, padding: "10px 16px", minWidth: 110 }}>
 <div style={{ fontSize: 20, fontWeight: 700, color: "#09090b" }}>{s.value}</div>
 <div style={{ fontSize: 11, color: "#71717a", marginTop: 1 }}>{s.label}</div>
 {s.note && <div style={{ fontSize: 10, color: "#a1a1aa" }}>{s.note}</div>}
 </div>
 ))}
 </div>
 );
 })()}

 {loading ? (
 <p style={{ color: "#a1a1aa", fontSize: 14 }}>Loading…</p>
 ) : conversions.length === 0 ? (
 <p style={{ color: "#a1a1aa", fontSize: 14 }}>No {filter === "unmatched" ? "unmatched " : ""}conversions found.</p>
 ) : (
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, height: "calc(100vh - 220px)", overflowY: "scroll" }}>
 <table style={{ width: "100%", borderCollapse: "collapse" }}>
 <thead style={{ position: "sticky", top: 0, zIndex: 1, background: "#fafafa" }}>
 <tr style={{ borderBottom: "1px solid #e4e4e7" }}>
 {["Date", "Store", "Order ID", "Amount", "Customer", "Via", "Status", ""].map((h) => (
 <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500 }}>{h}</th>
 ))}
 </tr>
 </thead>
 <tbody>
 {conversions.map((c) => (
 <tr key={c.conversionId} style={{ borderBottom: "1px solid #f4f4f5" }}
 onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
 onMouseLeave={(e) => (e.currentTarget.style.background = "")}
 >
 <td style={{ padding: "11px 16px", fontSize: 12, color: "#71717a", whiteSpace: "nowrap" }}>{fmtDate(c.timestamp)}</td>
 <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 600, color: "#09090b" }}>{c.storeName || c.storeSlug}</td>
 <td style={{ padding: "11px 16px", fontSize: 11, color: "#09090b", fontFamily: "monospace", background: "transparent" }}>
 <span style={{ background: "#f4f4f5", color: "#09090b", borderRadius: 4, padding: "1px 5px" }}>{c.orderId}</span>
 </td>
 <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 600, color: c.orderTotal === 0 ? "#dc2626" : "#09090b" }}>
 {c.orderTotal === 0 ? ": (missing)" : fmt(c.orderTotal, c.currency)}
 </td>
 <td style={{ padding: "11px 16px", fontSize: 12, color: "#09090b" }}>
 {c.userEmail ? (
 <div>
 <div>{c.userName || c.userEmail}</div>
 <div style={{ color: "#a1a1aa", fontSize: 11 }}>{c.userEmail}</div>
 </div>
 ) : (
 <span style={{ color: "#a1a1aa" }}>Unknown</span>
 )}
 </td>
 <td style={{ padding: "11px 16px" }}>
 {(() => { const a = acquisitionLabel(c); return (
 <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 99, background: a.bg, color: a.color, whiteSpace: "nowrap" }}>{a.label}</span>
 ); })()}
 </td>
 <td style={{ padding: "11px 16px" }}>
 {c.matched ? (
 <div>
 <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 99, background: "#dcfce7", color: "#15803d" }}>
 {c.matchedClickData?.source === "admin-manual" || c.matchedClickData?.source?.startsWith("admin") ? "Manually matched" : "Matched"}
 </span>
 {c.matchedClickData?.productName ? (
 <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>{c.matchedClickData.productName}</div>
 ) : (c.items?.length > 0 ? c.items : null)?.map((it) => it.productName).filter(Boolean).join(", ") ? (
 <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>
 {c.items.map((it) => it.productName).join(", ")}
 </div>
 ) : null}
 </div>
 ) : (
 <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 99, background: "#fef9c3", color: "#854d0e" }}>Unmatched</span>
 )}
 </td>
 <td style={{ padding: "11px 16px", whiteSpace: "nowrap" }}>
 <button
 onClick={() => openPanel(c)}
 style={{ fontSize: 12, color: "#09090b", border: "1px solid #e4e4e7", background: "#fff", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontWeight: 500, marginRight: 6 }}
 >
 {c.matched ? "Re-match" : "Match"}
 </button>
 {c.matched && (
 <button
 onClick={() => unmatch(c.conversionId)}
 style={{ fontSize: 11, color: "#71717a", border: "1px solid #e4e4e7", background: "#fff", padding: "4px 10px", borderRadius: 6, cursor: "pointer", marginRight: 6 }}
 >
 Unmatch
 </button>
 )}
 <button
 onClick={() => editAmount(c.conversionId, c.orderTotal)}
 style={{ fontSize: 11, color: "#71717a", border: "1px solid #e4e4e7", background: "#fff", padding: "4px 10px", borderRadius: 6, cursor: "pointer", marginRight: 6 }}
 >
 Edit $
 </button>
 <button
 onClick={() => deleteConversion(c.conversionId)}
 style={{ fontSize: 11, color: "#dc2626", border: "1px solid #fca5a5", background: "none", padding: "4px 10px", borderRadius: 6, cursor: "pointer" }}
 >
 Delete
 </button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>

 {/* Match panel */}
 {selected && (
 <>
 <div onClick={() => setSelected(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 100 }} />
 <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 520, background: "#fff", zIndex: 101, overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)" }}>
 <div style={{ padding: "20px 24px", borderBottom: "1px solid #e4e4e7", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
 <div>
 <p style={{ fontSize: 15, fontWeight: 600, color: "#09090b", margin: 0 }}>Match Conversion</p>
 <p style={{ fontSize: 12, color: "#a1a1aa", marginTop: 3, margin: 0 }}>{selected.storeName} · {fmt(selected.orderTotal, selected.currency)} · {fmtDate(selected.timestamp)}</p>
 </div>
 <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#a1a1aa" }}>×</button>
 </div>

 <div style={{ padding: "20px 24px" }}>
 {/* Order details */}
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, margin: "0 0 8px" }}>Order Details</p>
 <div style={{ fontSize: 12, color: "#09090b", marginBottom: 4 }}>
 Order ID: <span style={{ background: "#f4f4f5", color: "#09090b", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace" }}>{selected.orderId}</span>
 </div>
 {selected.items.length > 0 && (
 <div style={{ fontSize: 12, color: "#71717a", marginBottom: 8 }}>
 Items: {selected.items.map((it) => it.productName).join(", ")}
 </div>
 )}

 {/* Other line items from the same order */}
 {sameOrderSiblings.length > 0 && (
 <div style={{ marginBottom: 16, background: "#fafafa", border: "1px solid #e4e4e7", borderRadius: 6, padding: "10px 14px" }}>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, margin: "0 0 6px" }}>
 Other items in this order
 </p>
 {sameOrderSiblings.map((o) => (
 <div key={o.conversionId} style={{ fontSize: 12, color: "#09090b", marginBottom: 4, display: "flex", justifyContent: "space-between", gap: 8 }}>
 <span style={{ fontFamily: "monospace", color: "#a1a1aa", fontSize: 11 }}>{o.orderId}</span>
 <span style={{ flex: 1, fontWeight: o.productName ? 500 : 400, color: o.productName ? "#09090b" : "#a1a1aa" }}>
 {o.productName ?? "-"}
 </span>
 <span style={{ color: "#71717a" }}>{fmt(Number(o.orderTotal), o.currency)}</span>
 </div>
 ))}
 </div>
 )}

 {/* Send store notification */}
 <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
 <button
 onClick={sendStoreEmail}
 disabled={sendingEmail}
 style={{ padding: "7px 14px", background: sendingEmail ? "#f4f4f5" : "#fff", color: "#09090b", border: "1px solid #e4e4e7", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: sendingEmail ? "default" : "pointer" }}
 >
 {sendingEmail ? "Sending…" : "Send store notification"}
 </button>
 {emailStatus === "sent" && <span style={{ fontSize: 12, color: "#15803d" }}>✓ Email sent</span>}
 {emailStatus === "error" && <span style={{ fontSize: 12, color: "#dc2626" }}>{emailErrorMsg ?? "Failed"}</span>}
 </div>

 {/* Manual user match */}
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, margin: "16px 0 8px" }}>Match to Customer</p>
 <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
 <input
 type="text"
 value={manualUserInput}
 onChange={(e) => setManualUserInput(e.target.value)}
 placeholder="Email or user ID"
 style={{ flex: 1, padding: "7px 10px", border: "1px solid #e4e4e7", borderRadius: 6, fontSize: 13 }}
 />
 <button
 onClick={matchToUser}
 disabled={!manualUserInput.trim() || matching === "user"}
 style={{ padding: "7px 14px", background: "#18181b", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer", opacity: !manualUserInput.trim() ? 0.4 : 1 }}
 >
 {matching === "user" ? "Saving…" : "Set User"}
 </button>
 </div>

 {/* Product linking */}
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, margin: "16px 0 6px" }}>
 Link Product
 {(() => {
 const current = selected.matchedClickData?.productName || selected.items?.find(i => i.productName)?.productName;
 return current ? <span style={{ marginLeft: 8, fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#09090b" }}>Currently: {current}</span> : null;
 })()}
 </p>

 {/* If products exist in DB for this store: show searchable list */}
 {(productSearchLoading || productResults.length > 0) ? (
 <>
 <div style={{ position: "relative", marginBottom: 6 }}>
 <input
 type="text"
 value={productQuery}
 onChange={(e) => searchProducts(e.target.value)}
 placeholder={`Search ${selected.storeName} products…`}
 style={{ width: "100%", padding: "7px 10px", border: "1px solid #e4e4e7", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
 />
 {productSearchLoading && (
 <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#a1a1aa" }}>…</span>
 )}
 </div>
 {productResults.length > 0 && (
 <div style={{ border: "1px solid #e4e4e7", borderRadius: 6, overflow: "hidden", marginBottom: 16, maxHeight: 240, overflowY: "auto" }}>
 {productResults.map((p) => (
 <button
 key={p.title}
 onClick={() => setProduct(p.title)}
 disabled={settingProduct}
 style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", background: "#fff", border: "none", borderBottom: "1px solid #f4f4f5", cursor: "pointer", textAlign: "left" }}
 onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
 onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
 >
 {p.image && <img src={p.image} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />}
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ fontSize: 13, color: "#09090b", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
 <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 1 }}>
 ${p.price.toFixed(2)} · <span style={{ color: p.source === "current" ? "#15803d" : "#854d0e" }}>{p.source === "current" ? "in stock" : "sold"}</span>
 </div>
 </div>
 </button>
 ))}
 </div>
 )}
 {productQuery && productResults.length === 0 && !productSearchLoading && (
 <p style={{ fontSize: 12, color: "#a1a1aa", margin: "0 0 16px" }}>No matches. Type the product name below to set it manually.</p>
 )}
 </>
 ) : null}

 {/* Always-visible manual name input. Primary for stores with no synced products */}
 {!productSearchLoading && (
 <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
 <input
 type="text"
 value={productQuery}
 onChange={(e) => setProductQuery(e.target.value)}
 placeholder="Type product name and press Set…"
 style={{ flex: 1, padding: "7px 10px", border: "1px solid #e4e4e7", borderRadius: 6, fontSize: 13 }}
 />
 <button
 onClick={() => setProduct(productQuery)}
 disabled={settingProduct || !productQuery.trim()}
 style={{ padding: "7px 14px", background: "#18181b", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer", opacity: !productQuery.trim() ? 0.4 : 1 }}
 >
 {settingProduct ? "Saving…" : "Set"}
 </button>
 </div>
 )}

 {/* Customer's full click history at this store */}
 {userClicks.length > 0 && (
 <>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, margin: "16px 0 4px" }}>
 All Clicks by This Customer at {selected.storeName}
 </p>
 <p style={{ fontSize: 11, color: "#a1a1aa", margin: "0 0 8px" }}>
 No time limit: use these to identify what they purchased.
 </p>
 {userClicks.map((click) => (
 <div key={click.clickId} style={{
 border: click.productSoldOut ? "1px solid #09090b" : "1px solid #e4e4e7",
 borderRadius: 6, padding: "10px 14px", marginBottom: 8,
 background: click.productSoldOut ? "#fafafa" : "#fff",
 }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
 <div style={{ flex: 1 }}>
 <div style={{ fontSize: 13, fontWeight: 600, color: "#09090b", display: "flex", alignItems: "center", gap: 6 }}>
 {click.productSoldOut && <span title="Product is now sold out">🔴</span>}
 {click.productName || "-"}
 </div>
 <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>
 {fmtDate(click.timestamp)} · {minsApart(click.timestamp, selected.timestamp)}m from order
 </div>
 </div>
 <div style={{ display: "flex", gap: 6, marginLeft: 10, flexShrink: 0 }}>
 <button
 onClick={() => setProduct(click.productName)}
 disabled={settingProduct}
 style={{ padding: "5px 10px", background: "#f4f4f5", color: "#09090b", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}
 >
 Link name
 </button>
 <button
 onClick={() => matchToClick(click.clickId)}
 disabled={matching === click.clickId}
 style={{ padding: "5px 10px", background: "#18181b", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}
 >
 {matching === click.clickId ? "…" : "Use click"}
 </button>
 </div>
 </div>
 </div>
 ))}
 </>
 )}

 {/* Nearby orders from the same store */}
 {nearbyOrders.length > 0 && (
 <>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, margin: "16px 0 4px" }}>
 Other {selected.storeName} purchases (±7 days)
 </p>
 <p style={{ fontSize: 11, color: "#a1a1aa", margin: "0 0 8px" }}>
 Helps identify sold-out items by what else was selling around this time.
 </p>
 <div style={{ border: "1px solid #e4e4e7", borderRadius: 6, overflow: "hidden", marginBottom: 16 }}>
 {nearbyOrders.map((o, i) => (
 <div key={o.conversionId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: i < nearbyOrders.length - 1 ? "1px solid #f4f4f5" : "none", background: "#fff" }}>
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ fontSize: 12, fontWeight: 500, color: "#09090b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
 {o.productName ?? <span style={{ color: "#a1a1aa", fontWeight: 400 }}>Unidentified</span>}
 </div>
 <div style={{ fontSize: 10, color: "#a1a1aa", marginTop: 1 }}>
 {fmtDate(o.timestamp as string)} · <span style={{ fontFamily: "monospace" }}>{o.orderId}</span>
 </div>
 </div>
 <div style={{ fontSize: 12, fontWeight: 600, color: "#09090b", whiteSpace: "nowrap" }}>
 {fmt(Number(o.orderTotal), o.currency)}
 </div>
 <button
 onClick={() => o.productName && setProduct(o.productName)}
 disabled={!o.productName || settingProduct}
 style={{ padding: "4px 10px", background: "#f4f4f5", color: "#09090b", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: o.productName ? "pointer" : "default", opacity: o.productName ? 1 : 0.3, whiteSpace: "nowrap" }}
 >
 Use name
 </button>
 </div>
 ))}
 </div>
 </>
 )}

 {/* Candidate clicks */}
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, margin: "16px 0 4px" }}>
 Candidate Clicks (same store, ±48h)
 </p>
 <p style={{ fontSize: 11, color: "#a1a1aa", margin: "0 0 12px" }}>
 🔴 = product now sold out. Strong match signal
 </p>
 {candidatesLoading ? (
 <p style={{ fontSize: 13, color: "#a1a1aa" }}>Loading clicks…</p>
 ) : candidates.length === 0 ? (
 <div>
 <p style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 10 }}>No clicks found in this window.</p>
 <button
 onClick={() => fetchLiveSoldOut(selected)}
 disabled={liveSoldOutLoading}
 style={{ padding: "6px 14px", fontSize: 12, fontWeight: 500, borderRadius: 6, border: "1px solid #e4e4e7", background: liveSoldOutLoading ? "#f4f4f5" : "#fff", color: "#09090b", cursor: liveSoldOutLoading ? "default" : "pointer", marginBottom: 10 }}
 >
 {liveSoldOutLoading ? "Fetching from live site…" : "Fetch sold-out items from live site"}
 </button>
 {liveSoldOutFetched && (
 liveSoldOut.length === 0 ? (
 <p style={{ fontSize: 12, color: "#a1a1aa" }}>No sold-out items found near ${selected.orderTotal} {selected.currency}.</p>
 ) : (
 <div>
 <p style={{ fontSize: 11, color: "#a1a1aa", margin: "0 0 8px" }}>
 {liveSoldOut.length} sold-out item{liveSoldOut.length !== 1 ? "s" : ""} near this order amount:
 </p>
 <div style={{ border: "1px solid #e4e4e7", borderRadius: 6, overflow: "hidden", maxHeight: 300, overflowY: "auto" }}>
 {liveSoldOut.map((p) => (
 <div key={p.url} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: "1px solid #f4f4f5", background: "#fff" }}>
 {p.image && <img src={p.image} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />}
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ fontSize: 13, fontWeight: 500, color: "#09090b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
 <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 1 }}>
 {p.price.toFixed(2)} {p.currency} · <a href={p.url} target="_blank" rel="noreferrer" style={{ color: "#71717a" }}>view ↗</a>
 </div>
 </div>
 <button
 onClick={() => setProduct(p.title)}
 disabled={settingProduct}
 style={{ padding: "5px 10px", background: "#18181b", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}
 >
 Link
 </button>
 </div>
 ))}
 </div>
 </div>
 )
 )}
 </div>
 ) : (
 candidates.map((click) => (
 <div key={click.clickId} style={{
 border: click.productSoldOut ? "1px solid #09090b" : "1px solid #e4e4e7",
 borderRadius: 6,
 padding: "10px 14px",
 marginBottom: 8,
 background: click.productSoldOut ? "#fafafa" : "#fff",
 }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
 <div style={{ flex: 1 }}>
 <div style={{ fontSize: 13, fontWeight: 600, color: "#09090b", display: "flex", alignItems: "center", gap: 6 }}>
 {click.productSoldOut && <span title="Product is now sold out. Likely purchased">🔴</span>}
 {click.productName || "-"}
 </div>
 <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>
 {fmtDate(click.timestamp)} · {minsApart(click.timestamp, selected.timestamp)}m from order
 </div>
 {click.userEmail && (
 <div style={{ fontSize: 11, color: "#71717a", marginTop: 2 }}>
 {click.userName || click.userEmail}
 </div>
 )}
 <div style={{ fontSize: 10, color: "#a1a1aa", fontFamily: "monospace", marginTop: 2 }}>{click.clickId}</div>
 </div>
 <button
 onClick={() => matchToClick(click.clickId)}
 disabled={matching === click.clickId}
 style={{ marginLeft: 10, padding: "5px 12px", background: "#18181b", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}
 >
 {matching === click.clickId ? "Saving…" : "Use this"}
 </button>
 </div>
 </div>
 ))
 )}
 </div>
 </div>
 </>
 )}

 {/* Record Order Modal */}
 {addingOrder && (
 <>
 <div onClick={() => setAddingOrder(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 200 }} />
 <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 460, background: "#fff", zIndex: 201, borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", padding: "24px 28px", border: "1px solid #e4e4e7" }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
 <p style={{ fontSize: 15, fontWeight: 600, color: "#09090b", margin: 0 }}>Record Order Manually</p>
 <button onClick={() => setAddingOrder(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#a1a1aa" }}>×</button>
 </div>
 <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
 <div>
 <label style={{ fontSize: 11, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.1em" }}>Store Slug *</label>
 <input value={newOrder.storeSlug} onChange={(e) => setNewOrder({ ...newOrder, storeSlug: e.target.value })} placeholder="e.g. porters-preloved" style={{ width: "100%", padding: "7px 10px", border: "1px solid #e4e4e7", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />
 </div>
 <div>
 <label style={{ fontSize: 11, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.1em" }}>Store Name</label>
 <input value={newOrder.storeName} onChange={(e) => setNewOrder({ ...newOrder, storeName: e.target.value })} placeholder="e.g. Porter's Preloved" style={{ width: "100%", padding: "7px 10px", border: "1px solid #e4e4e7", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />
 </div>
 </div>
 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
 <div>
 <label style={{ fontSize: 11, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.1em" }}>Order ID *</label>
 <input value={newOrder.orderId} onChange={(e) => setNewOrder({ ...newOrder, orderId: e.target.value })} placeholder="Order number" style={{ width: "100%", padding: "7px 10px", border: "1px solid #e4e4e7", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />
 </div>
 <div>
 <label style={{ fontSize: 11, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.1em" }}>Amount *</label>
 <input type="number" value={newOrder.orderTotal} onChange={(e) => setNewOrder({ ...newOrder, orderTotal: e.target.value })} placeholder="0.00" style={{ width: "100%", padding: "7px 10px", border: "1px solid #e4e4e7", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />
 </div>
 </div>
 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
 <div>
 <label style={{ fontSize: 11, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.1em" }}>Currency</label>
 <input value={newOrder.currency} onChange={(e) => setNewOrder({ ...newOrder, currency: e.target.value })} placeholder="USD" style={{ width: "100%", padding: "7px 10px", border: "1px solid #e4e4e7", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />
 </div>
 <div>
 <label style={{ fontSize: 11, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.1em" }}>Order Date</label>
 <input type="datetime-local" value={newOrder.timestamp} onChange={(e) => setNewOrder({ ...newOrder, timestamp: e.target.value })} style={{ width: "100%", padding: "7px 10px", border: "1px solid #e4e4e7", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />
 </div>
 </div>
 <div>
 <label style={{ fontSize: 11, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.1em" }}>Customer Email (optional)</label>
 <input value={newOrder.userEmail} onChange={(e) => setNewOrder({ ...newOrder, userEmail: e.target.value })} placeholder="Links to a VYA account" style={{ width: "100%", padding: "7px 10px", border: "1px solid #e4e4e7", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />
 </div>
 {saveOrderError && <p style={{ fontSize: 12, color: "#dc2626", margin: 0 }}>{saveOrderError}</p>}
 <button
 onClick={saveManualOrder}
 disabled={savingOrder || !newOrder.storeSlug || !newOrder.orderId || !newOrder.orderTotal}
 style={{ padding: "9px", background: "#18181b", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer", opacity: (!newOrder.storeSlug || !newOrder.orderId || !newOrder.orderTotal) ? 0.5 : 1 }}
 >
 {savingOrder ? "Saving…" : "Save Order"}
 </button>
 </div>
 </div>
 </>
 )}
 </div>
 );
}
