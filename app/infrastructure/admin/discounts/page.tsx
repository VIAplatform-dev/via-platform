"use client";

import { useEffect, useState } from "react";
import { Tag, X } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, TechEmpty, StatusPill, MetricCard, TH, TD, cn } from "../ui";
import { Input } from "@/app/store/ui";
import { describeScope } from "@/app/lib/discount-scope";

type Discount = { id: number; code: string; label: string | null; kind: string; value: number | null; active: boolean; autoApply: boolean; endsAt: string | null; itemIds: string[]; audience: "all" | "new" | "lapsed"; lapsedDays: number | null; used?: number };
type Piece = { id: string; title: string };

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
 const [newEnds, setNewEnds] = useState("");
 const [busy, setBusy] = useState(false);
 // The row being edited. A code saved with the wrong number — WELCOME10 with no 10 — could only be
 // deleted and made again; every part of it is editable here now.
 const [editId, setEditId] = useState<number | null>(null);
 const [draft, setDraft] = useState<{ code: string; kind: string; value: string; endsAt: string; itemIds: string[]; audience: "all" | "new" | "lapsed"; lapsedDays: string }>({ code: "", kind: "percent", value: "", endsAt: "", itemIds: [], audience: "all", lapsedDays: "180" });
 // Her live pieces, so "20% off the dresses" can name actual dresses instead of asking for ids.
 const [pieces, setPieces] = useState<Piece[]>([]);
 const [pieceQuery, setPieceQuery] = useState("");

 useEffect(() => {
 fetch("/api/store/items").then((r) => (r.ok ? r.json() : null)).then((d) => {
 const live = (d?.items || []).filter((i: { status: string }) => i.status === "active");
 setPieces(live.map((i: { id: string; title: string }) => ({ id: i.id, title: i.title })));
 }).catch(() => {});
 fetch("/api/store/discounts").then((r) => (r.ok ? r.json() : null)).then((d) => d && setDiscounts(d.discounts || [])).catch(() => {});
 }, []);

 async function add() {
 if (!newCode.trim()) return;
 setBusy(true);
 try {
 const r = await fetch("/api/store/discounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: newCode, kind: newKind, value: newValue ? Number(newValue) : null, endsAt: newEnds ? new Date(newEnds).toISOString() : null }) });
 const d = await r.json();
 if (r.ok) { setDiscounts(d.discounts); setNewCode(""); setNewValue(""); setNewEnds(""); }
 } catch { /* ignore */ }
 setBusy(false);
 }
 function openEdit(d: Discount) {
 setEditId(d.id);
 // datetime-local wants "YYYY-MM-DDTHH:mm" in LOCAL time; an ISO string in UTC would show her the
 // wrong hour and then save that wrong hour back.
 const local = d.endsAt ? new Date(new Date(d.endsAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
 setDraft({ code: d.code, kind: d.kind, value: d.value == null ? "" : String(d.value), endsAt: local, itemIds: d.itemIds || [], audience: d.audience || "all", lapsedDays: d.lapsedDays == null ? "180" : String(d.lapsedDays) });
 setPieceQuery("");
 }
 async function saveEdit() {
 if (editId == null) return;
 await patch(editId, {
  code: draft.code.trim().toUpperCase(),
  kind: draft.kind,
  value: draft.value === "" ? null : Number(draft.value),
  endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
 itemIds: draft.itemIds,
 audience: draft.audience,
 lapsedDays: draft.audience === "lapsed" ? Number(draft.lapsedDays) || 180 : null,
 });
 setEditId(null);
 }
 async function patch(id: number, p: { active?: boolean; autoApply?: boolean; code?: string; kind?: string; value?: number | null; endsAt?: string | null; itemIds?: string[]; audience?: string; lapsedDays?: number | null }) {
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
 {discounts.map((d) => editId === d.id ? (
 <tr key={d.id} className="bg-stone-50/70">
 <TD className="px-5"><div className="w-32"><Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/\s/g, "") })} /></div></TD>
 <TD className="px-5">
 <div className="flex flex-wrap items-center gap-1.5">
 <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} className={selectCls}>
 <option value="percent">% off</option><option value="fixed">$ off</option><option value="free_shipping">Free shipping</option><option value="other">Other</option>
 </select>
 {(draft.kind === "percent" || draft.kind === "fixed") && <div className="w-16"><Input value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value.replace(/[^0-9.]/g, "") })} placeholder={draft.kind === "percent" ? "10" : "25"} /></div>}
 </div>
 </TD>
 <TD className="px-5">
 {/* WHO may use it. "First order" is what a WELCOME code has always meant; "lapsed" is the
     comeback code — and someone who has never bought counts as lapsed, which is what a shop
     means when it says "haven't ordered in six months". */}
 <label className="block text-[11px] text-stone-400">Who</label>
 <select value={draft.audience} onChange={(e) => setDraft({ ...draft, audience: e.target.value as "all" | "new" | "lapsed" })} className={selectCls}>
 <option value="all">Anyone</option>
 <option value="new">First order only</option>
 <option value="lapsed">Hasn&rsquo;t ordered in…</option>
 </select>
 {draft.audience === "lapsed" && (
 <div className="mt-1 flex items-center gap-1.5">
  <div className="w-14"><Input value={draft.lapsedDays} onChange={(e) => setDraft({ ...draft, lapsedDays: e.target.value.replace(/[^0-9]/g, "") })} /></div>
  <span className="text-[11px] text-stone-400">days</span>
 </div>
 )}
 </TD>
 <TD className="px-5">
 <label className="block text-[11px] text-stone-400">Ends (optional)</label>
 <input type="datetime-local" value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} className={selectCls} />
 {/* WHICH pieces. Empty means the whole order, which is what every code did before. */}
 <div className="mt-2">
 <label className="block text-[11px] text-stone-400">Only these pieces {draft.itemIds.length > 0 && <button type="button" onClick={() => setDraft({ ...draft, itemIds: [] })} className="ml-1 underline hover:text-stone-600">clear</button>}</label>
 {draft.itemIds.length > 0 && (
  <div className="mb-1 flex flex-wrap gap-1">
  {draft.itemIds.map((id) => (
   <span key={id} className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">
   <span className="max-w-[130px] truncate">{pieces.find((x) => x.id === id)?.title || "piece"}</span>
   <button type="button" onClick={() => setDraft({ ...draft, itemIds: draft.itemIds.filter((x) => x !== id) })} className="opacity-60 hover:opacity-100">×</button>
   </span>
  ))}
  </div>
 )}
 <Input value={pieceQuery} onChange={(e) => setPieceQuery(e.target.value)} placeholder={draft.itemIds.length ? "add another…" : "whole order — or search a piece"} />
 {pieceQuery.trim() && (
  <div className="mt-1 max-h-32 divide-y divide-stone-100 overflow-y-auto rounded-lg border border-stone-200">
  {pieces.filter((x) => x.title.toLowerCase().includes(pieceQuery.trim().toLowerCase()) && !draft.itemIds.includes(x.id)).slice(0, 6).map((x) => (
   <button key={x.id} type="button" onClick={() => { setDraft({ ...draft, itemIds: [...draft.itemIds, x.id] }); setPieceQuery(""); }} className="block w-full truncate px-2 py-1.5 text-left text-[12px] text-stone-700 hover:bg-stone-50">{x.title}</button>
  ))}
  </div>
 )}
 </div>
 </TD>
 <TD right className="px-5">
 <div className="flex items-center justify-end gap-2">
 <TechButton className="px-2.5 py-1 text-[12px]" onClick={saveEdit}>Save</TechButton>
 <TechButton variant="ghost" className="px-2.5 py-1 text-[12px]" onClick={() => setEditId(null)}>Cancel</TechButton>
 </div>
 </TD>
 </tr>
 ) : (
 <tr key={d.id} className="transition hover:bg-stone-50/70">
 <TD className="px-5 font-mono font-medium text-stone-900">{d.code}</TD>
 <TD className="px-5 text-stone-500">
 {kindLabel(d)}
 {/* A percentage nobody set is the bug that started this — say so where she'd look for it. */}
 {(d.kind === "percent" || d.kind === "fixed") && d.value == null && <span className="ml-1.5 text-[11px] text-amber-700">no amount set</span>}
 </TD>
 <TD className="px-5 tabular-nums text-stone-500">{d.used ? `${d.used}×` : "—"}</TD>
 <TD className="px-5">
 <div className="flex flex-wrap items-center gap-1.5">
 <StatusPill tone={d.active ? "live" : "neutral"} dot={d.active}>{d.active ? "Active" : "Off"}</StatusPill>
 {d.autoApply && <StatusPill tone="info">Auto-applies</StatusPill>}
 {describeScope(d, new Map(pieces.map((x) => [x.id, x.title]))) && (
  <span className="text-[11px] text-stone-500">{describeScope(d, new Map(pieces.map((x) => [x.id, x.title])))}</span>
 )}
 {d.endsAt && (new Date(d.endsAt) <= new Date()
  ? <StatusPill tone="neutral">Expired</StatusPill>
  : <span className="text-[11px] text-stone-400">until {new Date(d.endsAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>)}
 </div>
 </TD>
 <TD right className="px-5">
 <div className="flex items-center justify-end gap-2">
 <button onClick={() => patch(d.id, { autoApply: !d.autoApply })} title="Apply this one automatically (you can only pick one)" className={cn("text-sm leading-none", d.autoApply ? "text-[var(--accent,#0e9f76)]" : "text-stone-300 hover:text-stone-500")}>{d.autoApply ? "★" : "☆"}</button>
 <TechButton variant="ghost" className="px-2.5 py-1 text-[12px]" onClick={() => openEdit(d)}>Edit</TechButton>
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
 <label className="flex items-center gap-1.5 text-[12px] text-stone-400">ends<input type="datetime-local" value={newEnds} onChange={(e) => setNewEnds(e.target.value)} className={selectCls} title="Optional — the code stops working at this moment" /></label>
 <TechButton disabled={busy || !newCode.trim()} onClick={add}>Add code</TechButton>
 </div>
 <p className="mt-2 text-[11px] text-stone-400">★ auto-applies the code when a shopper clicks through from VYA — only one can. Others are for campaigns + your store page.</p>
 </TechCard>
 </AdminPage>
 );
}
