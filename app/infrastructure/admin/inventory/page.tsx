"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Package, Search, List, LayoutGrid, Check, X } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, TechButtonLink, TechEmpty, StatusPill, MetricCard, SectionLabel, TagRow, TH, TD, ConfirmDialog, cn } from "../ui";
import { toCsv, downloadCsv, datedFilename } from "@/app/lib/csv-export";
import { CategoryBreadcrumb, HeaderFilter, HeaderFilterItem, CategoryFilterMenu } from "../CategoryPicker";
import { Input, Field, inputCls } from "@/app/store/ui";
import { ITEM_STATUSES, STATUS_TONE, CATEGORY_GROUPS, OTHER_FAMILY, toCategorySlug, categoryValueLabel, categoryFamily, isCanonicalCategory, statusLabel, publishBlockers, type ItemStatus } from "@/app/lib/item-tags";

/**
 * Which store these calls act on.
 *
 * Without a ?store= the API resolves to whatever store the SESSION belongs to — so opening this page
 * to look at another seller's inventory silently read and edited your own store instead, and an item
 * "added to inventory" never reached the storefront being looked at.
 */
function withStore(path: string): string {
 if (typeof window === "undefined") return path;
 const s = new URLSearchParams(window.location.search).get("store");
 return s ? `${path}${path.includes("?") ? "&" : "?"}store=${encodeURIComponent(s)}` : path;
}

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
 source?: string; // manual | imported | ai | market (quick-listed at a market)
};

const TONE = STATUS_TONE;

type EditForm = {
 title: string; price: string; cost: string; brand: string; era: string; material: string;
 condition: string; size: string; category: string | null; description: string; status: ItemStatus; // slug, or free text under "Other"
 weightOz: string; lengthIn: string; widthIn: string; heightIn: string;
};

export default function ItemsPage() {
 const pathname = usePathname();
 const searchParams = useSearchParams();
 const deepLinkId = searchParams.get("item"); // ?item=<id> from global search → open its editor
 // ?missing=photo|price — Market Mode's "Before you sell" list deep-links straight to the items that
 // need fixing. Seeded from the URL once; the seller can clear it like any other filter.
 const missingParam = searchParams.get("missing");
 const [missingTag, setMissingTag] = useState<"photo" | "price" | "details" | null>(missingParam === "photo" || missingParam === "price" || missingParam === "details" ? missingParam : null);
 const [quickOnly, setQuickOnly] = useState(searchParams.get("source") === "market");
 // List vs thumbnail grid (?layout=grid deep-links; the choice is remembered per device).
 const [layout, setLayout] = useState<"list" | "grid">(searchParams.get("layout") === "grid" ? "grid" : "list");
 useEffect(() => { try { if (!searchParams.get("layout") && localStorage.getItem("inventory:layout") === "grid") void Promise.resolve().then(() => setLayout("grid")); } catch { /* storage off */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps
 const changeLayout = (v: "list" | "grid") => { setLayout(v); try { localStorage.setItem("inventory:layout", v); } catch { /* */ } };
 const [colTag, setColTag] = useState<string | null>(null); // collection filter
 const handledDeepLink = useRef<string | null>(null);
 const statusFilter = pathname.endsWith("/drafts") ? "draft" : pathname.endsWith("/sold") ? "sold" : null;
 const [loading, setLoading] = useState(true);
 const [authErr, setAuthErr] = useState<string | null>(null);
 const [items, setItems] = useState<Item[]>([]);
 const [importOpen, setImportOpen] = useState(false);
 const [q, setQ] = useState(""); // client-side search over title/category
 // Tag filters — the same tags the editor assigns. null = no filter on that axis.
 const [statusTag, setStatusTag] = useState<ItemStatus | null>(null);
 const [famTag, setFamTag] = useState<string | null>(null);   // family alone = the whole family
 const [catTag, setCatTag] = useState<string | null>(null);      // a category inside it
 const [page, setPage] = useState(1); // client-side pagination of the rendered rows
 // Where each item is posted — real cross-listing status per platform, keyed by itemId.
 const [channels, setChannels] = useState<Record<string, { key: string; status: string }[]>>({});
 const [platformNames, setPlatformNames] = useState<Record<string, string>>({});
 const [busyId, setBusyId] = useState<string | null>(null);
 // In-page confirmations (never browser dialogs): the row × becomes "Remove? Remove · Keep"; the bulk bar
 // and owner reset do the same two-step in place.
 const [confirmRow, setConfirmRow] = useState<string | null>(null);
 const [confirmBulk, setConfirmBulk] = useState(false);
 const [confirmReset, setConfirmReset] = useState(false);
 const [soldNotice, setSoldNotice] = useState<string | null>(null);
 const [isAdmin, setIsAdmin] = useState(false);
 const [selected, setSelected] = useState<Set<string>>(new Set());
 const [bulkBusy, setBulkBusy] = useState(false);
 const [bulkColOpen, setBulkColOpen] = useState(false); // bulk "add to collection" popover
 const [bulkColName, setBulkColName] = useState("");
 const [aiNotice, setAiNotice] = useState<string | null>(null); // result of the last AI re-tag
 const [editing, setEditing] = useState<Item | null>(null);
 const EMPTY_EDIT: EditForm = { title: "", price: "", cost: "", brand: "", era: "", material: "", condition: "", size: "", category: null, description: "", status: "draft", weightOz: "", lengthIn: "", widthIn: "", heightIn: "" };
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
 const r = await fetch(withStore("/api/store/items"));
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
 fetch(withStore("/api/store/collections")).then((r) => (r.ok ? r.json() : null)).then((c) => c && setCols(c.collections || [])).catch(() => {});
 // Cross-listing board → which channels each item is ACTUALLY published on. "Posted on" should
 // only reflect a real, completed listing — not a started-but-unpublished ('pending') or failed one.
 fetch(withStore("/api/store/cross-listing")).then((r) => (r.ok ? r.json() : null)).then((r) => {
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
 useEffect(() => { setPage(1); }, [q, statusFilter, statusTag, famTag, catTag, colTag, missingTag]);
 // The Drafts / Sold sub-tabs already pin a status — don't let a stale tag filter fight them.
 useEffect(() => { setStatusTag(null); }, [statusFilter]);

 async function act(id: string, action: "sold" | "remove" | "publish") {
 setConfirmRow(null);
 setBusyId(id);
 const r = await fetch(withStore(`/api/store/items/${id}`), {
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

 // Reprice the selection in one go. The analytics tab points a seller at aging
 // stock to reprice; without this they'd have to open each listing to act on it.
 async function bulkReprice() {
  const raw = prompt(`Reprice ${selected.size} selected ${selected.size === 1 ? "piece" : "pieces"}.\n\nEnter a new price (e.g. 45), or a percentage change (e.g. -20% to cut a fifth).`);
  if (raw == null) return;
  const input = raw.trim();
  if (!input) return;
  const pctMatch = input.match(/^([+-]?\d+(?:\.\d+)?)\s*%$/);
  const flat = Number(input.replace(/^\$/, ""));
  if (!pctMatch && (!Number.isFinite(flat) || flat < 0)) { alert("Enter a price like 45, or a change like -20%."); return; }

  const ids = [...selected];
  const updates = ids.map((id) => {
   const item = items.find((x) => x.id === id);
   if (!item) return null;
   const cents = pctMatch
    ? Math.max(0, Math.round(item.priceCents * (1 + Number(pctMatch[1]) / 100)))
    : Math.round(flat * 100);
   return { id, priceCents: cents };
  }).filter(Boolean) as { id: string; priceCents: number }[];

  const preview = pctMatch ? `${Number(pctMatch[1]) > 0 ? "+" : ""}${pctMatch[1]}%` : `$${flat.toFixed(2)} each`;
  if (!confirm(`Set ${updates.length} ${updates.length === 1 ? "piece" : "pieces"} to ${preview}? This changes live prices.`)) return;

  setBulkBusy(true);
  // One request per item — the existing PATCH already validates ownership per id.
  for (const u of updates) {
   await fetch(`/api/store/items/${u.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ price: u.priceCents / 100 }),
   }).catch(() => {});
  }
  setSelected(new Set());
  await load();
  setBulkBusy(false);
 }

 async function bulk(action: "publish" | "remove") {
 const ids = [...selected];
 if (!ids.length) return;
 setConfirmBulk(false);
 setBulkBusy(true);
 await fetch(withStore("/api/store/items"), {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action, ids }),
 }).catch(() => {});
 setSelected(new Set());
 await load();
 setBulkBusy(false);
 }
 // Re-tag the selected items' categories from their photos. The model only ever answers with a
 // slug from the taxonomy or nothing — items it can't place keep whatever they had.
 async function tagWithAi() {
 const ids = [...selected];
 if (!ids.length) return;
 setBulkBusy(true); setAiNotice(null);
 const r = await fetch(withStore("/api/store/items/categorize"), {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ ids }),
 }).then((x) => x.json()).catch(() => null);
 setBulkBusy(false);
 if (!r?.ok) { setAiNotice(r?.error || "Couldn’t tag those — try again."); return; }
 setAiNotice(
 `Tagged ${r.tagged} item${r.tagged === 1 ? "" : "s"}` +
 (r.skipped ? ` · ${r.skipped} left alone (couldn’t tell from the photo)` : "") +
 (r.capped ? " · capped at 60 per run" : ""),
 );
 setSelected(new Set());
 await load();
 setTimeout(() => setAiNotice(null), 9000);
 }

 // Build a collection from the inventory: add all selected items to a collection (creating it if new).
 async function bulkAddToCollection(title: string) {
 const name = title.trim();
 const ids = [...selected];
 if (!name || !ids.length) return;
 setBulkBusy(true);
 await fetch(withStore("/api/store/items"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "addToCollection", ids, collection: name }) }).catch(() => {});
 setBulkColOpen(false); setBulkColName(""); setSelected(new Set());
 await load();
 fetch(withStore("/api/store/collections")).then((r) => (r.ok ? r.json() : null)).then((c) => c && setCols(c.collections || [])).catch(() => {});
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
 size: it.size || "", category: toCategorySlug(it.category), description: it.description || "", status: it.status,
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
 const r = await fetch(withStore("/api/store/listings/upload"), { method: "POST", body: fd }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
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
 await fetch(withStore(`/api/store/items/${editing.id}`), {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 title: editForm.title, price: Number(editForm.price) || 0, cost: editForm.cost.trim() === "" ? null : Number(editForm.cost),
 brand: editForm.brand, era: editForm.era, material: editForm.material, condition: editForm.condition,
 // category is omitted when no tag is picked, so an unrecognised stored value survives an edit.
 size: editForm.size, ...(editForm.category ? { category: editForm.category } : {}), description: editForm.description, status: editForm.status,
 weightOz: n(editForm.weightOz), lengthIn: n(editForm.lengthIn), widthIn: n(editForm.widthIn), heightIn: n(editForm.heightIn),
 images: editImages, collections: selCols,
 }),
 }).catch(() => {});
 setSavingEdit(false);
 setEditing(null);
 await load();
 }

 async function clearAll() {
 setConfirmReset(false);
 setLoading(true);
 await fetch(withStore("/api/store/items"), { method: "DELETE" }).catch(() => {});
 setCols([]);
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
 // Route sub-tab filter (Drafts / Sold) + tag filters + client-side search over title/category.
 const term = q.trim().toLowerCase();
 // Every item's effective category, resolved once: the canonical slug where the stored value
 // folds onto one ("jackets", "Coats & Jackets", "coats-jackets" all become coats-jackets),
 // otherwise the seller's own words from the editor's "Other" field.
 const slugOf = new Map(items.map((i) => {
 const s = toCategorySlug(i.category);
 return [i.id, s ?? (i.category?.trim() || null)] as const;
 }));
 // Tag counts come from the OTHER filters' results, so a chip's number is what you'd actually get.
 const base = items
 .filter((i) => (statusFilter ? i.status === statusFilter : true))
 .filter((i) => (term ? `${i.title} ${i.brand || ""} ${i.category || ""} ${i.size || ""} sku-${1000 + i.sku} ${(i.collections || []).join(" ")} ${i.status}`.toLowerCase().includes(term) : true));
 // An item matches the category filter if it's the exact tag, or — when only a family is
 // picked — anything inside that family (so "Bags" catches Totes, Clutches and Crossbody too).
 const inCategory = (i: Item) => {
 const s = slugOf.get(i.id);
 if (catTag) return s === catTag;
 if (famTag) return !!s && categoryFamily(s) === famTag;
 return true;
 };
 const statusCounts: Partial<Record<ItemStatus, number>> = {};
 for (const i of base.filter(inCategory)) statusCounts[i.status] = (statusCounts[i.status] || 0) + 1;
 const catCounts: Record<string, number> = {};
 const famCounts: Record<string, number> = {};
 const famsPresent = new Set<string>();   // families with at least one item
 const customPresent = new Set<string>(); // the distinct free-text categories in use
 for (const i of base) {
 const s = slugOf.get(i.id); if (!s) continue;
 const f = categoryFamily(s);
 famsPresent.add(f);
 if (!isCanonicalCategory(s)) customPresent.add(s);
 if (!statusTag || i.status === statusTag) {
 catCounts[s] = (catCounts[s] || 0) + 1;
 famCounts[f] = (famCounts[f] || 0) + 1;
 }
 }
 // Every subcategory of a present family is offered, not just the ones currently in use —
 // so a filter exists to click the moment an item is retagged into it.
 const filterGroups: { label: string; values: string[] }[] = [
 ...CATEGORY_GROUPS.filter((g) => famsPresent.has(g.label)).map((g) => ({ label: g.label, values: [...g.slugs] as string[] })),
 ...(customPresent.size ? [{ label: OTHER_FAMILY, values: [...customPresent].sort() }] : []),
 ];
 const untagged = base.filter((i) => !slugOf.get(i.id)).length;
 const filtering = !!(statusTag || famTag || catTag || missingTag || colTag || quickOnly);
 const clearFilters = () => { setStatusTag(null); setFamTag(null); setCatTag(null); setMissingTag(null); setColTag(null); setQuickOnly(false); };
 const colCounts: Record<string, number> = {};
 for (const i of items) for (const c of i.collections || []) colCounts[c] = (colCounts[c] || 0) + 1;
 const needsDetails = (i: Item) => i.costCents == null || !i.size || !i.brand;
 const lacks = (i: Item) => (missingTag === "photo" ? !(i.images?.length) : missingTag === "price" ? !(i.priceCents > 0) : missingTag === "details" ? needsDetails(i) : true);
 const quickCount = items.filter((i) => i.source === "market").length;
 const detailsCount = items.filter((i) => i.source === "market" && needsDetails(i)).length;
 const shown = base
 .filter((i) => (statusTag ? i.status === statusTag : true))
 .filter(inCategory)
 .filter(lacks)
 .filter((i) => (colTag ? (i.collections || []).includes(colTag) : true))
 .filter((i) => (quickOnly ? i.source === "market" : true));
 const allChecked = shown.length > 0 && shown.every((i) => selected.has(i.id));

 // Exports everything currently filtered, not just the rendered page — an export
 // that silently stops at the pagination boundary is worse than none.
 function exportCsv() {
  const rows = shown.map((i) => [
   i.sku, i.title, i.brand ?? "", i.category ?? "", i.size ?? "", i.condition ?? "", i.era ?? "", i.material ?? "",
   (i.priceCents / 100).toFixed(2), i.costCents != null ? (i.costCents / 100).toFixed(2) : "",
   i.currency, i.status, (i.images || []).length, (i.collections || []).join(" | "),
  ]);
  downloadCsv(datedFilename("inventory"), toCsv(
   ["sku", "title", "brand", "category", "size", "condition", "era", "material", "price", "cost", "currency", "status", "photos", "collections"],
   rows,
  ));
 }

 // Paginate the RENDERED rows — a big inventory (hundreds of image rows) is slow to paint all at
 // once. Filtering, search, counts and select-all still run over the full set; only the DOM is capped.
 const PAGE_SIZE = 40;
 const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
 const pageSafe = Math.min(page, totalPages);
 const paged = shown.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

 const heading = statusFilter === "draft" ? "Drafts" : statusFilter === "sold" ? "Sold" : "Inventory";

 // Collections cell — every collection the item sits in, as small chips (tap = filter by it).
 const chipCls = "inline-flex items-center rounded-full px-2 py-[3px] text-[10.5px] font-medium leading-none";
 const collectionsCell = (it: Item) => {
 const cs = it.collections || [];
 if (!cs.length) return <span className="text-stone-300">—</span>;
 return (
 <div className="flex flex-wrap items-center gap-1">
 {cs.slice(0, 3).map((c) => <button key={c} type="button" onClick={() => setColTag(c)} className={cn(chipCls, "bg-stone-100 text-stone-600 hover:bg-stone-200")}>{c}</button>)}
 {cs.length > 3 && <span className="text-[10.5px] text-stone-400">+{cs.length - 3}</span>}
 </div>
 );
 };
 // "Posted on" cell — Store (live on the VYA storefront) + each real cross-listed channel.
 const postedCell = (it: Item) => {
 const chs = channels[it.id] || [];
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
 <span key={c.key} title="Live listing" className={cn(chipCls, "bg-stone-100 text-stone-600")}>{platformNames[c.key] || c.key}</span>
 ))}
 </div>
 );
 };

 // Wider than the standard admin page — this table has 9 columns and shouldn't need to scroll.
 return (
 <AdminPage className="max-w-[92rem]">
 <AdminHeader
 eyebrow="Sell · Inventory"
 title={heading}
 subtitle="Text a photo — VYA writes the listing and prices it from real comps."
 actions={
 <>
 {isAdmin && items.length > 0 && <button onClick={() => setConfirmReset(true)} className="text-[12px] text-rose-500/80 underline hover:text-rose-600">Clear all (owner)</button>}
 <div className="relative">
 <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
 <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items…" aria-label="Search items"
 className="h-9 w-full rounded-full border border-stone-200 bg-white pl-8 pr-3 text-[13px] text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-[var(--accent,#0e9f76)] sm:w-52" />
 </div>
 <TechButton variant="secondary" onClick={exportCsv}>Export</TechButton>
 <TechButton variant="secondary" onClick={() => setImportOpen(true)}>Import</TechButton>
 <TechButtonLink href={withStore("/admin/add-listing")}>+ New listing</TechButtonLink>
 </>
 }
 />

 {importOpen && (
 <ImportModal
 onClose={() => { setImportOpen(false); load(); }}
 />
 )}

 {aiNotice && (
 <div className="mb-4 flex items-start gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-[13px] text-stone-600">
 <span>{aiNotice}</span>
 </div>
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
 <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-[13px] shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
 <span className="font-medium text-stone-700">{selected.size} selected</span>
 <div className="ml-auto flex items-center gap-2">
 <div className="relative">
 <TechButton variant="secondary" className="px-3 py-1.5 text-[12px]" disabled={bulkBusy} onClick={bulkReprice}>Reprice</TechButton>
 <TechButton variant="secondary" className="px-3 py-1.5 text-[12px]" disabled={bulkBusy} onClick={() => setBulkColOpen((o) => !o)}>Add to collection ▾</TechButton>
 {bulkColOpen && (
 <div className="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-xl border border-stone-200 bg-white p-2.5 shadow-[0_16px_44px_-12px_rgba(16,24,40,0.35)]">
 <p className="mb-1.5 px-1 text-[11px] font-medium text-stone-500">Add {selected.size} item{selected.size > 1 ? "s" : ""} to a collection</p>
 <input
 autoFocus value={bulkColName} onChange={(e) => setBulkColName(e.target.value)}
 onKeyDown={(e) => { if (e.key === "Enter" && bulkColName.trim()) bulkAddToCollection(bulkColName); if (e.key === "Escape") setBulkColOpen(false); }}
 list="bulk-col-list" placeholder="Type a name (new or existing)…"
 className={cn(inputCls, "w-full text-[13px]")} />
 <datalist id="bulk-col-list">{cols.map((c) => <option key={c.id} value={c.title} />)}</datalist>
 {cols.length > 0 && (
 <div className="mt-2 flex flex-wrap gap-1">
 {cols.slice(0, 8).map((c) => (
 <button key={c.id} type="button" onClick={() => bulkAddToCollection(c.title)} disabled={bulkBusy} className="rounded-full border border-stone-200 px-2.5 py-1 text-[11px] text-stone-600 transition hover:border-[var(--accent,#0e9f76)] hover:text-stone-900 disabled:opacity-50">{c.title}</button>
 ))}
 </div>
 )}
 <div className="mt-2.5 flex justify-end gap-1.5">
 <TechButton variant="ghost" className="px-2.5 py-1 text-[12px]" onClick={() => setBulkColOpen(false)}>Cancel</TechButton>
 <TechButton className="px-2.5 py-1 text-[12px]" disabled={bulkBusy || !bulkColName.trim()} onClick={() => bulkAddToCollection(bulkColName)}>{bulkBusy ? "Adding…" : "Add"}</TechButton>
 </div>
 </div>
 )}
 </div>
 <TechButton className="px-3 py-1.5 text-[12px]" disabled={bulkBusy || draftsSelected === 0} onClick={() => bulk("publish")}>
 {bulkBusy ? "Working…" : `Publish now${draftsSelected ? ` (${draftsSelected})` : ""}`}
 </TechButton>
 <TechButton variant="secondary" className="px-3 py-1.5 text-[12px]" disabled={bulkBusy} onClick={tagWithAi} title="Re-read each item&rsquo;s photo and set its category">
 {bulkBusy ? "Working…" : "Tag with AI"}
 </TechButton>
 <TechButton variant="secondary" className="px-3 py-1.5 text-[12px]" disabled={bulkBusy} onClick={() => setConfirmBulk(true)}>Remove</TechButton>
 <TechButton variant="ghost" className="px-3 py-1.5 text-[12px]" onClick={() => setSelected(new Set())}>Clear</TechButton>
 </div>
 </div>
 )}

 {shown.length === 0 ? (
 <TechEmpty
 icon={<Package size={28} strokeWidth={1.5} />}
 title={term || filtering ? "No matches" : statusFilter ? `No ${statusLabel(statusFilter)} items` : "No items yet"}
 body={term || filtering ? "Try a different search, or clear the filters in the table headers." : "Snap a photo and VYA drafts the listing for you — title, description, and a ghost-mannequin image."}
 action={term ? undefined : filtering
 ? <TechButton variant="secondary" onClick={clearFilters}>Clear filters</TechButton>
 : <TechButtonLink href={withStore("/admin/add-listing")}>Snap your first piece</TechButtonLink>}
 />
 ) : layout === "grid" ? (
 <div>
 <ViewToggle value={layout} onChange={changeLayout} count={shown.length} q={q} onQuery={setQ} quick={{ total: quickCount, needs: detailsCount, on: quickOnly, needsOn: missingTag === "details", toggle: () => setQuickOnly((v) => !v), toggleNeeds: () => { setMissingTag((m) => (m === "details" ? null : "details")); setQuickOnly(true); } }} />
 <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
 {paged.map((it) => (
 <div key={it.id} className={cn("group overflow-hidden rounded-2xl border bg-white transition", selected.has(it.id) ? "border-[var(--accent,#0e9f76)]" : "border-stone-200 hover:border-stone-300")}>
 <button type="button" onClick={() => openEdit(it)} className="relative block aspect-[4/5] w-full bg-stone-100">
 {it.images[0] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.images[0]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-[11px] text-stone-400">no photo</span>}
 <span className="absolute left-2 top-2"><StatusPill tone={TONE[it.status]} dot={it.status === "active"}>{statusLabel(it.status)}</StatusPill></span>
 <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} onClick={(e) => e.stopPropagation()} className="absolute right-2 top-2 h-4 w-4 cursor-pointer accent-[var(--accent,#0e9f76)]" aria-label={`Select ${it.title}`} />
 </button>
 <div className="p-2.5">
 <p className="truncate text-[13px] font-medium text-stone-900">{it.title}</p>
 <div className="mt-0.5 flex items-center justify-between text-[12px] text-stone-500"><span className="truncate">{it.size || slugOf.get(it.id) || `SKU-${1000 + it.sku}`}</span><span className="font-semibold text-stone-900">${(it.priceCents / 100).toFixed(0)}</span></div>
 <div className="mt-2 flex items-center justify-between gap-2">{collectionsCell(it)}{postedCell(it)}</div>
 </div>
 </div>
 ))}
 </div>
 {totalPages > 1 && (
 <div className="mt-3 flex items-center justify-between text-[12px] text-stone-500">
 <span className="tabular-nums">Showing {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, shown.length)} of {shown.length}</span>
 <span className="flex gap-1"><TechButton variant="ghost" className="px-2 py-1 text-[12px]" disabled={pageSafe <= 1} onClick={() => setPage(pageSafe - 1)}>Prev</TechButton><TechButton variant="ghost" className="px-2 py-1 text-[12px]" disabled={pageSafe >= totalPages} onClick={() => setPage(pageSafe + 1)}>Next</TechButton></span>
 </div>
 )}
 </div>
 ) : (
 <TechCard className="overflow-hidden">
 <ViewToggle value={layout} onChange={changeLayout} count={shown.length} inCard q={q} onQuery={setQ} quick={{ total: quickCount, needs: detailsCount, on: quickOnly, needsOn: missingTag === "details", toggle: () => setQuickOnly((v) => !v), toggleNeeds: () => { setMissingTag((m) => (m === "details" ? null : "details")); setQuickOnly(true); } }} />
 <div className="overflow-x-auto">
 <table className="w-full text-[13px]">
 <thead>
 <tr>
 <TH className="w-9 pl-4 pr-2"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent,#0e9f76)]" aria-label="Select all" /></TH>
 {/* Category and Status get their own filterable headers — see HeaderFilter. */}
 <TH className="px-3">Item</TH>
 <TH className="px-3">
       {filterGroups.length > 0 ? (
 <HeaderFilter
 label="Category"
 value={catTag ? categoryValueLabel(catTag) : famTag}
 onClear={() => { setCatTag(null); setFamTag(null); }}
 >
 {(close) => (
 <CategoryFilterMenu
 groups={filterGroups} counts={catCounts} familyCounts={famCounts}
 total={base.length} untagged={untagged} family={famTag} value={catTag}
 onPick={(f, v) => { setFamTag(f); setCatTag(v); close(); }}
 />
 )}
 </HeaderFilter>
 ) : "Category"}
 </TH>
 <TH right className="px-3">Revenue</TH>
 <TH right className="px-3">Cost</TH>
 <TH right className="px-3">Margin</TH>
 <TH className="px-3">
 {statusFilter ? "Status" : (
 <HeaderFilter label="Status" value={statusTag ? statusLabel(statusTag) : null} onClear={() => setStatusTag(null)}>
 {(close) => (
 <>
 <HeaderFilterItem label="All statuses" count={base.length} selected={!statusTag} onClick={() => { setStatusTag(null); close(); }} />
 {ITEM_STATUSES.map((s) => (
 <HeaderFilterItem key={s} label={statusLabel(s)} count={statusCounts[s] ?? 0} selected={statusTag === s} onClick={() => { setStatusTag(s); close(); }} />
 ))}
 </>
 )}
 </HeaderFilter>
 )}
 </TH>
 <TH className="px-3">
 {cols.length > 0 ? (
 <HeaderFilter label="Collection" value={colTag} onClear={() => setColTag(null)}>
 {(close) => (
 <>
 <HeaderFilterItem label="All collections" count={base.length} selected={!colTag} onClick={() => { setColTag(null); close(); }} />
 {cols.map((c) => (
 <HeaderFilterItem key={c.id} label={c.title} count={colCounts[c.title] ?? 0} selected={colTag === c.title} onClick={() => { setColTag(c.title); close(); }} />
 ))}
 </>
 )}
 </HeaderFilter>
 ) : "Collection"}
 </TH>
 <TH className="px-3">Posted on</TH>
 <TH right className="pl-3 pr-4">Actions</TH>
 </tr>
 </thead>
 <tbody>
 {paged.map((it) => (
 <tr key={it.id} className={`group transition hover:bg-stone-50/70 ${selected.has(it.id) ? "bg-stone-50" : ""}`}>
 <TD className="pl-4 pr-2"><input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent,#0e9f76)]" aria-label={`Select ${it.title}`} /></TD>
 <TD className="px-3">
 <button onClick={() => openEdit(it)} className="flex items-center gap-3 text-left">
 <div className="h-11 w-9 shrink-0 overflow-hidden rounded-md bg-stone-100 ring-1 ring-stone-200">
 {it.images[0] && (
 // eslint-disable-next-line @next/next/no-img-element
 <img src={it.images[0]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
 )}
 </div>
 <span className="flex min-w-0 flex-col">
 <span className="max-w-[180px] truncate font-medium text-stone-900 group-hover:underline xl:max-w-[250px]">{it.title}</span>
 <span className="truncate font-mono text-[11px] tabular-nums text-stone-400">SKU-{1000 + it.sku}</span>
 </span>
 </button>
 </TD>
 <TD className="px-3">
       {(() => {
 const s = slugOf.get(it.id);
 if (!s) return <span className="text-stone-300">—</span>;
 // A custom category shows in lighter grey — it sits outside the taxonomy on purpose.
 return isCanonicalCategory(s)
 ? <span className="whitespace-nowrap text-stone-600">{categoryValueLabel(s)}</span>
 : <span className="whitespace-nowrap text-stone-400" title="Custom category">{s}</span>;
 })()}
 </TD>
 <TD right className="px-3 font-medium text-stone-800">${(it.priceCents / 100).toFixed(0)}</TD>
 <TD right className="px-3 text-stone-500">{it.costCents ? `$${(it.costCents / 100).toFixed(0)}` : "—"}</TD>
 <TD right className="px-3">
 {(() => {
 const hasCost = it.costCents != null && it.costCents > 0;
 if (!hasCost || it.priceCents <= 0) return <span className="text-stone-300">—</span>;
 const m = Math.round(((it.priceCents - (it.costCents as number)) / it.priceCents) * 100);
 return <span className={cn("font-semibold tabular-nums", m >= 0 ? "text-[var(--accent-ink,#0b7a5c)]" : "text-rose-500")}>{m}%</span>;
 })()}
 </TD>
 <TD className="px-3">
 {it.status === "draft" && it.publishAt ? (
 <div className="flex flex-col gap-0.5">
 <StatusPill tone="info">scheduled</StatusPill>
 <span className="text-[10px] text-stone-400" title={new Date(it.publishAt).toLocaleString()}>{new Date(it.publishAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
 </div>
 ) : (
 <StatusPill tone={TONE[it.status]} dot={it.status === "active"}>{statusLabel(it.status)}</StatusPill>
 )}
 </TD>
 <TD className="px-3">{collectionsCell(it)}</TD>
 <TD className="px-3">{postedCell(it)}</TD>
 <TD right className="pl-3 pr-4">
 <div className="flex items-center justify-end gap-0.5">
 {it.status === "draft" && <TechButton variant="secondary" className="px-2 py-1 text-[12px]" disabled={busyId === it.id} onClick={() => act(it.id, "publish")}>Publish</TechButton>}
 {(it.status === "active" || it.status === "reserved") && <TechButton variant="secondary" className="px-2 py-1 text-[12px]" disabled={busyId === it.id} onClick={() => act(it.id, "sold")}>Mark sold</TechButton>}
 {it.status !== "removed" && (
 <button type="button" aria-label={`Remove ${it.title}`} title="Remove from sale" disabled={busyId === it.id} onClick={() => setConfirmRow(it.id)}
 className="ml-1 grid h-7 w-7 place-items-center rounded-full text-[#5D0F17]/70 transition hover:bg-[#5D0F17]/10 hover:text-[#5D0F17] disabled:opacity-40">
 <X size={15} strokeWidth={2.2} />
 </button>
 )}
 </div>
 </TD>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 {/* With the filters in the headers, this rail is the only place that says a filter is on —
 so it shows up whenever one is, not just when the rows spill onto a second page. */}
 {(totalPages > 1 || filtering) && (
 <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 px-4 py-3 text-[12px] text-stone-500">
 <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
 <span className="tabular-nums">
 {totalPages > 1
 ? <>Showing {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, shown.length)} of {shown.length}</>
 : <><span className="font-medium text-stone-700">{shown.length}</span> of {base.length} items</>}
 </span>
 {filtering && (
 <>
 <span className="flex flex-wrap items-center gap-1.5">
 {statusTag && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">{statusLabel(statusTag)}</span>}
 {(catTag || famTag) && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">{catTag ? categoryValueLabel(catTag) : famTag}</span>}
 {missingTag && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">{missingTag === "photo" ? "No photo" : missingTag === "price" ? "No price" : "Needs details"}</span>}
 {quickOnly && <span className="rounded-full bg-[#5D0F17]/10 px-2 py-0.5 text-[11px] text-[#5D0F17]">Quick-listed</span>}
 {colTag && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">{colTag}</span>}
 </span>
 <button type="button" onClick={clearFilters} className="font-medium text-stone-500 underline-offset-2 transition hover:text-stone-800 hover:underline">Clear filters</button>
 </>
 )}
 </span>
 <div className={cn("flex items-center gap-2", totalPages <= 1 && "hidden")}>
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
 <StatusPill tone={TONE[editForm.status]} dot={editForm.status === "active"}>{statusLabel(editForm.status)}</StatusPill>
 </div>

 {/* Photos — reorder (‹ ›), remove (✕), add (upload). First = cover. */}
 <SectionLabel className="mb-2">Photos <span className="text-rose-500" title="Required to publish">*</span></SectionLabel>
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
 <Field label="Title" required><Input value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} /></Field>
 <div className="grid grid-cols-2 gap-3">
 <Field label="Brand"><Input value={editForm.brand} onChange={(e) => setEditForm((f) => ({ ...f, brand: e.target.value }))} placeholder="e.g. Fendi" /></Field>
 <Field label="Era"><Input value={editForm.era} onChange={(e) => setEditForm((f) => ({ ...f, era: e.target.value }))} placeholder="e.g. 1990s" /></Field>
 </div>
 <div className="grid grid-cols-3 gap-3">
 <Field label="Condition"><Input value={editForm.condition} onChange={(e) => setEditForm((f) => ({ ...f, condition: e.target.value }))} placeholder="Excellent" /></Field>
 <Field label="Material"><Input value={editForm.material} onChange={(e) => setEditForm((f) => ({ ...f, material: e.target.value }))} /></Field>
 <Field label="Size"><Input value={editForm.size} onChange={(e) => setEditForm((f) => ({ ...f, size: e.target.value }))} /></Field>
 </div>
 <Field label="Category" required>
 <CategoryBreadcrumb value={editForm.category} onChange={(v) => setEditForm((f) => ({ ...f, category: v }))} />
 {!editForm.category && editing.category && (
 <p className="mt-1.5 text-[11px] text-stone-400">Currently &ldquo;{editing.category}&rdquo; — not one of the tags. Pick one to replace it.</p>
 )}
 </Field>
 <div className="grid grid-cols-3 gap-3">
 <Field label="Price (USD)" required><Input type="number" inputMode="numeric" value={editForm.price} onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))} /></Field>
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
 <Field label="Status">
 {/* Status can't be cleared — an item is always in one. */}
 <TagRow options={ITEM_STATUSES} value={editForm.status} onChange={(v) => setEditForm((f) => ({ ...f, status: v ?? f.status }))} labelFor={statusLabel} />
 </Field>
 <Field label="Weight (oz)"><Input type="number" inputMode="numeric" value={editForm.weightOz} onChange={(e) => setEditForm((f) => ({ ...f, weightOz: e.target.value }))} placeholder="for shipping" /></Field>
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
 {/* The * fields are what a LIVE listing needs. A draft can be saved half-finished —
 the gate only bites when the item is going (or staying) active. */}
 {(() => {
 const missing = publishBlockers(editForm, editImages);
 return (
 <div className="mt-5 flex items-center justify-end gap-3">
 {missing.length > 0 && (
 <p className="mr-auto text-[11px] text-stone-400">
 {editForm.status === "active" ? "To publish, add" : "Missing for publishing"}: <span className="text-rose-500">{missing.join(", ")}</span>
 </p>
 )}
 <TechButton variant="ghost" onClick={() => setEditing(null)}>Cancel</TechButton>
 <TechButton
 disabled={savingEdit || !editForm.title.trim() || (editForm.status === "active" && missing.length > 0)}
 onClick={saveEdit}
 >{savingEdit ? "Saving…" : "Save"}</TechButton>
 </div>
 );
 })()}
 </div>
 </div>
 )}
 {(() => {
 const it = items.find((x) => x.id === confirmRow);
 return (
 <ConfirmDialog
 open={!!it}
 title="Remove this item?"
 body={it?.status === "sold" ? "It comes off your storefront and every connected channel. The sale and its order history stay untouched." : "It comes off your storefront and every connected channel. You can re-add it later from a new listing."}
 preview={it && (
 <div className="flex items-center gap-3">
 <div className="h-12 w-10 shrink-0 overflow-hidden rounded-md bg-stone-100 ring-1 ring-stone-200">
 {it.images[0] && /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.images[0]} alt="" className="h-full w-full object-cover" />}
 </div>
 <span className="min-w-0">
 <span className="block truncate text-[13.5px] font-medium text-stone-900">{it.title}</span>
 <span className="block font-mono text-[11px] text-stone-400">SKU-{1000 + it.sku} · ${(it.priceCents / 100).toFixed(0)}</span>
 </span>
 </div>
 )}
 confirmLabel="Remove item"
 cancelLabel="Keep it"
 busy={busyId === confirmRow}
 onConfirm={() => confirmRow && act(confirmRow, "remove")}
 onCancel={() => setConfirmRow(null)}
 />
 );
 })()}
 <ConfirmDialog
 open={confirmBulk}
 title={`Remove ${selected.size} item${selected.size === 1 ? "" : "s"}?`}
 body="They come off your storefront and every connected channel. Sold items keep their order history."
 confirmLabel={`Remove ${selected.size}`}
 cancelLabel="Keep them"
 busy={bulkBusy}
 onConfirm={() => bulk("remove")}
 onCancel={() => setConfirmBulk(false)}
 />
 <ConfirmDialog
 open={confirmReset}
 title="Delete everything in this store?"
 body={<>All <b className="text-stone-700">{items.length}</b> items — including sold — plus their orders, payouts and collections are permanently deleted. This can’t be undone.</>}
 confirmLabel="Delete everything"
 busy={loading}
 onConfirm={clearAll}
 onCancel={() => setConfirmReset(false)}
 />
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
 const r = await fetch(withStore("/api/store/inventory/convert"), { method: "POST" });
 const d = await r.json();
 if (!r.ok) { setMsg(d.error || "Couldn’t import your catalog."); return; }
 setMsg(d.added > 0 ? `✓ Imported ${d.added} item${d.added === 1 ? "" : "s"} from your synced catalog — they’re now editable inventory.` : "Nothing new to import — your catalog is already in your inventory.");
 } catch { setMsg("Something went wrong."); } finally { setBusy(false); }
 }

 async function importCsv() {
 if (!csv.trim()) { setMsg("Paste or upload your inventory file first."); return; }
 setBusy(true); setMsg(null);
 try {
 const r = await fetch(withStore("/api/store/items/import"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv, status: goLive ? "active" : "draft" }) });
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


/** List ↔ thumbnail grid switch, same look as Market Mode's. */
function ViewToggle({ value, onChange, count, inCard, q, onQuery, quick }: { value: "list" | "grid"; onChange: (v: "list" | "grid") => void; count: number; inCard?: boolean; q: string; onQuery: (v: string) => void; quick?: { total: number; needs: number; on: boolean; needsOn: boolean; toggle: () => void; toggleNeeds: () => void } }) {
 const btn = (v: "list" | "grid", Icon: typeof List, label: string) => (
 <button type="button" onClick={() => onChange(v)} aria-label={label} aria-pressed={value === v} className={cn("flex h-8 items-center gap-1 px-2.5 text-[12px] transition", value === v ? "bg-[#5D0F17]/10 text-[#5D0F17]" : "bg-white text-stone-500 hover:text-stone-800")}>
 {value === v && <Check size={12} strokeWidth={2.5} />}<Icon size={15} strokeWidth={2} />
 </button>
 );
 return (
 <div className={cn("flex items-center justify-between gap-3", inCard ? "border-b border-stone-100 px-4 py-2" : "mb-3")}>
 <span className="flex shrink-0 items-center gap-2 text-[12px] text-stone-400"><span><span className="font-medium text-stone-600">{count}</span> item{count === 1 ? "" : "s"}</span>
 {quick && quick.total > 0 && (
 <>
 <button type="button" onClick={quick.toggle} aria-pressed={quick.on} className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium transition", quick.on ? "border-transparent bg-[#5D0F17] text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400")}>Quick-listed · {quick.total}</button>
 {quick.needs > 0 && <button type="button" onClick={quick.toggleNeeds} aria-pressed={quick.needsOn} className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium transition", quick.needsOn ? "border-transparent bg-amber-600 text-white" : "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-400")}>Needs details · {quick.needs}</button>}
 </>
 )}
 </span>
 <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 focus-within:border-stone-400 sm:max-w-md">
 <Search size={14} className="shrink-0 text-stone-400" />
 <input value={q} onChange={(e) => onQuery(e.target.value)} placeholder="Filter by name, brand, size, SKU, collection…" className="h-8 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-stone-400" />
 {q && <button type="button" onClick={() => onQuery("")} className="text-[11px] text-stone-400 hover:text-stone-700">Clear</button>}
 </label>
 <div className="flex overflow-hidden rounded-xl border border-stone-200 divide-x divide-stone-200">{btn("list", List, "List view")}{btn("grid", LayoutGrid, "Thumbnail view")}</div>
 </div>
 );
}
