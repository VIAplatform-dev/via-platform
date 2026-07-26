"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Package, Search } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, TechButtonLink, TechEmpty, StatusPill, MetricCard, TH, TD, cn } from "../ui";
import { Input, Field } from "@/app/store/ui";

type Item = {
 id: string;
 sku: number; // per-store sequence by creation order (1 = the store's first item)
 title: string;
 priceCents: number;
 costCents: number | null; // seller's cost (COGS) if recorded — powers the margin column
 currency: string;
 images: string[];
 size: string | null;
 category: string | null;
 description: string | null;
 status: "draft" | "active" | "reserved" | "sold" | "removed";
 collections?: string[];
};

const TONE: Record<Item["status"], "live" | "pending" | "neutral" | "down" | "info"> = {
 draft: "pending",
 active: "live",
 reserved: "info",
 sold: "neutral",
 removed: "down",
};

type EditForm = { title: string; price: string; size: string; category: string; description: string };

export default function ItemsPage() {
 const pathname = usePathname();
 const statusFilter = pathname.endsWith("/drafts") ? "draft" : pathname.endsWith("/sold") ? "sold" : null;
 const [loading, setLoading] = useState(true);
 const [authErr, setAuthErr] = useState<string | null>(null);
 const [items, setItems] = useState<Item[]>([]);
 const [q, setQ] = useState(""); // client-side search over title/category
 // Where each item is posted — real cross-listing status per platform, keyed by itemId.
 const [channels, setChannels] = useState<Record<string, { key: string; status: string }[]>>({});
 const [platformNames, setPlatformNames] = useState<Record<string, string>>({});
 const [busyId, setBusyId] = useState<string | null>(null);
 const [isAdmin, setIsAdmin] = useState(false);
 const [selected, setSelected] = useState<Set<string>>(new Set());
 const [bulkBusy, setBulkBusy] = useState(false);
 const [editing, setEditing] = useState<Item | null>(null);
 const [editForm, setEditForm] = useState<EditForm>({ title: "", price: "", size: "", category: "", description: "" });
 const [savingEdit, setSavingEdit] = useState(false);
 // Collections: the store's collections + the ones selected for the item being edited.
 const [cols, setCols] = useState<{ id: string; title: string; itemCount?: number }[]>([]);
 const [selCols, setSelCols] = useState<string[]>([]);
 const [newCol, setNewCol] = useState("");

 async function load() {
 try {
 const r = await fetch("/api/store/items");
 if (!r.ok) {
 setAuthErr(r.status === 401 ? "Sign in as your store to manage items." : "Couldn’t load items.");
 setLoading(false);
 return;
 }
 const d = await r.json();
 setItems(d.items || []);
 setIsAdmin(!!d.isAdmin);
 } catch {
 setAuthErr("Couldn’t load items.");
 }
 setLoading(false);
 }
 useEffect(() => {
 (async () => { await load(); })();
 fetch("/api/store/collections").then((r) => (r.ok ? r.json() : null)).then((c) => c && setCols(c.collections || [])).catch(() => {});
 // Cross-listing board → which channels each item is posted on (listed) or queued for (pending).
 fetch("/api/store/cross-listing").then((r) => (r.ok ? r.json() : null)).then((r) => {
 if (!r) return;
 const names: Record<string, string> = {};
 (r.platforms || []).forEach((p: { key: string; name: string }) => { names[p.key] = p.name; });
 setPlatformNames(names);
 const map: Record<string, { key: string; status: string }[]> = {};
 (r.board || []).forEach((b: { itemId: string; listings?: Record<string, string> }) => {
 const posted = Object.entries(b.listings || {})
 .filter(([, s]) => s === "listed" || s === "pending")
 .map(([key, status]) => ({ key, status: String(status) }));
 if (posted.length) map[b.itemId] = posted;
 });
 setChannels(map);
 }).catch(() => {});
 }, []);

 async function act(id: string, action: "sold" | "remove" | "publish") {
 if (action === "remove" && !confirm("Remove this item?")) return;
 setBusyId(id);
 await fetch(`/api/store/items/${id}`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action }),
 });
 await load();
 setBusyId(null);
 }

 // ── Multi-select (for drops: stage drafts, then publish the batch at once) ──
 function toggle(id: string) {
 setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
 }
 function toggleAll() {
 setSelected((s) => (s.size === items.length ? new Set() : new Set(items.map((i) => i.id))));
 }
 const selectedItems = items.filter((i) => selected.has(i.id));
 const draftsSelected = selectedItems.filter((i) => i.status === "draft").length;

 async function bulk(action: "publish" | "remove") {
 const ids = [...selected];
 if (!ids.length) return;
 if (action === "remove" && !confirm(`Remove ${ids.length} selected item${ids.length > 1 ? "s" : ""}?`)) return;
 setBulkBusy(true);
 await fetch("/api/store/items", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action, ids }),
 }).catch(() => {});
 setSelected(new Set());
 await load();
 setBulkBusy(false);
 }

 // ── Edit a single item (any status, including drafts) ──
 function openEdit(it: Item) {
 setEditing(it);
 setEditForm({ title: it.title, price: (it.priceCents / 100).toFixed(0), size: it.size || "", category: it.category || "", description: it.description || "" });
 setSelCols(it.collections || []);
 setNewCol("");
 }
 async function saveEdit() {
 if (!editing) return;
 setSavingEdit(true);
 await fetch(`/api/store/items/${editing.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ title: editForm.title, price: Number(editForm.price) || 0, size: editForm.size, category: editForm.category, description: editForm.description, collections: selCols }),
 }).catch(() => {});
 setSavingEdit(false);
 setEditing(null);
 await load();
 }

 async function clearAll() {
 const n = items.length;
 if (!confirm(`OWNER RESET: permanently delete ALL ${n} items — including sold — plus their orders from this store? This can’t be undone.`)) return;
 setLoading(true);
 await fetch("/api/store/items", { method: "DELETE" }).catch(() => {});
 await load();
 }

 if (loading) return <div className="flex items-center justify-center py-32 text-sm text-stone-400">Loading…</div>;
 if (authErr) return <div className="flex items-center justify-center py-32 text-sm text-stone-500">{authErr}</div>;

 const counts = {
 active: items.filter((i) => i.status === "active").length,
 draft: items.filter((i) => i.status === "draft").length,
 sold: items.filter((i) => i.status === "sold").length,
 };
 const activeValueCents = items.filter((i) => i.status === "active").reduce((s, i) => s + i.priceCents, 0);
 const money0 = (c: number) => `$${Math.round(c / 100).toLocaleString()}`;
 // Route sub-tab filter (Drafts / Sold) + client-side search over title/category.
 const term = q.trim().toLowerCase();
 const shown = items
 .filter((i) => (statusFilter ? i.status === statusFilter : true))
 .filter((i) => (term ? `${i.title} ${i.category || ""}`.toLowerCase().includes(term) : true));
 const allChecked = shown.length > 0 && shown.every((i) => selected.has(i.id));

 const heading = statusFilter === "draft" ? "Drafts" : statusFilter === "sold" ? "Sold" : "Inventory";

 // "Posted on" cell — Store (live on the VYA storefront) + each real cross-listed channel.
 const chipCls = "inline-flex items-center rounded-full px-2 py-[3px] text-[10.5px] font-medium leading-none";
 const postedCell = (it: Item) => {
 const chs = channels[it.id] || [];
 // Every item here is VYA-native, so it always carries the VYA "Store" chip; live items get a green dot.
 const live = it.status === "active" || it.status === "reserved";
 return (
 <div className="flex flex-wrap items-center gap-1">
 <span title={live ? "Live on your VYA storefront" : "A VYA listing"} className={cn(chipCls, "gap-1 border border-stone-200 bg-white pl-1 text-stone-600")}>
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src="/via-logo-mark.png" alt="" className="h-3.5 w-3.5 object-contain" />
 Store
 {live && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[var(--accent-bright,#2fd39b)]" />}
 </span>
 {chs.map((c) => (
 <span key={c.key} title={c.status === "pending" ? "Queued" : "Listed"} className={cn(chipCls, c.status === "pending" ? "bg-amber-50 text-amber-600" : "bg-stone-100 text-stone-600")}>
 {platformNames[c.key] || c.key}
 </span>
 ))}
 </div>
 );
 };

 return (
 <AdminPage>
 <AdminHeader
 eyebrow="Sell · Inventory"
 title={heading}
 subtitle="Text a photo — VYA writes the listing and prices it from real comps."
 actions={
 <>
 {isAdmin && items.length > 0 && <button onClick={clearAll} className="text-[12px] text-rose-500/80 underline hover:text-rose-600">Clear all (owner)</button>}
 <div className="relative">
 <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
 <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items…" aria-label="Search items"
 className="h-9 w-full rounded-full border border-stone-200 bg-white pl-8 pr-3 text-[13px] text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-[var(--accent,#0e9f76)] sm:w-52" />
 </div>
 <TechButtonLink href="/infrastructure/admin/add-listing">+ New listing</TechButtonLink>
 </>
 }
 />

 {/* Real inventory snapshot — counts from the items list (no fabricated trend/delta). */}
 {items.length > 0 && (
 <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
 <MetricCard label="Active listings" value={counts.active} sub={`${money0(activeValueCents)} live value`} />
 <MetricCard label="Drafts" value={counts.draft} sub={counts.draft ? "Ready to publish" : "None waiting"} />
 <MetricCard label="Sold" value={counts.sold} sub="All-time" />
 </div>
 )}

 {/* Bulk action bar — appears when items are selected (e.g. publish a whole drop). */}
 {selected.size > 0 && (
 <div className="mb-3 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-[13px] shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
 <span className="font-medium text-stone-700">{selected.size} selected</span>
 <div className="ml-auto flex items-center gap-2">
 <TechButton className="px-3 py-1.5 text-[12px]" disabled={bulkBusy || draftsSelected === 0} onClick={() => bulk("publish")}>
 {bulkBusy ? "Working…" : `Publish now${draftsSelected ? ` (${draftsSelected})` : ""}`}
 </TechButton>
 <TechButton variant="secondary" className="px-3 py-1.5 text-[12px]" disabled={bulkBusy} onClick={() => bulk("remove")}>Remove</TechButton>
 <TechButton variant="ghost" className="px-3 py-1.5 text-[12px]" onClick={() => setSelected(new Set())}>Clear</TechButton>
 </div>
 </div>
 )}

 {shown.length === 0 ? (
 <TechEmpty
 icon={<Package size={28} strokeWidth={1.5} />}
 title={term ? "No matches" : statusFilter ? `No ${statusFilter} items` : "No items yet"}
 body={term ? "Try a different search." : "Snap a photo and VYA drafts the listing for you — title, description, and a ghost-mannequin image."}
 action={term ? undefined : <TechButtonLink href="/infrastructure/admin/add-listing">Snap your first piece</TechButtonLink>}
 />
 ) : (
 <TechCard className="overflow-hidden">
 <div className="overflow-x-auto">
 <table className="w-full text-[13px]">
 <thead>
 <tr>
 <TH className="px-4 w-9"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent,#0e9f76)]" aria-label="Select all" /></TH>
 <TH className="px-3">Item</TH>
 <TH right className="px-4">Revenue</TH>
 <TH right className="px-4">Cost</TH>
 <TH right className="px-4">Margin</TH>
 <TH className="px-4">Size</TH>
 <TH className="px-5">Status</TH>
 <TH className="px-5">Posted on</TH>
 <TH right className="px-5">Actions</TH>
 </tr>
 </thead>
 <tbody>
 {shown.map((it) => (
 <tr key={it.id} className={`group transition hover:bg-stone-50/70 ${selected.has(it.id) ? "bg-stone-50" : ""}`}>
 <TD className="px-4"><input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent,#0e9f76)]" aria-label={`Select ${it.title}`} /></TD>
 <TD className="px-3">
 <button onClick={() => openEdit(it)} className="flex items-center gap-3 text-left">
 <div className="h-11 w-9 shrink-0 overflow-hidden rounded-md bg-stone-100 ring-1 ring-stone-200">
 {it.images[0] && (
 // eslint-disable-next-line @next/next/no-img-element
 <img src={it.images[0]} alt="" className="h-full w-full object-cover" />
 )}
 </div>
 <span className="flex min-w-0 flex-col">
 <span className="max-w-[240px] truncate font-medium text-stone-900 group-hover:underline">{it.title}</span>
 <span className="truncate text-[11px] text-stone-400"><span className="font-mono tabular-nums">SKU-{1000 + it.sku}</span>{it.category ? ` · ${it.category}` : ""}</span>
 </span>
 </button>
 </TD>
 <TD right className="px-4 font-medium text-stone-800">${(it.priceCents / 100).toFixed(0)}</TD>
 <TD right className="px-4 text-stone-500">{it.costCents ? `$${(it.costCents / 100).toFixed(0)}` : "—"}</TD>
 <TD right className="px-4">
 {(() => {
 const hasCost = it.costCents != null && it.costCents > 0;
 if (!hasCost || it.priceCents <= 0) return <span className="text-stone-300">—</span>;
 const m = Math.round(((it.priceCents - (it.costCents as number)) / it.priceCents) * 100);
 return <span className={cn("font-semibold tabular-nums", m >= 0 ? "text-[var(--accent-ink,#0b7a5c)]" : "text-rose-500")}>{m}%</span>;
 })()}
 </TD>
 <TD className="px-4 text-stone-500">{it.size || "—"}</TD>
 <TD className="px-5"><StatusPill tone={TONE[it.status]} dot={it.status === "active"}>{it.status}</StatusPill></TD>
 <TD className="px-5">{postedCell(it)}</TD>
 <TD right className="px-5">
 <div className="flex items-center justify-end gap-1">
 <TechButton variant="ghost" className="px-2.5 py-1 text-[12px]" disabled={busyId === it.id} onClick={() => openEdit(it)}>Edit</TechButton>
 {it.status === "draft" && <TechButton variant="secondary" className="px-2.5 py-1 text-[12px]" disabled={busyId === it.id} onClick={() => act(it.id, "publish")}>Publish</TechButton>}
 {(it.status === "active" || it.status === "reserved") && <TechButton variant="secondary" className="px-2.5 py-1 text-[12px]" disabled={busyId === it.id} onClick={() => act(it.id, "sold")}>Mark sold</TechButton>}
 {it.status !== "removed" && <TechButton variant="ghost" className="px-2.5 py-1 text-[12px]" disabled={busyId === it.id} onClick={() => act(it.id, "remove")}>Remove</TechButton>}
 </div>
 </TD>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </TechCard>
 )}

 {/* Edit modal */}
 {editing && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => setEditing(null)}>
 <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
 <div className="mb-4 flex items-center justify-between">
 <h2 className="text-base font-semibold text-stone-900">Edit listing</h2>
 <StatusPill tone={TONE[editing.status]}>{editing.status}</StatusPill>
 </div>
 <div className="space-y-3">
 <Field label="Title"><Input value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} /></Field>
 <div className="grid grid-cols-2 gap-3">
 <Field label="Price (USD)"><Input type="number" inputMode="numeric" value={editForm.price} onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))} /></Field>
 <Field label="Size"><Input value={editForm.size} onChange={(e) => setEditForm((f) => ({ ...f, size: e.target.value }))} /></Field>
 </div>
 <Field label="Category"><Input value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))} /></Field>
 <Field label="Description">
 <textarea value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} rows={4} className="w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px] text-stone-900 outline-none focus:border-stone-400" />
 </Field>
 <div>
 <label className="mb-1.5 block text-[12px] font-medium text-stone-500">Collections <span className="font-normal text-stone-400">— where it shows on your store</span></label>
 <div className="flex flex-wrap gap-2">
 {cols.map((c) => {
 const on = selCols.includes(c.title);
 return (
 <button key={c.id} type="button" onClick={() => setSelCols((s) => (on ? s.filter((t) => t !== c.title) : [...s, c.title]))}
 className={`rounded-full border px-3 py-1.5 text-xs transition ${on ? "border-[var(--accent,#0e9f76)] bg-[var(--accent,#0e9f76)] text-white" : "border-stone-300 bg-white text-stone-600 hover:border-stone-400"}`}>
 {c.title}{c.itemCount ? ` ${c.itemCount}` : ""}
 </button>
 );
 })}
 {selCols.filter((t) => !cols.some((c) => c.title === t)).map((t) => (
 <button key={t} type="button" onClick={() => setSelCols((s) => s.filter((x) => x !== t))}
 className="rounded-full border border-[var(--accent,#0e9f76)] bg-[var(--accent,#0e9f76)] px-3 py-1.5 text-xs text-white">{t} ✕</button>
 ))}
 </div>
 <input value={newCol} onChange={(e) => setNewCol(e.target.value)}
 onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const t = newCol.trim(); if (t && !selCols.includes(t)) setSelCols((s) => [...s, t]); setNewCol(""); } }}
 placeholder="New collection — type &amp; Enter (Y2K, Designer bags…)"
 className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px] text-stone-900 outline-none focus:border-stone-400" />
 </div>
 </div>
 <div className="mt-5 flex items-center justify-end gap-2">
 <TechButton variant="ghost" onClick={() => setEditing(null)}>Cancel</TechButton>
 <TechButton disabled={savingEdit || !editForm.title.trim()} onClick={saveEdit}>{savingEdit ? "Saving…" : "Save"}</TechButton>
 </div>
 </div>
 </div>
 )}
 </AdminPage>
 );
}
