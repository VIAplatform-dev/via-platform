"use client";

// Collections manager — stores create collections, add/remove items, and move pieces between them.
// An item can live in as many collections as you like (adding to one never removes it from another).
import { useEffect, useState } from "react";
import { FolderPlus, Trash2, Pencil, X, Plus, Search, Package, Check } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, TechEmpty, SectionLabel, cn } from "../../ui";
import { inputCls } from "@/app/store/ui";

type Col = { id: string; title: string; slug: string; itemCount: number };
type ColItem = { id: string; title: string; priceCents: number; currency: string; image: string | null; status: string };
type InvItem = { id: string; title: string; images: string[]; status: string; priceCents: number; currency: string };

const money = (c: number, cur: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD", maximumFractionDigits: 0 }).format((c || 0) / 100);

export default function CollectionsPage() {
 const [cols, setCols] = useState<Col[]>([]);
 const [loading, setLoading] = useState(true);
 const [selId, setSelId] = useState<string | null>(null);
 const [items, setItems] = useState<ColItem[]>([]);
 const [detailBusy, setDetailBusy] = useState(false);
 const [newName, setNewName] = useState("");
 const [renameId, setRenameId] = useState<string | null>(null);
 const [renameVal, setRenameVal] = useState("");
 const [addOpen, setAddOpen] = useState(false);

 async function loadCols(keepSel = true) {
 const r = await fetch("/api/store/collections?all=1").then((x) => (x.ok ? x.json() : null)).catch(() => null);
 const list: Col[] = r?.collections || [];
 setCols(list);
 setLoading(false);
 setSelId((cur) => (keepSel && cur && list.find((c) => c.id === cur) ? cur : (list[0]?.id ?? null)));
 }
 async function loadDetail(id: string) {
 setDetailBusy(true);
 const r = await fetch(`/api/store/collections/${id}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
 setItems(r?.items || []);
 setDetailBusy(false);
 }

 useEffect(() => { (async () => { await loadCols(); })(); }, []);
 useEffect(() => { if (selId) (async () => { await loadDetail(selId); })(); }, [selId]);

 const sel = cols.find((c) => c.id === selId) || null;

 async function createCollection() {
 const title = newName.trim();
 if (!title) return;
 setNewName("");
 const r = await fetch("/api/store/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
 await loadCols();
 if (r?.collection?.id) setSelId(r.collection.id);
 }
 async function doRename(id: string) {
 const title = renameVal.trim();
 setRenameId(null);
 if (!title) return;
 await fetch(`/api/store/collections/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }).catch(() => {});
 loadCols();
 }
 async function removeCollection(id: string, title: string) {
 if (!confirm(`Delete the "${title}" collection? Your items stay — they're just no longer grouped here.`)) return;
 await fetch(`/api/store/collections/${id}`, { method: "DELETE" }).catch(() => {});
 if (selId === id) setSelId(null);
 loadCols(false);
 }
 // ── ordering ──
 // Reordering happens live in local state while dragging (so the grid follows the cursor) and is
 // persisted once on drop. Sending a request per hover would be dozens of writes for one gesture.
 const [dragIdx, setDragIdx] = useState<number | null>(null);
 function dragOverTile(i: number) {
 setDragIdx((from) => {
  if (from === null || from === i) return from;
  setItems((prev) => { const next = [...prev]; const [moved] = next.splice(from, 1); next.splice(i, 0, moved); return next; });
  return i;
 });
 }
 async function commitOrder() {
 setDragIdx(null);
 if (!selId) return;
 // Optimistic: the grid already shows the new order. If the write fails, reload puts it back —
 // better than blocking the gesture on a round trip.
 await fetch(`/api/store/collections/${selId}/items`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: items.map((i) => i.id) }) }).catch(() => {});
 }

 async function removeItem(itemId: string) {
 if (!selId) return;
 setItems((xs) => xs.filter((i) => i.id !== itemId)); // optimistic
 await fetch(`/api/store/collections/${selId}/items`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [itemId] }) }).catch(() => {});
 loadCols();
 }

 return (
 <AdminPage>
 <AdminHeader eyebrow="Sell · Inventory" title="Collections" subtitle="Group pieces together so shoppers can browse them. A piece can be in as many collections as you like." />

 <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
 {/* Collections list */}
 <TechCard className="p-3">
 <SectionLabel>Your collections</SectionLabel>
 <div className="mt-2 flex gap-1.5">
 <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createCollection(); }} placeholder="New collection…" className={cn(inputCls, "h-9 flex-1 text-[13px]")} />
 <TechButton className="shrink-0 px-2.5" disabled={!newName.trim()} onClick={createCollection} aria-label="Create collection"><FolderPlus size={15} /></TechButton>
 </div>
 <div className="mt-3 space-y-1">
 {loading ? (
 <p className="px-1 py-4 text-[13px] text-stone-400">Loading…</p>
 ) : cols.length === 0 ? (
 <p className="px-1 py-4 text-[13px] text-stone-400">No collections yet — create one above.</p>
 ) : cols.map((c) => (
 <div key={c.id} className={cn("group flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] transition", selId === c.id ? "bg-stone-100 text-stone-900" : "text-stone-600 hover:bg-stone-50")}>
 {renameId === c.id ? (
 <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doRename(c.id); if (e.key === "Escape") setRenameId(null); }} onBlur={() => doRename(c.id)} className={cn(inputCls, "h-7 flex-1 text-[13px]")} />
 ) : (
 <button type="button" onClick={() => setSelId(c.id)} className="flex flex-1 items-center gap-2 truncate text-left">
 <span className="truncate font-medium">{c.title}</span>
 <span className="ml-auto shrink-0 rounded-full bg-stone-200/70 px-1.5 text-[11px] tabular-nums text-stone-500">{c.itemCount}</span>
 </button>
 )}
 {renameId !== c.id && (
 <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
 <button type="button" title="Rename" onClick={() => { setRenameId(c.id); setRenameVal(c.title); }} className="grid h-6 w-6 place-items-center rounded text-stone-400 hover:bg-stone-200/60 hover:text-stone-700"><Pencil size={12} /></button>
 <button type="button" title="Delete" onClick={() => removeCollection(c.id, c.title)} className="grid h-6 w-6 place-items-center rounded text-stone-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={12} /></button>
 </span>
 )}
 </div>
 ))}
 </div>
 </TechCard>

 {/* Selected collection's items */}
 <TechCard className="p-4">
 {!sel ? (
 <TechEmpty icon={<Package size={28} strokeWidth={1.5} />} title="Pick a collection" body="Pick a collection on the left, or make a new one." />
 ) : (
 <>
 <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
 <div>
 <h2 className="text-[16px] font-semibold text-stone-900">{sel.title}</h2>
 <p className="text-[12px] text-stone-400">{sel.itemCount} item{sel.itemCount === 1 ? "" : "s"} · shows on /s/…/collections/{sel.slug}</p>
 </div>
 <TechButton onClick={() => setAddOpen(true)}><Plus size={14} /> Add items</TechButton>
 </div>
 {detailBusy && items.length === 0 ? (
 <p className="py-10 text-center text-[13px] text-stone-400">Loading…</p>
 ) : items.length === 0 ? (
 <TechEmpty icon={<Package size={26} strokeWidth={1.5} />} title="No items yet" body="Add pieces to this collection. A piece can be in more than one." />
 ) : (
 <>
 {/* The order is the seller's control over WHICH pieces lead: a storefront section showing
     "the first four" of this collection takes them from here. Said plainly, because an order
     that silently drives another screen is worse than no order at all. */}
 <p className="mb-3 text-[12px] text-stone-400">Drag to reorder. Storefront sections that show a few pieces take them from the top.</p>
 <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
 {items.map((it, i) => (
 <div
  key={it.id}
  draggable
  onDragStart={() => setDragIdx(i)}
  onDragOver={(e) => { e.preventDefault(); dragOverTile(i); }}
  onDragEnd={commitOrder}
  onDrop={(e) => { e.preventDefault(); commitOrder(); }}
  className={`group relative cursor-grab overflow-hidden rounded-xl border bg-white transition active:cursor-grabbing ${dragIdx === i ? "border-[#5D0F17] opacity-50" : "border-stone-200"}`}
 >
 <span className="absolute left-1.5 top-1.5 z-10 grid h-5 min-w-[20px] place-items-center rounded-full bg-stone-900/75 px-1 text-[10px] font-semibold tabular-nums text-white">{i + 1}</span>
 <button type="button" title="Remove from collection" onClick={() => removeItem(it.id)} className="absolute right-1.5 top-1.5 z-10 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-stone-500 opacity-0 shadow transition hover:text-rose-600 group-hover:opacity-100"><X size={13} /></button>
 {/* The tile opens the piece. A grid of photos that can't be clicked into is a dead end —
     a seller looking at a collection is usually looking for the piece, not the grid.
     Dragging still works: a drag never fires a click. */}
 <a href={`/admin/inventory?item=${it.id}`} title={`Open ${it.title}`} className="block">
 <div className="aspect-[4/5] w-full bg-stone-100">{it.image && <img src={it.image} alt={it.title} draggable={false} className="pointer-events-none h-full w-full object-cover" />}</div>
 <div className="p-2">
 <p className="line-clamp-1 text-[12px] text-stone-700 group-hover:underline">{it.title}</p>
 <p className="text-[12px] text-stone-400">{money(it.priceCents, it.currency)}{it.status !== "active" ? ` · ${it.status}` : ""}</p>
 </div>
 </a>
 </div>
 ))}
 </div>
 </>
 )}
 </>
 )}
 </TechCard>
 </div>

 {addOpen && sel && (
 <AddItemsModal collectionId={sel.id} collectionTitle={sel.title} inCollection={new Set(items.map((i) => i.id))} onClose={() => setAddOpen(false)} onAdded={() => { loadDetail(sel.id); loadCols(); }} />
 )}
 </AdminPage>
 );
}

// Pick items from the store's inventory to add to a collection (searchable, multi-select).
function AddItemsModal({ collectionId, collectionTitle, inCollection, onClose, onAdded }: { collectionId: string; collectionTitle: string; inCollection: Set<string>; onClose: () => void; onAdded: () => void }) {
 const [inv, setInv] = useState<InvItem[]>([]);
 const [loading, setLoading] = useState(true);
 const [q, setQ] = useState("");
 const [picked, setPicked] = useState<Set<string>>(new Set());
 const [busy, setBusy] = useState(false);

 useEffect(() => {
 fetch("/api/store/items").then((r) => (r.ok ? r.json() : null)).then((d) => { setInv((d?.items || []).filter((i: InvItem) => i.status !== "removed" && i.status !== "sold")); setLoading(false); }).catch(() => setLoading(false));
 }, []);

 const term = q.trim().toLowerCase();
 const shown = inv.filter((i) => !term || i.title.toLowerCase().includes(term));

 async function add() {
 const ids = [...picked];
 if (!ids.length) return;
 setBusy(true);
 await fetch(`/api/store/collections/${collectionId}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }).catch(() => {});
 setBusy(false);
 onAdded();
 onClose();
 }

 return (
 <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
 <div className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
 <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-5 py-3.5">
 <div>
 <h3 className="text-[15px] font-semibold text-stone-900">Add items to “{collectionTitle}”</h3>
 <p className="text-[12px] text-stone-400">{picked.size} selected · already-added items are checked</p>
 </div>
 <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-stone-400 hover:bg-stone-100"><X size={16} /></button>
 </div>
 <div className="border-b border-stone-200 px-5 py-2.5">
 <div className="relative">
 <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
 <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your items…" className={cn(inputCls, "h-9 w-full pl-8 text-[13px]")} />
 </div>
 </div>
 <div className="min-h-0 flex-1 overflow-y-auto p-3">
 {loading ? (
 <p className="py-10 text-center text-[13px] text-stone-400">Loading your inventory…</p>
 ) : shown.length === 0 ? (
 <p className="py-10 text-center text-[13px] text-stone-400">No items{term ? " match" : ""}.</p>
 ) : (
 <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
 {shown.map((it) => {
 const already = inCollection.has(it.id);
 const on = picked.has(it.id) || already;
 return (
 <button key={it.id} type="button" disabled={already} onClick={() => setPicked((s) => { const n = new Set(s); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; })}
 className={cn("group relative overflow-hidden rounded-xl border text-left transition", on ? "border-[var(--accent,#0e9f76)] ring-1 ring-[var(--accent,#0e9f76)]" : "border-stone-200 hover:border-stone-300", already && "opacity-60")}>
 {on && <span className="absolute right-1.5 top-1.5 z-10 grid h-5 w-5 place-items-center rounded-full bg-[var(--accent,#0e9f76)] text-white"><Check size={12} /></span>}
 <div className="aspect-[4/5] w-full bg-stone-100">{it.images?.[0] && <img src={it.images[0]} alt={it.title} className="h-full w-full object-cover" />}</div>
 <p className="line-clamp-1 px-2 py-1.5 text-[11px] text-stone-600">{it.title}</p>
 </button>
 );
 })}
 </div>
 )}
 </div>
 <div className="flex items-center justify-end gap-2 border-t border-stone-200 px-5 py-3">
 <TechButton variant="ghost" onClick={onClose}>Cancel</TechButton>
 <TechButton disabled={busy || picked.size === 0} onClick={add}>{busy ? "Adding…" : `Add ${picked.size || ""}`.trim()}</TechButton>
 </div>
 </div>
 </div>
 );
}
