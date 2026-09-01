"use client";

import { useEffect, useState } from "react";
import { Layers, Check, Pencil, Trash2, Upload, Plus } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, StatusPill, cn } from "../../ui";

// Your storefronts: the one that's live, and every one you've kept.
//
// Sellers already know this model from Shopify's themes — a list, one published, the rest drafts —
// so it needs no explaining. What it buys them is the thing that wasn't possible before: importing
// a real site AND building one here, keeping both, and switching whenever they like. Before this a
// store had exactly one storefront and whichever arrived last destroyed the other.

type VersionKind = "imported" | "built";
type Version = { id: string; name: string; kind: VersionKind; published: boolean; pageCount: number; updatedAt: string | null };

const KIND_LABEL: Record<VersionKind, string> = { imported: "Imported site", built: "Built here" };

const when = (iso: string | null) => {
 if (!iso) return "";
 const d = new Date(iso);
 return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

export default function StorefrontVersionsPage() {
 const [versions, setVersions] = useState<Version[]>([]);
 const [loading, setLoading] = useState(true);
 const [busy, setBusy] = useState<string | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [renaming, setRenaming] = useState<string | null>(null);
 const [draftName, setDraftName] = useState("");
 const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

 useEffect(() => {
  let active = true;
  (async () => {
   const r = await fetch("/api/store/storefront/versions").then((x) => (x.ok ? x.json() : null)).catch(() => null);
   if (!active) return;
   if (r?.ok) setVersions(r.versions as Version[]);
   setLoading(false);
  })();
  return () => { active = false; };
 }, []);

 // Every action returns the whole list, so the page never has to guess what changed.
 async function act(key: string, init: RequestInit, url = "/api/store/storefront/versions") {
  setBusy(key); setError(null);
  const r = await fetch(url, init).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(null);
  if (!r || !r.ok) { setError(r?.d?.error || "That didn’t work — try again."); return false; }
  if (r.d?.versions) setVersions(r.d.versions as Version[]);
  return true;
 }

 const json = (body: unknown, method: string) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

 const live = versions.find((v) => v.published) || null;
 const drafts = versions.filter((v) => !v.published);

 return (
  <AdminPage>
   <AdminHeader
    eyebrow="Storefront"
    title="Your storefronts"
    subtitle="One is live. The rest are drafts, kept exactly as they were until you publish them."
   />

   {error && (
    <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700" role="alert">{error}</div>
   )}

   {loading ? (
    <TechCard className="px-5 py-8 text-center text-[13px] text-stone-400">Loading your storefronts…</TechCard>
   ) : (
    <>
     {/* ── Live ─────────────────────────────────────────────────────────── */}
     <TechCard className="mb-4 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
       <Layers size={15} className="text-stone-400" />
       <h2 className="text-[13px] font-semibold text-stone-800">Live storefront</h2>
      </div>
      {live ? (
       <Row
        v={live}
        busy={busy}
        renaming={renaming === live.id}
        draftName={draftName}
        setDraftName={setDraftName}
        onRename={() => { setRenaming(live.id); setDraftName(live.name); }}
        onRenameCancel={() => setRenaming(null)}
        onRenameSave={async () => { if (await act(`rename:${live.id}`, json({ id: live.id, action: "rename", name: draftName }, "PATCH"))) setRenaming(null); }}
        onPublish={() => {}}
        onDelete={() => {}}
        confirmDelete={false}
        onConfirmDelete={() => {}}
        onCancelDelete={() => {}}
       />
      ) : (
       <p className="px-5 py-6 text-[13px] text-stone-400">No storefront yet.</p>
      )}
     </TechCard>

     {/* ── Actions ──────────────────────────────────────────────────────── */}
     <div className="mb-4 flex flex-wrap gap-2">
      <TechButton onClick={() => act("snapshot", json({ action: "snapshot" }, "POST"))} disabled={!!busy}>
       <Plus size={14} /> {busy === "snapshot" ? "Saving…" : "Save a copy of what’s live"}
      </TechButton>
      <TechButton onClick={() => act("fresh", json({ action: "fresh" }, "POST"))} disabled={!!busy}>
       <Upload size={14} /> {busy === "fresh" ? "Setting up…" : "Start a new design"}
      </TechButton>
     </div>
     <p className="mb-6 text-[12px] leading-relaxed text-stone-400">
      “Start a new design” keeps your current storefront as a draft and puts you on a blank one — nothing is deleted,
      and you can publish the old one again at any time.
     </p>

     {/* ── Drafts ───────────────────────────────────────────────────────── */}
     <TechCard className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
       <h2 className="text-[13px] font-semibold text-stone-800">Drafts</h2>
       <span className="text-[12px] text-stone-400">{drafts.length}</span>
      </div>
      {drafts.length === 0 ? (
       <p className="px-5 py-6 text-[13px] text-stone-400">No drafts yet. Save a copy before you make big changes and you can always come back to it.</p>
      ) : (
       <div className="divide-y divide-stone-100">
        {drafts.map((v) => (
         <Row
          key={v.id}
          v={v}
          busy={busy}
          renaming={renaming === v.id}
          draftName={draftName}
          setDraftName={setDraftName}
          onRename={() => { setRenaming(v.id); setDraftName(v.name); }}
          onRenameCancel={() => setRenaming(null)}
          onRenameSave={async () => { if (await act(`rename:${v.id}`, json({ id: v.id, action: "rename", name: draftName }, "PATCH"))) setRenaming(null); }}
          onPublish={() => act(`publish:${v.id}`, json({ id: v.id, action: "publish" }, "PATCH"))}
          onDelete={() => setConfirmDelete(v.id)}
          confirmDelete={confirmDelete === v.id}
          onConfirmDelete={async () => { if (await act(`delete:${v.id}`, { method: "DELETE" }, `/api/store/storefront/versions?id=${encodeURIComponent(v.id)}`)) setConfirmDelete(null); }}
          onCancelDelete={() => setConfirmDelete(null)}
         />
        ))}
       </div>
      )}
     </TechCard>
    </>
   )}
  </AdminPage>
 );
}

function Row({
 v, busy, renaming, draftName, setDraftName, onRename, onRenameCancel, onRenameSave,
 onPublish, onDelete, confirmDelete, onConfirmDelete, onCancelDelete,
}: {
 v: Version; busy: string | null; renaming: boolean; draftName: string; setDraftName: (s: string) => void;
 onRename: () => void; onRenameCancel: () => void; onRenameSave: () => void;
 onPublish: () => void; onDelete: () => void;
 confirmDelete: boolean; onConfirmDelete: () => void; onCancelDelete: () => void;
}) {
 return (
  <div className="flex flex-wrap items-center gap-3 px-5 py-4">
   <div className="min-w-0 flex-1">
    {renaming ? (
     <div className="flex flex-wrap items-center gap-2">
      <input
       value={draftName}
       onChange={(e) => setDraftName(e.target.value)}
       onKeyDown={(e) => { if (e.key === "Enter") onRenameSave(); if (e.key === "Escape") onRenameCancel(); }}
       autoFocus
       maxLength={60}
       className="w-56 rounded-md border border-stone-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-stone-500"
      />
      <TechButton onClick={onRenameSave} disabled={!!busy}><Check size={13} /> Save</TechButton>
      <button onClick={onRenameCancel} className="text-[12px] text-stone-400 hover:text-stone-700">Cancel</button>
     </div>
    ) : (
     <>
      <div className="flex flex-wrap items-center gap-2">
       <p className="truncate text-[14px] font-medium text-stone-800">{v.name}</p>
       {v.published && <StatusPill tone="live">Live</StatusPill>}
      </div>
      <p className="mt-0.5 text-[12px] text-stone-400">
       {KIND_LABEL[v.kind]}
       {v.kind === "imported" && v.pageCount > 0 && ` · ${v.pageCount} page${v.pageCount === 1 ? "" : "s"}`}
       {v.updatedAt && ` · saved ${when(v.updatedAt)}`}
      </p>
     </>
    )}
   </div>

   {!renaming && (
    <div className="flex flex-wrap items-center gap-2">
     {confirmDelete ? (
      <>
       <span className="text-[12px] text-stone-500">Delete this draft?</span>
       <button onClick={onConfirmDelete} disabled={!!busy} className={cn("rounded-md bg-rose-600 px-2.5 py-1 text-[12px] font-medium text-white", busy && "opacity-50")}>Delete</button>
       <button onClick={onCancelDelete} className="text-[12px] text-stone-400 hover:text-stone-700">Cancel</button>
      </>
     ) : (
      <>
       {!v.published && (
        <TechButton onClick={onPublish} disabled={!!busy}>
         {busy === `publish:${v.id}` ? "Publishing…" : "Publish"}
        </TechButton>
       )}
       <button onClick={onRename} className="flex items-center gap-1 text-[12px] text-stone-400 hover:text-stone-700"><Pencil size={12} /> Rename</button>
       {!v.published && (
        <button onClick={onDelete} className="flex items-center gap-1 text-[12px] text-stone-400 hover:text-rose-600"><Trash2 size={12} /> Delete</button>
       )}
      </>
     )}
    </div>
   )}
  </div>
 );
}
