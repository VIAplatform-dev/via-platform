"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, ExternalLink, PencilLine, Undo2 } from "lucide-react";
import { describeHostedStore, type CaptureStatus, type HostedStoreView } from "@/app/lib/hosted-store-entry";

// THE WAY IN TO THE EDITOR, on the tab where the seller already looks at her hosted store.
//
// A store finished importing and there was nothing anywhere in the portal that said "this is your
// hosted copy, here is how you change it". The click-to-edit view has existed all along at
// ?edit=1 — this is the block that finds it for her, in her words, and it never offers the button
// for a store that has nothing captured (see app/lib/hosted-store-entry.ts).

type Undoable = { path: string; savedAt: string | null };

export default function HostedStoreEntry({ previewStore }: { previewStore: string | null }) {
 const withStore = useCallback(
  (path: string) => (previewStore ? `${path}${path.includes("?") ? "&" : "?"}store=${encodeURIComponent(previewStore)}` : path),
  [previewStore],
 );
 const [view, setView] = useState<HostedStoreView | null>(null);
 const [undoable, setUndoable] = useState<Undoable[]>([]);
 const [showAll, setShowAll] = useState(false);
 const [busy, setBusy] = useState<string | null>(null);
 const [msg, setMsg] = useState<string | null>(null);

 useEffect(() => {
  let alive = true;
  // Capture status AND the side-by-side review, together: whether she may edit depends on both,
  // and showing edit buttons for a beat before the review answer lands would be a flicker of a
  // permission she doesn't have yet.
  Promise.all([
   fetch(withStore("/api/store/capture")).then((r) => (r.ok ? r.json() : null)).catch(() => null),
   fetch(withStore("/api/store/hosted-review")).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]).then(([cap, rev]: [CaptureStatus | null, { health?: { screens?: { page: string }[] } | null; reviews?: { page: string }[] } | null]) => {
   if (!alive) return;
   // health === null means no check has ever run for this store — "nothing to review", which is
   // NOT the same as "not reviewed". reviewGate keeps those apart; `screens: null` carries it.
   const review = { screens: rev?.health ? (rev.health.screens ?? []).map((s) => s.page) : null, answered: (rev?.reviews ?? []).map((r) => r.page) };
   setView(describeHostedStore(cap, review));
  });
  fetch(withStore("/api/store/capture/undo"))
   .then((r) => (r.ok ? r.json() : { pages: [] }))
   .then((j) => { if (alive) setUndoable(j.pages ?? []); })
   .catch(() => {});
  return () => { alive = false; };
 }, [withStore]);

 const undo = async (path: string) => {
  setBusy(path); setMsg(null);
  const res = await fetch(withStore("/api/store/capture/undo"), {
   method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }),
  });
  const j = await res.json().catch(() => ({}));
  setBusy(null);
  if (!res.ok) { setMsg(j.error ?? "Could not undo that."); return; }
  setUndoable(j.pages ?? []);
  setMsg("Put back the way it was before your last save.");
 };

 if (!view) return <p className="text-sm text-[#5D0F17]/60">Loading…</p>;

 const undoPaths = new Set(undoable.map((u) => u.path));
 const shown = showAll ? view.pages : view.pages.slice(0, 8);

 return (
  <section className="space-y-5 rounded-2xl border border-[#5D0F17]/12 bg-white p-5">
   <div className="space-y-1.5">
    <h2 className="font-serif text-xl text-[#5D0F17]">{view.headline}</h2>
    <p className="text-sm text-[#5D0F17]/70">{view.detail}</p>
   </div>

   {view.viewUrl && (
    <a
     href={view.viewUrl}
     target="_blank"
     rel="noreferrer"
     className="inline-flex items-center gap-2 rounded-full border border-[#5D0F17]/25 px-4 py-1.5 text-sm text-[#5D0F17] transition hover:bg-[#5D0F17]/[0.05]"
    >
     <ExternalLink size={14} strokeWidth={1.9} /> View your hosted store
    </a>
   )}

   {/* NOT REVIEWED YET. She still sees her hosted store and every page in it — what she doesn't get
       is the Edit button, and instead of a disabled control with no explanation she gets the step,
       named, with the way to do it. */}
   {view.state === "review-first" && (
    <>
     <button
      type="button"
      onClick={() => document.getElementById("hosted-review")?.scrollIntoView({ behavior: "smooth", block: "start" })}
      className="inline-flex items-center gap-2 rounded-full bg-[#5D0F17] px-4 py-1.5 text-sm text-[#FFFDF8] transition hover:bg-[#4a0c12]"
     >
      <ClipboardCheck size={14} strokeWidth={1.9} /> Go to the side-by-side ({view.reviewRemaining} left)
     </button>
     <div className="space-y-2">
      <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#5D0F17]/45">Pages we copied</h3>
      <ul className="divide-y divide-[#5D0F17]/8">
       {shown.map((p) => (
        <li key={p.path} className="flex flex-wrap items-baseline gap-x-3 py-2">
         <span className="text-sm text-[#5D0F17]">{p.label}</span>
         <span className="text-xs text-[#5D0F17]/45">{p.path}</span>
        </li>
       ))}
      </ul>
      {view.pages.length > shown.length && (
       <button type="button" onClick={() => setShowAll(true)} className="text-sm text-[#5D0F17]/70 underline">
        Show all {view.pages.length} pages
       </button>
      )}
     </div>
    </>
   )}

   {view.canEdit && (
    <>
     {/* What she is looking at, in her words. Nothing here promises more than the editor does. */}
     <div className="space-y-1.5 rounded-xl bg-[#5D0F17]/[0.04] px-4 py-3 text-sm leading-relaxed text-[#5D0F17]/80">
      <p><span className="font-medium text-[#5D0F17]">How editing works.</span> Open a page below and click any words or photo to change them. You can also add sections, and remove ones you don’t want.</p>
      <p>Your changes are <span className="font-medium text-[#5D0F17]">live the moment you press Save</span> — there is no separate publish step, and shoppers see the new version on your hosted store straight away.</p>
      <p><span className="font-medium text-[#5D0F17]">Undo goes back one save.</span> We keep the version of a page from immediately before your last save, and nothing older. Once you undo, that step is used up.</p>
      {view.productPages > 0 && (
       <p>Your {view.productPages} product page{view.productPages === 1 ? "" : "s"} {view.productPages === 1 ? "isn’t" : "aren’t"} in this list: they’re built from your live inventory, so titles, photos and prices are edited in <span className="font-medium text-[#5D0F17]">Listings</span>.</p>
      )}
     </div>

     <div className="space-y-2">
      <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#5D0F17]/45">Pages you can edit</h3>
      <ul className="divide-y divide-[#5D0F17]/8">
       {shown.map((p) => (
        <li key={p.path} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
         <span className="min-w-0 flex-1">
          <span className="text-sm text-[#5D0F17]">{p.label}</span>{" "}
          <span className="text-xs text-[#5D0F17]/45">{p.path}</span>
         </span>
         {undoPaths.has(p.path) && (
          <button
           type="button"
           disabled={busy === p.path}
           onClick={() => undo(p.path)}
           className="inline-flex items-center gap-1.5 rounded-full border border-[#5D0F17]/20 px-3 py-1 text-xs text-[#5D0F17]/70 transition hover:bg-[#5D0F17]/[0.05] disabled:opacity-50"
          >
           <Undo2 size={12} strokeWidth={2} /> Undo last change
          </button>
         )}
         <a
          href={p.editHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#5D0F17] px-3.5 py-1 text-xs text-[#FFFDF8] transition hover:bg-[#4a0c12]"
         >
          <PencilLine size={12} strokeWidth={2} /> Edit
         </a>
        </li>
       ))}
      </ul>
      {view.pages.length > shown.length && (
       <button type="button" onClick={() => setShowAll(true)} className="text-sm text-[#5D0F17]/70 underline">
        Show all {view.pages.length} pages
       </button>
      )}
     </div>
     {msg && <p className="text-sm text-[#5D0F17]/70">{msg}</p>}
    </>
   )}
  </section>
 );
}
