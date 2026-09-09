"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { Card, PageHeader, Badge, Stat, EmptyState } from "../ui";
import { useStoreBase } from "../nav-base";
import { toCsv, downloadCsv, datedFilename } from "@/app/lib/csv-export";
import { groupIntoParcels, parcelsToPost, type Parcel } from "@/app/lib/parcels-core";
import { formatPriceCents } from "@/app/lib/formatPrice";
import { shipFromGate, type ShipFromGate } from "@/app/lib/setup-gate-core";

/** Admin preview (?store=slug) must reach the API too, or a preview would read YOUR store. */
function withStore(path: string): string {
 if (typeof window === "undefined") return path;
 const s = new URLSearchParams(window.location.search).get("store");
 return s ? `${path}${path.includes("?") ? "&" : "?"}store=${encodeURIComponent(s)}` : path;
}

type Order = {
 id: string;
 orderNo: number;
 itemTitle: string | null;
 amountCents: number;
 taxCents: number | null;
 currency: string;
 buyerEmail: string | null;
 status: string;
 paidAt: string | null;
 /** "pickup" = collected in store: no label to print. Absent on orders placed before collection existed. */
 deliveryMethod?: "ship" | "pickup";
 /** The payment every piece bought together shares — what makes three orders one parcel. */
 paymentIntent?: string | null;
 labelUrl?: string | null;
 trackingNumber?: string | null;
 trackingUrl?: string | null;
};

type ImportedOrder = {
 id: number;
 externalId: string | null;
 orderDate: string | null;
 buyerName: string | null;
 buyerEmail: string | null;
 itemTitle: string | null;
 amountCents: number;
 currency: string;
 status: string | null;
};

// Fulfillment progression reads at a glance: delivered = done (green), shipped = in transit (blue),
// paid = money in but still needs shipping (amber = your move), refunded/cancelled = grey.
function tone(status: string): "success" | "warning" | "neutral" | "info" {
 const s = (status || "").toLowerCase();
 if (s.includes("deliver") || s.includes("complete")) return "success";
 if (s.includes("ship") || s.includes("fulfill")) return "info";
 if (s.includes("refund") || s.includes("cancel")) return "neutral";
 if (s.includes("paid") || s.includes("pend") || s.includes("process") || s.includes("unfulfill")) return "warning";
 return "info";
}

// Friendlier label — "paid" alone doesn't tell the seller it still needs shipping.
function statusLabel(status: string): string {
 const s = (status || "").toLowerCase();
 if (s === "paid") return "needs shipping";
 return status;
}

// Display an order's per-store sequence number as a real order # (starts at 1001 so it reads like
// an established counter, not test data). The number itself is meaningful: 1 = the store's first sale.
export function fmtOrderNo(n: number): string {
 return "#" + (1000 + n);
}

export default function OrdersPage() {
 const router = useRouter();
 const base = useStoreBase();
 const [loading, setLoading] = useState(true);
 const [authErr, setAuthErr] = useState<string | null>(null);
 const [orders, setOrders] = useState<Order[]>([]);
 const [imported, setImported] = useState<ImportedOrder[]>([]);
 const [importOpen, setImportOpen] = useState(false);
 // ?delivery=pickup — Home's "collections waiting" row lands on the orders someone is coming in
 // for. Read once from the URL; "Show all" clears it like any other filter.
 const [pickupOnly, setPickupOnly] = useState(false);
 const [busyKey, setBusyKey] = useState<string | null>(null);
 const [actErr, setActErr] = useState<string | null>(null);
 // Option J: a label cannot be bought without a ship-from address (orders/[id] refuses), so when
 // there are parcels to post and no address, this page says so — and only then.
 const [gate, setGate] = useState<ShipFromGate | null>(null);
 useEffect(() => {
 if (new URLSearchParams(window.location.search).get("delivery") === "pickup") void Promise.resolve().then(() => setPickupOnly(true));
 let live = true;
 fetch(withStore("/api/store/onboarding-status")).then((r) => (r.ok ? r.json() : null)).then((d) => { if (live) setGate(shipFromGate(d?.setup)); }).catch(() => {});
 return () => { live = false; };
 }, []);

 // One button for the whole bag: every piece flips together on the server (orders/parcel route),
 // and the buyer gets one tracking email listing all of them.
 async function actOnParcel(p: Parcel<Order>, action: "posted" | "delivered" | "collected") {
 setBusyKey(p.key); setActErr(null);
 try {
 const r = await fetch("/api/store/orders/parcel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderIds: p.orders.map((o) => o.id), action }) });
 const d = await r.json().catch(() => ({}));
 if (!r.ok) { setActErr(d.error || "Couldn’t update that parcel."); return; }
 await load();
 } catch { setActErr("Couldn’t update that parcel."); }
 finally { setBusyKey(null); }
 }

 async function load() {
 try {
 const r = await fetch("/api/store/orders");
 if (!r.ok) {
 setAuthErr(r.status === 401 ? "Sign in as your store to see orders." : "Couldn’t load orders.");
 setLoading(false);
 return;
 }
 const d = await r.json();
 setOrders(d.orders || []);
 setImported(d.imported || []);
 } catch {
 setAuthErr("Couldn’t load orders.");
 }
 setLoading(false);
 }
 useEffect(() => { load(); }, []);

 if (loading) return <div className="flex items-center justify-center py-32 text-sm text-stone-400">Loading…</div>;
 if (authErr) return <div className="flex items-center justify-center py-32 text-sm text-stone-500">{authErr}</div>;

 const revenue = orders.reduce((a, o) => a + (o.amountCents || 0), 0);
 const aov = orders.length ? revenue / orders.length : 0;
 const currency = orders[0]?.currency || imported[0]?.currency || "USD";
 // Parcels, not pieces (parcels-core.ts): a buyer who took three things is one row, one label, one
 // Mark posted — and "to ship" counts bags on her table, not lines on a list.
 const parcels = groupIntoParcels(orders);
 const toPost = parcelsToPost(parcels).length;
 const shown = pickupOnly ? parcels.filter((p) => p.deliveryMethod === "pickup" && p.status === "paid") : parcels;

 // Both sources in one file — a seller doing their books wants every sale of the
 // year, not the ones that happened to come through the storefront.
 function exportCsv() {
  const rows = [
   ...orders.map((o) => [o.orderNo, o.paidAt ? o.paidAt.slice(0, 10) : "", o.itemTitle ?? "", o.buyerEmail ?? "", (o.amountCents / 100).toFixed(2), o.taxCents != null ? (o.taxCents / 100).toFixed(2) : "", o.currency, o.status, "storefront"]),
   ...imported.map((o) => [o.externalId ?? "", o.orderDate ? o.orderDate.slice(0, 10) : "", o.itemTitle ?? "", o.buyerEmail ?? "", (o.amountCents / 100).toFixed(2), "", o.currency, o.status ?? "", "imported"]),
  ];
  downloadCsv(datedFilename("orders"), toCsv(["order", "date", "item", "buyer", "amount", "tax", "currency", "status", "source"], rows));
 }

 return (
 <div className="mx-auto max-w-6xl px-6 py-10 sm:px-8">
 <div className="mb-6 flex items-start justify-between gap-4">
 <PageHeader title="Orders" subtitle="Sales from your storefront. Payouts settle to your bank automatically." />
 <div className="mt-1 flex shrink-0 gap-2">
 <button onClick={exportCsv} disabled={orders.length === 0 && imported.length === 0} className="rounded-full border border-stone-200 px-4 py-2 text-[13px] text-stone-700 transition hover:border-stone-400 disabled:opacity-40">Export</button>
 <button onClick={() => setImportOpen(true)} className="rounded-full border border-stone-200 px-4 py-2 text-[13px] text-stone-700 transition hover:border-stone-400">Import history</button>
 </div>
 </div>

 {importOpen && <OrderImportModal onClose={() => { setImportOpen(false); load(); }} />}

 {orders.length > 0 && (
 <div className="mb-6 grid grid-cols-4 gap-3">
 <Stat label="Packages to ship" value={toPost} />
 <Stat label="Orders" value={orders.length} />
 <Stat label="Revenue" value={formatPriceCents(Math.round(revenue / 100) * 100, currency)} />
 <Stat label="Avg. order" value={formatPriceCents(Math.round(aov / 100) * 100, currency)} />
 </div>
 )}
 {gate && toPost > 0 && (
 <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900" data-testid="ship-from-gate">
 <span><b className="font-semibold">Labels can’t be bought yet.</b> Add the address you ship from.</span>
 <a href={withStore(gate.href)} className="ml-auto rounded-full bg-[var(--accent,#0e9f76)] px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-[var(--accent-hover,#0b8a66)]">{gate.verb}</a>
 </div>
 )}
 {actErr && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700" role="alert">{actErr}</div>}

 {orders.length === 0 && imported.length === 0 ? (
 <EmptyState icon={<ShoppingBag size={28} strokeWidth={1.5} />} title="No orders yet" body="When a buyer checks out on your storefront, the order shows up here — or import your past orders with “Import history”." />
 ) : orders.length > 0 ? (
 <Card className="overflow-hidden">
 {pickupOnly && (
 <div className="flex items-center justify-between gap-3 border-b border-stone-100 bg-amber-50/60 px-5 py-2.5 text-[12.5px] text-amber-900">
 <span>{shown.length === 0 ? "No collections waiting." : `Showing ${shown.length} ${shown.length === 1 ? "collection" : "collections"} waiting to be handed over.`}</span>
 <button type="button" onClick={() => setPickupOnly(false)} className="font-medium underline underline-offset-2">Show all orders</button>
 </div>
 )}
 <div className="overflow-x-auto">
 <table className="w-full text-[13px]">
 <thead>
 <tr className="border-b border-stone-100 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-stone-400">
 <th className="px-5 py-2.5 font-medium">Order</th>
 <th className="px-5 py-2.5 font-medium">Item</th>
 <th className="px-5 py-2.5 font-medium">Customer</th>
 <th className="px-5 py-2.5 font-medium">Date</th>
 <th className="px-5 py-2.5 font-medium">Status</th>
 <th className="px-5 py-2.5 text-right font-medium">Amount</th>
 <th className="px-5 py-2.5" />
 </tr>
 </thead>
 <tbody className="divide-y divide-stone-100">
 {shown.map((p) => {
 const first = p.orders[0];
 const multi = p.pieces > 1;
 const pickup = p.deliveryMethod === "pickup";
 const busy = busyKey === p.key;
 return (
 <tr key={p.key} data-testid="parcel-row" data-pieces={p.pieces} onClick={() => router.push(`${base}/orders/${first.id}`)} className="cursor-pointer transition hover:bg-stone-50">
 <td className="whitespace-nowrap px-5 py-3 font-mono text-[12px] tabular-nums text-stone-500">
 {fmtOrderNo(first.orderNo)}{multi && <span className="ml-1 text-stone-400">+{p.pieces - 1}</span>}
 </td>
 <td className="max-w-[300px] px-5 py-3 font-medium text-stone-900">
 {multi ? (
 <>
 <span className="mb-1 block text-[11px] font-normal uppercase tracking-[0.06em] text-stone-400">{p.pieces} pieces · one parcel</span>
 <ul className="space-y-0.5">{p.orders.map((o) => <li key={o.id} className="truncate">{o.itemTitle || "Item"}</li>)}</ul>
 </>
 ) : <span className="block truncate">{first.itemTitle || "Item"}</span>}
 </td>
 <td className="px-5 py-3 text-stone-600">{p.buyerEmail || "—"}</td>
 <td className="px-5 py-3 tabular-nums text-stone-500">{p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "—"}</td>
 {/* "needs shipping" is a lie for a collection — nothing is being posted. */}
 <td className="px-5 py-3">
 <Badge tone={tone(p.status)} dot>{pickup && p.status === "paid" ? "awaiting collection" : statusLabel(p.status)}</Badge>
 {pickup && <span className="ml-1.5 align-middle text-[11px] text-stone-400">collection</span>}
 </td>
 <td className="px-5 py-3 text-right font-medium tabular-nums text-stone-900">{formatPriceCents(p.amountCents, p.currency || currency)}</td>
 <td className="whitespace-nowrap px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
 {p.status === "paid" && !pickup && (
 <span className="inline-flex items-center gap-2">
 {p.labelUrl
 ? <a href={p.labelUrl} target="_blank" rel="noreferrer" className="rounded-full border border-stone-200 px-3 py-1 text-[12px] text-stone-700 hover:border-stone-400">Print label</a>
 : <button type="button" onClick={() => router.push(`${base}/orders/${first.id}`)} className="rounded-full border border-stone-200 px-3 py-1 text-[12px] text-stone-700 hover:border-stone-400">Buy label</button>}
 <button type="button" disabled={busy} onClick={() => actOnParcel(p, "posted")} className="rounded-full bg-stone-900 px-3 py-1 text-[12px] font-medium text-white hover:bg-stone-800 disabled:opacity-40">{busy ? "…" : "Mark posted"}</button>
 </span>
 )}
 {p.status === "paid" && pickup && (
 <button type="button" disabled={busy} onClick={() => actOnParcel(p, "collected")} className="rounded-full bg-stone-900 px-3 py-1 text-[12px] font-medium text-white hover:bg-stone-800 disabled:opacity-40">{busy ? "…" : "Mark collected"}</button>
 )}
 {p.status === "shipped" && (
 <button type="button" disabled={busy} onClick={() => actOnParcel(p, "delivered")} className="rounded-full border border-stone-200 px-3 py-1 text-[12px] text-stone-700 hover:border-stone-400 disabled:opacity-40">{busy ? "…" : "Mark delivered"}</button>
 )}
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 </Card>
 ) : null}

 {imported.length > 0 && (
 <div className="mt-8">
 <div className="mb-2 flex items-baseline justify-between">
 <h2 className="text-[13px] font-semibold text-stone-900">Past orders <span className="font-normal text-stone-400">· imported history</span></h2>
 <span className="text-[12px] text-stone-400">{imported.length} order{imported.length === 1 ? "" : "s"}</span>
 </div>
 <Card className="overflow-hidden">
 <div className="overflow-x-auto">
 <table className="w-full text-[13px]">
 <thead>
 <tr className="border-b border-stone-100 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-stone-400">
 <th className="px-5 py-2.5 font-medium">Order</th>
 <th className="px-5 py-2.5 font-medium">Item</th>
 <th className="px-5 py-2.5 font-medium">Customer</th>
 <th className="px-5 py-2.5 font-medium">Date</th>
 <th className="px-5 py-2.5 text-right font-medium">Amount</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-stone-100">
 {imported.map((o) => (
 <tr key={o.id} className="text-stone-600">
 <td className="whitespace-nowrap px-5 py-3 font-mono text-[12px] tabular-nums text-stone-400">{o.externalId || "—"}</td>
 <td className="max-w-[260px] truncate px-5 py-3 font-medium text-stone-800">{o.itemTitle || "—"}</td>
 <td className="px-5 py-3">{o.buyerEmail || o.buyerName || "—"}</td>
 <td className="px-5 py-3 tabular-nums text-stone-500">{o.orderDate ? new Date(o.orderDate).toLocaleDateString() : "—"}</td>
 <td className="px-5 py-3 text-right font-medium tabular-nums text-stone-800">{formatPriceCents(o.amountCents, o.currency || currency)}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </Card>
 </div>
 )}
 </div>
 );
}

// ── Import historical orders ─────────────────────────────────────────────────
// Bring a store's past Shopify/Square orders over for accounting + LTV. Stored apart
// from live orders (no item FK, never touches payouts). Shopify's multi-row orders are
// grouped by order id server-side.
function OrderImportModal({ onClose }: { onClose: () => void }) {
 const [csv, setCsv] = useState("");
 const [busy, setBusy] = useState(false);
 const [msg, setMsg] = useState<string | null>(null);
 const fileRef = useRef<HTMLInputElement>(null);

 async function run() {
 if (!csv.trim()) { setMsg("Paste or upload your order history first."); return; }
 setBusy(true); setMsg(null);
 try {
 const r = await fetch("/api/store/orders/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv }) });
 const d = await r.json();
 if (!r.ok) { setMsg(d.error || "Couldn’t read that file."); return; }
 setMsg(`✓ Imported ${d.added} of ${d.found} order${d.found === 1 ? "" : "s"}. They’re in your Past orders below.`);
 setCsv("");
 } catch { setMsg("Something went wrong."); } finally { setBusy(false); }
 }

 return (
 <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
 <div className="fixed inset-0 bg-black/40" onClick={onClose} />
 <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
 <div className="mb-4 flex items-start justify-between">
 <div>
 <h2 className="text-base font-semibold text-stone-900">Import order history</h2>
 <p className="mt-0.5 text-[12px] text-stone-500">Export your orders from Shopify/Square (or any spreadsheet) and drop the CSV here. Kept separate from your live sales — for your records, LTV, and repeat customers.</p>
 </div>
 <button onClick={onClose} className="text-stone-400 hover:text-stone-700">✕</button>
 </div>
 <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
 <button type="button" onClick={() => fileRef.current?.click()} className="mb-3 w-full rounded-lg border border-dashed border-stone-300 py-2.5 text-[13px] text-stone-500 hover:border-stone-400 hover:text-stone-700">Choose your orders CSV…</button>
 <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={5} placeholder="…or paste your rows here (order #, date, customer email, item, total)" className="w-full resize-none rounded-lg border border-stone-200 p-3 text-[12px] text-stone-800 outline-none focus:border-[var(--accent,#0e9f76)]" />
 <button disabled={busy || !csv.trim()} onClick={run} className="mt-3 w-full rounded-lg bg-stone-900 py-2.5 text-[13px] font-medium text-white transition hover:bg-stone-800 disabled:opacity-40">{busy ? "Importing…" : "Import orders"}</button>
 {msg && <p className="mt-4 rounded-lg bg-stone-50 px-3 py-2 text-[13px] text-stone-700">{msg}</p>}
 </div>
 </div>
 );
}
