"use client";

import { useState, useEffect, useCallback } from "react";

type StoreOpt = { slug: string; name: string };
type SearchResult = { title: string; price: number; image: string | null; source: string };
type Blocked = { storeSlug: string; title: string; reason: string | null; blockedAt: string };

export default function RemovedItemsClient({ stores }: { stores: StoreOpt[] }) {
 const [store, setStore] = useState("");
 const [query, setQuery] = useState("");
 const [results, setResults] = useState<SearchResult[]>([]);
 const [searching, setSearching] = useState(false);
 const [blocked, setBlocked] = useState<Blocked[]>([]);
 const [busy, setBusy] = useState<string | null>(null);
 const [msg, setMsg] = useState<string | null>(null);

 const storeName = (slug: string) => stores.find((s) => s.slug === slug)?.name ?? slug;

 const loadBlocked = useCallback(async () => {
 const res = await fetch("/api/admin/blocked-products");
 if (res.ok) setBlocked((await res.json()).blocked ?? []);
 }, []);

 useEffect(() => {
 loadBlocked();
 }, [loadBlocked]);

 async function search() {
 if (!store) {
 setMsg("Pick a store first.");
 return;
 }
 setSearching(true);
 setMsg(null);
 try {
 const res = await fetch(`/api/admin/products/search?store=${encodeURIComponent(store)}&q=${encodeURIComponent(query)}&limit=1000`);
 const data = await res.json();
 setResults(res.ok ? data.products ?? [] : []);
 if (!res.ok) setMsg(data.error ?? "Search failed.");
 } finally {
 setSearching(false);
 }
 }

 async function remove(title: string) {
 if (!confirm(`Permanently remove "${title}" from ${storeName(store)}?\n\nIt will be deleted now and blocked from re-importing on every future sync.`)) return;
 const reason = prompt("Reason (optional): e.g. counterfeit, off-brand, duplicate:", "") || null;
 setBusy(title);
 setMsg(null);
 try {
 const res = await fetch("/api/admin/blocked-products", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ storeSlug: store, title, reason }),
 });
 const data = await res.json();
 if (res.ok) {
 setResults((r) => r.filter((x) => x.title !== title));
 setMsg(`Removed "${title}" (${data.deleted} row${data.deleted === 1 ? "" : "s"} deleted) and blocked from re-import.`);
 await loadBlocked();
 } else {
 setMsg(data.error ?? "Failed to remove.");
 }
 } finally {
 setBusy(null);
 }
 }

 async function restore(b: Blocked) {
 if (!confirm(`Restore "${b.title}" for ${storeName(b.storeSlug)}?\n\nIt will reappear on the next sync if the store still lists it.`)) return;
 setBusy(b.storeSlug + b.title);
 try {
 const res = await fetch(`/api/admin/blocked-products?store=${encodeURIComponent(b.storeSlug)}&title=${encodeURIComponent(b.title)}`, { method: "DELETE" });
 if (res.ok) {
 setMsg(`Restored "${b.title}". It will re-sync if still listed.`);
 await loadBlocked();
 }
 } finally {
 setBusy(null);
 }
 }

 return (
 <div style={{ maxWidth: 880, margin: "0 auto", padding: "32px 20px", fontFamily: "Arial, sans-serif", color: "#18181b" }}>
 <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Removed items</h1>
 <p style={{ color: "#71717a", fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>
 Permanently remove items that shouldn&apos;t be on VYA. Removing deletes the item now and blocks it
 from being re-imported on any future sync. Restore an item to let it sync again.
 </p>

 {msg && (
 <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8, background: "#f4f4f5", fontSize: 13, color: "#3f3f46" }}>{msg}</div>
 )}

 {/* Find + remove */}
 <div style={{ marginTop: 24, border: "1px solid #e4e4e7", borderRadius: 12, padding: 18 }}>
 <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px" }}>Find an item to remove</h2>
 <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
 <select value={store} onChange={(e) => { setStore(e.target.value); setResults([]); }}
 style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid #d4d4d8", fontSize: 14, minWidth: 200 }}>
 <option value="">Select a store…</option>
 {stores.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
 </select>
 <input
 value={query}
 onChange={(e) => setQuery(e.target.value)}
 onKeyDown={(e) => e.key === "Enter" && search()}
 placeholder="Search title (blank = list all)"
 style={{ flex: 1, minWidth: 200, padding: "9px 10px", borderRadius: 8, border: "1px solid #d4d4d8", fontSize: 14 }}
 />
 <button onClick={search} disabled={searching || !store}
 style={{ padding: "9px 16px", borderRadius: 8, border: 0, background: "#18181b", color: "#fff", fontSize: 14, cursor: "pointer", opacity: searching || !store ? 0.5 : 1 }}>
 {searching ? "Searching…" : "Search"}
 </button>
 </div>

 {results.length > 0 && (
 <div style={{ marginTop: 14, borderTop: "1px solid #f4f4f5" }}>
 {results.map((r) => (
 <div key={r.title} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f4f4f5" }}>
 {/* eslint-disable-next-line @next/next/no-img-element */}
 {r.image ? <img src={r.image} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} /> : <div style={{ width: 44, height: 44, borderRadius: 6, background: "#f4f4f5", flexShrink: 0 }} />}
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
 <div style={{ fontSize: 12, color: "#a1a1aa" }}>${Math.round(r.price).toLocaleString()} · {r.source}</div>
 </div>
 <button onClick={() => remove(r.title)} disabled={busy === r.title}
 style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #fca5a5", background: "#fef2f2", color: "#b91c1c", fontSize: 13, cursor: "pointer", flexShrink: 0 }}>
 {busy === r.title ? "Removing…" : "Remove permanently"}
 </button>
 </div>
 ))}
 </div>
 )}
 </div>

 {/* Currently blocked */}
 <div style={{ marginTop: 24, border: "1px solid #e4e4e7", borderRadius: 12, padding: 18 }}>
 <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px" }}>Permanently removed ({blocked.length})</h2>
 {blocked.length === 0 ? (
 <p style={{ color: "#a1a1aa", fontSize: 13, margin: 0 }}>Nothing removed yet.</p>
 ) : (
 <div>
 {blocked.map((b) => (
 <div key={b.storeSlug + b.title} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f4f4f5" }}>
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
 <div style={{ fontSize: 12, color: "#a1a1aa" }}>{storeName(b.storeSlug)}{b.reason ? ` · ${b.reason}` : ""}</div>
 </div>
 <button onClick={() => restore(b)} disabled={busy === b.storeSlug + b.title}
 style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #d4d4d8", background: "#fff", color: "#3f3f46", fontSize: 13, cursor: "pointer", flexShrink: 0 }}>
 {busy === b.storeSlug + b.title ? "…" : "Restore"}
 </button>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 );
}
