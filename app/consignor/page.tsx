"use client";

import { useEffect, useState } from "react";
import EmbeddedPayments from "@/app/store/payments/EmbeddedPayments";

type Item = { status: string; splitPct: number; listedPriceCents: number | null; soldPriceCents: number | null; intakeDate: string; soldAt: string | null };
type Ledger = { type: string; amountCents: number; orderId: string | null; createdAt: string; note: string | null };
type Consignment = { consignorId: number; store: string; storeName: string; name: string; connected: boolean; payoutMethod: string; payableCents: number; balanceCents: number; items: Item[]; ledger: Ledger[]; payouts: { amountCents: number; method: string; status: string; createdAt: string }[] };

const METHOD_LABEL: Record<string, string> = { cash: "cash", check: "a check", store_credit: "store credit" };
// For consignors paid out-of-band (cash / check / store credit) — VYA doesn't deposit their money,
// the store hands it over in person, so tell them where + when to collect it.
function collectNote(con: Consignment): { text: string; tone: "ready" | "pending" | "none" } {
 const label = METHOD_LABEL[con.payoutMethod] || "store credit";
 if (con.payableCents > 0) return { text: `${money(con.payableCents)} in ${label} is ready — stop by ${con.storeName} to collect it.`, tone: "ready" };
 if (con.balanceCents > 0) return { text: `${money(con.balanceCents)} is clearing the return window. Once it’s ready, you can collect it in ${label} at ${con.storeName}.`, tone: "pending" };
 return { text: `You’re paid in ${label} at ${con.storeName}.`, tone: "none" };
}

const money = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const day = (s: string) => new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const STATUS: Record<string, { label: string; cls: string }> = {
 active: { label: "For sale", cls: "bg-emerald-50 text-emerald-700" },
 sold: { label: "Sold", cls: "bg-stone-900 text-white" },
 expired: { label: "Ended", cls: "bg-amber-50 text-amber-700" },
 returned: { label: "Returned", cls: "bg-stone-100 text-stone-500" },
 pulled: { label: "Pulled", cls: "bg-stone-100 text-stone-500" },
};
const LEDGER_LABEL: Record<string, string> = { sale_credit: "Sale", payout: "Payout", reversal: "Return", adjustment: "Adjustment" };

const shell = "min-h-screen bg-stone-50 px-5 py-12";
const FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export default function ConsignorPortal() {
 const [state, setState] = useState<"loading" | "out" | "in">("loading");
 const [consignments, setConsignments] = useState<Consignment[]>([]);
 const [email, setEmail] = useState("");
 const [sent, setSent] = useState(false);
 const [sending, setSending] = useState(false);
 const [err, setErr] = useState<string | null>(null);
 // Which consignor is showing the embedded bank surface, and in what mode (add bank vs manage).
 const [bank, setBank] = useState<{ id: number; mode: "onboarding" | "manage" } | null>(null);

 function reload() {
 return fetch("/api/consignor/me").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { setConsignments(d.consignments || []); setState("in"); });
 }
 useEffect(() => {
 reload().catch(() => {
 setState("out");
 if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("error") === "expired") setErr("That link expired. Enter your email for a fresh one.");
 });
 }, []);

 async function requestLink(e: React.FormEvent) {
 e.preventDefault();
 if (!email.trim()) return;
 setSending(true); setErr(null);
 const r = await fetch("/api/consignor/request-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }) });
 const d = await r.json().catch(() => null);
 setSending(false);
 if (!r.ok) { setErr(d?.error || "Something went wrong."); return; }
 setSent(true);
 }
 async function signOut() { await fetch("/api/consignor/me", { method: "DELETE" }); setConsignments([]); setState("out"); setSent(false); }

 if (state === "loading") return <div className="flex min-h-screen items-center justify-center text-[13px] text-stone-400" style={{ fontFamily: FONT_FAMILY }}>Loading…</div>;

 if (state === "out") {
 return (
 <div className={`${shell} flex items-center justify-center`} style={{ fontFamily: FONT_FAMILY }}>
 <div className="w-full max-w-sm">
 <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">Consignment</p>
 <h1 className="mt-1 text-[24px] font-semibold tracking-tight text-stone-900">View your statement</h1>
 {sent ? (
 <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-[13px] text-emerald-800">Check your email — if you consign with us, a sign-in link is on its way. It works once and expires in 15 minutes.</div>
 ) : (
 <form onSubmit={requestLink} className="mt-6">
 <p className="mb-3 text-[13px] text-stone-500">Enter the email your consignor account is under, and we&rsquo;ll send you a sign-in link.</p>
 <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" className="w-full rounded-lg border border-stone-200 px-3 py-2.5 text-[14px] outline-none focus:border-stone-400" />
 {err && <p className="mt-2 text-[12px] text-rose-600">{err}</p>}
 <button disabled={sending || !email.trim()} className="mt-3 w-full rounded-lg bg-stone-900 px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-stone-800 disabled:opacity-50">{sending ? "Sending…" : "Email me a sign-in link"}</button>
 </form>
 )}
 <p className="mt-10 text-center text-[11px] text-stone-400">Powered by VYA</p>
 </div>
 </div>
 );
 }

 return (
 <div className={shell} style={{ fontFamily: FONT_FAMILY }}>
 <div className="mx-auto max-w-2xl">
 <div className="flex items-center justify-between">
 <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">Consignment statement</p>
 <button onClick={signOut} className="text-[12px] text-stone-400 hover:text-stone-700">Sign out</button>
 </div>

 {consignments.length === 0 ? (
 <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 text-center text-[13px] text-stone-500">No consignments found for your email yet.</div>
 ) : consignments.map((con, ci) => (
 <div key={ci} className={ci === 0 ? "mt-2" : "mt-12"}>
 <h1 className="text-[24px] font-semibold tracking-tight text-stone-900">{con.name}</h1>
 <div className="mt-5 rounded-2xl bg-stone-900 px-6 py-5 text-white">
 <p className="text-[12px] text-stone-300">Current balance</p>
 <p className="mt-0.5 text-[30px] font-semibold tabular-nums">{money(con.balanceCents)}</p>
 </div>
 {con.payoutMethod === "stripe" ? (
 con.connected ? (
 <div className="mt-2.5 flex items-center gap-3">
 <p className="text-[12px] text-emerald-600">✓ Direct deposit connected — payouts go to your bank.</p>
 <button onClick={() => setBank((b) => (b?.id === con.consignorId && b.mode === "manage" ? null : { id: con.consignorId, mode: "manage" }))} className="text-[12px] text-stone-400 underline underline-offset-2 hover:text-stone-700">{bank?.id === con.consignorId && bank.mode === "manage" ? "Hide" : "Manage"}</button>
 </div>
 ) : (
 <button onClick={() => setBank({ id: con.consignorId, mode: "onboarding" })} disabled={bank?.id === con.consignorId} className="mt-3 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-[12.5px] font-medium text-stone-700 transition hover:border-stone-400 disabled:opacity-50">Connect bank for direct deposit →</button>
 )
 ) : (() => {
 const n = collectNote(con);
 return (
 <p className={`mt-2.5 text-[12px] ${n.tone === "ready" ? "font-medium text-emerald-600" : n.tone === "pending" ? "text-amber-600" : "text-stone-500"}`}>{n.tone === "ready" ? "✓ " : ""}{n.text}</p>
 );
 })()}

 {/* Embedded Stripe surface — only for direct-deposit consignors, no redirect. */}
 {con.payoutMethod === "stripe" && bank?.id === con.consignorId && (
 <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4">
 <EmbeddedPayments
 endpoint="/api/consignor/account-session"
 body={{ consignorId: con.consignorId }}
 mode={bank.mode}
 onComplete={bank.mode === "onboarding" ? () => { setBank(null); reload(); } : undefined}
 />
 </div>
 )}

 <h2 className="mt-8 text-[13px] font-semibold text-stone-800">Your items</h2>
 <div className="mt-2 overflow-hidden rounded-xl border border-stone-200 bg-white">
 {con.items.length === 0 ? <p className="px-4 py-8 text-center text-[13px] text-stone-400">No items yet.</p> : (
 <table className="w-full text-[13px]"><tbody>
 {con.items.map((it, i) => {
 const st = STATUS[it.status] ?? { label: it.status, cls: "bg-stone-100 text-stone-500" };
 const price = it.soldPriceCents ?? it.listedPriceCents;
 return (
 <tr key={i} className="border-b border-stone-50 last:border-0">
 <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span></td>
 <td className="px-4 py-3 text-stone-500">Your {it.splitPct}%</td>
 <td className="px-4 py-3 text-right tabular-nums text-stone-800">{price != null ? money(price) : "—"}{it.soldPriceCents != null && <span className="ml-1 text-[11px] text-emerald-600">→ {money(Math.round(it.soldPriceCents * it.splitPct / 100))}</span>}</td>
 <td className="px-4 py-3 text-right text-[12px] text-stone-400">{day(it.soldAt ?? it.intakeDate)}</td>
 </tr>
 );
 })}
 </tbody></table>
 )}
 </div>

 <h2 className="mt-8 text-[13px] font-semibold text-stone-800">Activity</h2>
 <div className="mt-2 overflow-hidden rounded-xl border border-stone-200 bg-white">
 {con.ledger.length === 0 ? <p className="px-4 py-8 text-center text-[13px] text-stone-400">No activity yet.</p> : (
 <table className="w-full text-[13px]"><tbody>
 {con.ledger.map((l, i) => (
 <tr key={i} className="border-b border-stone-50 last:border-0">
 <td className="px-4 py-3 text-stone-700">{LEDGER_LABEL[l.type] ?? l.type}{l.note ? <span className="text-stone-400"> · {l.note}</span> : ""}</td>
 <td className="px-4 py-3 text-right text-[12px] text-stone-400">{day(l.createdAt)}</td>
 <td className={`px-4 py-3 text-right font-medium tabular-nums ${l.amountCents >= 0 ? "text-emerald-600" : "text-stone-500"}`}>{l.amountCents >= 0 ? "+" : "−"}{money(Math.abs(l.amountCents))}</td>
 </tr>
 ))}
 </tbody></table>
 )}
 </div>
 </div>
 ))}

 <p className="mt-10 text-center text-[11px] text-stone-400">Powered by VYA</p>
 </div>
 </div>
 );
}
