"use client";

import { Suspense, useEffect, useState } from "react";
import { B, MarketPage, Notice, api, href, money, type MarketItem } from "../ui";

type Resp = { session: { name: string; createdAt: string }; items: MarketItem[]; count: number; valueCents: number };

// A printable packing list: one line per item with a tick box, sorted by title. Print styles hide the
// app chrome so it's just the list.
function BringInner() {
 const [d, setD] = useState<Resp | null>(null);
 const [err, setErr] = useState<string | null>(null);
 useEffect(() => { api<Resp>("/api/store/market/bring-list").then((r) => (r.ok ? setD(r.data) : setErr(r.data.error || "Couldn't load"))); }, []);
 return (
 <MarketPage title="Bring list" back={`${B}/setup`}>
 <style>{`@media print { aside, nav, header, .no-print, [class*="fixed"] { display: none !important } main { margin: 0 !important; padding: 0 !important } .print-sheet { border: 0 !important; box-shadow: none !important } }`}</style>
 {err && <Notice tone="danger">{err}</Notice>}
 {d && (
 <>
 <div className="no-print mb-3 flex items-center justify-between">
 <p className="text-[13px] text-stone-500">{d.count} items · {money(d.valueCents)}</p>
 <button onClick={() => window.print()} className="rounded-xl bg-stone-900 px-4 py-2 text-[13px] font-semibold text-white">Print</button>
 </div>
 <div className="print-sheet rounded-2xl border border-stone-200 bg-white p-4">
 <p className="text-[16px] font-semibold text-stone-900">{d.session.name}</p>
 <p className="text-[12px] text-stone-500">{new Date(d.session.createdAt).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} · {d.count} items · {money(d.valueCents)}</p>
 <table className="mt-3 w-full text-[13px]">
 <thead><tr className="text-left font-mono text-[10px] uppercase tracking-[0.12em] text-stone-400"><th className="w-6 py-1"></th><th className="py-1">Item</th><th className="py-1">Size</th><th className="py-1 text-right">Price</th><th className="w-12 py-1 text-right">Sold</th></tr></thead>
 <tbody>
 {d.items.map((i) => (
 <tr key={i.id} className="border-t border-stone-100">
 <td className="py-2"><span className="inline-block h-4 w-4 rounded border border-stone-400" /></td>
 <td className="py-2 pr-2 text-stone-900">{i.title}<span className="block text-[11px] text-stone-400">{[i.brand, i.category].filter(Boolean).join(" · ")}</span></td>
 <td className="py-2 text-stone-600">{i.size ?? ""}</td>
 <td className="py-2 text-right font-medium">{money(i.priceCents, i.currency)}</td>
 <td className="py-2 text-right"><span className="inline-block h-4 w-4 rounded border border-stone-400" /></td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 <a href={href(`${B}/setup`)} className="no-print mt-4 block text-center text-[13px] text-stone-500 underline">Back to setup</a>
 </>
 )}
 </MarketPage>
 );
}

export default function BringListPage() {
 return <Suspense fallback={null}><BringInner /></Suspense>;
}
