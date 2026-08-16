"use client";

import { useState } from "react";
import { AdminPage, AdminHeader, TechButton, cn } from "../ui";

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
 images: string[];
 status: "draft" | "live";
 ok: boolean;
};
type Slot = BulkItem | "loading" | undefined;

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
 const [saved, setSaved] = useState<{ drafted: number; failed: number } | null>(null);

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

 // ── Draft every item — the FULL intake per item, filling each card in place. ──
 async function draftAll() {
  const list = groups.map((photos, gi) => ({ gi, photos })).filter((x) => x.photos.length);
  if (!list.length) return;
  setBusy(true); setErr(null); setProgress({ done: 0, total: list.length }); setBusyMsg("Drafting your items…");
  let drafted = 0, failed = 0, done = 0;
  const CONCURRENCY = 3;

  async function draftOne(gi: number, photos: string[]) {
   setDrafted((d) => ({ ...d, [gi]: "loading" }));
   try {
    // 1) AI draft. title/description/category are plain strings; brand/era/material/condition are {value}.
    const d = await fetch("/api/store/intake", {
     method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrls: photos, draftOnly: true }),
    }).then((r) => r.json()).catch(() => null);
    const dr = d?.draft || {};
    const S = (k: string) => (typeof dr[k] === "string" ? dr[k] : "");              // plain-string field
    const F = (k: string) => (dr[k] && typeof dr[k].value === "string" ? dr[k].value : ""); // {value} field
    const fields = {
     title: S("title"), description: S("description"), category: S("category"),
     brand: F("brand"), era: F("era"), material: F("material"), condition: F("condition"), size: F("size"),
    };

    // 2) Price it (same inputs as the single-item flow).
    let priceUsd = 0;
    try {
     const p = await fetch("/api/store/intake/pricing", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrls: photos, fields: { ...fields, conditionGrade: fields.condition, price: "", runway: (d?.runway ?? dr?.runway) || "", celebrity: d?.celebrity || "" }, searchQuery: d?.searchQuery ?? dr?.searchQuery ?? null, reverseComps: d?.reverseComps ?? [], reverseTitles: d?.reverseTitles ?? [], editorialTitles: d?.editorialTitles ?? [], knowledgeHintCents: dr?.priceHint ? dr.priceHint * 100 : null, draftRanFull: d?.needDraft === true }),
     }).then((r) => r.json()).catch(() => null);
     if (typeof p?.estimate?.suggestedCents === "number") priceUsd = Math.round(p.estimate.suggestedCents / 100);
    } catch { /* price stays 0 */ }

    // 3) Save a complete draft.
    const images = [d?.ghostUrl, ...photos].filter(Boolean) as string[];
    const save = await fetch("/api/store/intake/autosave", {
     method: "POST", headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ title: fields.title, description: fields.description, size: fields.size, category: fields.category, price: priceUsd, images, status: "draft" }),
    });
    const sd = await save.json().catch(() => null);
    const ok = save.ok; if (ok) drafted++; else failed++;
    setDrafted((d2) => ({ ...d2, [gi]: { id: sd?.id ?? null, ...fields, priceUsd, images, status: "draft", ok } }));
   } catch {
    failed++;
    setDrafted((d2) => ({ ...d2, [gi]: { id: null, title: "", brand: "", era: "", material: "", condition: "", category: "", size: "", description: "", priceUsd: 0, images: photos, status: "draft", ok: false } }));
   }
   done++; setProgress({ done, total: list.length });
  }

  const queue = list.slice();
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
   while (queue.length) { const next = queue.shift(); if (next) await draftOne(next.gi, next.photos); }
  }));
  setSaved({ drafted, failed });
  setBusy(false);
 }

 // ── Publish a drafted item (flip it live). ──
 async function publishOne(gi: number) {
  const it = drafted[gi]; if (!it || it === "loading" || !it.id || it.status === "live") return;
  const r = await fetch(`/api/store/listings/${it.id}`, {
   method: "PATCH", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ title: it.title || "Untitled", price: it.priceUsd, description: it.description, category: it.category, size: it.size, images: it.images, status: "active" }),
  });
  if (r.ok) setDrafted((d) => ({ ...d, [gi]: { ...it, status: "live" } }));
  else setErr("Couldn’t publish that one — check your ship-from address in Settings → Shipping.");
 }
 async function publishAll() {
  for (const k of Object.keys(drafted)) { const gi = Number(k); const it = drafted[gi]; if (it && it !== "loading" && it.status === "draft" && it.ok) await publishOne(gi); }
 }

 const itemCount = groups.filter((g) => g.length).length;
 const pendingPublish = Object.values(drafted).some((s) => s && s !== "loading" && s.status === "draft" && s.ok);

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
         {(drafted[gi] as BulkItem)?.status === "live" && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-600">● Live</span>}
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

        {drafted[gi] === "loading" && (
         <div className="mt-2 border-t border-stone-100 pt-2 text-[11px] text-stone-400">Drafting title, brand, condition, description &amp; price…</div>
        )}
        {drafted[gi] && drafted[gi] !== "loading" && (() => { const it = drafted[gi] as BulkItem; const meta = [it.brand, it.era, it.material, it.condition, it.category].filter(Boolean).join(" · "); return (
         <div className="mt-2 border-t border-stone-100 pt-2">
          <div className="flex items-baseline justify-between gap-2">
           <p className="truncate text-[13px] font-semibold text-stone-900">{it.title || "Untitled"}</p>
           <p className="shrink-0 text-[13px] font-semibold text-stone-900">{it.priceUsd > 0 ? `$${it.priceUsd.toLocaleString()}` : "—"}</p>
          </div>
          <p className="mt-0.5 text-[11px] text-stone-500">{meta || "no details detected"}</p>
          {it.description && <p className="mt-1 line-clamp-3 text-[11px] text-stone-400">{it.description}</p>}
          {!it.ok ? (
           <p className="mt-2 text-[11px] text-rose-600">Couldn&rsquo;t save this one — try it one at a time.</p>
          ) : it.status === "live" ? (
           <p className="mt-2 text-[11px] text-emerald-600">Published to your storefront.</p>
          ) : (
           <div className="mt-2 flex items-center gap-3">
            <button type="button" onClick={() => publishOne(gi)} className="rounded-lg bg-stone-900 px-3 py-1 text-[12px] font-semibold text-white hover:bg-stone-800">Publish</button>
            <span className="text-[11px] text-stone-400">saved as a draft</span>
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
  </AdminPage>
 );
}
