"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Camera, X } from "lucide-react";
import { B, ActionBar, BigButton, MarketPage, Notice, Thumb, api, href, money, type MarketItem } from "../../../ui";

// Edit a listing without leaving Market Mode: the fields a seller fixes at a table (name, price, size,
// brand, condition, photos) in a phone-sized form. Saves through the same PATCH the workspace uses.
async function downscale(file: File, max = 1600): Promise<string> {
 const url = URL.createObjectURL(file);
 try {
 const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
 const scale = Math.min(1, max / Math.max(img.width, img.height));
 const c = document.createElement("canvas"); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
 c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
 return c.toDataURL("image/jpeg", 0.86);
 } finally { URL.revokeObjectURL(url); }
}

function EditInner() {
 const { id } = useParams<{ id: string }>();
 const router = useRouter();
 const camRef = useRef<HTMLInputElement>(null);
 const [f, setF] = useState<{ title: string; price: string; cost: string; brand: string; size: string; category: string; condition: string; era: string; material: string; description: string; images: string[] } | null>(null);
 const [soldFor, setSoldFor] = useState<number | null>(null);
 const [quick, setQuick] = useState(false);
 const [status, setStatus] = useState<string>("");
 const [busy, setBusy] = useState<null | "save" | "photo">(null);
 const [err, setErr] = useState<string | null>(null);
 useEffect(() => {
 api<{ item: MarketItem }>(`/api/store/market/item/${id}`).then((r) => {
 if (!r.ok) { setErr(r.data.error || "Not found"); return; }
 const it = r.data.item;
 setStatus(it.status); setSoldFor(it.soldForCents ?? null); setQuick(it.source === "market");
 setF({ title: it.title, price: (it.priceCents / 100).toFixed(it.priceCents % 100 ? 2 : 0), cost: it.costCents == null ? "" : (it.costCents / 100).toFixed(it.costCents % 100 ? 2 : 0), brand: it.brand ?? "", size: it.size ?? "", category: it.category ?? "", condition: it.condition ?? "", era: it.era ?? "", material: it.material ?? "", description: it.description ?? "", images: it.images ?? [] });
 });
 }, [id]);
 const set = (k: keyof NonNullable<typeof f>, v: string) => setF((o) => (o ? { ...o, [k]: v } : o));

 async function addPhoto(files: FileList | null) {
 const file = files?.[0]; if (!file || !f) return;
 setBusy("photo"); setErr(null);
 try {
 const dataUrl = await downscale(file);
 const r = await api<{ imageUrl: string }>("/api/store/market/quick-list", { method: "POST", body: JSON.stringify({ image: dataUrl, ai: false }) });
 if (r.ok) setF((o) => (o ? { ...o, images: [...o.images, r.data.imageUrl].slice(0, 12) } : o)); else setErr(r.data.error || "Couldn't save the photo");
 } catch { setErr("Couldn't read that photo."); }
 setBusy(null);
 }

 async function save() {
 if (!f) return;
 if (!f.title.trim()) { setErr("Give it a name."); return; }
 const price = Number(f.price);
 if (!(price > 0)) { setErr("Enter a price."); return; }
 setBusy("save"); setErr(null);
 const r = await api(`/api/store/items/${id}`, { method: "PATCH", body: JSON.stringify({ title: f.title, price, cost: f.cost.trim() === "" ? null : Number(f.cost), brand: f.brand, size: f.size, category: f.category, condition: f.condition, era: f.era, material: f.material, description: f.description, images: f.images }) });
 setBusy(null);
 if (!r.ok) { setErr(r.data.error || "Couldn't save"); return; }
 router.push(href(`${B}/item/${id}`));
 }

 const input = "min-h-[48px] w-full rounded-xl border border-stone-200 bg-white px-3 text-[15px] outline-none focus:border-stone-400";
 const label = "block font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400";
 return (
 <MarketPage title="Edit listing" back={`${B}/item/${id}`}>
 <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addPhoto(e.target.files); e.target.value = ""; }} />
 {err && <div className="mb-3"><Notice tone="danger">{err}</Notice></div>}
 {!f && !err && <p className="text-[13px] text-stone-400">Loading…</p>}
 {f && (
 <div className="space-y-4">
 {status === "sold" && <Notice tone="warn">This item is sold — edits won’t change the sale.</Notice>}
 {quick && <Notice tone="info">Quick-listed at a market. Add what you paid and the size so your margins and listing are complete.</Notice>}
 <div>
 <span className={label}>Photos</span>
 <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
 {f.images.map((src, i) => (
 <div key={src + i} className="relative shrink-0">
 <Thumb src={src} alt="" size={84} />
 <button type="button" aria-label="Remove photo" onClick={() => setF((o) => (o ? { ...o, images: o.images.filter((_, k) => k !== i) } : o))} className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-stone-900 text-white shadow"><X size={12} /></button>
 {i === 0 && <span className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[9.5px] font-semibold text-white">Main</span>}
 </div>
 ))}
 <button type="button" onClick={() => camRef.current?.click()} disabled={busy === "photo"} className="grid h-[84px] w-[84px] shrink-0 place-items-center rounded-xl border border-dashed border-stone-300 text-stone-400"><Camera size={22} /></button>
 </div>
 {busy === "photo" && <p className="mt-1 text-[12px] text-stone-400">Saving photo…</p>}
 </div>
 <label className="block"><span className={label}>Name</span><input value={f.title} onChange={(e) => set("title", e.target.value)} className={`mt-1 ${input}`} /></label>
 <label className="block"><span className={label}>Price</span>
 <div className="mt-1 flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 focus-within:border-stone-400"><span className="text-[22px] font-semibold text-stone-400">$</span><input inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} className="min-h-[52px] w-full bg-transparent text-[24px] font-semibold outline-none" /></div>
 </label>
 {(() => {
 const cost = f.cost.trim() === "" ? null : Math.round(Number(f.cost) * 100);
 const basis = soldFor ?? Math.round(Number(f.price) * 100);
 const margin = cost != null && basis > 0 ? Math.round(((basis - cost) / basis) * 100) : null;
 return (
 <label className="block"><span className={label}>What you paid (cost)</span>
 <div className="mt-1 flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 focus-within:border-stone-400"><span className="text-[18px] font-semibold text-stone-400">$</span><input inputMode="decimal" value={f.cost} onChange={(e) => set("cost", e.target.value)} placeholder="0" className="min-h-[48px] w-full bg-transparent text-[18px] font-semibold outline-none" /></div>
 <span className="mt-1 block text-[12px] text-stone-500">
 {margin == null ? "Add a cost to see your margin." : <>Margin <b className={margin >= 0 ? "text-emerald-700" : "text-red-700"}>{margin}%</b> · {money(basis - (cost ?? 0))} on {soldFor != null ? `the ${money(soldFor)} sale` : `the ${money(basis)} list price`}</>}
 </span>
 </label>
 );
 })()}
 <div className="grid grid-cols-2 gap-2">
 <label className="block"><span className={label}>Brand</span><input value={f.brand} onChange={(e) => set("brand", e.target.value)} className={`mt-1 ${input}`} /></label>
 <label className="block"><span className={label}>Size</span><input value={f.size} onChange={(e) => set("size", e.target.value)} className={`mt-1 ${input}`} /></label>
 <label className="block"><span className={label}>Category</span><input value={f.category} onChange={(e) => set("category", e.target.value)} className={`mt-1 ${input}`} /></label>
 <label className="block"><span className={label}>Condition</span><input value={f.condition} onChange={(e) => set("condition", e.target.value)} className={`mt-1 ${input}`} /></label>
 <label className="block"><span className={label}>Era</span><input value={f.era} onChange={(e) => set("era", e.target.value)} className={`mt-1 ${input}`} /></label>
 <label className="block"><span className={label}>Material</span><input value={f.material} onChange={(e) => set("material", e.target.value)} className={`mt-1 ${input}`} /></label>
 </div>
 <label className="block"><span className={label}>Description</span><textarea value={f.description} onChange={(e) => set("description", e.target.value)} className="mt-1 min-h-[110px] w-full rounded-xl border border-stone-200 bg-white p-3 text-[14px] outline-none focus:border-stone-400" /></label>
 <ActionBar>
 <BigButton onClick={save} disabled={busy !== null} className="min-h-[60px]">{busy === "save" ? "Saving…" : "Save changes"}</BigButton>
 <BigButton variant="ghost" onClick={() => router.push(href(`${B}/item/${id}`))} disabled={busy !== null}>Cancel</BigButton>
 </ActionBar>
 </div>
 )}
 </MarketPage>
 );
}

export default function EditPage() {
 return <Suspense fallback={null}><EditInner /></Suspense>;
}
