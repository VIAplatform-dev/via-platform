"use client";

import { useEffect, useState } from "react";

type Offer = {
 id: string;
 storeSlug: string;
 storeName: string;
 fee: number;
 timeline: string;
 notes: string | null;
 status: "pending" | "accepted" | "declined";
 createdAt: string;
};

type SourcingRequest = {
 id: string;
 status: string;
 createdAt: string;
 matchedStoreSlug: string | null;
 matchedStoreAt: string | null;
 userName: string | null;
 userEmail: string;
 userPhone: string | null;
 userInstagram: string | null;
 description: string;
 priceMin: number;
 priceMax: number;
 condition: string;
 size: string | null;
 deadline: string;
 imageUrl: string | null;
 preferredStoreSlugs: string[] | null;
 offers: Offer[];
 acceptedOffer: Offer | null;
};

function fmt(date: string | null) {
 if (!date) return "-";
 return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
 pending_payment: { color: "#71717a", bg: "#f4f4f5" },
 paid: { color: "#854d0e", bg: "#fef9c3" },
 matched: { color: "#15803d", bg: "#dcfce7" },
 refunded: { color: "#71717a", bg: "#f4f4f5" },
};

function RequestRow({
 req,
 onClick,
 selected,
}: {
 req: SourcingRequest;
 onClick: () => void;
 selected: boolean;
}) {
 const statusStyle = STATUS_COLORS[req.status] ?? { color: "#71717a", bg: "#f4f4f5" };
 return (
 <tr
 onClick={onClick}
 style={{
 cursor: "pointer",
 background: selected ? "#fafafa" : undefined,
 borderBottom: "1px solid #f4f4f5",
 }}
 onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = "#fafafa"; }}
 onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = ""; }}
 >
 <td style={{ padding: "12px 16px", fontSize: 13, color: "#09090b" }}>
 {req.userName || "-"}
 <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>{req.userEmail}</div>
 </td>
 <td style={{ padding: "12px 16px", fontSize: 13, color: "#71717a", maxWidth: 240 }}>
 <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{req.description}</div>
 </td>
 <td style={{ padding: "12px 16px", fontSize: 13, color: "#71717a", whiteSpace: "nowrap" }}>
 ${req.priceMin}–${req.priceMax}
 </td>
 <td style={{ padding: "12px 16px" }}>
 <span style={{
 fontSize: 11,
 fontWeight: 500,
 color: statusStyle.color,
 background: statusStyle.bg,
 borderRadius: 99,
 padding: "2px 8px",
 }}>
 {req.status.replace("_", " ")}
 </span>
 </td>
 <td style={{ padding: "12px 16px", fontSize: 12, color: "#a1a1aa", whiteSpace: "nowrap" }}>
 {req.offers.length} offer{req.offers.length !== 1 ? "s" : ""}
 </td>
 <td style={{ padding: "12px 16px", fontSize: 12, color: "#a1a1aa", whiteSpace: "nowrap" }}>
 {fmt(req.createdAt)}
 </td>
 </tr>
 );
}

function DetailPanel({ req, onClose, onUpdate }: { req: SourcingRequest; onClose: () => void; onUpdate: (id: string, status: string, matchedStoreSlug: string | null) => void }) {
 const [editStatus, setEditStatus] = useState(req.status);
 const [editStore, setEditStore] = useState(req.matchedStoreSlug ?? "");
 const [saving, setSaving] = useState(false);
 const [saveError, setSaveError] = useState<string | null>(null);

 async function handleSave() {
 setSaving(true);
 setSaveError(null);
 try {
 const res = await fetch(`/api/admin/sourcing/${req.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 status: editStatus,
 matchedStoreSlug: editStatus === "matched" ? editStore || null : null,
 }),
 });
 if (!res.ok) throw new Error("Failed to save");
 onUpdate(req.id, editStatus, editStatus === "matched" ? editStore || null : null);
 } catch {
 setSaveError("Could not save. Try again.");
 } finally {
 setSaving(false);
 }
 }

 return (
 <>
 <div
 onClick={onClose}
 style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 100 }}
 />
 <div style={{
 position: "fixed", top: 0, right: 0, bottom: 0, width: 480,
 background: "#fff", zIndex: 101, overflowY: "auto",
 boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
 }}>
 <div style={{ padding: "20px 24px", borderBottom: "1px solid #e4e4e7", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
 <div>
 <p style={{ fontSize: 16, fontWeight: 600, color: "#09090b", margin: 0 }}>
 {req.userName || req.userEmail}
 </p>
 <p style={{ fontSize: 12, color: "#a1a1aa", marginTop: 2 }}>{req.userEmail}</p>
 </div>
 <button
 onClick={onClose}
 style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#a1a1aa", padding: 0 }}
 >
 ×
 </button>
 </div>

 <div style={{ padding: "20px 24px" }}>
 {req.imageUrl && (
 <img
 src={req.imageUrl}
 alt="Request"
 style={{ width: "100%", maxHeight: 240, objectFit: "contain", marginBottom: 20, border: "1px solid #e4e4e7", borderRadius: 8 }}
 />
 )}

 <Section title="Request Details" />
 <Row label="Description" value={req.description} />
 <Row label="Budget" value={`$${req.priceMin} – $${req.priceMax}`} />
 <Row label="Condition" value={req.condition} />
 {req.size && <Row label="Size" value={req.size} />}
 <Row label="Deadline" value={req.deadline} />
 <Row label="Status" value={req.status.replace("_", " ")} />
 <Row label="Submitted" value={fmt(req.createdAt)} />
 {req.preferredStoreSlugs && req.preferredStoreSlugs.length > 0 && (
 <Row label="Preferred Stores" value={req.preferredStoreSlugs.join(", ")} />
 )}

 <Section title="Customer Contact" />
 <Row label="Email" value={req.userEmail} />
 {req.userPhone && <Row label="Phone" value={req.userPhone} />}
 {req.userInstagram && <Row label="Instagram" value={req.userInstagram} />}

 <Section title={`Offers (${req.offers.length})`} />
 {req.offers.length === 0 ? (
 <p style={{ fontSize: 13, color: "#a1a1aa" }}>No offers yet.</p>
 ) : (
 req.offers.map((offer) => (
 <div
 key={offer.id}
 style={{
 border: "1px solid",
 borderColor: offer.status === "accepted" ? "#16a34a" : offer.status === "declined" ? "#e4e4e7" : "#e4e4e7",
 borderRadius: 6,
 padding: "12px 14px",
 marginBottom: 10,
 background: offer.status === "accepted" ? "#dcfce7" : undefined,
 opacity: offer.status === "declined" ? 0.5 : 1,
 }}
 >
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
 <span style={{ fontSize: 13, fontWeight: 600, color: "#09090b" }}>{offer.storeName}</span>
 <span style={{
 fontSize: 11, fontWeight: 500, borderRadius: 99,
 padding: "2px 7px",
 background: offer.status === "accepted" ? "#dcfce7" : offer.status === "declined" ? "#f4f4f5" : "#fef9c3",
 color: offer.status === "accepted" ? "#15803d" : offer.status === "declined" ? "#71717a" : "#854d0e",
 }}>
 {offer.status}
 </span>
 </div>
 <div style={{ fontSize: 12, color: "#71717a" }}>
 ${offer.fee} fee · {offer.timeline}
 {offer.notes && <div style={{ marginTop: 4, color: "#09090b" }}>{offer.notes}</div>}
 <div style={{ marginTop: 4, color: "#a1a1aa" }}>Submitted {fmt(offer.createdAt)}</div>
 </div>
 </div>
 ))
 )}

 {req.acceptedOffer && (
 <>
 <Section title="Accepted Offer" />
 <Row label="Store" value={req.acceptedOffer.storeName} />
 <Row label="Fee" value={`$${req.acceptedOffer.fee}`} />
 <Row label="Timeline" value={req.acceptedOffer.timeline} />
 {req.acceptedOffer.notes && <Row label="Notes" value={req.acceptedOffer.notes} />}
 <Row label="Offer Submitted" value={fmt(req.acceptedOffer.createdAt)} />
 {req.matchedStoreAt && <Row label="Offer Accepted" value={fmt(req.matchedStoreAt)} />}
 </>
 )}

 <Section title="Admin Actions" />
 <div style={{ marginTop: 8 }}>
 <label style={{ fontSize: 12, color: "#71717a", display: "block", marginBottom: 4 }}>Status</label>
 <select
 value={editStatus}
 onChange={(e) => setEditStatus(e.target.value)}
 style={{ width: "100%", padding: "7px 10px", border: "1px solid #e4e4e7", borderRadius: 6, fontSize: 13, marginBottom: 10 }}
 >
 <option value="pending_payment">Pending Payment</option>
 <option value="paid">Paid</option>
 <option value="matched">Matched</option>
 <option value="refunded">Refunded</option>
 </select>

 {editStatus === "matched" && (
 <div style={{ marginBottom: 10 }}>
 <label style={{ fontSize: 12, color: "#71717a", display: "block", marginBottom: 4 }}>Matched Store Slug</label>
 <input
 type="text"
 value={editStore}
 onChange={(e) => setEditStore(e.target.value)}
 placeholder="e.g. house-on-a-chain"
 style={{ width: "100%", padding: "7px 10px", border: "1px solid #e4e4e7", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
 />
 </div>
 )}

 {saveError && <p style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>{saveError}</p>}

 <button
 onClick={handleSave}
 disabled={saving || editStatus === req.status}
 style={{
 padding: "8px 16px",
 background: saving || editStatus === req.status ? "#f4f4f5" : "#18181b",
 color: saving || editStatus === req.status ? "#a1a1aa" : "#fff",
 border: "none",
 borderRadius: 6,
 fontSize: 12,
 fontWeight: 500,
 cursor: saving || editStatus === req.status ? "default" : "pointer",
 }}
 >
 {saving ? "Saving…" : "Save Changes"}
 </button>
 </div>
 </div>
 </div>
 </>
 );
}

function Section({ title }: { title: string }) {
 return (
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, margin: "20px 0 8px" }}>
 {title}
 </p>
 );
}

function Row({ label, value }: { label: string; value: string }) {
 return (
 <div style={{ display: "flex", borderBottom: "1px solid #f4f4f5", padding: "7px 0", gap: 12 }}>
 <span style={{ fontSize: 12, color: "#a1a1aa", minWidth: 120, flexShrink: 0 }}>{label}</span>
 <span style={{ fontSize: 13, color: "#09090b", wordBreak: "break-word" }}>{value}</span>
 </div>
 );
}

type FilterTab = "all" | "outstanding" | "offers" | "accepted";

export default function AdminSourcingPage() {
 const [requests, setRequests] = useState<SourcingRequest[]>([]);
 const [loading, setLoading] = useState(true);
 const [selected, setSelected] = useState<SourcingRequest | null>(null);
 const [tab, setTab] = useState<FilterTab>("all");

 useEffect(() => {
 fetch("/api/admin/sourcing")
 .then((r) => r.json())
 .then((d) => { setRequests(d.requests ?? []); setLoading(false); })
 .catch(() => setLoading(false));
 }, []);

 const filtered = requests.filter((r) => {
 if (tab === "outstanding") return r.status === "paid" && !r.matchedStoreSlug;
 if (tab === "offers") return r.offers.length > 0 && r.status !== "matched";
 if (tab === "accepted") return r.status === "matched";
 return true;
 });

 const counts = {
 all: requests.length,
 outstanding: requests.filter((r) => r.status === "paid" && !r.matchedStoreSlug).length,
 offers: requests.filter((r) => r.offers.length > 0 && r.status !== "matched").length,
 accepted: requests.filter((r) => r.status === "matched").length,
 };

 const tabs: { key: FilterTab; label: string }[] = [
 { key: "all", label: "All" },
 { key: "outstanding", label: "Outstanding" },
 { key: "offers", label: "Has Offers" },
 { key: "accepted", label: "Accepted" },
 ];

 return (
 <div style={{ minHeight: "100vh", background: "#f8f9fa", fontFamily: "system-ui, sans-serif" }}>
 <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
 <div style={{ marginBottom: 24 }}>
 <h1 style={{ fontSize: 20, fontWeight: 600, color: "#09090b", margin: "0 0 4px" }}>Sourcing Requests</h1>
 <p style={{ fontSize: 14, color: "#71717a", margin: 0 }}>{requests.length} total requests</p>
 </div>

 {/* Tabs */}
 <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
 {tabs.map((t) => (
 <button
 key={t.key}
 onClick={() => setTab(t.key)}
 style={{
 padding: "6px 14px",
 borderRadius: 6,
 border: "1px solid",
 borderColor: tab === t.key ? "#18181b" : "#e4e4e7",
 background: tab === t.key ? "#18181b" : "#fff",
 color: tab === t.key ? "#fff" : "#71717a",
 fontSize: 12,
 cursor: "pointer",
 fontWeight: tab === t.key ? 500 : 400,
 }}
 >
 {t.label} <span style={{ opacity: 0.7 }}>({counts[t.key]})</span>
 </button>
 ))}
 </div>

 {loading ? (
 <p style={{ color: "#a1a1aa", fontSize: 14 }}>Loading…</p>
 ) : filtered.length === 0 ? (
 <p style={{ color: "#a1a1aa", fontSize: 14 }}>No requests in this category.</p>
 ) : (
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, overflow: "hidden" }}>
 <table style={{ width: "100%", borderCollapse: "collapse" }}>
 <thead>
 <tr style={{ background: "#fafafa", borderBottom: "1px solid #e4e4e7" }}>
 {["Customer", "Description", "Budget", "Status", "Offers", "Date"].map((h) => (
 <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500 }}>
 {h}
 </th>
 ))}
 </tr>
 </thead>
 <tbody>
 {filtered.map((req) => (
 <RequestRow
 key={req.id}
 req={req}
 selected={selected?.id === req.id}
 onClick={() => setSelected(req)}
 />
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>

 {selected && (
 <DetailPanel
 req={selected}
 onClose={() => setSelected(null)}
 onUpdate={(id, status, matchedStoreSlug) => {
 setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status, matchedStoreSlug } : r));
 setSelected((prev) => prev?.id === id ? { ...prev, status, matchedStoreSlug } : prev);
 }}
 />
 )}
 </div>
 );
}
