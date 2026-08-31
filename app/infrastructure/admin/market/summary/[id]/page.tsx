"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { B, BigLink, MarketPage, Notice, Stat, Thumb, api, href, money, type MarketItem } from "../../ui";

type Order = { id: string; itemTitle: string | null; itemImage: string | null; amountCents: number; discountCents: number | null; tender: string | null; status: string; paidAt: string | null };
type Resp = {
 session: { id: string; name: string; status: string; createdAt: string; closedAt: string | null };
 summary: { count: number; grossCents: number; avgCents: number; refundedCount: number; byTender: Record<string, number>; discountCents: number };
 orders: Order[]; topCategories: { name: string; count: number; cents: number }[]; topBrands: { name: string; count: number; cents: number }[];
 brought: { count: number; valueCents: number }; unsold: { count: number; valueCents: number; items: MarketItem[] };
};

// End-of-day: the numbers a seller writes in the notebook, plus the pack-up list.
function SummaryInner() {
 const { id } = useParams<{ id: string }>();
 const [d, setD] = useState<Resp | null>(null);
 const [err, setErr] = useState<string | null>(null);
 useEffect(() => { api<Resp>(`/api/store/market/session/summary?session=${id}`).then((r) => (r.ok ? setD(r.data) : setErr(r.data.error || "Not found"))); }, [id]);
 const cash = d?.summary.byTender.cash ?? 0, card = d?.summary.byTender.card ?? 0;
 return (
 <MarketPage title={d ? d.session.name : "Market summary"} back={`${B}/setup`}>
 {err && <Notice tone="danger">{err}</Notice>}
 {d && (
 <>
 <p className="-mt-2 mb-4 text-[12.5px] text-stone-500">{new Date(d.session.createdAt).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}{d.session.closedAt ? ` · closed ${new Date(d.session.closedAt).toLocaleTimeString([], { timeStyle: "short" })}` : " · still open"}</p>
 <div className="grid grid-cols-3 gap-2">
 <Stat label="Sold" value={d.summary.count} sub={`of ${d.brought.count} brought`} />
 <Stat label="Gross" value={money(d.summary.grossCents)} sub={d.summary.discountCents ? `${money(d.summary.discountCents)} off list` : undefined} />
 <Stat label="Avg" value={money(d.summary.avgCents)} />
 </div>
 <div className="mt-2 grid grid-cols-2 gap-2">
 <Stat label="Cash in the tin" value={money(cash)} />
 <Stat label="Card (to Stripe)" value={money(card)} sub={d.summary.refundedCount ? `${d.summary.refundedCount} refunded` : undefined} />
 </div>
 {(d.topCategories.length > 0 || d.topBrands.length > 0) && (
 <div className="mt-4 grid grid-cols-2 gap-2">
 <div className="rounded-2xl border border-stone-200 bg-white p-3"><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Best categories</p>{d.topCategories.map((t) => <p key={t.name} className="mt-1.5 flex justify-between text-[13px]"><span className="truncate text-stone-700">{t.name}</span><span className="font-medium">{money(t.cents)}</span></p>)}</div>
 <div className="rounded-2xl border border-stone-200 bg-white p-3"><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Best brands</p>{d.topBrands.map((t) => <p key={t.name} className="mt-1.5 flex justify-between text-[13px]"><span className="truncate text-stone-700">{t.name}</span><span className="font-medium">{money(t.cents)}</span></p>)}</div>
 </div>
 )}
 <p className="mb-2 mt-5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Sold</p>
 <div className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
 {d.orders.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-stone-400">No sales.</p>}
 {d.orders.map((o) => <div key={o.id} className={`flex items-center gap-3 px-3 py-2.5 ${o.status === "refunded" ? "opacity-50" : ""}`}><Thumb src={o.itemImage} alt="" size={36} /><span className="min-w-0 flex-1 truncate text-[13.5px] text-stone-900">{o.itemTitle}</span><span className="text-[11px] text-stone-400">{o.tender === "cash" ? "cash" : "card"}</span><span className="text-[14px] font-semibold">{money(o.amountCents)}</span></div>)}
 </div>
 <p className="mb-2 mt-5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Pack it up — {d.unsold.count} left · {money(d.unsold.valueCents)}</p>
 <div className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
 {d.unsold.items.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-stone-400">Everything sold. 🎉</p>}
 {d.unsold.items.map((i) => <div key={i.id} className="flex items-center gap-3 px-3 py-2.5"><Thumb src={i.image} alt="" size={36} /><span className="min-w-0 flex-1 truncate text-[13.5px] text-stone-900">{i.title}</span><span className="text-[14px] font-semibold">{money(i.priceCents, i.currency)}</span></div>)}
 </div>
 <div className="mt-6 grid grid-cols-2 gap-2">
 <button onClick={() => window.print()} className="min-h-[48px] rounded-2xl border border-stone-200 bg-white text-[14px] font-semibold text-stone-800">Print / save PDF</button>
 <BigLink href={href(B)} variant="secondary" className="min-h-[48px] text-[14px]">Market home</BigLink>
 </div>
 </>
 )}
 </MarketPage>
 );
}

export default function SummaryPage() {
 return <Suspense fallback={null}><SummaryInner /></Suspense>;
}
