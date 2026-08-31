"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { List, LayoutGrid, Check } from "lucide-react";
import { B, ActionBar, BigLink, MarketPage, Notice, StatusChip, Thumb, api, href, money, type MarketItem } from "../ui";

// Choose what's coming to the market from the ENTIRE sellable inventory: tick items one by one, or
// select everything in view (search narrows the view, so "select all" can mean "all my jackets").
function BringInner() {
 const [items, setItems] = useState<MarketItem[] | null>(null);
 const [picked, setPicked] = useState<Set<string>>(new Set());
 const [q, setQ] = useState("");
 const [layout, setLayout] = useState<"list" | "grid">("list");
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState<string | null>(null);

 useEffect(() => {
 (async () => {
 const [inv, b] = await Promise.all([api<{ items: MarketItem[] }>("/api/store/market/inventory?view=available"), api<{ ids: string[] }>("/api/store/market/session/items")]);
 if (inv.ok) setItems(inv.data.items); else setErr(inv.data.error || "Couldn't load inventory");
 if (b.ok) setPicked(new Set(b.data.ids));
 })();
 }, []);

 const term = q.trim().toLowerCase();
 const shown = useMemo(() => (items ?? []).filter((i) => !term || `${i.title} ${i.brand ?? ""} ${i.size ?? ""} ${i.category ?? ""}`.toLowerCase().includes(term)), [items, term]);
 const pickedValue = useMemo(() => (items ?? []).filter((i) => picked.has(i.id)).reduce((s, i) => s + i.priceCents, 0), [items, picked]);
 const allShownPicked = shown.length > 0 && shown.every((i) => picked.has(i.id));

 async function setMany(ids: string[], on: boolean) {
 if (!ids.length) return;
 setBusy(true); setErr(null);
 setPicked((prev) => { const n = new Set(prev); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });
 const r = await api("/api/store/market/session/items", { method: on ? "POST" : "DELETE", body: JSON.stringify({ ids }) });
 if (!r.ok) { setErr(r.data.error || "Couldn't save"); setPicked((prev) => { const n = new Set(prev); ids.forEach((id) => (on ? n.delete(id) : n.add(id))); return n; }); }
 setBusy(false);
 }
 const toggle = (id: string) => setMany([id], !picked.has(id));

 const box = (on: boolean) => <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-[1.5px] text-[13px] font-bold ${on ? "border-[#5D0F17] bg-[#5D0F17] text-white" : "border-stone-300 bg-white"}`}>{on ? "✓" : ""}</span>;
 return (
 <MarketPage title="What are you bringing?" back={`${B}/setup`}>
 {err && <div className="mb-3"><Notice tone="danger">{err}</Notice></div>}
 <p className="-mt-2 mb-3 text-[13px] text-stone-500">Select what’s physically coming. Nothing selected = everything counts as here.</p>
 <div className="flex items-center gap-2">
 <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, brand, size…" className="min-h-[48px] min-w-0 flex-1 rounded-2xl border border-stone-200 bg-white px-4 text-[15px] outline-none focus:border-stone-400" />
 <div className="flex shrink-0 overflow-hidden rounded-2xl border border-stone-200 divide-x divide-stone-200">
 {(["list", "grid"] as const).map((v) => { const Icon = v === "list" ? List : LayoutGrid; return <button key={v} onClick={() => setLayout(v)} aria-pressed={layout === v} className={`flex min-h-[48px] items-center gap-1 px-3 ${layout === v ? "bg-[#5D0F17]/10 text-[#5D0F17]" : "bg-white text-stone-600"}`}>{layout === v && <Check size={13} strokeWidth={2.5} />}<Icon size={18} /></button>; })}
 </div>
 </div>
 <div className="mt-3 flex items-center justify-between">
 <span className="text-[12.5px] text-stone-500">{shown.length} item{shown.length === 1 ? "" : "s"}{term ? " match" : ""}</span>
 <div className="flex gap-2">
 <button onClick={() => setMany(shown.map((i) => i.id), !allShownPicked)} disabled={busy || !shown.length} className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-stone-800 disabled:opacity-50">{allShownPicked ? (term ? "Deselect these" : "Deselect all") : (term ? "Select these" : "Select all")}</button>
 {picked.size > 0 && <button onClick={() => setMany([...picked], false)} disabled={busy} className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-[12.5px] text-stone-500">Clear</button>}
 </div>
 </div>

 <div className={`mt-3 ${layout === "grid" ? "grid grid-cols-2 gap-2 sm:grid-cols-3" : "space-y-1.5"}`}>
 {items === null && <p className="col-span-full text-center text-[13px] text-stone-400">Loading…</p>}
 {items && shown.length === 0 && <p className="col-span-full py-8 text-center text-[13px] text-stone-400">Nothing matches.</p>}
 {shown.map((i) => layout === "grid" ? (
 <button key={i.id} onClick={() => toggle(i.id)} className={`relative overflow-hidden rounded-2xl border bg-white text-left ${picked.has(i.id) ? "border-[#5D0F17]" : "border-stone-200"}`}>
 <div className="aspect-square bg-stone-100"><Thumb src={i.image} alt={i.title} fill className="!max-h-none aspect-square !object-cover" /></div>
 <span className="absolute left-2 top-2">{box(picked.has(i.id))}</span>
 <div className="p-2"><p className="truncate text-[12.5px] font-medium text-stone-900">{i.title}</p><p className="text-[12px] text-stone-500">{i.size ? `${i.size} · ` : ""}{money(i.priceCents, i.currency)}</p></div>
 </button>
 ) : (
 <button key={i.id} onClick={() => toggle(i.id)} className={`flex w-full items-center gap-3 rounded-2xl border bg-white p-2.5 text-left ${picked.has(i.id) ? "border-[#5D0F17]" : "border-stone-200"}`}>
 {box(picked.has(i.id))}
 <Thumb src={i.image} alt={i.title} size={44} />
 <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-medium text-stone-900">{i.title}</span><span className="block text-[12px] text-stone-500">{[i.brand, i.size && `Size ${i.size}`].filter(Boolean).join(" · ")}</span></span>
 <span className="text-right"><span className="block text-[15px] font-semibold text-stone-900">{money(i.priceCents, i.currency)}</span><StatusChip status={i.status} /></span>
 </button>
 ))}
 </div>

 <ActionBar>
 <div className="flex items-center justify-between px-1 pb-1 text-[13px]">
 <span className="text-stone-600">{picked.size ? <><b className="text-stone-900">{picked.size}</b> items · <b className="text-stone-900">{money(pickedValue)}</b> coming</> : "Bringing everything"}</span>
 {busy && <span className="text-stone-400">Saving…</span>}
 </div>
 <BigLink href={href(`${B}/setup`)} className="min-h-[56px]">Done</BigLink>
 </ActionBar>
 </MarketPage>
 );
}

export default function BringPage() {
 return <Suspense fallback={null}><BringInner /></Suspense>;
}
