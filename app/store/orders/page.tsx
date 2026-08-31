"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { Card, PageHeader, Badge, Stat, EmptyState } from "../ui";
import { useStoreBase } from "../nav-base";

type Order = {
 id: string;
 orderNo: number;
 itemTitle: string | null;
 amountCents: number;
 currency: string;
 buyerEmail: string | null;
 status: string;
 paidAt: string | null;
 /** "pickup" = collected in store: no label to print. Absent on orders placed before collection existed. */
 deliveryMethod?: "ship" | "pickup";
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

 return (
 <div className="mx-auto max-w-6xl px-6 py-10 sm:px-8">
 <div className="mb-6 flex items-start justify-between gap-4">
 <PageHeader title="Orders" subtitle="Sales from your storefront. Payouts settle to your bank automatically." />
 <button onClick={() => setImportOpen(true)} className="mt-1 shrink-0 rounded-full border border-stone-200 px-4 py-2 text-[13px] text-stone-700 transition hover:border-stone-400">Import history</button>
 </div>

 {importOpen && <OrderImportModal onClose={() => { setImportOpen(false); load(); }} />}

 {orders.length > 0 && (
 <div className="mb-6 grid grid-cols-3 gap-3">
 <Stat label="Orders" value={orders.length} />
 <Stat label="Revenue" value={`$${(revenue / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
 <Stat label="Avg. order" value={`$${(aov / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
 </div>
 )}

 {orders.length === 0 && imported.length === 0 ? (
 <EmptyState icon={<ShoppingBag size={28} strokeWidth={1.5} />} title="No orders yet" body="When a buyer checks out on your storefront, the order shows up here — or import your past orders with “Import history”." />
 ) : orders.length > 0 ? (
 <Card className="overflow-hidden">
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
 </tr>
 </thead>
 <tbody className="divide-y divide-stone-100">
 {orders.map((o) => (
 <tr key={o.id} onClick={() => router.push(`${base}/orders/${o.id}`)} className="cursor-pointer transition hover:bg-stone-50">
 <td className="whitespace-nowrap px-5 py-3 font-mono text-[12px] tabular-nums text-stone-500">{fmtOrderNo(o.orderNo)}</td>
 <td className="max-w-[260px] truncate px-5 py-3 font-medium text-stone-900">{o.itemTitle || "Item"}</td>
 <td className="px-5 py-3 text-stone-600">{o.buyerEmail || "—"}</td>
 <td className="px-5 py-3 tabular-nums text-stone-500">{o.paidAt ? new Date(o.paidAt).toLocaleDateString() : "—"}</td>
 {/* "needs shipping" is a lie for a collection — nothing is being posted. */}
 <td className="px-5 py-3">
 <Badge tone={tone(o.status)} dot>{o.deliveryMethod === "pickup" && o.status === "paid" ? "awaiting collection" : statusLabel(o.status)}</Badge>
 {o.deliveryMethod === "pickup" && <span className="ml-1.5 align-middle text-[11px] text-stone-400">collection</span>}
 </td>
 <td className="px-5 py-3 text-right font-medium tabular-nums text-stone-900">${(o.amountCents / 100).toFixed(2)}</td>
 </tr>
 ))}
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
 <td className="px-5 py-3 text-right font-medium tabular-nums text-stone-800">${(o.amountCents / 100).toFixed(2)}</td>
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
