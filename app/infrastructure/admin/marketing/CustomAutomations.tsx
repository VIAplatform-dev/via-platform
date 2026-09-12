"use client";

// The seller's own automatic emails — her triggers, her words — and the form that makes one.
//
// This used to be the bottom half of a separate Automations page whose top half listed the same
// built-in flows, with the same toggles, that Your emails already showed. Two pages for one
// question: "what does my shop send?" A seller reading them side by side said they felt "virtually
// the same", and she was right — the only thing that page had of its own is here.

import { useEffect, useState } from "react";
import { Zap, Plus, X } from "lucide-react";
import { TechCard, TechButton, SectionLabel, Toggle } from "../ui";
import { Input, Field } from "@/app/store/ui";
import EmailEditor from "@/app/store/EmailEditor";

type Custom = { kind: "custom"; id: number; name: string; trigger: string; subject: string; body: string; enabled: boolean };
type Trigger = { value: string; label: string };
type Data = { custom: Custom[]; triggers: Trigger[] };

export function CustomAutomations() {
 const [data, setData] = useState<Data | null>(null);
 const [busyKey, setBusyKey] = useState<string | null>(null);
 const [adding, setAdding] = useState(false);
 const [form, setForm] = useState({ name: "", trigger: "new_listing", subject: "", body: "" });
 const [saving, setSaving] = useState(false);
 const [err, setErr] = useState<string | null>(null);

 useEffect(() => {
  fetch("/api/store/automations").then((r) => (r.ok ? r.json() : null)).then((d) => d && setData(d)).catch(() => {});
 }, []);

 async function toggle(body: object, key: string) {
  setBusyKey(key);
  try {
   const r = await fetch("/api/store/automations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
   if (r.ok) setData((await r.json()) as Data);
  } catch { /* ignore */ }
  setBusyKey(null);
 }
 async function create() {
  setSaving(true); setErr(null);
  try {
   const r = await fetch("/api/store/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
   const d = await r.json();
   if (!r.ok) setErr(d.error || "Couldn’t save.");
   else { setData(d as Data); setAdding(false); setForm({ name: "", trigger: "new_listing", subject: "", body: "" }); }
  } catch { setErr("Couldn’t save."); }
  setSaving(false);
 }
 async function removeCustom(id: number) {
  if (!window.confirm("Delete this automation?")) return;
  const r = await fetch("/api/store/automations", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  if (r.ok) setData((await r.json()) as Data);
 }

 const triggerLabel = (v: string) => data?.triggers.find((t) => t.value === v)?.label || v;

 return (
  <>
   <div className="mt-2 flex items-center gap-3">
    <SectionLabel>Your own</SectionLabel>
    <TechButton className="ml-auto" variant="secondary" onClick={() => { setErr(null); setAdding(true); }}>
     <Plus size={14} /> New automation
    </TechButton>
   </div>

   {data && data.custom.length === 0 && !adding && (
    <TechCard className="mt-2 p-6 text-center text-[13px] text-stone-500">
     Nothing of your own yet. <button onClick={() => setAdding(true)} className="font-medium text-[var(--accent,#0e9f76)] underline">Write one</button> to email customers on a trigger you choose.
    </TechCard>
   )}

   <div className="mt-2 space-y-2.5">
    {(data?.custom || []).map((c) => {
     const busy = busyKey === `c${c.id}`;
     return (
      <TechCard key={c.id} className="flex items-start gap-3.5 p-4">
       <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500"><Zap size={17} strokeWidth={1.75} /></span>
       <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-stone-900">{c.name}</p>
        <p className="mt-0.5 text-[12px] text-stone-500">{triggerLabel(c.trigger)} → “{c.subject}”</p>
       </div>
       <div className="flex shrink-0 items-center gap-3">
        <Toggle on={c.enabled} className={busy ? "opacity-60 pointer-events-none" : undefined} onClick={() => toggle({ kind: "custom", id: c.id, enabled: !c.enabled }, `c${c.id}`)} />
        <button onClick={() => removeCustom(c.id)} aria-label={`Delete ${c.name}`} className="text-stone-300 transition hover:text-rose-500"><X size={15} /></button>
       </div>
      </TechCard>
     );
    })}
   </div>

   {adding && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => setAdding(false)}>
     <div className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:p-6" onClick={(e) => e.stopPropagation()}>
      <h2 className="mb-4 text-base font-semibold text-stone-900">New automation</h2>
      <div className="space-y-3">
       <Field label="Name"><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Welcome new customers" /></Field>
       <Field label="Trigger — when it sends">
        <select value={form.trigger} onChange={(e) => setForm((f) => ({ ...f, trigger: e.target.value }))} className="h-9 w-full rounded-md border border-stone-300 bg-white px-2 text-[13px] text-stone-900 outline-none focus:border-stone-400">
         {(data?.triggers || []).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
       </Field>
       <Field label="Subject"><Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Welcome to the family ✨" /></Field>
       <Field label="Message"><EmailEditor body={form.body} onBody={(v) => setForm((f) => ({ ...f, body: v }))} subject={form.subject} link="" placeholder="Thanks for joining — here’s what to expect…" /></Field>
      </div>
      {err && <p className="mt-3 text-xs text-red-600">{err}</p>}
      <div className="mt-5 flex items-center justify-end gap-2">
       <TechButton variant="ghost" onClick={() => setAdding(false)}>Cancel</TechButton>
       <TechButton disabled={saving || !form.name.trim() || !form.subject.trim() || !form.body.trim()} onClick={create}>{saving ? "Saving…" : "Create automation"}</TechButton>
      </div>
     </div>
    </div>
   )}
  </>
 );
}
