"use client";

import { useEffect, useState } from "react";
import { Tag, X } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, TechEmpty, StatusPill, MetricCard, TH, TD, cn } from "../ui";
import { Input } from "@/app/store/ui";

type Discount = { id: number; code: string; label: string | null; kind: string; value: number | null; active: boolean; autoApply: boolean; used?: number };

const selectCls = "h-9 rounded-lg border border-stone-200 bg-white px-2 text-[13px] text-stone-900 outline-none focus:border-stone-400";

function kindLabel(d: Discount): string {
 if (d.kind === "percent") return d.value ? `${d.value}% off` : "% off";
 if (d.kind === "fixed") return d.value ? `$${d.value} off` : "$ off";
 if (d.kind === "free_shipping") return "Free shipping";
 return d.label || "Discount";
}

export default function DiscountsPage() {
 const [discounts, setDiscounts] = useState<Discount[]>([]);
 const [newCode, setNewCode] = useState("");
 const [newKind, setNewKind] = useState("percent");
 const [newValue, setNewValue] = useState("");
 const [busy, setBusy] = useState(false);

 useEffect(() => {
 fetch("/api/store/discounts").then((r) => (r.ok ? r.json() : null)).then((d) => d && setDiscounts(d.discounts || [])).catch(() => {});
 }, []);

 async function add() {
 if (!newCode.trim()) return;
 setBusy(true);
 try {
 const r = await fetch("/api/store/discounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: newCode, kind: newKind, value: newValue ? Number(newValue) : null }) });
 const d = await r.json();
 if (r.ok) { setDiscounts(d.discounts); setNewCode(""); setNewValue(""); }
 } catch { /* ignore */ }
 setBusy(false);
 }
 async function patch(id: number, p: { active?: boolean; autoApply?: boolean }) {
 const r = await fetch("/api/store/discounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...p }) });
 const d = await r.json().catch(() => null);
 if (r.ok && d) setDiscounts(d.discounts);
 }
 async function remove(id: number) {
 if (!window.confirm("Remove this code?")) return;
 const r = await fetch("/api/store/discounts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
 const d = await r.json().catch(() => null);
 if (r.ok && d) setDiscounts(d.discounts);
 }

 const active = discounts.filter((d) => d.active).length;

 return (
 <AdminPage>
 <AdminHeader
 eyebrow="Store · Discounts"
 title="Discounts"
 subtitle="Discount codes for people who reach your store from VYA. Star one and it’s applied for them automatically."
 />

 <div className="mb-5 grid grid-cols-3 gap-3">
 <MetricCard label="Codes" value={discounts.length} />
 <MetricCard label="Active" value={active} />
 <MetricCard label="Auto-applies" value={discounts.filter((d) => d.autoApply).length} />
 </div>

 {discounts.length === 0 ? (
 <TechEmpty
 icon={<Tag size={28} strokeWidth={1.5} />}
 title="No discount codes yet"
 body="Add a code below and it’s applied automatically for people who reach your store from VYA."
 />
 ) : (
 <TechCard className="mb-5 overflow-hidden">
 <div className="overflow-x-auto">
 <table className="w-full text-[13px]">
 <thead>
 <tr>
 <TH className="px-5">Code</TH>
 <TH className="px-5">Discount</TH>
 <TH className="px-5">Used</TH>
 <TH className="px-5">Status</TH>
 <TH right className="px-5">Actions</TH>
 </tr>
 </thead>
 <tbody>
 {discounts.map((d) => (
 <tr key={d.id} className="transition hover:bg-stone-50/70">
 <TD className="px-5 font-mono font-medium text-stone-900">{d.code}</TD>
 <TD className="px-5 text-stone-500">{kindLabel(d)}</TD>
 <TD className="px-5 tabular-nums text-stone-500">{d.used ? `${d.used}×` : "—"}</TD>
 <TD className="px-5">
 <div className="flex flex-wrap items-center gap-1.5">
 <StatusPill tone={d.active ? "live" : "neutral"} dot={d.active}>{d.active ? "Active" : "Off"}</StatusPill>
 {d.autoApply && <StatusPill tone="info">Auto-applies</StatusPill>}
 </div>
 </TD>
 <TD right className="px-5">
 <div className="flex items-center justify-end gap-2">
 <button onClick={() => patch(d.id, { autoApply: !d.autoApply })} title="Apply this one automatically (you can only pick one)" className={cn("text-sm leading-none", d.autoApply ? "text-[var(--accent,#0e9f76)]" : "text-stone-300 hover:text-stone-500")}>{d.autoApply ? "★" : "☆"}</button>
 <TechButton variant="ghost" className="px-2.5 py-1 text-[12px]" onClick={() => patch(d.id, { active: !d.active })}>{d.active ? "Disable" : "Enable"}</TechButton>
 <TechButton variant="ghost" className="px-2 py-1 text-[12px] text-stone-300 hover:text-red-600" onClick={() => remove(d.id)}><X size={14} /></TechButton>
 </div>
 </TD>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </TechCard>
 )}

 <TechCard className="p-5">
 <div className="flex flex-wrap items-center gap-2">
 <div className="w-36"><Input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase().replace(/\s/g, ""))} placeholder="WELCOME10" /></div>
 <select value={newKind} onChange={(e) => setNewKind(e.target.value)} className={selectCls}>
 <option value="percent">% off</option>
 <option value="fixed">$ off</option>
 <option value="free_shipping">Free shipping</option>
 <option value="other">Other</option>
 </select>
 {(newKind === "percent" || newKind === "fixed") && <div className="w-20"><Input value={newValue} onChange={(e) => setNewValue(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={newKind === "percent" ? "10" : "25"} /></div>}
 <TechButton disabled={busy || !newCode.trim()} onClick={add}>Add code</TechButton>
 </div>
 <p className="mt-2 text-[11px] text-stone-400">★ auto-applies the code when a shopper clicks through from VYA — only one can. Others are for campaigns + your store page.</p>
 </TechCard>
 </AdminPage>
 );
}
