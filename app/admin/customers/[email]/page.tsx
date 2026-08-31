"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const DARK = "#09090b";
const GRAY = "#71717a";
const MUTED = "#a1a1aa";
const BORDER = "#e4e4e7";
const BG_HOVER = "#fafafa";

type Profile = {
 email: string;
 name: string | null;
 phone: string | null;
 status: string | null;
 signedUpAt: string | null;
 approvedAt: string | null;
 acquisitionSource: string | null;
 referralCode: string | null;
 referredBy: string | null;
 promoCode: string | null;
 emailSubscribe: boolean;
 smsSubscribe: boolean;
 hasAccount: boolean;
};

type Stats = {
 totalViews: number;
 totalClicks: number;
 totalFavorites: number;
 totalCartItems: number;
 totalOrders: number;
 totalGmv: number;
 totalSessions: number;
 totalBrowseMs: number;
};

type SessionEvent = {
 type: "click" | "view" | "favorite" | "cart" | "page";
 label: string;
 store: string;
 storeSlug: string;
 timestamp: string;
 pageType?: string;
 fullPath?: string;
 timeOnPageMs?: number | null;
};

type Session = {
 start: string;
 end: string;
 durationMs: number;
 clickCount: number;
 viewCount: number;
 favoriteCount: number;
 cartCount: number;
 pageCount: number;
 events: SessionEvent[];
};

type Order = {
 conversionId: string;
 orderId: string;
 orderTotal: number;
 currency: string;
 storeName: string;
 storeSlug: string | null;
 timestamp: string;
 returned: boolean;
 returnedAt: string | null;
};

type Favorite = {
 productId: number;
 title: string | null;
 image: string | null;
 storeName: string | null;
 price: string | null;
 url: string | null;
 createdAt: string;
};

type CartItem = {
 productId: number;
 title: string;
 image: string | null;
 storeName: string;
 price: string;
 currency: string;
 addedAt: string;
};

type TopStore = { store: string; storeSlug: string; count: number };
type StoreFav = { storeSlug: string; storeName: string; createdAt: string };

type Retention = {
 firstSeen: string | null;
 lastSeen: string | null;
 distinctDays: number;
 daysSinceLastSeen: number | null;
 isReturning: boolean;
};

type Visit = {
 source: string;
 channel: string;
 medium: string | null;
 campaign: string | null;
 landingPath: string | null;
 timestamp: string;
};

type VisitSource = {
 source: string;
 channel: string;
 visits: number;
 firstAt: string;
 lastAt: string;
};

type Data = {
 profile: Profile;
 stats: Stats;
 retention: Retention;
 visits: Visit[];
 visitSources: VisitSource[];
 visitsTruncated: boolean;
 sessions: Session[];
 topStores: TopStore[];
 favorites: Favorite[];
 cart: CartItem[];
 orders: Order[];
 storeFavorites: StoreFav[];
};

function fmtDate(ts: string | null) {
 if (!ts) return "—";
 return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(ts: string) {
 return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(ms: number) {
 if (ms < 60_000) return "< 1 min";
 const mins = Math.round(ms / 60_000);
 if (mins < 60) return `${mins} min`;
 const hrs = Math.floor(mins / 60);
 const rem = mins % 60;
 return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function fmtMoney(n: number, currency = "USD") {
 return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
 return (
 <div style={{ background: "#fff", border: `1px solid ${BORDER}`, padding: "16px 20px", borderRadius: 8, minWidth: 120 }}>
 <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, fontWeight: 500, marginBottom: 4 }}>{label}</div>
 <div style={{ fontSize: 24, fontWeight: 700, color: DARK, lineHeight: 1 }}>{value}</div>
 {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{sub}</div>}
 </div>
 );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
 return (
 <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, fontWeight: 500, marginBottom: 10, marginTop: 32 }}>
 {children}
 </div>
 );
}

export default function CustomerProfilePage() {
 const params = useParams();
 const email = decodeURIComponent(params.email as string);
 const [data, setData] = useState<Data | null>(null);
 const [loading, setLoading] = useState(true);
 const [expandedSessions, setExpandedSessions] = useState<Set<number>>(new Set());
 const [showAllVisits, setShowAllVisits] = useState(false);

 useEffect(() => {
 fetch(`/api/admin/customers/${encodeURIComponent(email)}`)
 .then((r) => r.json())
 .then((d) => { setData(d); setLoading(false); })
 .catch(() => setLoading(false));
 }, [email]);

 function toggleSession(i: number) {
 setExpandedSessions((prev) => {
 const next = new Set(prev);
 next.has(i) ? next.delete(i) : next.add(i);
 return next;
 });
 }

 const p = data?.profile;
 const s = data?.stats;

 return (
 <div style={{ minHeight: "100vh", background: "#f8f9fa" }}>

 <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
 {/* Back */}
 <Link href="/admin/customers" style={{ fontSize: 12, color: MUTED, textDecoration: "none", display: "inline-block", marginBottom: 20 }}>
 ← All Customers
 </Link>

 {loading && <div style={{ color: MUTED, fontSize: 13 }}>Loading...</div>}

 {!loading && !data && (
 <div style={{ color: "#b91c1c", fontSize: 13 }}>Failed to load customer — the page may still be deploying. Try refreshing.</div>
 )}

 {!loading && data && p && s && (
 <>
 {/* Header */}
 <div style={{ background: "#fff", border: `1px solid ${BORDER}`, padding: "24px 28px", borderRadius: 8, marginBottom: 24 }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
 <div>
 <h1 style={{ fontSize: 20, fontWeight: 600, color: DARK, margin: 0 }}>{p.name || "—"}</h1>
 <p style={{ fontSize: 13, color: GRAY, margin: "4px 0 0" }}>{p.email}</p>
 {p.phone && <p style={{ fontSize: 12, color: MUTED, margin: "2px 0 0" }}>{p.phone}</p>}
 {(() => {
 const s = (p.acquisitionSource || "").toLowerCase();
 const COLORS: Record<string, string> = { instagram: "#E1306C", tiktok: "#111", email: "#6366f1", substack: "#FF6719", direct: "#0ea5e9", referral: "#d4af37", linkedin: "#0a66c2" };
 const LABELS: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", email: "Email", substack: "Substack", direct: "Direct", referral: "Referral", linkedin: "LinkedIn" };
 const bg = COLORS[s] || "#64748b";
 const label = s ? (LABELS[s] || s) : "Unknown";
 return (
 <div style={{ marginTop: 9 }}>
 <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", padding: "3px 10px", fontWeight: 700, borderRadius: 99, background: bg, color: "#fff" }}>
 ◍ From {label}
 </span>
 </div>
 );
 })()}
 <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
 <span style={{
 fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", padding: "2px 10px", fontWeight: 600, borderRadius: 99,
 background: p.status === "approved" ? "#dcfce7" : "#fef9c3",
 color: p.status === "approved" ? "#15803d" : "#854d0e",
 }}>{p.status ?? "unknown"}</span>
 {p.promoCode && (
 <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", padding: "2px 10px", fontWeight: 600, borderRadius: 99, background: "#ede9fe", color: "#5b21b6" }}>
 Promo: {p.promoCode}
 </span>
 )}
 {!p.hasAccount && (
 <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", padding: "2px 10px", borderRadius: 99, background: "#f4f4f5", color: GRAY }}>
 Never signed in
 </span>
 )}
 </div>
 </div>
 <div style={{ fontSize: 12, color: MUTED, textAlign: "right", lineHeight: 1.8 }}>
 <div>Signed up: <strong style={{ color: DARK }}>{fmtDate(p.signedUpAt)}</strong></div>
 {p.approvedAt && <div>Approved: <strong style={{ color: DARK }}>{fmtDate(p.approvedAt)}</strong></div>}
 {p.referralCode && <div>Referral code: <code style={{ background: "#f4f4f5", padding: "1px 5px", color: DARK, borderRadius: 4 }}>{p.referralCode}</code></div>}
 {p.referredBy && <div>Referred by: <code style={{ background: "#fef9c3", padding: "1px 5px", color: "#854d0e", borderRadius: 4 }}>{p.referredBy}</code></div>}
 </div>
 </div>
 </div>

 {/* Stats */}
 <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
 <StatBox label="Sessions" value={s.totalSessions} />
 <StatBox label="Total Browse Time" value={fmtDuration(s.totalBrowseMs)} sub="from all activity" />
 <StatBox label="Product Views" value={s.totalViews} />
 <StatBox label="Store Click-Throughs" value={s.totalClicks} />
 <StatBox label="Saved Items" value={s.totalFavorites} />
 <StatBox label="In Cart" value={s.totalCartItems} />
 <StatBox label="Orders" value={s.totalOrders} />
 {s.totalGmv > 0 && <StatBox label="Total Spent" value={fmtMoney(s.totalGmv)} />}
 </div>

 {/* Retention */}
 {data.retention.firstSeen && (
 <>
 <SectionLabel>Retention</SectionLabel>
 <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: 24 }}>
 <div>
 <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, fontWeight: 500, marginBottom: 3 }}>First seen</div>
 <div style={{ fontSize: 14, fontWeight: 600, color: DARK }}>{fmtDate(data.retention.firstSeen)}</div>
 </div>
 <div>
 <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, fontWeight: 500, marginBottom: 3 }}>Last seen</div>
 <div style={{ fontSize: 14, fontWeight: 600, color: DARK }}>{fmtDate(data.retention.lastSeen!)}</div>
 {data.retention.daysSinceLastSeen !== null && (
 <div style={{ fontSize: 11, color: data.retention.daysSinceLastSeen > 14 ? "#b91c1c" : MUTED }}>
 {data.retention.daysSinceLastSeen === 0 ? "Today" : `${data.retention.daysSinceLastSeen}d ago`}
 </div>
 )}
 </div>
 <div>
 <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, fontWeight: 500, marginBottom: 3 }}>Active days</div>
 <div style={{ fontSize: 14, fontWeight: 600, color: DARK }}>{data.retention.distinctDays}</div>
 </div>
 <div style={{ display: "flex", alignItems: "center" }}>
 {data.retention.isReturning ? (
 <span style={{ fontSize: 11, background: "#dcfce7", color: "#15803d", padding: "4px 12px", borderRadius: 99, fontWeight: 600 }}>
 Returning user
 </span>
 ) : (
 <span style={{ fontSize: 11, background: "#f4f4f5", color: GRAY, padding: "4px 12px", borderRadius: 99 }}>
 Visited once
 </span>
 )}
 </div>
 </div>
 </>
 )}

 {/* ── Where they came from, every time ──────────────────────────────
     The summary bar is the answer to "which channels keep bringing them
     back" and is what you actually read. The visit-by-visit list is the
     evidence behind it, collapsed by default — expanded it is 100+ rows
     and drowns the rest of the page. ── */}
 {data.visitSources.length > 0 && (
 <>
 <SectionLabel>Where They Came From</SectionLabel>
 <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, marginBottom: 24, padding: "18px 20px" }}>

 {/* One proportional bar per source. Width carries the comparison, so the
     numbers don't have to be read against each other. */}
 {(() => {
 const total = data.visitSources.reduce((n, v) => n + v.visits, 0) || 1;
 const TONE: Record<string, string> = {
 Social: "#111827", Email: "#6366f1", Referral: "#d4af37", Search: "#0ea5e9", Direct: "#d4d4d8",
 };
 return (
 <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
 {data.visitSources.map((vs) => (
 <div key={vs.source} style={{ display: "grid", gridTemplateColumns: "104px 1fr 150px", gap: 12, alignItems: "center" }}>
 <span style={{ fontSize: 13, fontWeight: 600, color: DARK }}>{vs.source}</span>
 <div style={{ position: "relative", height: 8, background: "#f4f4f5", borderRadius: 99, overflow: "hidden" }}>
 <div style={{ position: "absolute", inset: 0, width: `${Math.max(2, (vs.visits / total) * 100)}%`, background: TONE[vs.channel] ?? "#64748b", borderRadius: 99 }} />
 </div>
 <span style={{ fontSize: 11, color: MUTED, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
 {vs.visits} visit{vs.visits === 1 ? "" : "s"} &middot;{" "}
 {vs.firstAt === vs.lastAt ? fmtDate(vs.firstAt) : `${fmtDate(vs.firstAt)}\u2013${fmtDate(vs.lastAt)}`}
 </span>
 </div>
 ))}
 </div>
 );
 })()}

 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
 <span style={{ fontSize: 11, color: MUTED }}>
 Signed-in visits only &mdash; logged-out visits aren&rsquo;t linked to an account yet.
 </span>
 <button
 onClick={() => setShowAllVisits((v) => !v)}
 style={{ fontSize: 12, color: DARK, background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}
 >
 {showAllVisits ? "Hide" : `Show all ${data.visits.length}${data.visitsTruncated ? "+" : ""} visits`}
 </button>
 </div>

 {showAllVisits && (
 <div style={{ maxHeight: 340, overflowY: "auto", marginTop: 14, borderTop: `1px solid ${BORDER}` }}>
 {data.visits.map((v, i) => (
 <div
 key={`${v.timestamp}-${i}`}
 style={{
 display: "grid",
 gridTemplateColumns: "140px 110px 1fr",
 gap: 12,
 alignItems: "baseline",
 padding: "7px 0",
 borderBottom: i === data.visits.length - 1 ? "none" : "1px solid #f4f4f5",
 }}
 >
 <span style={{ fontSize: 11, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{fmtDate(v.timestamp)}</span>
 <span style={{ fontSize: 12, color: DARK, display: "inline-flex", alignItems: "center", gap: 5 }}>
 {v.source}
 {/* "earliest", not "first touch": the header badge shows the earliest
     REAL channel, which is often not the oldest row (usually Direct). */}
 {i === data.visits.length - 1 && (
 <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: MUTED }}>earliest</span>
 )}
 </span>
 <span style={{ fontSize: 11, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
 {[v.campaign, v.landingPath].filter(Boolean).join(" \u00b7 ") || "\u2014"}
 </span>
 </div>
 ))}
 </div>
 )}
 </div>
 </>
 )}

 {/* Top stores */}
 {data.topStores.length > 0 && (
 <>
 <SectionLabel>Most Browsed Stores</SectionLabel>
 <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
 {data.topStores.map((st) => (
 <Link key={st.storeSlug} href={`/admin/stores/${st.storeSlug}`} style={{ textDecoration: "none" }}>
 <div style={{ background: "#fff", border: `1px solid ${BORDER}`, padding: "8px 14px", borderRadius: 8, fontSize: 12, color: DARK }}>
 {st.store} <span style={{ color: MUTED, fontSize: 11 }}>({st.count} clicks)</span>
 </div>
 </Link>
 ))}
 </div>
 </>
 )}

 {/* Orders */}
 {data.orders.length > 0 && (
 <>
 <SectionLabel>Orders ({data.orders.length})</SectionLabel>
 <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
 <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
 <thead>
 <tr style={{ background: BG_HOVER, borderBottom: `1px solid ${BORDER}` }}>
 {["Date", "Store", "Order ID", "Amount", "Status"].map((h) => (
 <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, fontWeight: 500 }}>{h}</th>
 ))}
 </tr>
 </thead>
 <tbody>
 {data.orders.map((o, i) => (
 <tr key={o.conversionId} style={{ borderBottom: i < data.orders.length - 1 ? `1px solid ${BORDER}` : "none" }}>
 <td style={{ padding: "10px 14px", color: GRAY, fontSize: 12 }}>{fmtDate(o.timestamp)}</td>
 <td style={{ padding: "10px 14px", color: DARK, fontWeight: 500 }}>
 {o.storeSlug ? <Link href={`/admin/stores/${o.storeSlug}`} style={{ color: DARK, textDecoration: "none" }}>{o.storeName}</Link> : o.storeName}
 </td>
 <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 11, background: "#f4f4f5", color: DARK }}>{o.orderId}</td>
 <td style={{ padding: "10px 14px", fontWeight: 600, color: DARK }}>{fmtMoney(o.orderTotal, o.currency)}</td>
 <td style={{ padding: "10px 14px" }}>
 {o.returned ? (
 <span style={{ fontSize: 10, background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: 99 }}>Returned {o.returnedAt ? fmtDate(o.returnedAt) : ""}</span>
 ) : (
 <span style={{ fontSize: 10, background: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: 99 }}>Completed</span>
 )}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </>
 )}

 {/* Browse sessions */}
 {data.sessions.length > 0 && (
 <>
 <SectionLabel>Browse Sessions ({data.sessions.length})</SectionLabel>
 <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
 {data.sessions.map((sess, i) => (
 <div key={i} style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
 <button
 onClick={() => toggleSession(i)}
 style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
 >
 <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
 <span style={{ fontSize: 12, color: DARK, fontWeight: 500 }}>{fmtDateTime(sess.start)}</span>
 {sess.pageCount > 0 && <span style={{ fontSize: 11, color: MUTED }}>📄 {sess.pageCount} pages</span>}
 {sess.viewCount > 0 && <span style={{ fontSize: 11, color: MUTED }}>👁 {sess.viewCount}</span>}
 {sess.clickCount > 0 && <span style={{ fontSize: 11, color: MUTED }}>↗ {sess.clickCount}</span>}
 {sess.favoriteCount > 0 && <span style={{ fontSize: 11, color: MUTED }}>♥ {sess.favoriteCount}</span>}
 {sess.cartCount > 0 && <span style={{ fontSize: 11, color: MUTED }}>🛍 {sess.cartCount}</span>}
 <span style={{ fontSize: 11, color: GRAY, background: "#f4f4f5", padding: "2px 8px", borderRadius: 4 }}>
 {fmtDuration(sess.durationMs)}
 </span>
 </div>
 <span style={{ fontSize: 16, color: MUTED }}>{expandedSessions.has(i) ? "−" : "+"}</span>
 </button>

 {/* Page journey strip — always visible when there are page views */}
 {sess.events.filter((e) => e.type === "page").length > 0 && (
 <div style={{ borderTop: `1px solid #f4f4f5`, padding: "6px 16px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, background: "#fafafa" }}>
 {sess.events
 .filter((e) => e.type === "page")
 .map((e, j, arr) => (
 <span key={j} style={{ display: "flex", alignItems: "center", gap: 4 }}>
 <span style={{ fontSize: 11, color: j === arr.length - 1 ? "#b91c1c" : GRAY, fontWeight: j === arr.length - 1 ? 600 : 400 }}>
 {e.label}
 {e.timeOnPageMs && e.timeOnPageMs > 0 ? (
 <span style={{ color: MUTED, fontWeight: 400 }}> ({Math.round(e.timeOnPageMs / 1000)}s)</span>
 ) : null}
 </span>
 {j < arr.length - 1 && <span style={{ fontSize: 10, color: MUTED }}>→</span>}
 </span>
 ))}
 <span style={{ fontSize: 10, color: "#b91c1c", marginLeft: 4 }}>✕ exit</span>
 </div>
 )}

 {expandedSessions.has(i) && (
 <div style={{ borderTop: `1px solid ${BORDER}`, padding: "0 16px 12px" }}>
 {sess.events.map((e, j) => (
 <div key={j} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: j < sess.events.length - 1 ? `1px solid #f4f4f5` : "none" }}>
 <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
 <span style={{ fontSize: 11, marginTop: 1, flexShrink: 0, color: e.type === "page" ? "#6366f1" : "inherit" }}>
 {e.type === "click" ? "↗" : e.type === "view" ? "👁" : e.type === "favorite" ? "♥" : e.type === "cart" ? "🛍" : "→"}
 </span>
 <div>
 <p style={{ fontSize: 12, color: e.type === "page" ? "#6366f1" : DARK, margin: 0, fontStyle: e.type === "page" ? "italic" : "normal" }}>
 {e.label}
 {e.type === "page" && e.timeOnPageMs && e.timeOnPageMs > 0 && (
 <span style={{ color: MUTED, fontStyle: "normal", marginLeft: 4 }}>· {Math.round(e.timeOnPageMs / 1000)}s</span>
 )}
 </p>
 {e.store && (
 <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>
 {e.storeSlug ? (
 <Link href={`/admin/stores/${e.storeSlug}`} style={{ color: MUTED, textDecoration: "none" }}>{e.store}</Link>
 ) : e.store}
 </p>
 )}
 </div>
 </div>
 <span style={{ fontSize: 11, color: MUTED, whiteSpace: "nowrap", marginLeft: 12 }}>
 {new Date(e.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
 </span>
 </div>
 ))}
 </div>
 )}
 </div>
 ))}
 </div>
 </>
 )}

 {/* Saved items */}
 {data.favorites.length > 0 && (
 <>
 <SectionLabel>Saved Items ({data.favorites.length})</SectionLabel>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
 {data.favorites.map((f, i) => (
 <div key={i} style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
 {f.image && <img src={f.image} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover" }} />}
 <div style={{ padding: "8px 10px" }}>
 <p style={{ fontSize: 12, color: DARK, margin: 0, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.title || "Unknown"}</p>
 <p style={{ fontSize: 11, color: MUTED, margin: "2px 0 0" }}>{f.storeName}{f.price ? ` · $${f.price}` : ""}</p>
 </div>
 </div>
 ))}
 </div>
 </>
 )}

 {/* Cart */}
 {data.cart.length > 0 && (
 <>
 <SectionLabel>Cart ({data.cart.length})</SectionLabel>
 <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8 }}>
 {data.cart.map((c, i) => (
 <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", borderBottom: i < data.cart.length - 1 ? `1px solid ${BORDER}` : "none" }}>
 {c.image && <img src={c.image} alt="" style={{ width: 40, height: 40, objectFit: "cover", flexShrink: 0, borderRadius: 4 }} />}
 <div style={{ flex: 1, minWidth: 0 }}>
 <p style={{ fontSize: 13, color: DARK, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</p>
 <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>{c.storeName}</p>
 </div>
 <p style={{ fontSize: 13, fontWeight: 600, color: DARK, flexShrink: 0 }}>${c.price}</p>
 </div>
 ))}
 </div>
 </>
 )}

 {/* Saved stores */}
 {data.storeFavorites.length > 0 && (
 <>
 <SectionLabel>Saved Stores ({data.storeFavorites.length})</SectionLabel>
 <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
 {data.storeFavorites.map((sf) => (
 <Link key={sf.storeSlug} href={`/admin/stores/${sf.storeSlug}`} style={{ textDecoration: "none" }}>
 <div style={{ background: "#fff", border: `1px solid ${BORDER}`, padding: "6px 12px", borderRadius: 8, fontSize: 12, color: DARK }}>
 {sf.storeName}
 </div>
 </Link>
 ))}
 </div>
 </>
 )}

 {!p.hasAccount && (
 <div style={{ marginTop: 32, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "24px", textAlign: "center", color: MUTED, fontSize: 13 }}>
 This customer signed up but has never logged in — no activity data available yet.
 </div>
 )}
 </>
 )}
 </div>
 </div>
 );
}
