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
 internalNote: string | null;
 // Delivered or collected in store. Absent on every order placed before collection existed — those
 // are deliveries, so anything but "pickup" reads as one.
 deliveryMethod?: "ship" | "pickup";
 collectFrom?: string | null;
 instructions?: string | null;
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
 // The seller's private note. Local state so typing stays responsive; it writes
 // on blur, because an order note isn't worth a request per keystroke.
 const [note, setNote] = useState("");
 const [noteSaved, setNoteSaved] = useState(false);
 const [retBusy, setRetBusy] = useState(false);
 const [retMsg, setRetMsg] = useState<string | null>(null);
 const [rejecting, setRejecting] = useState(false);
 const [rejNote, setRejNote] = useState("");
 const [rejPhotos, setRejPhotos] = useState<string[]>([]);
 const [rejShipBack, setRejShipBack] = useState(false);
 const [rejBusy, setRejBusy] = useState(false);
 const [rejMsg, setRejMsg] = useState<string | null>(null);

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
 if (!cancelled) { setOrder(d.order); setNote(d.order?.internalNote ?? ""); setStripeFee(d.stripeFeeCents || 0); setLoading(false); }
 } catch {
 if (!cancelled) { setErr("Couldn’t load the order."); setLoading(false); }
 }
 })();
 return () => { cancelled = true; };
 }, [id, reloadKey]);

 async function saveNote() {
  await fetch(`/api/store/orders/${id}`, {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ action: "set_note", note }),
  }).catch(() => {});
  setNoteSaved(true);
  setTimeout(() => setNoteSaved(false), 1500);
 }

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

 async function sendReturnLabel() {
 if (retBusy) return;
 setRetBusy(true); setRetMsg(null);
 try {
 const r = await fetch(`/api/store/orders/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "return_label" }) });
 const d = await r.json();
 if (!r.ok) setRetMsg(d.error || "Couldn’t create a return label.");
 else setRetMsg(`Return label emailed to the buyer${d.paidBy === "buyer" ? " (cost comes off their refund)" : ""}.`);
 } catch { setRetMsg("Couldn’t create a return label."); }
 setRetBusy(false);
 }

 async function uploadRejPhoto(file: File) {
 const fd = new FormData(); fd.append("file", file);
 const d = await fetch("/api/store/assets", { method: "POST", body: fd }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
 if (d?.url) setRejPhotos((p) => [...p, d.url]);
 }
 async function rejectReturn() {
 if (rejBusy) return;
 setRejBusy(true); setRejMsg(null);
 try {
 const r = await fetch(`/api/store/orders/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reject_return", note: rejNote.trim() || null, evidence: rejPhotos, shipBack: rejShipBack }) });
 const d = await r.json();
 if (r.ok) { setRejMsg(`Return rejected — the buyer was notified${d.shipBackUrl ? " and the item is on its way back" : ""}.`); setRejecting(false); }
 else setRejMsg(d.error || "Couldn’t reject the return.");
 } catch { setRejMsg("Couldn’t reject the return."); }
 setRejBusy(false);
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
 const isPickup = order.deliveryMethod === "pickup";

 return (
 <div className="mx-auto max-w-4xl px-6 py-10 sm:px-8">
 <Link href={`${base}/orders`} className="text-[13px] text-stone-500 transition hover:text-stone-900">← All orders</Link>
 <div className="mb-7 mt-3 flex items-center gap-3">
 <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-stone-900">Order <span className="font-mono text-[18px] tabular-nums text-stone-400">{fmtOrderNo(order.orderNo)}</span></h1>
 <Badge tone={STATUS_TONE[order.status] || "neutral"} dot>{STATUS_LABEL[order.status] || order.status}</Badge>
 {isPickup && <Badge tone="info">Collection</Badge>}
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
 <CardHeader title={isPickup ? "Collection" : "Fulfillment"} />
 <div className="px-5 py-4">
 {/* Private working note — the buyer never sees this. Sits above fulfilment
     because it applies whether the piece ships or is collected. */}
 <div className="mb-5 rounded-xl border border-stone-200 bg-white p-4">
  <div className="mb-2 flex items-baseline justify-between">
   <span className="text-[12px] font-medium text-stone-700">Your note</span>
   <span className="text-[11px] text-stone-400">{noteSaved ? "Saved" : "Only you can see this"}</span>
  </div>
  <textarea
   value={note}
   onChange={(e) => setNote(e.target.value)}
   onBlur={saveNote}
   rows={2}
   placeholder="Buyer asked to hold until the 12th · sent a replacement dust bag…"
   className="w-full resize-y rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none placeholder:text-stone-400 focus:border-stone-400"
  />
 </div>
 {isPickup ? (
 // Collected in store: no label, no tracking, nothing to post. Just hand it over.
 <div className="mb-4 rounded-lg border border-stone-200 bg-stone-50 p-4">
 <p className="text-[13px] font-medium text-stone-900">Collect in store — no label to print.</p>
 <p className="mt-1 text-[13px] text-stone-600">{order.buyerName || order.buyerEmail || "The buyer"} is picking this up{order.collectFrom ? <> at <b className="text-stone-900">{order.collectFrom}</b></> : null}. Mark it delivered when they’ve taken it.</p>
 {order.instructions && <p className="mt-1.5 text-xs text-stone-500">You told them: “{order.instructions}”</p>}
 </div>
 ) : order.labelUrl ? (
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
 {order.status === "paid" && !isPickup && <Button size="sm" variant="secondary" onClick={markShipped} disabled={busy}>Mark shipped</Button>}
 {order.status === "paid" && isPickup && <Button size="sm" variant="secondary" onClick={() => setStatus("delivered")} disabled={busy}>Mark collected</Button>}
 {order.status === "shipped" && <Button size="sm" variant="secondary" onClick={() => setStatus("delivered")} disabled={busy}>Mark delivered</Button>}
 {!isPickup && (order.status === "shipped" || order.status === "delivered") && <Button size="sm" variant="secondary" onClick={sendReturnLabel} disabled={retBusy}>{retBusy ? "Creating…" : "Send return label"}</Button>}
 {(order.status === "shipped" || order.status === "delivered") && !rejecting && <Button size="sm" variant="ghost" onClick={() => { setRejecting(true); setRejMsg(null); }}>Reject return</Button>}
 {order.status !== "refunded" && <Button size="sm" variant="danger" onClick={() => setStatus("refunded")} disabled={busy}>Refund order</Button>}
 </div>
 {retMsg && <p className="mt-2 text-xs text-stone-500">{retMsg}</p>}
 {rejecting && (
 <div className="mt-3 space-y-2 rounded-lg border border-stone-200 p-3">
 <p className="text-[13px] font-medium text-stone-700">Reject this return</p>
 <textarea value={rejNote} onChange={(e) => setRejNote(e.target.value)} rows={2} placeholder="Reason (shown to the buyer) — e.g. came back worn, or not the item that was sent" className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-[13px] outline-none focus:border-stone-400" />
 <div className="flex flex-wrap items-center gap-2">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 {rejPhotos.map((u, i) => <img key={i} src={u} alt="" className="h-12 w-12 rounded border border-stone-200 object-cover" />)}
 <label className="cursor-pointer text-[12px] text-stone-500 underline hover:text-stone-700">+ Add photo<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadRejPhoto(f); }} /></label>
 <span className="text-[11px] text-stone-400">Photos are kept as proof if the buyer disputes the charge.</span>
 </div>
 <label className="flex items-center gap-2 text-[13px] text-stone-600"><input type="checkbox" checked={rejShipBack} onChange={(e) => setRejShipBack(e.target.checked)} /> Ship the item back to the buyer</label>
 <div className="flex gap-2">
 <Button size="sm" variant="danger" onClick={rejectReturn} disabled={rejBusy}>{rejBusy ? "Rejecting…" : "Reject & notify buyer"}</Button>
 <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
 </div>
 </div>
 )}
 {rejMsg && <p className="mt-2 text-xs text-stone-500">{rejMsg}</p>}
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
 {/* A collection has no delivery address — say so, rather than showing a bare dash. */}
 {isPickup
 ? <p className="text-[13px] leading-relaxed text-stone-700">{order.buyerName || "—"}<br /><span className="text-stone-500">Collecting in store — no delivery address.</span></p>
 : <p className="text-[13px] leading-relaxed text-stone-700">{addrLines.length ? addrLines.map((l, i) => <span key={i}>{l}<br /></span>) : "—"}</p>}
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
