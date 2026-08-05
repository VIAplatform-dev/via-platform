"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Package, Search } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, TechButtonLink, TechEmpty, StatusPill, MetricCard, SectionLabel, TH, TD, cn } from "../ui";
import { Input, Field, inputCls } from "@/app/store/ui";

type ItemStatus = "draft" | "active" | "reserved" | "sold" | "removed";
type Item = {
 id: string;
 sku: number; // per-store sequence by creation order (1 = the store's first item)
 title: string;
 priceCents: number;
 costCents: number | null; // seller's cost (COGS) if recorded — powers the margin column
 currency: string;
 images: string[];
 brand: string | null;
 era: string | null;
 material: string | null;
 condition: string | null;
 size: string | null;
 category: string | null;
 description: string | null;
 status: ItemStatus;
 publishAt?: string | null; // set on a scheduled draft — auto-publishes at this time
 weightOz: number | null;
 lengthIn: number | null;
 widthIn: number | null;
 heightIn: number | null;
 collections?: string[];
};

const TONE: Record<Item["status"], "live" | "pending" | "neutral" | "down" | "info"> = {
 draft: "pending",
 active: "live",
 reserved: "info",
 sold: "neutral",
 removed: "down",
};

type EditForm = {
 title: string; price: string; cost: string; brand: string; era: string; material: string;
 condition: string; size: string; category: string; description: string; status: ItemStatus;
 weightOz: string; lengthIn: string; widthIn: string; heightIn: string;
};

export default function ItemsPage() {
 const pathname = usePathname();
 const searchParams = useSearchParams();
 const deepLinkId = searchParams.get("item"); // ?item=<id> from global search → open its editor
 const handledDeepLink = useRef<string | null>(null);
 const statusFilter = pathname.endsWith("/drafts") ? "draft" : pathname.endsWith("/sold") ? "sold" : null;
 const [loading, setLoading] = useState(true);
 const [authErr, setAuthErr] = useState<string | null>(null);
 const [items, setItems] = useState<Item[]>([]);
 const [importOpen, setImportOpen] = useState(false);
 const [q, setQ] = useState(""); // client-side search over title/category
 const [page, setPage] = useState(1); // client-side pagination of the rendered rows
 // Where each item is posted — real cross-listing status per platform, keyed by itemId.
 const [channels, setChannels] = useState<Record<string, { key: string; status: string }[]>>({});
 const [platformNames, setPlatformNames] = useState<Record<string, string>>({});
 const [busyId, setBusyId] = useState<string | null>(null);
 const [soldNotice, setSoldNotice] = useState<string | null>(null);
 const [isAdmin, setIsAdmin] = useState(false);
 const [selected, setSelected] = useState<Set<string>>(new Set());
 const [bulkBusy, setBulkBusy] = useState(false);
 const [editing, setEditing] = useState<Item | null>(null);
 const EMPTY_EDIT: EditForm = { title: "", price: "", cost: "", brand: "", era: "", material: "", condition: "", size: "", category: "", description: "", status: "draft", weightOz: "", lengthIn: "", widthIn: "", heightIn: "" };
 const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT);
 const [editImages, setEditImages] = useState<string[]>([]); // photo list being edited (reorder/remove/add)
 const [uploading, setUploading] = useState(false);
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
 // Cross-listing board → which channels each item is ACTUALLY published on. "Posted on" should
 // only reflect a real, completed listing — not a started-but-unpublished ('pending') or failed one.
 fetch("/api/store/cross-listing").then((r) => (r.ok ? r.json() : null)).then((r) => {
 if (!r) return;
 const names: Record<string, string> = {};
 (r.platforms || []).forEach((p: { key: string; name: string }) => { names[p.key] = p.name; });
 setPlatformNames(names);
 const map: Record<string, { key: string; status: string }[]> = {};
 (r.board || []).forEach((b: { itemId: string; listings?: Record<string, string> }) => {
 const posted = Object.entries(b.listings || {})
 .filter(([, s]) => s === "listed")
 .map(([key, status]) => ({ key, status: String(status) }));
 if (posted.length) map[b.itemId] = posted;
 });
 setChannels(map);
 }).catch(() => {});
 }, []);

 // Deep link from the global ⌘K search (?item=<id>) → open that item's editor once it's loaded.
 useEffect(() => {
 if (!deepLinkId || !items.length || handledDeepLink.current === deepLinkId) return;
 const it = items.find((i) => i.id === deepLinkId);
 if (it) { handledDeepLink.current = deepLinkId; openEdit(it); }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [deepLinkId, items]);

 // A new search or sub-tab resets to the first page.
 useEffect(() => { setPage(1); }, [q, statusFilter]);

 async function act(id: string, action: "sold" | "remove" | "publish") {
 if (action === "remove" && !confirm("Remove this item?")) return;
 setBusyId(id);
 const r = await fetch(`/api/store/items/${id}`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action }),
 }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
 // On a sale, tell the seller which no-API channels they must pull the item from by hand.
 if (action === "sold") {
 const manual = (r?.pull || []).filter((p: { hasApi: boolean }) => !p.hasApi).map((p: { name: string }) => p.name);
 setSoldNotice(manual.length ? `Marked sold and pulled from your channels. Remove it on ${manual.join(" & ")} yourself — they have no API.` : "Marked sold and pulled from every connected channel.");
 setTimeout(() => setSoldNotice(null), 9000);
 }
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

 // ── Edit a single item (any status, including drafts) — full listing edit ──
 const cents2str = (c: number | null) => (c == null ? "" : (c / 100).toFixed(0));
 const num2str = (n: number | null) => (n == null ? "" : String(n));
 function openEdit(it: Item) {
 setEditing(it);
 setEditForm({
 title: it.title, price: cents2str(it.priceCents), cost: cents2str(it.costCents),
 brand: it.brand || "", era: it.era || "", material: it.material || "", condition: it.condition || "",
 size: it.size || "", category: it.category || "", description: it.description || "", status: it.status,
 weightOz: num2str(it.weightOz), lengthIn: num2str(it.lengthIn), widthIn: num2str(it.widthIn), heightIn: num2str(it.heightIn),
 });
 setEditImages(it.images || []);
 setSelCols(it.collections || []);
 setNewCol("");
 }
 async function uploadImages(files: FileList | null) {
 if (!files || !files.length) return;
 setUploading(true);
 for (const file of Array.from(files)) {
 const fd = new FormData(); fd.append("file", file);
 const r = await fetch("/api/store/listings/upload", { method: "POST", body: fd }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (r?.url) setEditImages((imgs) => [...imgs, r.url]);
 }
 setUploading(false);
 }
 function moveImage(i: number, dir: -1 | 1) {
 setEditImages((imgs) => { const a = [...imgs]; const j = i + dir; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
 }
 async function saveEdit() {
 if (!editing) return;
 const n = (s: string) => (s.trim() === "" ? null : Number(s));
 setSavingEdit(true);
 await fetch(`/api/store/items/${editing.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 title: editForm.title, price: Number(editForm.price) || 0, cost: editForm.cost.trim() === "" ? null : Number(editForm.cost),
 brand: editForm.brand, era: editForm.era, material: editForm.material, condition: editForm.condition,
 size: editForm.size, category: editForm.category, description: editForm.description, status: editForm.status,
 weightOz: n(editForm.weightOz), lengthIn: n(editForm.lengthIn), widthIn: n(editForm.widthIn), heightIn: n(editForm.heightIn),
 images: editImages, collections: selCols,
 }),
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

 // Paginate the RENDERED rows — a big inventory (hundreds of image rows) is slow to paint all at
 // once. Filtering, search, counts and select-all still run over the full set; only the DOM is capped.
 const PAGE_SIZE = 40;
 const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
 const pageSafe = Math.min(page, totalPages);
 const paged = shown.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

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
 <span key={c.key} title="Live listing" className={cn(chipCls, "bg-stone-100 text-stone-600")}>
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
 <TechButton variant="secondary" onClick={() => setImportOpen(true)}>Import</TechButton>
 <TechButtonLink href="/admin/add-listing">+ New listing</TechButtonLink>
 </>
 }
 />

 {importOpen && (
 <ImportModal
 onClose={() => { setImportOpen(false); load(); }}
 />
 )}

 {soldNotice && (
 <div className="mb-4 flex items-start gap-2 rounded-xl border border-[var(--accent,#0e9f76)]/25 bg-[var(--accent-soft,#eafaf3)] px-4 py-3 text-[13px] text-[var(--accent-ink,#0b7a5c)]">
 <span>✓ {soldNotice}</span>
 </div>
 )}

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
 action={term ? undefined : <TechButtonLink href="/admin/add-listing">Snap your first piece</TechButtonLink>}
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
 {paged.map((it) => (
 <tr key={it.id} className={`group transition hover:bg-stone-50/70 ${selected.has(it.id) ? "bg-stone-50" : ""}`}>
 <TD className="px-4"><input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent,#0e9f76)]" aria-label={`Select ${it.title}`} /></TD>
 <TD className="px-3">
 <button onClick={() => openEdit(it)} className="flex items-center gap-3 text-left">
 <div className="h-11 w-9 shrink-0 overflow-hidden rounded-md bg-stone-100 ring-1 ring-stone-200">
 {it.images[0] && (
 // eslint-disable-next-line @next/next/no-img-element
 <img src={it.images[0]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
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
 <TD className="px-5">
 {it.status === "draft" && it.publishAt ? (
 <div className="flex flex-col gap-0.5">
 <StatusPill tone="info">scheduled</StatusPill>
 <span className="text-[10px] text-stone-400" title={new Date(it.publishAt).toLocaleString()}>{new Date(it.publishAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
 </div>
 ) : (
 <StatusPill tone={TONE[it.status]} dot={it.status === "active"}>{it.status}</StatusPill>
 )}
 </TD>
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
 {totalPages > 1 && (
 <div className="flex items-center justify-between gap-3 border-t border-stone-100 px-4 py-3 text-[12px] text-stone-500">
 <span className="tabular-nums">Showing {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, shown.length)} of {shown.length}</span>
 <div className="flex items-center gap-2">
 <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe <= 1} className="rounded-full border border-stone-200 px-3 py-1 transition enabled:hover:bg-stone-50 disabled:opacity-40">Prev</button>
 <span className="tabular-nums">Page {pageSafe} / {totalPages}</span>
 <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={pageSafe >= totalPages} className="rounded-full border border-stone-200 px-3 py-1 transition enabled:hover:bg-stone-50 disabled:opacity-40">Next</button>
 </div>
 </div>
 )}
 </TechCard>
 )}

 {/* Edit modal */}
 {editing && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => setEditing(null)}>
 <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
 <div className="mb-4 flex items-center justify-between">
 <div>
 <h2 className="text-base font-semibold text-stone-900">Edit listing</h2>
 <p className="font-mono text-[11px] tabular-nums text-stone-400">SKU-{1000 + editing.sku}</p>
 </div>
 <StatusPill tone={TONE[editForm.status]} dot={editForm.status === "active"}>{editForm.status}</StatusPill>
 </div>

 {/* Photos — reorder (‹ ›), remove (✕), add (upload). First = cover. */}
 <SectionLabel className="mb-2">Photos</SectionLabel>
 <div className="mb-4 flex flex-wrap gap-2">
 {editImages.map((src, i) => (
 <div key={`${src}-${i}`} className="group relative h-20 w-16 overflow-hidden rounded-md ring-1 ring-stone-200">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={src} alt="" className="h-full w-full object-cover" />
 {i === 0 && <span className="absolute left-0 top-0 rounded-br bg-[var(--accent,#0e9f76)] px-1 text-[8px] font-bold text-white">COVER</span>}
 <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/50 px-1 py-0.5 text-[12px] leading-none text-white opacity-0 transition group-hover:opacity-100">
 <button type="button" aria-label="Move left" onClick={() => moveImage(i, -1)} disabled={i === 0} className="disabled:opacity-30">‹</button>
 <button type="button" aria-label="Remove" onClick={() => setEditImages((a) => a.filter((_, k) => k !== i))} className="hover:text-rose-300">✕</button>
 <button type="button" aria-label="Move right" onClick={() => moveImage(i, 1)} disabled={i === editImages.length - 1} className="disabled:opacity-30">›</button>
 </div>
 </div>
 ))}
 <label className="flex h-20 w-16 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-stone-300 text-[10px] text-stone-400 transition hover:border-[var(--accent,#0e9f76)] hover:text-[var(--accent,#0e9f76)]">
 {uploading ? "Uploading…" : "+ Add"}
 <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { uploadImages(e.target.files); e.currentTarget.value = ""; }} />
 </label>
 </div>

 <div className="space-y-3">
 <Field label="Title"><Input value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} /></Field>
 <div className="grid grid-cols-2 gap-3">
 <Field label="Brand"><Input value={editForm.brand} onChange={(e) => setEditForm((f) => ({ ...f, brand: e.target.value }))} placeholder="e.g. Fendi" /></Field>
 <Field label="Era"><Input value={editForm.era} onChange={(e) => setEditForm((f) => ({ ...f, era: e.target.value }))} placeholder="e.g. 1990s" /></Field>
 </div>
 <div className="grid grid-cols-3 gap-3">
 <Field label="Condition"><Input value={editForm.condition} onChange={(e) => setEditForm((f) => ({ ...f, condition: e.target.value }))} placeholder="Excellent" /></Field>
 <Field label="Material"><Input value={editForm.material} onChange={(e) => setEditForm((f) => ({ ...f, material: e.target.value }))} /></Field>
 <Field label="Size"><Input value={editForm.size} onChange={(e) => setEditForm((f) => ({ ...f, size: e.target.value }))} /></Field>
 </div>
 <Field label="Category"><Input value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))} /></Field>
 <div className="grid grid-cols-3 gap-3">
 <Field label="Price (USD)"><Input type="number" inputMode="numeric" value={editForm.price} onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))} /></Field>
 <Field label="Cost (USD)"><Input type="number" inputMode="numeric" value={editForm.cost} onChange={(e) => setEditForm((f) => ({ ...f, cost: e.target.value }))} placeholder="optional" /></Field>
 <Field label="Margin">
 {(() => {
 const p = Number(editForm.price) || 0; const hasCost = editForm.cost.trim() !== ""; const c = Number(editForm.cost) || 0;
 if (!hasCost || p <= 0) return <div className="flex h-9 items-center text-[13px] text-stone-300">—</div>;
 const m = Math.round(((p - c) / p) * 100);
 return <div className={cn("flex h-9 items-center text-[13px] font-semibold tabular-nums", m >= 0 ? "text-[var(--accent-ink,#0b7a5c)]" : "text-rose-500")}>{m}%</div>;
 })()}
 </Field>
 </div>
 <Field label="Description">
 <textarea value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} rows={4} className="w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px] text-stone-900 outline-none focus:border-stone-400" />
 </Field>
 <div className="grid grid-cols-2 gap-3">
 <Field label="Status">
 <select value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value as ItemStatus }))} className={inputCls}>
 {(["draft", "active", "reserved", "sold", "removed"] as ItemStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
 </select>
 </Field>
 <Field label="Weight (oz)"><Input type="number" inputMode="numeric" value={editForm.weightOz} onChange={(e) => setEditForm((f) => ({ ...f, weightOz: e.target.value }))} placeholder="for shipping" /></Field>
 </div>
 <div className="grid grid-cols-3 gap-3">
 <Field label="Length (in)"><Input type="number" inputMode="numeric" value={editForm.lengthIn} onChange={(e) => setEditForm((f) => ({ ...f, lengthIn: e.target.value }))} /></Field>
 <Field label="Width (in)"><Input type="number" inputMode="numeric" value={editForm.widthIn} onChange={(e) => setEditForm((f) => ({ ...f, widthIn: e.target.value }))} /></Field>
 <Field label="Height (in)"><Input type="number" inputMode="numeric" value={editForm.heightIn} onChange={(e) => setEditForm((f) => ({ ...f, heightIn: e.target.value }))} /></Field>
 </div>
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

// ── Import inventory ─────────────────────────────────────────────────────────
// Two on-ramps for getting stock in fast: (1) import the store's already-synced
// marketplace catalog as managed items (fixes the read-only-catalog trap), and
// (2) bulk-upload a CSV/spreadsheet (the path for stores with no Shopify to connect).
// Both re-host images onto our storage so listings survive leaving the old platform.
function ImportModal({ onClose }: { onClose: () => void }) {
 const [tab, setTab] = useState<"catalog" | "csv">("catalog");
 const [csv, setCsv] = useState("");
 const [goLive, setGoLive] = useState(false);
 const [busy, setBusy] = useState(false);
 const [msg, setMsg] = useState<string | null>(null);
 const fileRef = useRef<HTMLInputElement>(null);

 async function importCatalog() {
 setBusy(true); setMsg(null);
 try {
 const r = await fetch("/api/store/inventory/convert", { method: "POST" });
 const d = await r.json();
 if (!r.ok) { setMsg(d.error || "Couldn’t import your catalog."); return; }
 setMsg(d.added > 0 ? `✓ Imported ${d.added} item${d.added === 1 ? "" : "s"} from your synced catalog — they’re now editable inventory.` : "Nothing new to import — your catalog is already in your inventory.");
 } catch { setMsg("Something went wrong."); } finally { setBusy(false); }
 }

 async function importCsv() {
 if (!csv.trim()) { setMsg("Paste or upload your inventory file first."); return; }
 setBusy(true); setMsg(null);
 try {
 const r = await fetch("/api/store/items/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv, status: goLive ? "active" : "draft" }) });
 const d = await r.json();
 if (!r.ok) { setMsg(d.error || "Couldn’t read that file."); return; }
 setMsg(`✓ Added ${d.added} of ${d.found} item${d.found === 1 ? "" : "s"}${goLive ? " — live now." : " as drafts — review and publish when ready."}`);
 setCsv("");
 } catch { setMsg("Something went wrong."); } finally { setBusy(false); }
 }

 return (
 <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
 <div className="fixed inset-0 bg-black/40" onClick={onClose} />
 <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
 <div className="mb-4 flex items-start justify-between">
 <div>
 <h2 className="text-base font-semibold text-stone-900">Import inventory</h2>
 <p className="mt-0.5 text-[12px] text-stone-500">Get your whole catalog in at once. Images are copied onto VYA, so nothing breaks if you leave your old platform.</p>
 </div>
 <button onClick={onClose} className="text-stone-400 hover:text-stone-700">✕</button>
 </div>

 <div className="mb-4 flex gap-1 rounded-lg bg-stone-100 p-1 text-[13px]">
 <button onClick={() => { setTab("catalog"); setMsg(null); }} className={cn("flex-1 rounded-md px-3 py-1.5 transition", tab === "catalog" ? "bg-white font-medium text-stone-900 shadow-sm" : "text-stone-500")}>My synced catalog</button>
 <button onClick={() => { setTab("csv"); setMsg(null); }} className={cn("flex-1 rounded-md px-3 py-1.5 transition", tab === "csv" ? "bg-white font-medium text-stone-900 shadow-sm" : "text-stone-500")}>Upload a file</button>
 </div>

 {tab === "catalog" ? (
 <div className="space-y-3">
 <p className="text-[13px] leading-relaxed text-stone-600">If you connected Shopify (or another store), your products are already browsable on VYA but read-only. Import them here to turn them into managed inventory you can edit, reprice, and relist.</p>
 <TechButton className="w-full" disabled={busy} onClick={importCatalog}>{busy ? "Importing…" : "Import my synced catalog"}</TechButton>
 </div>
 ) : (
 <div className="space-y-3">
 <p className="text-[13px] leading-relaxed text-stone-600">Paste or upload a CSV. We’ll map the columns automatically — a title and price are all that’s required (brand, size, condition, image URL, etc. come over too if present).</p>
 <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
 <button type="button" onClick={() => fileRef.current?.click()} className="w-full rounded-lg border border-dashed border-stone-300 py-2.5 text-[13px] text-stone-500 hover:border-stone-400 hover:text-stone-700">Choose a CSV file…</button>
 <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={5} placeholder="…or paste your rows here (title, price, brand, size, condition, image URL)" className="w-full resize-none rounded-lg border border-stone-200 p-3 text-[12px] text-stone-800 outline-none focus:border-[var(--accent,#0e9f76)]" />
 <label className="flex items-center gap-2 text-[13px] text-stone-600"><input type="checkbox" checked={goLive} onChange={(e) => setGoLive(e.target.checked)} className="accent-[var(--accent,#0e9f76)]" />Publish immediately (otherwise saved as drafts)</label>
 <TechButton className="w-full" disabled={busy || !csv.trim()} onClick={importCsv}>{busy ? "Importing…" : "Import items"}</TechButton>
 </div>
 )}

 {msg && <p className="mt-4 rounded-lg bg-stone-50 px-3 py-2 text-[13px] text-stone-700">{msg}</p>}
 </div>
 </div>
 );
}
