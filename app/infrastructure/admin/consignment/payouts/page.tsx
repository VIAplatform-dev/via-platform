"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPage, AdminHeader, TechCard, TechButton, TechEmpty, TH, TD } from "../../ui";

type Row = { id: number; name: string; method: string; portalToken: string | null; balanceCents: number; payableCents: number;
 // Owed for sales that happened on a marketplace, which paid the store directly.
 offPlatform?: { totalCents: number; byChannel: Record<string, number> };
 // Reserved by a bank debit that hasn't cleared yet — owed, but already on its way.
 inFlightCents?: number };
type Bank = { ready: boolean; bank: string | null; since: string | null };

const money = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const METHOD_LABEL: Record<string, string> = { stripe: "Direct deposit", store_credit: "Store credit", cash: "Cash", check: "Check", ach: "From your bank" };

export default function PayoutsPage() {
 const [rows, setRows] = useState<Row[]>([]);
 const [holdDays, setHoldDays] = useState(14);
 const [loading, setLoading] = useState(true);
 const [paying, setPaying] = useState<number | null>(null);
 const [copied, setCopied] = useState(false);
 const [err, setErr] = useState<string | null>(null);
 const [payMethod, setPayMethod] = useState<Record<number, string>>({});
 const [bank, setBank] = useState<Bank>({ ready: false, bank: null, since: null });
 const [note, setNote] = useState<string | null>(null);
 const [linking, setLinking] = useState(false);

 async function reload() {
 const r = await fetch("/api/store/consignment/payouts");
 const d = await r.json().catch(() => null);
 if (r.ok && d) { setRows(d.consignors || []); setHoldDays(d.holdDays ?? 14); if (d.bank) setBank(d.bank); }
 }
 useEffect(() => {
 fetch("/api/store/consignment/payouts").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { setRows(d.consignors || []); setHoldDays(d.holdDays ?? 14); if (d.bank) setBank(d.bank); } }).catch(() => {}).finally(() => setLoading(false));
 }, []);

 // Stripe hosts the bank-connect page; we only ever hold the mandate it hands back.
 async function connectBank() {
 setLinking(true); setErr(null);
 const r = await fetch("/api/store/consignment/bank", { method: "POST" });
 const d = await r.json().catch(() => null);
 setLinking(false);
 if (!r.ok || !d?.url) { setErr(d?.error || "Couldn't open the bank connection."); return; }
 window.location.href = d.url;
 }

 async function pay(id: number, method: string) {
 setPaying(id); setErr(null);
 const r = await fetch("/api/store/consignment/payouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consignorId: id, method }) });
 const d = await r.json().catch(() => null);
 setPaying(null);
 if (!r.ok) { setErr(d?.error || "Couldn't record the payout."); return; }
 // An ACH payout isn't done when the button stops spinning — it is days away, and saying so here
 // is the difference between a store waiting patiently and a store pressing Pay again.
 setNote(d?.message ?? null);
 reload();
 }
 function copyPortal() {
 const url = `${window.location.origin}/consignor`;
 navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
 }

 const totalPayable = rows.reduce((s, r) => s + r.payableCents, 0);

 return (
 <AdminPage>
 <div className="mb-1">
 <Link href="/admin/consignment" className="text-[12px] text-stone-400 hover:text-stone-700">← Consignment</Link>
 </div>
 <AdminHeader
 eyebrow="Sell · Consignment · Payouts"
 title="Payouts"
 subtitle={`What each consignor is owed, and what’s ready to pay now (sale credits older than your ${holdDays}-day return hold). Anything sold on eBay or Depop is owed too — those marketplaces paid you directly, so pay her yourself and record it as cash or a bank transfer.`}
 />

 <div className="flex items-center gap-3">
 <TechButton variant="secondary" className="px-3 py-1.5 text-[12.5px]" onClick={copyPortal}>{copied ? "Copied!" : "Copy consignor portal link"}</TechButton>
 </div>
 <p className="mt-1.5 text-[11px] text-stone-400">Consignors sign in there with their email to see their own statement.</p>

 {totalPayable > 0 && (
 <div className="mt-5 inline-flex items-baseline gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-white">
 <span className="text-[12px] text-stone-300">Ready to pay out</span>
 <span className="text-[15px] font-semibold tabular-nums">{money(totalPayable)}</span>
 </div>
 )}

 {err && <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-600 ring-1 ring-rose-200">{err}</div>}
 {note && <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-700 ring-1 ring-emerald-200">{note}</div>}

 {/* Connecting a bank is what turns the amber "owed off VYA" figure into something payable from
     this screen instead of a reminder to go and do it by hand. Offered, never assumed: it is an
     authorisation to take money out of the store's account, so it stays an explicit choice. */}
 {rows.some((r) => (r.offPlatform?.totalCents ?? 0) > 0) && (
 <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
 <div className="text-[12.5px] text-stone-600">
 {bank.ready ? (
 <>Off-marketplace payouts come from <b className="text-stone-800">{bank.bank || "your connected bank"}</b>. We debit you, then pay her once it clears.</>
 ) : (
 <>Items sold on eBay or Depop were paid to you directly. Connect your bank and VYA can debit you and pay your consignors for those too — otherwise pay them yourself and record it as cash.</>
 )}
 </div>
 <TechButton variant="secondary" className="px-3 py-1.5 text-[12px]" disabled={linking} onClick={connectBank}>
 {linking ? "…" : bank.ready ? "Change bank" : "Connect bank"}
 </TechButton>
 </div>
 )}

 {!loading && rows.length === 0 ? (
 <TechEmpty className="mt-6" title="No active consignors yet." />
 ) : (
 <TechCard className="mt-6 overflow-hidden">
 <div className="overflow-x-auto">
 <table className="w-full text-[13px]">
 <thead>
 <tr>
 <TH className="px-4">Consignor</TH>
 <TH className="px-4">Method</TH>
 <TH right className="px-4">Balance</TH>
 <TH right className="px-4">Payable now</TH>
 <TH right className="px-4">Owed off VYA</TH>
 <TH className="px-4"></TH>
 </tr>
 </thead>
 <tbody>
 {loading ? (
 <tr><td colSpan={5} className="py-10 text-center text-[13px] text-stone-400">Loading…</td></tr>
 ) : rows.map((c) => (
 <tr key={c.id} className="transition hover:bg-stone-50/70">
 <TD className="px-4 font-medium text-stone-900">{c.name}</TD>
 <TD className="px-4 text-stone-500">{METHOD_LABEL[c.method] ?? c.method}</TD>
 <TD right className="px-4 text-stone-700">{money(c.balanceCents)}</TD>
 <TD right className="px-4 font-medium text-stone-900">{money(c.payableCents)}</TD>
 {/* Sold on eBay or Depop: they paid YOU, so VYA has nothing to send. Still owed, and settled by
     paying her yourself and recording it as cash or a bank transfer. Shown separately or the
     balance looks unpayable for no visible reason. */}
 <TD right className="px-4">
  {c.offPlatform && c.offPlatform.totalCents > 0 ? (
   <span className="text-amber-700" title={`${Object.entries(c.offPlatform.byChannel).map(([ch, v]) => `${ch}: ${money(v)}`).join(" · ")} — these marketplaces paid you directly, so pay her yourself and record it below.`}>
    {money(c.offPlatform.totalCents)}
   </span>
  ) : <span className="text-stone-300">—</span>}
  {(c.inFlightCents ?? 0) > 0 && (
   <div className="text-[11px] text-stone-400">{money(c.inFlightCents!)} clearing</div>
  )}
 </TD>
 <TD className="px-4">
 <div className="flex items-center justify-end gap-2">
 <select value={payMethod[c.id] ?? c.method} onChange={(e) => setPayMethod({ ...payMethod, [c.id]: e.target.value })} className="rounded-lg border border-stone-200 px-2 py-1.5 text-[12px] text-stone-600 outline-none focus:border-stone-400" aria-label="Payout method">
 <option value="stripe">Direct deposit</option>
 {/* Only offered where it can actually work: it settles marketplace sales by debiting the
     store, so it is meaningless without a mandate or without money owed off-platform. */}
 {bank.ready && (c.offPlatform?.totalCents ?? 0) > 0 ? <option value="ach">From your bank</option> : null}
 <option value="cash">Cash</option>
 <option value="check">Check</option>
 <option value="store_credit">Store credit</option>
 </select>
 {(() => {
  // Direct deposit can only send money VYA actually holds. The manual methods are the store
  // paying from its own pocket, so they can settle the marketplace sales too.
  const m = payMethod[c.id] ?? c.method;
  // Each method can settle a different pot. Direct deposit sends only what VYA holds; ACH sends
  // only the off-platform debt (that is the money it goes and fetches); cash and cheque are the
  // store paying from its own pocket, so they cover both.
  const offPlatform = c.offPlatform?.totalCents ?? 0;
  const canSend = m === "stripe" ? c.payableCents
   : m === "ach" ? Math.max(0, offPlatform - (c.inFlightCents ?? 0))
   : c.payableCents + offPlatform;
  return (
   <TechButton className="px-3 py-1.5 text-[12px]" disabled={canSend <= 0 || paying === c.id} onClick={() => pay(c.id, m)}>
    {paying === c.id ? "…" : `Pay ${money(canSend)}`}
   </TechButton>
  );
 })()}
 </div>
 </TD>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </TechCard>
 )}

 <p className="mt-4 text-[11px] text-stone-400">With auto-pay on (in Settings), direct-deposit payouts run on their own once a sale clears your return window. Use <b>Pay</b> here for a manual payout, or for cash / check / store credit.</p>
 </AdminPage>
 );
}
