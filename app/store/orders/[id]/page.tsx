"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, Badge, Button } from "../../ui";
import { useStoreBase } from "../../nav-base";
import { fmtOrderNo } from "../page";

type Order = {
 id: string;
 orderNo: number;
 status: string;
 amountCents: number;
 feeCents: number | null;
 shippingPaidCents: number | null;
 currency: string;
 buyerEmail: string | null;
 buyerName: string | null;
 buyerPhone: string | null;
 shipLine1: string | null; shipLine2: string | null; shipCity: string | null;
 shipState: string | null; shipPostal: string | null; shipCountry: string | null;
 paidAt: string | null;
 itemTitle: string | null;
 itemImages: string[] | null;
 labelUrl: string | null;
 trackingNumber: string | null;
 trackingUrl: string | null;
};

const STATUS_LABEL: Record<string, string> = { paid: "Paid", shipped: "Shipped", delivered: "Delivered", refunded: "Refunded" };
const STATUS_TONE: Record<string, "success" | "info" | "neutral"> = { paid: "success", shipped: "info", delivered: "success", refunded: "neutral" };

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
 return (
 <div className="flex justify-between py-1">
 <span className={muted ? "text-stone-500" : strong ? "font-semibold text-stone-900" : "text-stone-500"}>{label}</span>
 <span className={strong ? "font-semibold tabular-nums text-stone-900" : "tabular-nums text-stone-700"}>{value}</span>
 </div>
 );
}

export default function OrderDetailPage() {
 const { id } = useParams<{ id: string }>();
 const base = useStoreBase();
 const [order, setOrder] = useState<Order | null>(null);
 const [stripeFee, setStripeFee] = useState(0);
 const [loading, setLoading] = useState(true);
 const [err, setErr] = useState<string | null>(null);
 const [busy, setBusy] = useState(false);
 const [reloadKey, setReloadKey] = useState(0);
 const [quote, setQuote] = useState<{ costCents: number; provider: string; service: string; rateId: string; estDays: number | null; sellerPays: boolean } | null>(null);
 const [labelMsg, setLabelMsg] = useState<string | null>(null);
 const [labelBusy, setLabelBusy] = useState(false);

 useEffect(() => {
 let cancelled = false;
 (async () => {
 try {
 const r = await fetch(`/api/store/orders/${id}`);
 if (!r.ok) {
 if (!cancelled) { setErr(r.status === 401 ? "Sign in as your store to view this order." : "Order not found."); setLoading(false); }
 return;
 }
 const d = await r.json();
 if (!cancelled) { setOrder(d.order); setStripeFee(d.stripeFeeCents || 0); setLoading(false); }
 } catch {
 if (!cancelled) { setErr("Couldn’t load the order."); setLoading(false); }
 }
 })();
 return () => { cancelled = true; };
 }, [id, reloadKey]);

 async function setStatus(status: string) {
 if (status === "refunded" && !window.confirm("Refund this order? The buyer is refunded, VYA's fee is reversed, and the item relists.")) return;
 setBusy(true);
 await fetch(`/api/store/orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }).catch(() => {});
 setReloadKey((k) => k + 1);
 setBusy(false);
 }

 // Mark shipped via the label action so the buyer gets their tracking email (the generic status
 // update doesn't send it). Works whether the label was auto-generated or bought manually.
 async function markShipped() {
 setBusy(true);
 await fetch(`/api/store/orders/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_shipped" }) }).catch(() => {});
 setReloadKey((k) => k + 1);
 setBusy(false);
 }

 async function getQuote() {
 setLabelBusy(true); setLabelMsg(null); setQuote(null);
 try {
 const r = await fetch(`/api/store/orders/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "label_quote" }) });
 const d = await r.json();
 if (!r.ok) setLabelMsg(d.error || "Couldn’t get a rate.");
 else setQuote(d.rate ? { ...d.rate, sellerPays: d.sellerPays } : null);
 } catch { setLabelMsg("Couldn’t get a rate."); }
 setLabelBusy(false);
 }

 async function buyLabelNow() {
 if (!quote) return;
 setLabelBusy(true); setLabelMsg(null);
 try {
 const r = await fetch(`/api/store/orders/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "buy_label", rateId: quote.rateId }) });
 const d = await r.json();
 if (!r.ok) setLabelMsg(d.error || "Couldn’t buy the label.");
 else { setQuote(null); setReloadKey((k) => k + 1); }
 } catch { setLabelMsg("Couldn’t buy the label."); }
 setLabelBusy(false);
 }

 const money = (c: number, cur: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD" }).format((c || 0) / 100);

 if (loading) return <div className="flex items-center justify-center py-32 text-sm text-stone-400">Loading…</div>;
 if (err || !order) return <div className="flex items-center justify-center py-32 text-sm text-stone-500">{err || "Order not found."}</div>;

 const cur = order.currency;
 const fee = order.feeCents ?? 0;
 const shipPaid = order.shippingPaidCents ?? 0;
 const gross = order.amountCents + shipPaid;
 const payout = order.amountCents - stripeFee - fee;
 const img = order.itemImages?.[0] || null;
 const addrLines = [order.buyerName, order.shipLine1, order.shipLine2, [order.shipCity, order.shipState, order.shipPostal].filter(Boolean).join(", "), order.shipCountry].filter(Boolean) as string[];

 return (
 <div className="mx-auto max-w-4xl px-6 py-10 sm:px-8">
 <Link href={`${base}/orders`} className="text-[13px] text-stone-500 transition hover:text-stone-900">← All orders</Link>
 <div className="mb-7 mt-3 flex items-center gap-3">
 <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-stone-900">Order <span className="font-mono text-[18px] tabular-nums text-stone-400">{fmtOrderNo(order.orderNo)}</span></h1>
 <Badge tone={STATUS_TONE[order.status] || "neutral"} dot>{STATUS_LABEL[order.status] || order.status}</Badge>
 {order.paidAt && <span className="text-[13px] text-stone-400">{new Date(order.paidAt).toLocaleString()}</span>}
 </div>

 <div className="grid gap-5 lg:grid-cols-3">
 {/* Main column */}
 <div className="space-y-5 lg:col-span-2">
 {/* Item */}
 <Card>
 <CardHeader title="Item" />
 <div className="flex items-center gap-4 px-5 py-4">
 <div className="h-20 w-16 shrink-0 overflow-hidden rounded-md bg-stone-100 ring-1 ring-stone-200">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 {img && <img src={img} alt="" className="h-full w-full object-cover" />}
 </div>
 <div className="min-w-0">
 <p className="text-[15px] font-medium text-stone-900">{order.itemTitle || "Item"}</p>
 <p className="mt-1 text-[13px] tabular-nums text-stone-500">{money(order.amountCents, cur)}</p>
 </div>
 </div>
 </Card>

 {/* Fulfillment */}
 <Card>
 <CardHeader title="Fulfillment" />
 <div className="px-5 py-4">
 {order.labelUrl ? (
 <div className="mb-4">
 {order.status !== "shipped" && order.status !== "delivered" && <p className="mb-2 text-[13px] text-stone-600">✓ Prepaid label ready — print it, drop off, then <b>Mark shipped</b>.</p>}
 <a href={order.labelUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-md bg-[#5D0F17] px-4 text-[13px] font-medium text-white transition hover:bg-[#4a0c12]">Print label ↗</a>
 {order.trackingNumber && <p className="mt-2.5 text-[13px] text-stone-500">Tracking: {order.trackingUrl ? <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-[#5D0F17] underline">{order.trackingNumber}</a> : order.trackingNumber}</p>}
 </div>
 ) : quote ? (
 <div className="mb-4 rounded-lg border border-stone-200 bg-stone-50 p-4">
 <p className="text-[13px] text-stone-700">{quote.provider} {quote.service}{quote.sellerPays ? <> — <b className="text-stone-900">{money(quote.costCents, cur)}</b></> : ""}{quote.estDays ? ` · ~${quote.estDays}d` : ""}</p>
 <p className="mt-1 text-xs text-stone-500">{quote.sellerPays ? "This label cost will be charged to your card on file." : "The buyer already paid shipping — no charge to you."}</p>
 <div className="mt-3 flex gap-2">
 <Button size="sm" onClick={buyLabelNow} disabled={labelBusy}>{labelBusy ? (quote.sellerPays ? "Buying…" : "Generating…") : (quote.sellerPays ? `Buy label — ${money(quote.costCents, cur)}` : "Generate prepaid label")}</Button>
 <Button size="sm" variant="ghost" onClick={() => setQuote(null)}>Cancel</Button>
 </div>
 </div>
 ) : (
 <Button className="mb-4 w-full" onClick={getQuote} disabled={labelBusy}>{labelBusy ? "Getting rate…" : "Get shipping label"}</Button>
 )}
 {labelMsg && <p className="mb-3 text-xs text-red-600">{labelMsg}</p>}
 <div className="flex flex-wrap gap-2">
 {order.status === "paid" && <Button size="sm" variant="secondary" onClick={markShipped} disabled={busy}>Mark shipped</Button>}
 {order.status === "shipped" && <Button size="sm" variant="secondary" onClick={() => setStatus("delivered")} disabled={busy}>Mark delivered</Button>}
 {order.status !== "refunded" && <Button size="sm" variant="danger" onClick={() => setStatus("refunded")} disabled={busy}>Refund order</Button>}
 </div>
 </div>
 </Card>
 </div>

 {/* Sidebar */}
 <div className="space-y-5">
 {/* Payment summary */}
 <Card>
 <CardHeader title="Payment" />
 <div className="px-5 py-4 text-[13px]">
 <Row label="Item" value={money(order.amountCents, cur)} />
 {shipPaid > 0 && <Row label="Shipping (buyer paid)" value={money(shipPaid, cur)} />}
 <div className="mt-1 border-t border-stone-100 pt-2"><Row label="Buyer paid" value={money(gross, cur)} strong /></div>
 <Row label={`Stripe fee${stripeFee === 0 ? "*" : ""}`} value={`−${money(stripeFee, cur)}`} muted />
 <Row label="VYA commission (1%)" value={`−${money(fee, cur)}`} muted />
 {shipPaid > 0 && <Row label="Shipping → label" value={`−${money(shipPaid, cur)}`} muted />}
 <div className="mt-1 border-t border-stone-100 pt-2"><Row label="Your payout" value={money(payout, cur)} strong /></div>
 {stripeFee === 0 && <p className="mt-2 text-[11px] text-stone-400">*Stripe’s ≈2.9% + 30¢ fee settles directly and appears here once the charge clears.</p>}
 </div>
 </Card>

 {/* Customer */}
 <Card>
 <CardHeader title="Customer" />
 <div className="px-5 py-4">
 <p className="text-[13px] leading-relaxed text-stone-700">{addrLines.length ? addrLines.map((l, i) => <span key={i}>{l}<br /></span>) : "—"}</p>
 <div className="mt-3 space-y-1 text-[13px] text-stone-500">
 {order.buyerEmail && <p className="truncate">{order.buyerEmail}</p>}
 {order.buyerPhone && <p>{order.buyerPhone}</p>}
 </div>
 </div>
 </Card>
 </div>
 </div>
 </div>
 );
}
