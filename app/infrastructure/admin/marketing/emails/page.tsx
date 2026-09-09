"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, FileText, Send, Zap } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, StatusPill, Toggle } from "../../ui";

// Every email a store sends, in one place.
//
// Before this they lived in three: automations under one tab, scheduled sends invisible until they
// went out, and drafts nowhere at all. A seller had no way to answer "what is my shop about to
// send?" — which is the question you ask before you go to bed.

type Builtin = { kind: "builtin"; key: string; name: string; body: string; cadence: string; enabled: boolean };
type Custom = { kind: "custom"; id: number; name: string; trigger: string; subject: string; body: string; enabled: boolean };
type Campaign = { id: number; subject: string; body: string; status: string; scheduledAt: string | null; sentAt: string | null; recipientCount: number; segment: string | null };

const when = (iso: string | null) =>
 iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

export default function EmailsPage() {
 const [automatic, setAutomatic] = useState<{ builtin: Builtin[]; custom: Custom[] }>({ builtin: [], custom: [] });
 const [drafts, setDrafts] = useState<Campaign[]>([]);
 const [scheduled, setScheduled] = useState<Campaign[]>([]);
 const [sent, setSent] = useState<Campaign[]>([]);
 const [loading, setLoading] = useState(true);
 const [busy, setBusy] = useState<number | null>(null);

 const load = useCallback(async () => {
  const d = await fetch("/api/store/emails").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (d?.ok) {
   setAutomatic(d.automatic || { builtin: [], custom: [] });
   setDrafts(d.drafts || []);
   setScheduled(d.scheduled || []);
   setSent(d.sent || []);
  }
  setLoading(false);
 }, []);
 useEffect(() => { void load(); }, [load]);

 async function toggleBuiltin(key: string, on: boolean) {
  setAutomatic((a) => ({ ...a, builtin: a.builtin.map((b) => (b.key === key ? { ...b, enabled: on } : b)) }));
  await fetch("/api/store/automations", {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ kind: "builtin", key, enabled: on }),
  }).catch(() => {});
 }

 async function remove(id: number) {
  setBusy(id);
  await fetch(`/api/store/emails?id=${id}`, { method: "DELETE" }).catch(() => {});
  setBusy(null);
  void load();
 }

 // Opening one puts its words back in the composer, so editing is editing rather than retyping.
 const edit = (c: Campaign) =>
  `/admin/marketing/campaigns/compose?subject=${encodeURIComponent(c.subject)}&body=${encodeURIComponent(c.body)}`;

 return (
  <AdminPage>
   <AdminHeader
    eyebrow="Store · Marketing"
    title="Your emails"
    subtitle="Everything your shop sends: the ones that go on their own, what's waiting for you, and what's scheduled."
    actions={<TechButton onClick={() => { window.location.href = "/admin/marketing/campaigns"; }}><Send size={14} /> Write an email</TechButton>}
   />

   {loading ? (
    <TechCard className="px-5 py-8 text-center text-[13px] text-stone-400">Loading…</TechCard>
   ) : (
    <div className="flex flex-col gap-4">

     {/* Waiting for her — first, because it's the only section with something to do in it. */}
     {drafts.length > 0 && (
      <TechCard className="overflow-hidden">
       <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
        <FileText size={14} className="text-stone-400" />
        <h2 className="text-[13px] font-semibold text-stone-800">Ready for you to check</h2>
       </div>
       <div className="divide-y divide-stone-100">
        {drafts.map((c) => (
         <div key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
          <div className="min-w-0 flex-1">
           <p className="truncate text-[13.5px] font-medium text-stone-900">{c.subject}</p>
           <p className="mt-0.5 truncate text-[12px] text-stone-500">
            {c.segment === "new-arrivals" ? "Your new pieces, gathered for you" : c.body.split("\n")[0]}
           </p>
          </div>
          <a href={edit(c)} className="rounded-lg bg-stone-900 px-3 py-1.5 text-[12.5px] font-medium text-white transition hover:opacity-90">Open and send</a>
          <button onClick={() => remove(c.id)} disabled={busy === c.id} className="text-[12px] text-stone-400 hover:text-rose-600">Discard</button>
         </div>
        ))}
       </div>
      </TechCard>
     )}

     {scheduled.length > 0 && (
      <TechCard className="overflow-hidden">
       <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
        <Clock size={14} className="text-stone-400" />
        <h2 className="text-[13px] font-semibold text-stone-800">Going out later</h2>
       </div>
       <div className="divide-y divide-stone-100">
        {scheduled.map((c) => (
         <div key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
          <div className="min-w-0 flex-1">
           <p className="truncate text-[13.5px] font-medium text-stone-900">{c.subject}</p>
           <p className="mt-0.5 text-[12px] text-stone-500">Sends {when(c.scheduledAt)}</p>
          </div>
          <a href={edit(c)} className="rounded-lg border border-stone-200 px-3 py-1.5 text-[12.5px] text-stone-600 transition hover:bg-stone-50">Edit</a>
          <button onClick={() => remove(c.id)} disabled={busy === c.id} className="text-[12px] text-stone-400 hover:text-rose-600">Call it off</button>
         </div>
        ))}
       </div>
      </TechCard>
     )}

     <TechCard className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
       <Zap size={14} className="text-stone-400" />
       <div className="flex-1">
        <h2 className="text-[13px] font-semibold text-stone-800">Sent on their own</h2>
        <p className="mt-0.5 text-[12px] text-stone-500">These fire when something happens — an order, a basket left behind. You don&rsquo;t send them.</p>
       </div>
      </div>
      <div className="divide-y divide-stone-100">
       {automatic.builtin.map((b) => (
        <div key={b.key} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
         <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium text-stone-900">{b.name}</p>
          <p className="mt-0.5 max-w-[64ch] text-[12px] leading-relaxed text-stone-500">{b.body}</p>
          <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-stone-400">{b.cadence}</p>
         </div>
         <Toggle on={b.enabled} onClick={() => toggleBuiltin(b.key, !b.enabled)} />
        </div>
       ))}
       {automatic.custom.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
         <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium text-stone-900">{c.name}</p>
          <p className="mt-0.5 truncate text-[12px] text-stone-500">{c.subject}</p>
         </div>
         <a href="/admin/marketing/automations" className="rounded-lg border border-stone-200 px-3 py-1.5 text-[12.5px] text-stone-600 transition hover:bg-stone-50">Edit</a>
         <StatusPill tone={c.enabled ? "live" : "neutral"} dot={c.enabled}>{c.enabled ? "On" : "Off"}</StatusPill>
        </div>
       ))}
      </div>
      <div className="border-t border-stone-100 px-5 py-3">
       <a href="/admin/marketing/automations" className="text-[12.5px] text-stone-500 underline underline-offset-2 hover:text-stone-900">Write your own automatic email</a>
      </div>
     </TechCard>

     {sent.length > 0 && (
      <TechCard className="overflow-hidden">
       <div className="border-b border-stone-100 px-5 py-3">
        <h2 className="text-[13px] font-semibold text-stone-800">Already sent</h2>
       </div>
       <div className="divide-y divide-stone-100">
        {sent.map((c) => (
         <div key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
           <p className="truncate text-[13px] text-stone-700">{c.subject}</p>
           <p className="mt-0.5 text-[12px] text-stone-400">{when(c.sentAt)} · {c.recipientCount} {c.recipientCount === 1 ? "person" : "people"}</p>
          </div>
         </div>
        ))}
       </div>
      </TechCard>
     )}
    </div>
   )}
  </AdminPage>
 );
}
