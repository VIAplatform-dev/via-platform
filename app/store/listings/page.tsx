"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Listing = {
 id: number;
 title: string;
 price: number;
 currency: string;
 images: string[];
 size: string | null;
 description: string | null;
 category: string | null;
 status: "active" | "sold" | "draft";
};

type Draft = {
 id: number | null;
 title: string;
 price: string;
 size: string;
 description: string;
 status: "active" | "sold" | "draft";
 images: string[];
};

const NEW_DRAFT: Draft = { id: null, title: "", price: "", size: "", description: "", status: "active", images: [] };

const input =
 "w-full bg-white border border-[#5D0F17]/15 px-3.5 py-2.5 text-sm text-[#5D0F17] outline-none focus:border-[#5D0F17]/50 transition";
const label = "block text-[11px] uppercase tracking-[0.18em] text-[#5D0F17]/55 mb-2";

export default function ListingsManager() {
 // Admin preview: the page URL carries ?store={slug}, and every API call has to carry it too.
 // Without this the page rendered the previewed store but SAVED against whichever store the session
 // belongs to — so a listing added while previewing simply never appeared on that storefront.
 const withStore = useCallback((path: string) => {
  if (typeof window === "undefined") return path;
  const s = new URLSearchParams(window.location.search).get("store");
  return s ? `${path}${path.includes("?") ? "&" : "?"}store=${encodeURIComponent(s)}` : path;
 }, []);

 const [loading, setLoading] = useState(true);
 const [authErr, setAuthErr] = useState<string | null>(null);
 const [listings, setListings] = useState<Listing[]>([]);
 const [draft, setDraft] = useState<Draft | null>(null);
 const [saving, setSaving] = useState(false);
 const [uploading, setUploading] = useState(false);
 const [dragOver, setDragOver] = useState(false);
 const [err, setErr] = useState<string | null>(null);
 const fileRef = useRef<HTMLInputElement>(null);

 const load = useCallback(async function load() {
 try {
 const r = await fetch(withStore("/api/store/listings"));
 if (!r.ok) {
 setAuthErr(r.status === 401 ? "Sign in as your store to manage listings." : "Couldn't load listings.");
 setLoading(false);
 return;
 }
 const d = await r.json();
 setListings(d.listings || []);
 } catch {
 setAuthErr("Couldn't load listings.");
 }
 setLoading(false);
 }, [withStore]);
 useEffect(() => {
 load();
 }, [load]);

 function startNew() {
 setErr(null);
 setDraft({ ...NEW_DRAFT });
 }
 function startEdit(l: Listing) {
 setErr(null);
 setDraft({
 id: l.id,
 title: l.title,
 price: String(l.price ?? ""),
 size: l.size || "",
 description: l.description || "",
 status: l.status,
 images: l.images || [],
 });
 }

 async function onPickFiles(files: FileList | null) {
 if (!files || !draft) return;
 const picked = Array.from(files).filter((f) => f.type.startsWith("image/"));
 if (picked.length === 0) return;
 setUploading(true);
 setErr(null);
 try {
 for (const file of picked.slice(0, 8)) {
 const fd = new FormData();
 fd.append("file", file);
 const r = await fetch(withStore("/api/store/listings/upload"), { method: "POST", body: fd });
 const d = await r.json();
 if (!r.ok) throw new Error(d.error || "Upload failed");
 setDraft((x) => (x ? { ...x, images: [...x.images, d.url].slice(0, 8) } : x));
 }
 } catch (e) {
 setErr(e instanceof Error ? e.message : "Upload failed");
 }
 setUploading(false);
 if (fileRef.current) fileRef.current.value = "";
 }

 function removeImage(url: string) {
 setDraft((x) => (x ? { ...x, images: x.images.filter((u) => u !== url) } : x));
 }

 async function save() {
 if (!draft) return;
 if (!draft.title.trim()) {
 setErr("Title is required.");
 return;
 }
 setSaving(true);
 setErr(null);
 const body = {
 title: draft.title,
 price: Number(draft.price) || 0,
 size: draft.size,
 description: draft.description,
 status: draft.status,
 images: draft.images,
 };
 try {
 const r = await fetch(withStore(draft.id ? `/api/store/listings/${draft.id}` : "/api/store/listings"), {
 method: draft.id ? "PATCH" : "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(body),
 });
 const d = await r.json();
 if (!r.ok) setErr(d.error || "Save failed.");
 else {
 setDraft(null);
 await load();
 }
 } catch {
 setErr("Save failed.");
 }
 setSaving(false);
 }

 async function remove(id: number) {
 if (!confirm("Delete this listing?")) return;
 await fetch(withStore(`/api/store/listings/${id}`), { method: "DELETE" });
 await load();
 }

 if (loading) {
 return <div className="min-h-screen bg-[#FFFDF8] flex items-center justify-center text-[#5D0F17]/40 text-sm">Loading…</div>;
 }
 if (authErr) {
 return <div className="min-h-screen bg-[#FFFDF8] flex items-center justify-center text-[#5D0F17]/60 text-sm">{authErr}</div>;
 }

 // ── Editor form ──
 if (draft) {
 return (
 <main className="min-h-screen bg-[#FFFDF8] text-[#5D0F17]">
 <div className="mx-auto max-w-2xl px-6 py-12">
 <button onClick={() => setDraft(null)} className="mb-6 text-xs uppercase tracking-[0.2em] text-[#5D0F17]/50 hover:text-[#5D0F17]">
 ← All listings
 </button>
 <h1 className="font-serif text-3xl mb-8">{draft.id ? "Edit listing" : "New listing"}</h1>

 {/* Photos */}
 <label className={label}>Photos</label>
 <div
 onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
 onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
 onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
 onDrop={(e) => { e.preventDefault(); setDragOver(false); onPickFiles(e.dataTransfer.files); }}
 className={`mb-6 rounded-[4px] border border-dashed p-3 transition-colors ${dragOver ? "border-[#5D0F17] bg-[#5D0F17]/[0.06]" : "border-[#5D0F17]/15"}`}
 >
 <div className="flex flex-wrap gap-3">
 {draft.images.map((url) => (
 <div key={url} className="relative h-24 w-20 overflow-hidden rounded-[3px] bg-[#efe6d7]">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={url} alt="" className="h-full w-full object-cover" />
 <button
 onClick={() => removeImage(url)}
 className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[11px] text-white"
 aria-label="Remove"
 >
 ×
 </button>
 </div>
 ))}
 <button
 onClick={() => fileRef.current?.click()}
 disabled={uploading || draft.images.length >= 8}
 className="flex h-24 w-20 flex-col items-center justify-center rounded-[3px] border border-dashed border-[#5D0F17]/30 text-[10px] uppercase tracking-wider text-[#5D0F17]/50 hover:border-[#5D0F17]/60 disabled:opacity-40"
 >
 {uploading ? "…" : "+ Photo"}
 </button>
 <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files)} />
 </div>
 <p className="mt-2.5 text-[11px] text-[#5D0F17]/40">
 {dragOver ? "Drop to upload" : "Drag & drop photos here, or click + Photo · up to 8"}
 </p>
 </div>

 <div className="mb-5">
 <label className={label}>Title</label>
 <input className={input} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="1990s Prada nylon shoulder bag" />
 </div>

 <div className="mb-5 grid grid-cols-2 gap-4">
 <div>
 <label className={label}>Price</label>
 <input className={input} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="240" inputMode="decimal" />
 </div>
 <div>
 <label className={label}>Size</label>
 <input className={input} value={draft.size} onChange={(e) => setDraft({ ...draft, size: e.target.value })} placeholder="M / US 8 / One size" />
 </div>
 </div>

 <div className="mb-5">
 <label className={label}>Description</label>
 <textarea className={input + " min-h-[90px] resize-y"} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Condition, measurements, story…" maxLength={2000} />
 </div>

 <div className="mb-7">
 <label className={label}>Status</label>
 <select className={input} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Draft["status"] })}>
 <option value="active">Active (visible)</option>
 <option value="draft">Draft (hidden)</option>
 <option value="sold">Sold</option>
 </select>
 </div>

 <div className="flex items-center gap-4">
 <button onClick={save} disabled={saving} className="bg-[#5D0F17] text-[#FFFDF8] px-6 py-3 text-xs uppercase tracking-[0.15em] hover:bg-[#5D0F17]/85 transition disabled:opacity-50">
 {saving ? "Saving…" : "Save listing"}
 </button>
 {err && <span className="text-xs text-red-700">{err}</span>}
 </div>
 </div>
 </main>
 );
 }

 // ── List view ──
 return (
 <main className="min-h-screen bg-[#FFFDF8] text-[#5D0F17]">
 <div className="mx-auto max-w-3xl px-6 py-12">
 <div className="mb-8 flex items-end justify-between">
 <div>
 <h1 className="font-serif text-3xl mb-1">Listings</h1>
 <p className="text-sm text-[#5D0F17]/55">Items you list here show on your VYA storefront.</p>
 </div>
 <button onClick={startNew} className="bg-[#5D0F17] text-[#FFFDF8] px-5 py-2.5 text-xs uppercase tracking-[0.15em] hover:bg-[#5D0F17]/85 transition">
 + New listing
 </button>
 </div>

 {listings.length === 0 ? (
 <div className="border border-dashed border-[#5D0F17]/20 py-20 text-center">
 <p className="text-sm text-[#5D0F17]/50">No listings yet.</p>
 <button onClick={startNew} className="mt-3 text-xs uppercase tracking-[0.2em] underline text-[#5D0F17]/70 hover:text-[#5D0F17]">
 Create your first
 </button>
 </div>
 ) : (
 <div className="divide-y divide-[#5D0F17]/10 border-y border-[#5D0F17]/10">
 {listings.map((l) => (
 <div key={l.id} className="flex items-center gap-4 py-3">
 <div className="h-16 w-14 shrink-0 overflow-hidden rounded-[3px] bg-[#efe6d7]">
 {l.images[0] && (
 // eslint-disable-next-line @next/next/no-img-element
 <img src={l.images[0]} alt="" className="h-full w-full object-cover" />
 )}
 </div>
 <div className="min-w-0 flex-1">
 <p className="truncate text-sm">{l.title}</p>
 <p className="text-xs text-[#5D0F17]/50">
 ${l.price}
 {l.size ? ` · ${l.size}` : ""}
 {l.status !== "active" ? ` · ${l.status}` : ""}
 </p>
 </div>
 <button onClick={() => startEdit(l)} className="text-xs uppercase tracking-[0.15em] text-[#5D0F17]/60 hover:text-[#5D0F17]">
 Edit
 </button>
 <button onClick={() => remove(l.id)} className="text-xs uppercase tracking-[0.15em] text-[#5D0F17]/35 hover:text-red-700">
 Delete
 </button>
 </div>
 ))}
 </div>
 )}
 </div>
 </main>
 );
}
