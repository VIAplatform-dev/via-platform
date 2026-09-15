"use client";

import { useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";
import { Card, CardHeader, PageHeader, Badge, Button, Input, Field, inputCls, cn } from "../ui";

type ChannelRow = { channel: string; clicks: number; orders: number; sales: number; convPct: number; aov: number };
type Trend = { days: string[]; series: { channel: string; counts: number[] }[] };
type Attribution = { rows: ChannelRow[]; totals: { clicks: number; orders: number; sales: number; convPct: number; aov: number }; newCustomers: number; returningCustomers: number; trend?: Trend };
type Discount = { id: number; code: string; label: string | null; kind: string; value: number | null; active: boolean; autoApply: boolean };

const TREND_COLORS = ["#5D0F17", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6"];
function TrendChart({ days, series }: Trend) {
 if (!series.length || !days.length || series.every((s) => s.counts.every((c) => c === 0))) return null;
 const max = Math.max(1, ...series.flatMap((s) => s.counts));
 const W = 100, H = 36;
 const xAt = (i: number) => (days.length > 1 ? (i / (days.length - 1)) * W : 0);
 const yAt = (v: number) => H - (v / max) * H;
 return (
 <div className="mb-5">
 <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-28 w-full">
 {series.map((s, si) => (
 <polyline key={s.channel} fill="none" stroke={TREND_COLORS[si % TREND_COLORS.length]} strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" points={s.counts.map((c, i) => `${xAt(i)},${yAt(c)}`).join(" ")} />
 ))}
 </svg>
 <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
 {series.map((s, si) => (
 <span key={s.channel} className="flex items-center gap-1.5 text-[11px] text-stone-500"><i className="h-2 w-2 rounded-full" style={{ background: TREND_COLORS[si % TREND_COLORS.length] }} />{s.channel}</span>
 ))}
 </div>
 <div className="mt-0.5 flex justify-between text-[10px] text-stone-400"><span>{days[0]}</span><span>{days[days.length - 1]}</span></div>
 </div>
 );
}

const selectCls = "h-9 rounded-md border border-stone-300 bg-white px-2 text-[13px] text-stone-900 outline-none focus:border-stone-400";

function kindLabel(d: Discount): string {
 if (d.kind === "percent") return d.value ? `${d.value}% off` : "% off";
 if (d.kind === "fixed") return d.value ? `$${d.value} off` : "$ off";
 if (d.kind === "free_shipping") return "Free shipping";
 return d.label || "Discount";
}

export default function MarketingPage() {
 // Discounts
 const [discounts, setDiscounts] = useState<Discount[]>([]);
 const [newCode, setNewCode] = useState("");
 const [newKind, setNewKind] = useState("percent");
 const [newValue, setNewValue] = useState("");
 const [dBusy, setDBusy] = useState(false);
 // Audience attribution
 const [range, setRange] = useState<"30" | "all">("30");
 const [aud, setAud] = useState<Attribution | null>(null);
 // Email campaign
 const [subject, setSubject] = useState("");
 const [msg, setMsg] = useState("");
 const [link, setLink] = useState("");
 const [camp, setCamp] = useState<{ recipientCount: number; storeEmail: string | null } | null>(null);
 const [sending, setSending] = useState(false);
 const [campMsg, setCampMsg] = useState<string | null>(null);

 useEffect(() => {
 fetch("/api/store/discounts").then((r) => (r.ok ? r.json() : null)).then((d) => d && setDiscounts(d.discounts || [])).catch(() => {});
 fetch("/api/store/campaign").then((r) => (r.ok ? r.json() : null)).then((d) => d && setCamp(d)).catch(() => {});
 }, []);

 const loadAudience = useCallback(async () => {
 try { const r = await fetch(`/api/store/audience?days=${range}`); if (r.ok) setAud(await r.json()); } catch { /* ignore */ }
 }, [range]);
 useEffect(() => { (async () => { await loadAudience(); })(); }, [loadAudience]);

 async function addDiscount() {
 if (!newCode.trim()) return;
 setDBusy(true);
 try {
 const r = await fetch("/api/store/discounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: newCode, kind: newKind, value: newValue ? Number(newValue) : null }) });
 const d = await r.json();
 if (r.ok) { setDiscounts(d.discounts); setNewCode(""); setNewValue(""); }
 } catch { /* ignore */ }
 setDBusy(false);
 }
 async function patchDiscount(id: number, patch: { active?: boolean; autoApply?: boolean }) {
 const r = await fetch("/api/store/discounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
 const d = await r.json().catch(() => null);
 if (r.ok && d) setDiscounts(d.discounts);
 }
 async function removeDiscount(id: number) {
 if (!window.confirm("Remove this code?")) return;
 const r = await fetch("/api/store/discounts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
 const d = await r.json().catch(() => null);
 if (r.ok && d) setDiscounts(d.discounts);
 }

 async function sendCampaign(test: boolean) {
 if (!subject.trim() || !msg.trim()) { setCampMsg("Add a subject and a message."); return; }
 if (!test && !window.confirm(`Send this to ${camp?.recipientCount ?? 0} customers? This can't be undone.`)) return;
 setSending(true); setCampMsg(null);
 try {
 const r = await fetch("/api/store/campaign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, body: msg, link, test }) });
 const d = await r.json();
 if (!r.ok) setCampMsg(d.error || "Couldn’t send.");
 else if (test) setCampMsg(`Test sent to ${d.sentTo}. Check your inbox.`);
 else setCampMsg(`Sent to ${d.sent} customer${d.sent === 1 ? "" : "s"}${d.failed ? ` (${d.failed} failed)` : ""}. ✓`);
 } catch { setCampMsg("Couldn’t send."); }
 setSending(false);
 }

 return (
 <div className="mx-auto max-w-2xl px-6 py-10 sm:px-8">
 <PageHeader title="Marketing" subtitle="Discounts, campaigns, and where your shoppers come from." />

 {/* Discounts */}
 <Card className="mb-5">
 <CardHeader title="Discounts" subtitle="Codes shoppers get when they click through from VYA. One auto-applies." />
 <div className="px-5 py-4">
 {discounts.length > 0 && (
 <div className="mb-4 divide-y divide-stone-100 overflow-hidden rounded-lg border border-stone-200">
 {discounts.map((d) => (
 <div key={d.id} className="flex items-center gap-2.5 px-3 py-2.5">
 <span className="font-mono text-[13px] font-medium text-stone-900">{d.code}</span>
 <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-500">{kindLabel(d)}</span>
 {d.autoApply && <Badge tone="accent">Auto-applies</Badge>}
 {!d.active && <Badge tone="neutral">Off</Badge>}
 <div className="ml-auto flex items-center gap-3">
 <button onClick={() => patchDiscount(d.id, { autoApply: !d.autoApply })} title="Auto-apply on click-through (only one)" className={cn("text-sm leading-none", d.autoApply ? "text-[#5D0F17]" : "text-stone-300 hover:text-stone-500")}>{d.autoApply ? "★" : "☆"}</button>
 <button onClick={() => patchDiscount(d.id, { active: !d.active })} className={cn("text-[11px] font-medium", d.active ? "text-stone-500 hover:text-stone-900" : "text-emerald-600")}>{d.active ? "Disable" : "Enable"}</button>
 <button onClick={() => removeDiscount(d.id)} className="text-stone-300 transition hover:text-red-600"><X size={14} /></button>
 </div>
 </div>
 ))}
 </div>
 )}
 <div className="flex flex-wrap items-center gap-2">
 <div className="w-36"><Input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase().replace(/\s/g, ""))} placeholder="WELCOME10" /></div>
 <select value={newKind} onChange={(e) => setNewKind(e.target.value)} className={selectCls}>
 <option value="percent">% off</option>
 <option value="fixed">$ off</option>
 <option value="free_shipping">Free shipping</option>
 <option value="other">Other</option>
 </select>
 {(newKind === "percent" || newKind === "fixed") && <div className="w-20"><Input value={newValue} onChange={(e) => setNewValue(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={newKind === "percent" ? "10" : "25"} /></div>}
 <Button onClick={addDiscount} disabled={dBusy || !newCode.trim()}>Add</Button>
 </div>
 <p className="mt-2 text-[11px] text-stone-400">★ auto-applies the code when a shopper clicks through from VYA, only one can. Others are for campaigns + your store page.</p>
 </div>
 </Card>

 {/* Audience attribution */}
 <Card className="mb-5">
 <CardHeader
 title="Where your audience comes from"
 subtitle="Attribution by channel: clicks, orders, revenue"
 action={
 <div className="flex gap-1">
 {(["30", "all"] as const).map((r) => (
 <button key={r} onClick={() => setRange(r)} className={cn("rounded px-2 py-0.5 text-[11px] font-medium transition", range === r ? "bg-stone-100 text-stone-900" : "text-stone-400 hover:text-stone-700")}>{r === "30" ? "30d" : "All"}</button>
 ))}
 </div>
 }
 />
 <div className="px-5 py-4">
 {!aud || aud.totals.clicks === 0 ? (
 <p className="py-6 text-center text-[13px] text-stone-400">No traffic data yet for this period. Once shoppers click through from your channels, you’ll see the breakdown here.</p>
 ) : (
 <>
 {aud.trend && <TrendChart {...aud.trend} />}
 <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1.5 text-[13px] text-stone-600">
 <span><b className="text-stone-900 tabular-nums">{aud.totals.clicks.toLocaleString()}</b> clicks</span>
 <span><b className="text-stone-900 tabular-nums">{aud.totals.orders.toLocaleString()}</b> orders</span>
 <span><b className="text-stone-900 tabular-nums">${aud.totals.sales.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b> sales</span>
 <span><b className="text-stone-900 tabular-nums">{aud.totals.convPct}%</b> conv</span>
 <span><b className="text-stone-900 tabular-nums">{aud.newCustomers}</b> new · <b className="text-stone-900 tabular-nums">{aud.returningCustomers}</b> returning</span>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-[13px]">
 <thead>
 <tr className="border-b border-stone-100 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-stone-400">
 <th className="py-2 pr-3 font-medium">Channel</th>
 <th className="px-3 py-2 text-right font-medium">Clicks</th>
 <th className="px-3 py-2 text-right font-medium">Orders</th>
 <th className="px-3 py-2 text-right font-medium">Sales</th>
 <th className="px-3 py-2 text-right font-medium">Conv</th>
 <th className="py-2 pl-3 text-right font-medium">AOV</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-stone-100">
 {aud.rows.map((r) => (
 <tr key={r.channel}>
 <td className="py-2.5 pr-3 font-medium text-stone-800">{r.channel}</td>
 <td className="px-3 py-2.5 text-right tabular-nums text-stone-600">{r.clicks.toLocaleString()}</td>
 <td className="px-3 py-2.5 text-right tabular-nums text-stone-600">{r.orders.toLocaleString()}</td>
 <td className="px-3 py-2.5 text-right tabular-nums text-stone-900">${r.sales.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
 <td className="px-3 py-2.5 text-right tabular-nums text-stone-600">{r.convPct}%</td>
 <td className="py-2.5 pl-3 text-right tabular-nums text-stone-600">${r.aov.toLocaleString()}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 <p className="pt-3 text-[11px] text-stone-400">VYA-attributed click-throughs + orders {range === "30" ? "in the last 30 days" : "all time"}. Ad-spend metrics (ROAS/CPA) need an ad-platform connection.</p>
 </>
 )}
 </div>
 </Card>

 {/* Email campaign */}
 <Card>
 <CardHeader title="Email campaign" subtitle={`Sends with your store’s name. Replies go to ${camp?.storeEmail || "your contact email"}`} />
 <div className="space-y-3 px-5 py-4">
 <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="New drop just landed ✨" /></Field>
 <Field label="Message"><textarea className={cn(inputCls, "h-32 py-2 leading-relaxed")} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Write to your customers. What just landed, a sale, a restock…" /></Field>
 <Field label="Button link" hint="Where “Shop now” points. Defaults to your store.">
 <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://yourstore.com" />
 </Field>
 <div className="flex flex-wrap items-center gap-2 pt-1">
 <Button variant="secondary" onClick={() => sendCampaign(true)} disabled={sending}>Send test to myself</Button>
 <Button onClick={() => sendCampaign(false)} disabled={sending || !camp?.recipientCount}>{sending ? "Sending…" : `Send to ${camp?.recipientCount ?? 0} customer${camp?.recipientCount === 1 ? "" : "s"}`}</Button>
 {campMsg && <span className="text-xs text-stone-600">{campMsg}</span>}
 </div>
 <p className="text-[11px] text-stone-400">Tip: send a test first. Links are tagged so email traffic shows up in your attribution above.</p>
 </div>
 </Card>
 </div>
 );
}
