"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

const SOURCE_COLORS: Record<string, string> = { instagram: "#E1306C", tiktok: "#111", email: "#6366f1", substack: "#FF6719", direct: "#0ea5e9", referral: "#d4af37", linkedin: "#0a66c2", facebook: "#1877f2", twitter: "#1d9bf0", youtube: "#ff0000", pinterest: "#bd081c", threads: "#111", reddit: "#ff4500" };
function srcColor(s: string): string { return SOURCE_COLORS[s.toLowerCase()] ?? "#64748b"; }

type Customer = {
 email: string;
 name: string | null;
 phone: string | null;
 status: string;
 signedUpAt: string;
 approvedAt: string | null;
 referralCode: string | null;
 referredBy: string | null;
 source: string | null;
 sourceLabel: string;
 sourceChannel: string;
 loginMethod: string;
 emailSubscribe: boolean;
 activityScore: number;
 clickCount: number;
 viewCount: number;
 favoriteCount: number;
 cartCount: number;
 orderCount: number;
 pageViewCount: number;
 totalSpend: number;
 lastActiveAt: string | null;
};

type ActivityData = {
 userId: string | null;
 favorites: { product_id: number; title: string | null; image: string | null; store_name: string | null; price: string | null; created_at: string }[];
 cart: { product_id: number; product_title: string; product_image: string | null; store_name: string; price: string; currency: string; added_at: string }[];
 clicks: { click_id: string; product_name: string; store: string; store_slug: string; timestamp: string }[];
 orders: { conversion_id: string; order_id: string; order_total: number; store_name: string; store_slug: string | null; timestamp: string }[];
};

type UnmatchedConversion = {
 conversionId: string;
 timestamp: string;
 orderId: string;
 orderTotal: number;
 currency: string;
 storeName: string;
};

function fmtTime(date: string | null) {
 if (!date) return "—";
 return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ClickMatchRow({ click, userId, orders, onMatchSuccess }: { click: ActivityData["clicks"][number]; userId: string; orders: ActivityData["orders"]; onMatchSuccess: () => void }) {
 const [expanded, setExpanded] = useState(false);
 const [conversions, setConversions] = useState<UnmatchedConversion[]>([]);
 const [loadingConv, setLoadingConv] = useState(false);
 const [matching, setMatching] = useState<string | null>(null);
 const [matched, setMatched] = useState<string | null>(null);

 // Check if this click is already linked to an existing order (same store, within 48h before or 6h after click)
 const clickTs = new Date(click.timestamp).getTime();
 const linkedOrder = orders.find((o) => {
 const sameStore = o.store_slug === click.store_slug || o.store_name === click.store;
 if (!sameStore) return false;
 const orderTs = new Date(o.timestamp).getTime();
 return orderTs >= clickTs - 48 * 60 * 60 * 1000 && orderTs <= clickTs + 6 * 60 * 60 * 1000;
 });

 function toggle() {
 if (!expanded) {
 setLoadingConv(true);
 fetch(`/api/admin/conversions?filter=unmatched&store=${encodeURIComponent(click.store_slug)}`)
 .then((r) => r.json())
 .then((d) => { setConversions(d.conversions ?? []); setLoadingConv(false); })
 .catch(() => setLoadingConv(false));
 }
 setExpanded((v) => !v);
 }

 async function matchConversion(conversionId: string) {
 setMatching(conversionId);
 const res = await fetch(`/api/admin/conversions/${conversionId}`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ clickId: click.click_id, userId }),
 });
 setMatching(null);
 if (!res.ok) {
 const d = await res.json().catch(() => ({}));
 alert(d.error ?? "Failed to match order");
 return;
 }
 setMatched(conversionId);
 setConversions((prev) => prev.filter((c) => c.conversionId !== conversionId));
 onMatchSuccess();
 }

 return (
 <div style={{ marginBottom: 8 }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
 <div style={{ minWidth: 0 }}>
 <p style={{ fontSize: 13, color: "#09090b", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{click.product_name}</p>
 <p style={{ fontSize: 11, color: "#71717a", margin: 0 }}>{click.store}</p>
 </div>
 <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
 <p style={{ fontSize: 11, color: "#a1a1aa", whiteSpace: "nowrap" }}>{fmtTime(click.timestamp)}</p>
 {linkedOrder ? (
 <span style={{ fontSize: 10, padding: "2px 8px", background: "rgba(16,185,129,0.1)", color: "#065f46", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 4, whiteSpace: "nowrap", fontWeight: 600 }}>
 Order ${Number(linkedOrder.order_total).toFixed(0)} ✓
 </span>
 ) : (
 <button
 onClick={toggle}
 style={{ fontSize: 10, padding: "2px 8px", background: "transparent", color: "#09090b", border: "1px solid #e4e4e7", borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap" }}
 >
 {expanded ? "Hide" : "Match order"}
 </button>
 )}
 </div>
 </div>
 {expanded && (
 <div style={{ marginTop: 6, marginLeft: 0, borderLeft: "2px solid #e4e4e7", paddingLeft: 10 }}>
 {loadingConv ? (
 <p style={{ fontSize: 12, color: "#a1a1aa" }}>Loading orders…</p>
 ) : conversions.length === 0 ? (
 <p style={{ fontSize: 12, color: "#a1a1aa" }}>No unmatched orders for this store.</p>
 ) : (
 conversions.map((conv) => (
 <div key={conv.conversionId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6, padding: "6px 8px", background: "#fafafa", border: "1px solid #e4e4e7", borderRadius: 6 }}>
 <div>
 <p style={{ fontSize: 12, fontWeight: 600, color: "#09090b", margin: 0 }}>
 {new Intl.NumberFormat("en-US", { style: "currency", currency: conv.currency || "USD", maximumFractionDigits: 0 }).format(conv.orderTotal)}
 </p>
 <p style={{ fontSize: 11, color: "#a1a1aa", margin: 0 }}>{fmtTime(conv.timestamp)} · <span style={{ fontFamily: "monospace" }}>{conv.orderId.slice(0, 20)}</span></p>
 </div>
 {matched === conv.conversionId ? (
 <span style={{ fontSize: 11, color: "#065f46", fontWeight: 600 }}>Matched ✓</span>
 ) : (
 <button
 onClick={() => matchConversion(conv.conversionId)}
 disabled={matching === conv.conversionId}
 style={{ fontSize: 11, padding: "3px 10px", background: "#18181b", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap", opacity: matching === conv.conversionId ? 0.6 : 1 }}
 >
 {matching === conv.conversionId ? "…" : "Match"}
 </button>
 )}
 </div>
 ))
 )}
 </div>
 )}
 </div>
 );
}

function ActivityPanel({ customer, onClose }: { customer: Customer; onClose: () => void }) {
 const [data, setData] = useState<ActivityData | null>(null);
 const [loading, setLoading] = useState(true);

 function loadActivity() {
 setLoading(true);
 fetch(`/api/admin/customers/activity?email=${encodeURIComponent(customer.email)}`)
 .then((r) => r.json())
 .then((d) => { setData(d); setLoading(false); })
 .catch(() => setLoading(false));
 }

 useEffect(() => { loadActivity(); }, [customer.email]);

 const section = (title: string, count: number) => (
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 600, margin: "24px 0 10px" }}>
 {title} <span style={{ color: "#09090b" }}>({count})</span>
 </p>
 );

 return (
 <>
 {/* Backdrop */}
 <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 100 }} />

 {/* Panel */}
 <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, background: "#fff", zIndex: 101, overflowY: "auto", boxShadow: "-4px 0 32px rgba(0,0,0,0.1)" }}>
 {/* Header */}
 <div style={{ padding: "20px 24px", borderBottom: "1px solid #e4e4e7", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
 <div>
 <p style={{ fontWeight: 600, color: "#09090b", fontSize: 15, margin: 0 }}>{customer.name || "—"}</p>
 <p style={{ fontSize: 12, color: "#71717a", margin: "2px 0 0" }}>{customer.email}</p>
 </div>
 <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#a1a1aa", lineHeight: 1, padding: 0 }}>×</button>
 </div>

 <div style={{ padding: "0 24px 32px" }}>
 {loading ? (
 <p style={{ fontSize: 13, color: "#a1a1aa", marginTop: 24 }}>Loading…</p>
 ) : !data?.userId ? (
 <p style={{ fontSize: 13, color: "#a1a1aa", marginTop: 24 }}>No account activity yet — user hasn&apos;t signed in.</p>
 ) : (
 <>
 {/* Favorites */}
 {section("Liked Items", data.favorites.length)}
 {data.favorites.length === 0 ? <p style={{ fontSize: 13, color: "#a1a1aa" }}>None</p> : data.favorites.map((f, i) => (
 <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
 {f.image ? <img src={f.image} alt="" style={{ width: 40, height: 40, objectFit: "cover", flexShrink: 0 }} /> : <div style={{ width: 40, height: 40, background: "#f4f4f5", flexShrink: 0 }} />}
 <div style={{ minWidth: 0 }}>
 <p style={{ fontSize: 13, color: "#09090b", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.title || "Unknown"}</p>
 <p style={{ fontSize: 11, color: "#71717a", margin: 0 }}>{f.store_name} {f.price ? `· $${f.price}` : ""}</p>
 </div>
 </div>
 ))}

 {/* Cart */}
 {section("In Cart", data.cart.length)}
 {data.cart.length === 0 ? <p style={{ fontSize: 13, color: "#a1a1aa" }}>None</p> : data.cart.map((c, i) => (
 <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
 {c.product_image ? <img src={c.product_image} alt="" style={{ width: 40, height: 40, objectFit: "cover", flexShrink: 0 }} /> : <div style={{ width: 40, height: 40, background: "#f4f4f5", flexShrink: 0 }} />}
 <div style={{ minWidth: 0 }}>
 <p style={{ fontSize: 13, color: "#09090b", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.product_title}</p>
 <p style={{ fontSize: 11, color: "#71717a", margin: 0 }}>{c.store_name} · ${c.price}</p>
 </div>
 </div>
 ))}

 {/* Clicks */}
 {section("Clicked Through to Store", data.clicks.length)}
 {data.clicks.length === 0 ? <p style={{ fontSize: 13, color: "#a1a1aa" }}>None</p> : data.clicks.map((c, i) => (
 <ClickMatchRow key={i} click={c} userId={data.userId!} orders={data.orders} onMatchSuccess={loadActivity} />
 ))}

 {/* Orders */}
 {section("Orders", data.orders.length)}
 {data.orders.length === 0 ? <p style={{ fontSize: 13, color: "#a1a1aa" }}>None</p> : data.orders.map((o, i) => (
 <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
 <div>
 <p style={{ fontSize: 13, color: "#09090b", margin: 0 }}>{o.store_name}</p>
 <p style={{ fontSize: 11, color: "#71717a", margin: 0 }}>{fmtTime(o.timestamp)}</p>
 </div>
 <p style={{ fontSize: 13, fontWeight: 600, color: "#09090b" }}>${Number(o.order_total).toFixed(2)}</p>
 </div>
 ))}
 </>
 )}
 </div>
 </div>
 </>
 );
}

function fmt(date: string | null) {
 if (!date) return "—";
 return new Date(date).toLocaleDateString("en-US", {
 month: "short",
 day: "numeric",
 year: "numeric",
 });
}

export default function CustomersClient() {
 const searchParams = useSearchParams();
 const router = useRouter();
 const [customers, setCustomers] = useState<Customer[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [filter, setFilter] = useState<"all" | "approved" | "pending">("all");
 // Acquisition-source filter. "all" plus one entry per source actually present in the
 // data, so the chips never advertise a channel with nothing behind it.
 const [sourceFilter, setSourceFilter] = useState<string>("all");
 const [search, setSearch] = useState(searchParams.get("search") ?? "");
 // Render in pages so a large customer list doesn't freeze the browser (each row is heavy).
 const PAGE = 100;
 const [visibleCount, setVisibleCount] = useState(PAGE);
 useEffect(() => { setVisibleCount(PAGE); }, [filter, search, sourceFilter]);
 const [approving, setApproving] = useState<string | null>(null);
 const [approvingAll, setApprovingAll] = useState(false);
 const [emailProgress, setEmailProgress] = useState<string | null>(null);
 const [sendingNewArrivals, setSendingNewArrivals] = useState(false);
 const [newArrivalsResult, setNewArrivalsResult] = useState<string | null>(null);

 async function handleSendNewArrivals() {
 if (!confirm("Send New Arrivals email to all approved users?")) return;
 setSendingNewArrivals(true);
 setNewArrivalsResult(null);
 try {
 const res = await fetch("/api/admin/send-new-arrivals", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ send: true }),
 });
 const data = await res.json();
 if (!res.ok) {
 setNewArrivalsResult(`Error: ${data.error}`);
 } else {
 setNewArrivalsResult(`Sent to ${data.sent} users (${data.products} products)`);
 }
 setTimeout(() => setNewArrivalsResult(null), 6000);
 } finally {
 setSendingNewArrivals(false);
 }
 }

 async function handleApproveAll() {
 const pendingCustomers = customers.filter((c) => c.status !== "approved");
 if (pendingCustomers.length === 0) return;
 if (!confirm(`Approve all ${pendingCustomers.length} pending customers? This will send approval emails to each one.`)) return;
 setApprovingAll(true);
 setEmailProgress("Approving...");
 try {
 const res = await fetch("/api/admin/customers/approve-all", { method: "POST" });
 if (!res.ok) return;
 const { approved } = await res.json();
 setCustomers((prev) => prev.map((c) => ({ ...c, status: c.status !== "approved" ? "approved" : c.status })));

 // Send emails in batches of 50 until done
 let remaining = approved;
 let totalSent = 0;
 while (remaining > 0) {
 setEmailProgress(`Sending emails… ${totalSent} sent, ${remaining} remaining`);
 const emailRes = await fetch("/api/admin/customers/send-emails", { method: "POST" });
 if (!emailRes.ok) break;
 const data = await emailRes.json();
 totalSent += data.sent ?? 0;
 remaining = data.remaining ?? 0;
 if (data.sent === 0) break; // nothing was sent, stop to avoid infinite loop
 }
 setEmailProgress(`Done — ${totalSent} emails sent`);
 setTimeout(() => setEmailProgress(null), 4000);
 } finally {
 setApprovingAll(false);
 }
 }

 async function handleApprove(email: string, name: string | null) {
 setApproving(email);
 try {
 const res = await fetch("/api/admin/customers/approve", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ email, firstName: name?.split(" ")[0] ?? undefined }),
 });
 const data = await res.json();
 if (res.ok) {
 setCustomers((prev) =>
 prev.map((c) => c.email === email ? { ...c, status: "approved" } : c)
 );
 if (data.emailSent) {
 alert(`✓ Approved and email sent to ${email}`);
 } else {
 alert(`Approved but email FAILED for ${email}:\n${data.emailError || "Unknown error"}`);
 }
 } else {
 alert(`Failed to approve ${email}: ${data.error}`);
 }
 } finally {
 setApproving(null);
 }
 }

 useEffect(() => {
 fetch(`/api/admin/customers?t=${Date.now()}`)
 .then((r) => r.json())
 .then((d) => {
 setCustomers(d.customers ?? []);
 setLoading(false);
 })
 .catch(() => {
 setError("Failed to load customers.");
 setLoading(false);
 });
 }, []);

 // Source counts drive the chips below — computed off the STATUS-filtered set so the
 // numbers match what you'd actually see, but not off the source filter itself
 // (otherwise selecting TikTok would zero out every other chip).
 const sourceCounts = customers.reduce<Record<string, number>>((acc, c) => {
 const label = c.sourceLabel || "Direct";
 acc[label] = (acc[label] ?? 0) + 1;
 return acc;
 }, {});
 const sourceOptions = Object.entries(sourceCounts)
 .sort((a, b) => (a[0] === "Direct" ? 1 : b[0] === "Direct" ? -1 : b[1] - a[1]));

 const filtered = customers.filter((c) => {
 if (filter === "approved" && c.status !== "approved") return false;
 if (filter === "pending" && c.status === "approved") return false;
 if (sourceFilter !== "all" && (c.sourceLabel || "Direct") !== sourceFilter) return false;
 // Each condition must be able to REJECT independently. This used to `return` the
 // search result directly, which meant typing in the box discarded the status filter.
 if (search) {
 const q = search.toLowerCase();
 const hit = c.email.toLowerCase().includes(q) || (c.name?.toLowerCase().includes(q) ?? false);
 if (!hit) return false;
 }
 return true;
 });

 const approved = customers.filter((c) => c.status === "approved").length;
 const pending = customers.filter((c) => c.status !== "approved").length;
 const loggedIn = customers.filter((c) => c.loginMethod === "Google").length;

 const exportCSV = () => {
 if (filtered.length === 0) return;
 const headers = ["Email", "Name", "Phone", "Status", "Source", "Channel", "Login Method", "Last Active", "Signed Up", "Approved", "Referral Code", "Referred By", "Email Subscribe"];
 const rows = filtered.map((c) => [
 c.email,
 c.name ?? "",
 c.phone ?? "",
 c.status,
 c.sourceLabel,
 c.sourceChannel,
 c.loginMethod,
 fmt(c.lastActiveAt),
 fmt(c.signedUpAt),
 fmt(c.approvedAt),
 c.referralCode ?? "",
 c.referredBy ?? "",
 c.emailSubscribe ? "Yes" : "No",
 ]);

 const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
 const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
 const link = document.createElement("a");
 link.href = URL.createObjectURL(blob);
 link.download = `vya-customers-${new Date().toISOString().split("T")[0]}.csv`;
 link.click();
 };

 return (
 <>
 <main style={{ background: "#f8f9fa", minHeight: "100vh" }}>

 {/* Page title */}
 <section style={{ background: "#fff", borderBottom: "1px solid #e4e4e7" }}>
 <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 32px" }}>
 <h1 style={{ fontSize: 20, fontWeight: 600, color: "#09090b", marginBottom: 6 }}>
 Customers
 </h1>
 <p style={{ fontSize: 13, color: "#71717a" }}>
 Everyone who has signed up for the VYA pilot.{" "}
 <Link href="/admin/analytics" style={{ color: "#18181b", textDecoration: "underline" }}>
 View click &amp; purchase analytics →
 </Link>
 </p>
 </div>
 </section>

 {/* Stats */}
 <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 24px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
 <div style={{ display: "flex", flexWrap: "wrap", gap: 32 }}>
 {[
 { label: "Total", value: customers.length, filterVal: "all" as const },
 { label: "Approved", value: approved, filterVal: "approved" as const },
 { label: "Pending", value: pending, filterVal: "pending" as const },
 { label: "Via Google", value: loggedIn, filterVal: null },
 ].map((s) => (
 <div
 key={s.label}
 onClick={() => s.filterVal && setFilter(s.filterVal)}
 style={{ cursor: s.filterVal ? "pointer" : "default", opacity: s.filterVal && filter === s.filterVal ? 1 : s.filterVal ? 0.85 : 1, transition: "opacity 0.15s" }}
 onMouseEnter={e => { if (s.filterVal) (e.currentTarget as HTMLElement).style.opacity = "1"; }}
 onMouseLeave={e => { if (s.filterVal && filter !== s.filterVal) (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
 >
 <p style={{ fontSize: 24, fontWeight: 600, color: "#09090b", lineHeight: 1, textDecoration: s.filterVal && filter === s.filterVal ? "underline" : "none" }}>{s.value}</p>
 <p style={{ fontSize: 11, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>
 {s.label}
 </p>
 </div>
 ))}
 </div>
 <div style={{ display: "flex", gap: 8 }}>
 {(pending > 0 || approvingAll) && (
 <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
 <button
 onClick={handleApproveAll}
 disabled={approvingAll}
 style={{ padding: "8px 16px", border: "none", background: "#18181b", color: "#fff", cursor: approvingAll ? "not-allowed" : "pointer", opacity: approvingAll ? 0.6 : 1, fontSize: 12, fontWeight: 500, borderRadius: 6 }}
 >
 {approvingAll ? "Working…" : `Approve All (${pending})`}
 </button>
 {emailProgress && (
 <p style={{ fontSize: 11, color: "#71717a", margin: 0 }}>{emailProgress}</p>
 )}
 </div>
 )}
 <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
 <button
 onClick={handleSendNewArrivals}
 disabled={sendingNewArrivals}
 style={{ padding: "8px 16px", border: "none", background: "#18181b", color: "#fff", cursor: sendingNewArrivals ? "not-allowed" : "pointer", opacity: sendingNewArrivals ? 0.6 : 1, fontSize: 12, fontWeight: 500, borderRadius: 6 }}
 >
 {sendingNewArrivals ? "Sending…" : "Send New Arrivals Email"}
 </button>
 {newArrivalsResult && (
 <p style={{ fontSize: 11, color: "#71717a", margin: 0 }}>{newArrivalsResult}</p>
 )}
 </div>
 <button
 onClick={exportCSV}
 disabled={filtered.length === 0}
 style={{ padding: "8px 16px", border: "1px solid #e4e4e7", background: "#fff", color: "#09090b", cursor: filtered.length === 0 ? "not-allowed" : "pointer", opacity: filtered.length === 0 ? 0.4 : 1, fontSize: 12, borderRadius: 6 }}
 >
 Export CSV
 </button>
 </div>
 </div>

 {/* Filters */}
 <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px 16px" }}>
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: "12px 16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
 <div style={{ display: "flex", gap: 8 }}>
 {(["all", "approved", "pending"] as const).map((f) => (
 <button
 key={f}
 onClick={() => setFilter(f)}
 style={{
 fontSize: 12,
 padding: "4px 12px",
 border: filter === f ? "none" : "1px solid #e4e4e7",
 cursor: "pointer",
 transition: "all 0.15s",
 background: filter === f ? "#18181b" : "transparent",
 color: filter === f ? "#fff" : "#71717a",
 borderRadius: 5,
 }}
 >
 {f}
 </button>
 ))}
 </div>

 {/* Acquisition source. A select rather than chips: with a dozen sources the
     chip row wrapped onto three lines and pushed the search box around. The
     counts stay in the option labels so you still see the shape of the data
     without opening it. */}
 {sourceOptions.length > 0 && (
 <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
 <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#a1a1aa" }}>Source</span>
 <select
 value={sourceFilter}
 onChange={(e) => setSourceFilter(e.target.value)}
 style={{
 border: "1px solid #e4e4e7",
 borderRadius: 6,
 padding: "7px 10px",
 fontSize: 13,
 color: "#09090b",
 background: "#fff",
 outline: "none",
 cursor: "pointer",
 minWidth: 168,
 }}
 onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 2px rgba(24,24,27,0.08)")}
 onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
 >
 <option value="all">All sources ({customers.length})</option>
 {sourceOptions.map(([label, count]) => (
 <option key={label} value={label}>
 {label} ({count})
 </option>
 ))}
 </select>
 </label>
 )}

 <input
 type="text"
 placeholder="Search by email or name…"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 style={{ marginLeft: "auto", border: "1px solid #e4e4e7", borderRadius: 6, padding: "7px 12px", fontSize: 13, color: "#09090b", outline: "none", width: 256, boxShadow: "none" }}
 onFocus={e => (e.currentTarget.style.boxShadow = "0 0 0 2px rgba(24,24,27,0.08)")}
 onBlur={e => (e.currentTarget.style.boxShadow = "none")}
 />
 </div>
 </div>

 {/* Content */}
 <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px 48px" }}>
 {loading ? (
 <div style={{ textAlign: "center", padding: "64px 0", color: "#a1a1aa", fontSize: 14 }}>Loading…</div>
 ) : error ? (
 <div style={{ textAlign: "center", padding: "64px 0", color: "#b91c1c", fontSize: 14 }}>{error}</div>
 ) : filtered.length === 0 ? (
 <div style={{ textAlign: "center", padding: "64px 0", color: "#a1a1aa", fontSize: 14 }}>No customers found.</div>
 ) : (
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, overflow: "hidden" }}>
 <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
 <thead>
 <tr style={{ borderBottom: "1px solid #e4e4e7", background: "#fafafa" }}>
 {["#", "Name / Email", "Status", "Login", "Last Active", "Signed Up", "LTV", "Referral Code", "Referred By", ""].map((h) => (
 <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#a1a1aa", fontWeight: 500 }}>{h}</th>
 ))}
 </tr>
 </thead>
 <tbody>
 {filtered.slice(0, visibleCount).map((c, i) => (
 <tr key={c.email} onClick={() => router.push(`/admin/customers/${encodeURIComponent(c.email)}`)} style={{ borderBottom: "1px solid #f4f4f5", cursor: "pointer" }} onMouseEnter={e => (e.currentTarget.style.background = "#fafafa")} onMouseLeave={e => (e.currentTarget.style.background = "")}>
 <td style={{ padding: "12px 16px", color: "#d4d4d8" }}>{i + 1}</td>
 <td style={{ padding: "12px 16px" }}>
 <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
 <p style={{ fontWeight: 500, color: "#09090b", margin: 0 }}>{c.name || "—"}</p>
 {c.pageViewCount > 0 && (
 <span title={`${c.pageViewCount} site page visits`} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10, color: "#6d28d9", background: "#ede9fe", padding: "1px 5px", borderRadius: 4 }}>
 <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
 {c.pageViewCount}
 </span>
 )}
 {c.viewCount > 0 && (
 <span title={`${c.viewCount} product views`} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10, color: "#71717a", background: "#f4f4f5", padding: "1px 5px", borderRadius: 4 }}>
 <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
 {c.viewCount}
 </span>
 )}
 {c.clickCount > 0 && (
 <span title={`${c.clickCount} store click-throughs`} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10, color: "#71717a", background: "#f4f4f5", padding: "1px 5px", borderRadius: 4 }}>
 <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 3l14 9-14 9V3z"/></svg>
 {c.clickCount}
 </span>
 )}
 {c.favoriteCount > 0 && (
 <span title={`${c.favoriteCount} saved`} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10, color: "#71717a", background: "#f4f4f5", padding: "1px 5px", borderRadius: 4 }}>
 <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
 {c.favoriteCount}
 </span>
 )}
 {c.orderCount > 0 && (
 <span title={`${c.orderCount} orders`} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10, color: "#166534", background: "#dcfce7", padding: "1px 5px", borderRadius: 4, fontWeight: 600 }}>
 <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
 {c.orderCount}
 </span>
 )}
 </div>
 <p style={{ fontSize: 12, color: "#71717a", margin: 0 }}>{c.email}</p>
 {c.phone && <p style={{ fontSize: 12, color: "#71717a", margin: 0 }}>{c.phone}</p>}
 </td>
 <td style={{ padding: "12px 16px" }}>
 <span style={{
 display: "inline-block",
 fontSize: 11,
 padding: "2px 8px",
 fontWeight: 500,
 borderRadius: 99,
 background: c.status === "approved" ? "#dcfce7" : c.status === "waitlist" ? "#f4f4f5" : "#fef9c3",
 color: c.status === "approved" ? "#15803d" : c.status === "waitlist" ? "#71717a" : "#854d0e",
 }}>
 {c.status}
 </span>
 </td>
 <td style={{ padding: "12px 16px" }}>
 <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: c.loginMethod === "Google" ? "#2563eb" : "#a1a1aa" }}>
 {c.loginMethod === "Google" ? (
 <svg style={{ width: 12, height: 12 }} viewBox="0 0 24 24">
 <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
 <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
 <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
 <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
 </svg>
 ) : (
 <svg style={{ width: 12, height: 12 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
 </svg>
 )}
 {c.loginMethod}
 </span>
 {c.source && (
 <span style={{ marginLeft: 8, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 7px", borderRadius: 99, fontWeight: 700, background: srcColor(c.source), color: "#fff" }}>
 {c.source}
 </span>
 )}
 </td>
 <td style={{ padding: "12px 16px", fontSize: 12 }}>
 {c.lastActiveAt ? (
 <span style={{ color: "#09090b", fontWeight: 500 }}>{fmt(c.lastActiveAt)}</span>
 ) : (
 <span style={{ color: "#d4d4d8" }}>—</span>
 )}
 </td>
 <td style={{ padding: "12px 16px", fontSize: 12, color: "#71717a" }}>{fmt(c.signedUpAt)}</td>
 <td style={{ padding: "12px 16px" }}>
 {c.totalSpend > 0 ? (
 <span style={{ fontSize: 12, fontWeight: 600, color: "#15803d" }}>
 ${c.totalSpend.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
 </span>
 ) : <span style={{ fontSize: 12, color: "#a1a1aa" }}>—</span>}
 </td>
 <td style={{ padding: "12px 16px" }}>
 {c.referralCode ? (
 <code style={{ fontSize: 11, background: "#f4f4f5", padding: "1px 6px", color: "#09090b", fontFamily: "monospace", borderRadius: 4 }}>{c.referralCode}</code>
 ) : "—"}
 </td>
 <td style={{ padding: "12px 16px" }}>
 {c.referredBy ? (
 <code style={{ fontSize: 11, background: "#fef9c3", color: "#854d0e", padding: "1px 6px", fontFamily: "monospace", borderRadius: 4 }}>{c.referredBy}</code>
 ) : "—"}
 </td>
 <td style={{ padding: "12px 16px" }}>
 {c.status !== "approved" && (
 <button
 onClick={(e) => { e.stopPropagation(); handleApprove(c.email, c.name); }}
 disabled={approving === c.email}
 style={{
 fontSize: 11,
 padding: "3px 10px",
 background: "#18181b",
 color: "#fff",
 border: "none",
 borderRadius: 5,
 cursor: approving === c.email ? "not-allowed" : "pointer",
 opacity: approving === c.email ? 0.6 : 1,
 whiteSpace: "nowrap",
 }}
 >
 {approving === c.email ? "…" : "Approve"}
 </button>
 )}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 {filtered.length > visibleCount && (
 <div style={{ textAlign: "center", padding: "12px 16px", borderTop: "1px solid #f4f4f5" }}>
 <button onClick={() => setVisibleCount((v) => v + PAGE)} style={{ padding: "8px 20px", border: "1px solid #e4e4e7", background: "#fff", color: "#09090b", cursor: "pointer", fontSize: 13, borderRadius: 6 }}>
 Load {Math.min(PAGE, filtered.length - visibleCount)} more
 </button>
 </div>
 )}
 <p style={{ fontSize: 12, color: "#a1a1aa", padding: "10px 16px" }}>
 Showing {Math.min(visibleCount, filtered.length)} of {filtered.length}{filtered.length !== customers.length ? ` (of ${customers.length})` : ""} customers
 </p>
 </div>
 )}
 </div>
 </main>
 </>
 );
}
