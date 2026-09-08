"use client";

import { Suspense, useEffect, useState } from "react";
import { B, MarketPage, Notice, Stat, Thumb, api, money } from "../ui";
import { ConfirmDialog } from "../../ui";
import { describeVoid } from "@/app/lib/market/void-core";

type Order = { id: string; itemId: string; itemTitle: string | null; itemImage: string | null; amountCents: number; currency: string; status: string; tender: string | null; paidAt: string | null; stripePaymentIntent?: string | null };
type Resp = { session: { name: string }; orders: Order[]; summary: { count: number; grossCents: number; avgCents: number; refundedCount: number } };

function SalesInner() {
 const [data, setData] = useState<Resp | null>(null);
 const [err, setErr] = useState<string | null>(null);
 // Void: the customer changed their mind at the stall. Confirmed in-page, never a browser dialog.
 const [voiding, setVoiding] = useState<Order | null>(null);
 const [voidBusy, setVoidBusy] = useState(false);
 const [voided, setVoided] = useState<Set<string>>(new Set());
 const load = () => api<Resp>("/api/store/market/sales").then((r) => (r.ok ? setData(r.data) : setErr(r.data.error || "Couldn't load")));
 useEffect(() => { load(); }, []);
 async function voidSale() {
 if (!voiding) return;
 setVoidBusy(true); setErr(null);
 const r = await api<{ ok: boolean; voided?: boolean; alreadyVoided?: boolean }>(`/api/store/market/sales/${voiding.id}/void`, { method: "POST", body: "{}" });
 setVoidBusy(false);
 if (!r.ok) { setErr(r.data.error || "Couldn't void that sale."); setVoiding(null); return; }
 setVoided((v) => new Set(v).add(voiding.id));
 setVoiding(null);
 load();
 }
 const kindOf = (o: Order): "cash" | "card" => (o.tender === "cash" ? "cash" : "card");

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
 <p className="text-[12px] text-stone-500">{o.paidAt ? new Date(o.paidAt).toLocaleTimeString([], { timeStyle: "short" }) : ""} · {o.tender === "cash" ? "Cash" : "Card"}{o.status === "refunded" || voided.has(o.id) ? " · Voided · back on the rack" : ""}</p>
 </div>
 <div className="text-right">
 <p className="text-[16px] font-semibold text-stone-900">{money(o.amountCents, o.currency)}</p>
 {o.status !== "refunded" && o.status !== "cancelled" && !voided.has(o.id) && (
 <button type="button" onClick={() => setVoiding(o)} className="mt-0.5 text-[12px] font-semibold text-stone-500 underline-offset-2 hover:text-stone-900 hover:underline">Void</button>
 )}
 </div>
 </div>
 ))}
 </div>
 <ConfirmDialog
 open={!!voiding}
 title={voiding ? `Void ${voiding.itemTitle ?? "this sale"}?` : "Void"}
 body={voiding ? describeVoid({ kind: kindOf(voiding), amountCents: voiding.amountCents, currency: voiding.currency }) : null}
 confirmLabel={voidBusy ? "Voiding…" : "Void sale"}
 cancelLabel="Keep it"
 busy={voidBusy}
 onConfirm={voidSale}
 onCancel={() => { if (!voidBusy) setVoiding(null); }}
 />
 </MarketPage>
 );
}

export default function SalesPage() {
 return <Suspense fallback={null}><SalesInner /></Suspense>;
}
