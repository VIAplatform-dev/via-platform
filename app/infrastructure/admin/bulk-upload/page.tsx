"use client";

import { useEffect, useRef, useState } from "react";
import { AdminPage, AdminHeader, TechButton, SectionLabel, StatusPill, TagRow, cn } from "../ui";
import { CategoryBreadcrumb } from "../CategoryPicker";
import { Input, Field } from "@/app/store/ui";
import { ITEM_STATUSES, STATUS_TONE, toCategorySlug, categoryTagLabel, statusLabel, publishBlockers, type ItemStatus } from "@/app/lib/item-tags";

// One drafted item's AI results, shown inline on its card once "Draft" runs.
type BulkItem = {
 id: string | null;            // the saved draft's listing id (for publish / update)
 title: string;
 brand: string;
 era: string;
 material: string;
 condition: string;
 category: string;
 size: string;
 description: string;
 priceUsd: number;
 // AI-estimated shipping parcel — the same estimate the one-at-a-time flow gets.
 weightOz: string;
 lengthIn: string;
 widthIn: string;
 heightIn: string;
 images: string[];
 status: ItemStatus;
 ok: boolean;
};
// "queued" = accepted, waiting for a worker; "loading" = a worker is on it right now. The two are
// distinct because a queued card must NOT show a moving progress bar — nothing is happening to it yet.
type Slot = BulkItem | "loading" | "queued" | undefined;

// "Has this item actually finished?" — one predicate rather than a `!== "loading"` check repeated at
// every call site, which is how adding "queued" broke six of them at once.
const isItem = (s: Slot): s is BulkItem => !!s && s !== "loading" && s !== "queued";

// How many items are drafted at once. The UI needs this too: a queued item's wait is "how many are
// ahead of it, divided by how many run in parallel".
const CONCURRENCY = 3;

// The inline draft editor's form — mirrors the inventory editor field-for-field.
// Everything is a string while it's being typed; blanks mean "not set".
type EditForm = {
 title: string; price: string; cost: string; brand: string; era: string; material: string;
 condition: string; size: string; category: string | null; description: string; status: ItemStatus; // slug, or free text under "Other"
 weightOz: string; lengthIn: string; widthIn: string; heightIn: string;
};
const EMPTY_EDIT: EditForm = { title: "", price: "", cost: "", brand: "", era: "", material: "", condition: "", size: "", category: null, description: "", status: "draft", weightOz: "", lengthIn: "", widthIn: "", heightIn: "" };

// Bulk intake: drop many photos, VYA clusters them into items by visual similarity, the seller
// merges/splits, then "Draft" runs the FULL intake (title, brand, era, material, condition,
// description, price) per item and fills each card in place — publish or keep as a draft right here.
export default function BulkUploadPage() {
 const [busy, setBusy] = useState(false);
 const [busyMsg, setBusyMsg] = useState("");
 const [err, setErr] = useState<string | null>(null);
 const [dragOver, setDragOver] = useState(false);
 const [groups, setGroups] = useState<string[][]>([]);
 const [drag, setDrag] = useState<{ g: number; i: number } | null>(null);
 const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
 const [drafted, setDrafted] = useState<Record<number, Slot>>({});
 // Per-item progress. `startedAt` is when a worker picked the item up; `durations` collects how long
 // FINISHED items actually took. The estimate comes only from those real measurements — before the
 // first one lands there is no honest number to show, so the bar stays indeterminate rather than
 // inventing a percentage. `tick` just re-renders while drafting so the bars advance.
 const [startedAt, setStartedAt] = useState<Record<number, number>>({});
 const [durations, setDurations] = useState<number[]>([]);
 const [now, setNow] = useState(0);
 const [saved, setSaved] = useState<{ drafted: number; failed: number } | null>(null);
 // Inline draft editor — edit a drafted item in a popup and save it without leaving the batch.
 const [editGi, setEditGi] = useState<number | null>(null);
 const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT);
 const [editImages, setEditImages] = useState<string[]>([]);
 const [savingEdit, setSavingEdit] = useState(false);
 const [uploadingEdit, setUploadingEdit] = useState(false);
 // Collections picker + the fields the bulk draft never carried (cost, shipping dims) — pulled
 // from the saved item when the editor opens, so the popup matches the inventory editor.
 const [cols, setCols] = useState<{ id: string; title: string; itemCount?: number }[]>([]);
 const [selCols, setSelCols] = useState<string[]>([]);
 const [newCol, setNewCol] = useState("");
 const openItemId = useRef<string | null>(null); // guards a slow hydrate landing on a re-opened editor
 const [hydrated, setHydrated] = useState(false);  // cost/dims/collections loaded — until then, don't send them

 useEffect(() => {
  fetch("/api/store/collections").then((r) => (r.ok ? r.json() : null)).then((c) => c && setCols(c.collections || [])).catch(() => {});
 }, []);

 const locked = busy || saved != null; // grouping freezes once drafting starts

 async function onPick(files: FileList | File[] | null) {
  if (!files || locked) return;
  const list = Array.from(files).filter((f) => !f.type || f.type.startsWith("image/")).slice(0, 60);
  if (!list.length) return;
  setBusy(true); setErr(null); setBusyMsg(`Uploading ${list.length} photo${list.length > 1 ? "s" : ""}…`);
  try {
   const urls: string[] = [];
   for (const file of list) {
    const fd = new FormData(); fd.append("file", file);
    const up = await fetch("/api/store/listings/upload", { method: "POST", body: fd });
    const ud = await up.json(); if (!up.ok) throw new Error(ud.error || "Upload failed");
    urls.push(ud.url);
   }
   setBusyMsg("Grouping photos into items…");
   const r = await fetch("/api/store/intake/bulk-group", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrls: urls }),
   });
   const d = await r.json().catch(() => null);
   const next: string[][] = Array.isArray(d?.groups) && d.groups.length ? d.groups : urls.map((u) => [u]);
   setGroups((prev) => [...prev, ...next]);
  } catch (e) {
   setErr(e instanceof Error ? e.message : "Something went wrong uploading.");
  }
  setBusy(false);
 }

 function moveTo(from: { g: number; i: number }, toGroup: number) {
  if (locked) return;
  setGroups((prev) => {
   const next = prev.map((g) => g.slice());
   const [url] = next[from.g].splice(from.i, 1);
   if (toGroup === -1) next.push([url]); else next[toGroup].push(url);
   return next.filter((g) => g.length);
  });
 }
 function removePhoto(g: number, i: number) {
  if (locked) return;
  setGroups((prev) => prev.map((x, gi) => (gi === g ? x.filter((_, ii) => ii !== i) : x)).filter((x) => x.length));
 }

 // A clock that ticks a few times a second while drafting, so the bars advance and every bar in a
 // given render reads the same instant. Torn down the moment the batch finishes.
 useEffect(() => {
  if (!busy) return;
  setNow(Date.now());
  const id = setInterval(() => setNow(Date.now()), 250);
  return () => clearInterval(id);
 }, [busy]);

 // How long one item takes, measured from the ones that have finished — the MEDIAN, so a single slow
 // outlier doesn't skew every remaining estimate. Null until at least one item has completed, which
 // is the honest answer for "how long will this take" before anything has.
 const estMs: number | null = durations.length
  ? [...durations].sort((a, b) => a - b)[Math.floor(durations.length / 2)]
  : null;
 const fmt = (ms: number) => (ms >= 60_000 ? `${Math.round(ms / 60_000)}m` : `${Math.max(1, Math.round(ms / 1000))}s`);

 // What one card should show. Deliberately three different answers, because three different things
 // are true: running with an estimate, running without one yet, and waiting its turn.
 function slotProgress(gi: number): { pct: number | null; note: string } {
  const slot = drafted[gi];
  if (slot === "loading") {
   const started = startedAt[gi];
   if (!started || estMs == null) return { pct: null, note: "Drafting…" };
   const elapsed = Math.max(0, now - started);
   // Capped below 100: the bar must never sit full while the request is still out. An item that
   // overruns the estimate holds at the cap and says so rather than silently lying at 99%.
   const pct = Math.min(92, Math.round((elapsed / estMs) * 100));
   const left = estMs - elapsed;
   return { pct, note: left > 1500 ? `about ${fmt(left)} left` : "finishing up…" };
  }
  if (slot === "queued") {
   if (estMs == null) return { pct: 0, note: "Queued" };
   // Position in the queue → how many batches of CONCURRENCY have to clear first.
   const queuedBefore = groups.reduce((n, g, i) => n + (g.length && i < gi && drafted[i] === "queued" ? 1 : 0), 0);
   const running = groups.reduce((n, g, i) => n + (g.length && drafted[i] === "loading" ? 1 : 0), 0);
   const wait = Math.ceil((queuedBefore + running) / CONCURRENCY) * estMs;
   return { pct: 0, note: `Queued · about ${fmt(wait)} away` };
  }
  return { pct: 0, note: "" };
 }

 // ── Draft every item — the FULL intake per item, filling each card in place. ──
 async function draftAll() {
  const list = groups.map((photos, gi) => ({ gi, photos })).filter((x) => x.photos.length);
  if (!list.length) return;
  setBusy(true); setErr(null); setProgress({ done: 0, total: list.length }); setBusyMsg("Drafting your items…");
  // Everything is marked queued immediately, so every card says what's happening to it — the three
  // waiting for a worker used to show nothing at all and read as though they'd been forgotten.
  setStartedAt({}); setDurations([]);
  setDrafted(Object.fromEntries(list.map((x) => [x.gi, "queued" as const])));
  let drafted = 0, failed = 0, done = 0;

  async function draftOne(gi: number, photos: string[]) {
   const t0 = Date.now();
   setDrafted((d) => ({ ...d, [gi]: "loading" }));
   setStartedAt((s0) => ({ ...s0, [gi]: t0 }));
   try {
    // 1) AI draft. title/description/category are plain strings; brand/era/material/condition are {value}.
    const d = await fetch("/api/store/intake", {
     method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrls: photos, draftOnly: true }),
    }).then((r) => r.json()).catch(() => null);
    const dr = d?.draft || {};
    const S = (k: string) => (typeof dr[k] === "string" ? dr[k] : "");              // plain-string field
    const F = (k: string) => (dr[k] && typeof dr[k].value === "string" ? dr[k].value : ""); // {value} field
    const fields = {
     title: S("title"), description: S("description"), category: F("category"),
     brand: F("brand"), era: F("era"), material: F("material"), condition: F("condition"), size: F("size"),
    };
    // The intake also estimates a shipping parcel from the photos. Blank when it couldn't.
    const P = (k: "weightOz" | "lengthIn" | "widthIn" | "heightIn") =>
     (dr.parcel && Number.isFinite(dr.parcel[k]) ? String(dr.parcel[k]) : "");
    const parcel = { weightOz: P("weightOz"), lengthIn: P("lengthIn"), widthIn: P("widthIn"), heightIn: P("heightIn") };

    // 2) Price it (same inputs as the single-item flow).
    let priceUsd = 0;
    // The whole estimate, not just the number: the market value, the quick-sale→top-demand band
    // and the rationale are what the editor needs to show the same AI guidance the one-at-a-time
    // flow shows. Bulk used to keep only `suggestedCents` and drop the rest on the floor.
    let est: Record<string, unknown> | null = null;
    try {
     const p = await fetch("/api/store/intake/pricing", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrls: photos, fields: { ...fields, conditionGrade: fields.condition, price: "", runway: (d?.runway ?? dr?.runway) || "", celebrity: d?.celebrity || "" }, searchQuery: d?.searchQuery ?? dr?.searchQuery ?? null, reverseComps: d?.reverseComps ?? [], reverseTitles: d?.reverseTitles ?? [], editorialTitles: d?.editorialTitles ?? [], knowledgeHintCents: dr?.priceHint ? dr.priceHint * 100 : null, draftRanFull: d?.needDraft === true }),
     }).then((r) => r.json()).catch(() => null);
     if (typeof p?.estimate?.suggestedCents === "number") priceUsd = Math.round(p.estimate.suggestedCents / 100);
     if (p?.estimate) est = p.estimate;
    } catch { /* price stays 0 */ }

    // 3) Save a complete draft.
    const images = [d?.ghostUrl, ...photos].filter(Boolean) as string[];
    const save = await fetch("/api/store/intake/autosave", {
     method: "POST", headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ title: fields.title, description: fields.description, size: fields.size, category: fields.category, price: priceUsd, images, status: "draft" }),
    });
    const sd = await save.json().catch(() => null);
    const ok = save.ok; if (ok) drafted++; else failed++;

    // 4) autosave only persists the listing basics, so everything else the AI worked out —
    // brand, era, material, condition and the shipping parcel — is written straight after.
    // Without this the bulk flow silently loses fields the one-at-a-time flow keeps.
    if (ok && sd?.id) {
     await fetch(`/api/store/items/${sd.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
       brand: fields.brand, era: fields.era, material: fields.material, condition: fields.condition,
       weightOz: parcel.weightOz || null, lengthIn: parcel.lengthIn || null,
       widthIn: parcel.widthIn || null, heightIn: parcel.heightIn || null,
      }),
     }).catch(() => {});
     // Attach the AI price context so the listing editor can render the rationale, the price
     // scale and the over/under-market flag for bulk-drafted items too.
     if (est) {
      await fetch(`/api/store/items/${sd.id}/price-context`, {
       method: "POST", headers: { "Content-Type": "application/json" },
       body: JSON.stringify({
        suggestedCents: est.suggestedCents, marketCents: est.marketCents,
        lowCents: est.lowCents, highCents: est.highCents,
        confidence: est.confidence, source: est.source, rationale: est.rationale,
        compCount: Array.isArray(est.comps) ? est.comps.length : null,
       }),
      }).catch(() => {});
     }
    }
    setDrafted((d2) => ({ ...d2, [gi]: { id: sd?.id ?? null, ...fields, ...parcel, priceUsd, images, status: "draft", ok } }));
   } catch {
    failed++;
    setDrafted((d2) => ({ ...d2, [gi]: { id: null, title: "", brand: "", era: "", material: "", condition: "", category: "", size: "", description: "", priceUsd: 0, weightOz: "", lengthIn: "", widthIn: "", heightIn: "", images: photos, status: "draft", ok: false } }));
   }
   // Every completed item sharpens the estimate for the ones still running and still queued.
   setDurations((ds) => [...ds, Date.now() - t0]);
   done++; setProgress({ done, total: list.length });
  }

  const queue = list.slice();
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
   while (queue.length) { const next = queue.shift(); if (next) await draftOne(next.gi, next.photos); }
  }));
  setSaved({ drafted, failed });
  setBusy(false);
 }

 // ── Edit a drafted item in place — open the popup, save straight back to the draft. ──
 function openEdit(gi: number) {
  const it = drafted[gi]; if (!isItem(it) || !it.id) return;
  setEditForm({
   ...EMPTY_EDIT,
   title: it.title, brand: it.brand, era: it.era, material: it.material, condition: it.condition,
   size: it.size, category: toCategorySlug(it.category), description: it.description,
   price: it.priceUsd ? String(it.priceUsd) : "", status: it.status,
   // The AI's parcel estimate is already on the card — show it immediately rather than
   // leaving the fields blank until the hydrate below lands.
   weightOz: it.weightOz, lengthIn: it.lengthIn, widthIn: it.widthIn, heightIn: it.heightIn,
  });
  setEditImages(it.images);
  setSelCols([]);
  setNewCol("");
  setHydrated(false);
  setEditGi(gi);
  // Cost and collections only live on the saved item, so fill them in behind the popup, and
  // re-read the parcel in case it was edited since. The AI-written fields above stay as the
  // seller last saw them on the card.
  const id = it.id;
  openItemId.current = id;
  fetch("/api/store/items").then((r) => (r.ok ? r.json() : null)).then((d) => {
   if (openItemId.current !== id) return;
   const row = (d?.items || []).find((x: { id: string }) => x.id === id);
   if (!row) return;
   const c2s = (c: number | null) => (c == null ? "" : String(Math.round(c / 100)));
   const n2s = (n: number | null) => (n == null ? "" : String(n));
   // Saved values win, but a blank one falls back to the AI estimate already in the form —
   // so a failed parcel write can't wipe the numbers the seller is looking at.
   setEditForm((f) => ({
    ...f, cost: c2s(row.costCents),
    weightOz: n2s(row.weightOz) || f.weightOz, lengthIn: n2s(row.lengthIn) || f.lengthIn,
    widthIn: n2s(row.widthIn) || f.widthIn, heightIn: n2s(row.heightIn) || f.heightIn,
   }));
   setSelCols(row.collections || []);
   setHydrated(true);
  }).catch(() => {});
 }
 function moveEditImage(i: number, dir: -1 | 1) {
  setEditImages((imgs) => { const a = [...imgs]; const j = i + dir; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
 }
 async function uploadEditImages(files: FileList | null) {
  if (!files || !files.length) return;
  setUploadingEdit(true);
  for (const file of Array.from(files)) {
   const fd = new FormData(); fd.append("file", file);
   const r = await fetch("/api/store/listings/upload", { method: "POST", body: fd }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
   if (r?.url) setEditImages((imgs) => [...imgs, r.url]);
  }
  setUploadingEdit(false);
 }
 // Saves via the item PATCH (the full-fidelity one), so brand/era/material/condition persist too —
 // the bulk autosave can't carry them. Status is left alone, so a live item stays live.
 async function saveEdit(): Promise<BulkItem | null> {
  const gi = editGi; if (gi == null) return null;
  const it = drafted[gi]; if (!isItem(it) || !it.id) return null;
  const t = (s: string) => s.trim();
  const n = (s: string) => (s.trim() === "" ? null : Number(s));
  const priceUsd = Math.max(0, Math.round(Number(editForm.price) || 0));
  const next: BulkItem = {
   ...it, title: t(editForm.title), brand: t(editForm.brand), era: t(editForm.era), material: t(editForm.material),
   // No tag picked → keep whatever was stored. Some AI categories don't fold onto a tag, and
   // opening the editor shouldn't be enough to erase one.
   condition: t(editForm.condition), size: t(editForm.size), category: editForm.category || it.category,
   description: t(editForm.description), priceUsd, images: editImages, status: editForm.status,
  };
  setSavingEdit(true); setErr(null);
  const r = await fetch(`/api/store/items/${it.id}`, {
   method: "PATCH", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({
    title: next.title, price: next.priceUsd, brand: next.brand, era: next.era,
    material: next.material, condition: next.condition, size: next.size,
    description: next.description, status: next.status, images: next.images,
    ...(editForm.category ? { category: editForm.category } : {}),
    // Omitted until the saved item has loaded, so a fast save can't blank what it hasn't seen.
    ...(hydrated ? {
     cost: n(editForm.cost), collections: selCols,
     weightOz: n(editForm.weightOz), lengthIn: n(editForm.lengthIn), widthIn: n(editForm.widthIn), heightIn: n(editForm.heightIn),
    } : {}),
   }),
  }).catch(() => null);
  setSavingEdit(false);
  if (!r || !r.ok) { setErr("Couldn’t save that edit — try again."); return null; }
  setDrafted((d) => ({ ...d, [gi]: next }));
  setEditGi(null);
  return next;
 }

 // ── Publish a drafted item (flip it live). ──
 async function publishOne(gi: number) {
  const it = drafted[gi]; if (!isItem(it) || !it.id || it.status !== "draft") return;
  const r = await fetch(`/api/store/listings/${it.id}`, {
   method: "PATCH", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ title: it.title || "Untitled", price: it.priceUsd, description: it.description, category: it.category, size: it.size, images: it.images, status: "active" }),
  });
  if (r.ok) setDrafted((d) => ({ ...d, [gi]: { ...it, status: "active" } }));
  else setErr("Couldn’t publish that one — check your ship-from address in Settings → Shipping.");
 }
 async function publishAll() {
  for (const k of Object.keys(drafted)) { const gi = Number(k); const it = drafted[gi]; if (isItem(it) && it.status === "draft" && it.ok) await publishOne(gi); }
 }

 const itemCount = groups.filter((g) => g.length).length;
 const pendingPublish = Object.values(drafted).some((s) => isItem(s) && s.status === "draft" && s.ok);

 return (
  <AdminPage className="max-w-4xl">
   <AdminHeader
    eyebrow="Sell · Bulk upload"
    title="List a whole batch at once"
    subtitle="Drop in all your photos — VYA groups them into items, you tweak, then draft them all in one go with AI title, brand, description and price. Publish or keep as drafts right here."
    actions={<a href="/admin/add-listing" className="text-[13px] font-medium text-stone-500 hover:text-stone-800">One at a time →</a>}
   />

   {err && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{err}</div>}

   {!saved && (
    <label
     onDragOver={(e) => { e.preventDefault(); if (!locked) setDragOver(true); }}
     onDragLeave={() => setDragOver(false)}
     onDrop={(e) => { e.preventDefault(); setDragOver(false); onPick(e.dataTransfer.files); }}
     className={cn("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors", dragOver ? "border-emerald-500 bg-emerald-50/60" : "border-stone-300 hover:border-stone-400", groups.length > 0 && "py-5", locked && "pointer-events-none opacity-50")}
    >
     <input type="file" accept="image/*" multiple className="hidden" disabled={locked} onChange={(e) => onPick(e.target.files)} />
     <p className="text-sm font-medium text-stone-700">{busy && !Object.keys(drafted).length ? busyMsg : groups.length ? "Add more photos" : "Drop your photos here"}</p>
     {!busy && <p className="mt-1 text-[11px] text-stone-400">up to 60 · include tag shots · VYA groups them into items</p>}
    </label>
   )}

   {itemCount > 0 && (
    <div className="mt-6">
     <div className="mb-3 flex items-center justify-between gap-3">
      {saved ? (
       <p className="text-sm font-medium text-stone-700">
        <span className="text-emerald-600">✓ Saved {saved.drafted} draft{saved.drafted === 1 ? "" : "s"}</span>
        {saved.failed > 0 && <span className="text-rose-600"> · {saved.failed} failed</span>} — publish below, or from inventory.
       </p>
      ) : (
       <p className="text-sm font-medium text-stone-700">{itemCount} item{itemCount === 1 ? "" : "s"} — drag a photo to regroup, or split it out</p>
      )}
      {saved ? (
       <div className="flex shrink-0 items-center gap-3">
        {pendingPublish && <TechButton onClick={publishAll}>Publish all</TechButton>}
        <a href="/admin/inventory/drafts" className="text-[13px] font-medium text-stone-500 hover:text-stone-800">Inventory →</a>
        <TechButton variant="ghost" onClick={() => { setGroups([]); setDrafted({}); setSaved(null); setProgress({ done: 0, total: 0 }); }}>New batch</TechButton>
       </div>
      ) : (
       <TechButton onClick={draftAll} disabled={busy}>{busy ? `Drafting ${progress.done}/${progress.total}…` : `Draft ${itemCount} item${itemCount === 1 ? "" : "s"}`}</TechButton>
      )}
     </div>

     <style>{".vya-indet{animation:vya-indet 1.15s ease-in-out infinite}@keyframes vya-indet{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}@media(prefers-reduced-motion:reduce){.vya-indet{animation:none;width:100%;opacity:.35}}"}</style>

     {busy && progress.total > 0 && (
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded bg-stone-100">
       <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
      </div>
     )}

     <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {groups.map((g, gi) => g.length === 0 ? null : (
       <div
        key={gi}
        onDragOver={(e) => { if (!locked) e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); if (drag && !locked) moveTo(drag, gi); setDrag(null); }}
        className={cn("rounded-xl border bg-white p-3", (drafted[gi] as BulkItem)?.ok === false ? "border-rose-200 bg-rose-50/40" : "border-stone-200")}
       >
        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-stone-400">
         <span>Item {gi + 1} · {g.length} photo{g.length === 1 ? "" : "s"}</span>
         {(() => { const s = drafted[gi]; return isItem(s) && s.ok && s.status !== "draft" ? <StatusPill tone={STATUS_TONE[s.status]} dot={s.status === "active"}>{statusLabel(s.status)}</StatusPill> : null; })()}
        </div>
        <div className="flex flex-wrap gap-2">
         {g.map((url, i) => (
          <div key={url} draggable={!locked} onDragStart={() => { if (!locked) setDrag({ g: gi, i }); }} className={cn("group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-stone-200", !locked && "cursor-grab")}>
           {/* eslint-disable-next-line @next/next/no-img-element */}
           <img src={url} alt="" className="h-full w-full object-cover" />
           {!locked && (
            <div className="absolute inset-x-0 bottom-0 hidden justify-center gap-1 bg-black/45 py-0.5 group-hover:flex">
             <button type="button" title="Split into its own item" onClick={() => moveTo({ g: gi, i }, -1)} className="text-[10px] text-white/90 hover:text-white">split</button>
             <span className="text-[10px] text-white/40">·</span>
             <button type="button" title="Remove photo" onClick={() => removePhoto(gi, i)} className="text-[10px] text-white/90 hover:text-white">remove</button>
            </div>
           )}
          </div>
         ))}
        </div>

        {(drafted[gi] === "loading" || drafted[gi] === "queued") && (() => {
         const { pct, note } = slotProgress(gi);
         return (
          <div className="mt-2 border-t border-stone-100 pt-2">
           {/* Shown for QUEUED items too. Previously only the three in flight said anything, so the
               rest looked skipped rather than waiting. */}
           <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] text-stone-400">Drafting title, brand, condition, description &amp; price…</p>
            <p className="shrink-0 text-[10px] tabular-nums text-stone-400">{note}</p>
           </div>
           <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-stone-100">
            {pct == null
             // No completed item yet, so there's no measured pace to project from. An indeterminate
             // sweep says "working" without claiming a percentage we can't stand behind.
             ? <div className="vya-indet h-full w-1/3 rounded-full bg-emerald-500" />
             : <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />}
           </div>
          </div>
         );
        })()}
        {isItem(drafted[gi]) && (() => { const it = drafted[gi] as BulkItem; const catSlug = toCategorySlug(it.category); const meta = [it.brand, it.era, it.material, it.condition, catSlug ? categoryTagLabel(catSlug) : it.category].filter(Boolean).join(" · "); return (
         <div className="mt-2 border-t border-stone-100 pt-2">
          <div className="flex items-baseline justify-between gap-2">
           <p className="truncate text-[13px] font-semibold text-stone-900">{it.title || "Untitled"}</p>
           <p className="shrink-0 text-[13px] font-semibold text-stone-900">{it.priceUsd > 0 ? `$${it.priceUsd.toLocaleString()}` : "—"}</p>
          </div>
          <p className="mt-0.5 text-[11px] text-stone-500">{meta || "no details detected"}</p>
          {it.description && <p className="mt-1 line-clamp-3 text-[11px] text-stone-400">{it.description}</p>}
          {!it.ok ? (
           <p className="mt-2 text-[11px] text-rose-600">Couldn&rsquo;t save this one — try it one at a time.</p>
          ) : (
           <div className="mt-2 flex flex-wrap items-center gap-2">
            {it.status === "draft" && (
             <button type="button" onClick={() => publishOne(gi)} className="rounded-lg bg-stone-900 px-3 py-1 text-[12px] font-semibold text-white hover:bg-stone-800">Publish</button>
            )}
            <button type="button" onClick={() => openEdit(gi)} className="rounded-lg border border-stone-300 px-3 py-1 text-[12px] font-semibold text-stone-700 hover:border-stone-400 hover:text-stone-900">
             {it.status === "draft" ? "Edit draft" : "Edit listing"}
            </button>
            <span className={cn("text-[11px]", it.status === "active" ? "text-emerald-600" : "text-stone-400")}>
             {it.status === "draft" ? "saved as a draft" : it.status === "active" ? "Published to your storefront." : statusLabel(it.status)}
            </span>
           </div>
          )}
         </div>
        ); })()}
       </div>
      ))}

      {!locked && (
       <div onDragOver={(e) => { e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); if (drag) moveTo(drag, -1); setDrag(null); }} className="flex min-h-[92px] items-center justify-center rounded-xl border-2 border-dashed border-stone-200 text-[11px] text-stone-400">
        drag a photo here to make it its own item
       </div>
      )}
     </div>
    </div>
   )}

   {/* Edit-draft popup — tweak what the AI wrote and save it right here. */}
   {editGi != null && (() => { const it = drafted[editGi]; if (!isItem(it)) return null; return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => { if (!savingEdit) setEditGi(null); }}>
     <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
      <div className="mb-4 flex items-center justify-between">
       <div>
        <h2 className="text-base font-semibold text-stone-900">{it.status === "draft" ? "Edit draft" : "Edit listing"}</h2>
        <p className="text-[11px] text-stone-400">Item {editGi + 1} of this batch</p>
       </div>
       <StatusPill tone={STATUS_TONE[editForm.status]} dot={editForm.status === "active"}>{statusLabel(editForm.status)}</StatusPill>
      </div>

      {/* Photos — reorder (‹ ›), remove (✕), add. First = cover. */}
      <SectionLabel className="mb-2">Photos <span className="text-rose-500" title="Required to publish">*</span></SectionLabel>
      <div className="mb-4 flex flex-wrap gap-2">
       {editImages.map((src, i) => (
        <div key={`${src}-${i}`} className="group relative h-20 w-16 overflow-hidden rounded-md ring-1 ring-stone-200">
         {/* eslint-disable-next-line @next/next/no-img-element */}
         <img src={src} alt="" className="h-full w-full object-cover" />
         {i === 0 && <span className="absolute left-0 top-0 rounded-br bg-[var(--accent,#0e9f76)] px-1 text-[8px] font-bold text-white">COVER</span>}
         <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/50 px-1 py-0.5 text-[12px] leading-none text-white opacity-0 transition group-hover:opacity-100">
          <button type="button" aria-label="Move left" onClick={() => moveEditImage(i, -1)} disabled={i === 0} className="disabled:opacity-30">‹</button>
          <button type="button" aria-label="Remove" onClick={() => setEditImages((a) => a.filter((_, k) => k !== i))} className="hover:text-rose-300">✕</button>
          <button type="button" aria-label="Move right" onClick={() => moveEditImage(i, 1)} disabled={i === editImages.length - 1} className="disabled:opacity-30">›</button>
         </div>
        </div>
       ))}
       <label className="flex h-20 w-16 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-stone-300 text-[10px] text-stone-400 transition hover:border-[var(--accent,#0e9f76)] hover:text-[var(--accent,#0e9f76)]">
        {uploadingEdit ? "Uploading…" : "+ Add"}
        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { uploadEditImages(e.target.files); e.currentTarget.value = ""; }} />
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
        {!editForm.category && it.category && (
         <p className="mt-1.5 text-[11px] text-stone-400">Currently &ldquo;{it.category}&rdquo; — not one of the tags. Pick one to replace it.</p>
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

      {(() => {
       const missing = publishBlockers(editForm, editImages);
       return (
        <div className="mt-5 flex items-center justify-end gap-3">
         {missing.length > 0 && (
          <p className="mr-auto text-[11px] text-stone-400">
           {editForm.status === "active" ? "To publish, add" : "Missing for publishing"}: <span className="text-rose-500">{missing.join(", ")}</span>
          </p>
         )}
         <TechButton variant="ghost" disabled={savingEdit} onClick={() => setEditGi(null)}>Cancel</TechButton>
         <TechButton
          disabled={savingEdit || !editForm.title.trim() || (editForm.status === "active" && missing.length > 0)}
          onClick={saveEdit}
         >{savingEdit ? "Saving…" : "Save"}</TechButton>
        </div>
       );
      })()}
     </div>
    </div>
   ); })()}
  </AdminPage>
 );
}
