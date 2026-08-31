"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { List, LayoutGrid, Check } from "lucide-react";
import { B, ItemCard, MarketPage, Notice, StatusChip, Thumb, api, href, money, type MarketItem } from "../ui";

// Thumbnail grid — the "see the rack at a glance" view. Same data, same tap target (Confirm screen).
function ItemTile({ item, dim }: { item: MarketItem; dim?: boolean }) {
 return (
 <Link href={href(`${B}/item/${item.id}`)} className={`block overflow-hidden rounded-2xl border border-stone-200 bg-white active:bg-stone-50 ${dim ? "opacity-60" : ""}`}>
 <div className="aspect-square w-full bg-stone-100"><Thumb src={item.image} alt={item.title} fill className="!max-h-none aspect-square !object-cover" /></div>
 <div className="p-2.5">
 <p className="truncate text-[13px] font-medium text-stone-900">{item.title}</p>
 <div className="mt-1 flex items-center justify-between gap-2">
 <StatusChip status={item.status} />
 <span className="text-[14px] font-semibold text-stone-900">{money(item.priceCents, item.currency)}</span>
 </div>
 </div>
 </Link>
 );
}

function ViewToggle({ value, onChange }: { value: "list" | "grid"; onChange: (v: "list" | "grid") => void }) {
 const btn = (v: "list" | "grid", Icon: typeof List, label: string) => (
 <button type="button" onClick={() => onChange(v)} aria-label={label} aria-pressed={value === v} className={`flex min-h-[48px] items-center gap-1 px-3.5 transition ${value === v ? "bg-[#5D0F17]/10 text-[#5D0F17]" : "bg-white text-stone-600"}`}>
 {value === v && <Check size={14} strokeWidth={2.5} />}<Icon size={18} strokeWidth={2} />
 </button>
 );
 return <div className="flex shrink-0 overflow-hidden rounded-2xl border border-stone-200 divide-x divide-stone-200">{btn("list", List, "List view")}{btn("grid", LayoutGrid, "Thumbnail view")}</div>;
}

function InventoryInner() {
 const [view, setView] = useState<"available" | "sold">("available");
 const [loaded, setLoaded] = useState<{ view: string; items: MarketItem[] } | null>(null);
 const items = loaded && loaded.view === view ? loaded.items : null; // switching tabs shows "Loading…" without a sync reset
 const [q, setQ] = useState("");
 const [layout, setLayout] = useState<"list" | "grid">("list");
 // Remembered per device; read after mount so the server-rendered markup never disagrees with the client.
 useEffect(() => { try { if (localStorage.getItem("market:inventory:layout") === "grid") void Promise.resolve().then(() => setLayout("grid")); } catch { /* private mode */ } }, []);
 const changeLayout = (v: "list" | "grid") => { setLayout(v); try { localStorage.setItem("market:inventory:layout", v); } catch { /* private mode */ } };
 const [err, setErr] = useState<string | null>(null);
 useEffect(() => {
 api<{ items: MarketItem[] }>(`/api/store/market/inventory?view=${view}`).then((r) => (r.ok ? setLoaded({ view, items: r.data.items }) : setErr(r.data.error || "Couldn't load")));
 }, [view]);
 const shown = (items ?? []).filter((i) => !q.trim() || `${i.title} ${i.brand ?? ""} ${i.size ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
 const onList = shown.filter((i) => i.onBringList), offList = shown.filter((i) => !i.onBringList);

 return (
 <MarketPage title="At this market" back={B}>
 <div className="grid grid-cols-2 rounded-2xl bg-stone-200/70 p-1">
 {(["available", "sold"] as const).map((v) => (
 <button key={v} onClick={() => setView(v)} className={`min-h-[44px] rounded-xl text-[14px] font-semibold capitalize transition ${view === v ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"}`}>{v}</button>
 ))}
 </div>
 <div className="mt-3 flex items-center gap-2">
 <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="min-h-[48px] min-w-0 flex-1 rounded-2xl border border-stone-200 bg-white px-4 text-[15px] outline-none focus:border-stone-400" />
 <ViewToggle value={layout} onChange={changeLayout} />
 </div>
 {err && <div className="mt-3"><Notice tone="danger">{err}</Notice></div>}
 <div className="mt-4 space-y-2">
 {items === null && <p className="text-center text-[13px] text-stone-400">Loading…</p>}
 {items && shown.length === 0 && <p className="py-10 text-center text-[13.5px] text-stone-400">{view === "sold" ? "Nothing sold yet today." : "No items."}</p>}
 {layout === "list" ? (
 <>
 {onList.map((it) => <ItemCard key={it.id} item={it} to={`${B}/item/${it.id}`} />)}
 {offList.length > 0 && <p className="pt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Not on your bring list</p>}
 {offList.map((it) => <ItemCard key={it.id} item={it} to={`${B}/item/${it.id}`} dim />)}
 </>
 ) : (
 <>
 <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{onList.map((it) => <ItemTile key={it.id} item={it} />)}</div>
 {offList.length > 0 && <p className="pt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Not on your bring list</p>}
 {offList.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{offList.map((it) => <ItemTile key={it.id} item={it} dim />)}</div>}
 </>
 )}
 </div>
 </MarketPage>
 );
}

export default function InventoryPage() {
 return <Suspense fallback={null}><InventoryInner /></Suspense>;
}
