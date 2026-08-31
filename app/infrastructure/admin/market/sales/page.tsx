"use client";

import { Suspense, useEffect, useState } from "react";
import { B, MarketPage, Notice, Stat, Thumb, api, money } from "../ui";

type Order = { id: string; itemId: string; itemTitle: string | null; itemImage: string | null; amountCents: number; currency: string; status: string; tender: string | null; paidAt: string | null };
type Resp = { session: { name: string }; orders: Order[]; summary: { count: number; grossCents: number; avgCents: number; refundedCount: number } };

function SalesInner() {
 const [data, setData] = useState<Resp | null>(null);
 const [err, setErr] = useState<string | null>(null);
 const load = () => api<Resp>("/api/store/market/sales").then((r) => (r.ok ? setData(r.data) : setErr(r.data.error || "Couldn't load")));
 useEffect(() => { load(); }, []);

 return (
 <MarketPage title="Sales today" back={B}>
 {err && <div className="mb-3"><Notice tone="danger">{err}</Notice></div>}
 <div className="grid grid-cols-3 gap-2">
 <Stat label="Items" value={data ? data.summary.count : "—"} />
 <Stat label="Gross" value={data ? money(data.summary.grossCents) : "—"} />
 <Stat label="Avg" value={data ? money(data.summary.avgCents) : "—"} />
 </div>
 <div className="mt-5 space-y-2">
 {data && data.orders.length === 0 && <p className="py-10 text-center text-[13.5px] text-stone-400">No sales yet today. Find an item to get started.</p>}
 {data?.orders.map((o) => (
 <div key={o.id} className={`flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 ${o.status === "refunded" ? "opacity-60" : ""}`}>
 <Thumb src={o.itemImage} alt={o.itemTitle ?? ""} size={52} />
 <div className="min-w-0 flex-1">
 <p className="truncate text-[14.5px] font-medium text-stone-900">{o.itemTitle ?? "Item"}</p>
 <p className="text-[12px] text-stone-500">{o.paidAt ? new Date(o.paidAt).toLocaleTimeString([], { timeStyle: "short" }) : ""} · {o.tender === "cash" ? "Cash" : "Card"}{o.status === "refunded" ? " · Refunded" : ""}</p>
 </div>
 <div className="text-right">
 <p className="text-[16px] font-semibold text-stone-900">{money(o.amountCents, o.currency)}</p>

 </div>
 </div>
 ))}
 </div>
 </MarketPage>
 );
}

export default function SalesPage() {
 return <Suspense fallback={null}><SalesInner /></Suspense>;
}
