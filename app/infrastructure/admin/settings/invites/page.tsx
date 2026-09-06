"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Mail } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, StatusPill, cn } from "../../ui";

// Who can open a store on VYA.
//
// This is VYA's own list, not a store's — the people we've told "yes, you can run a shop here".
// Everyone else who reaches the signup wizard is turned away, which is what makes the pilot a pilot.

type Invite = { email: string; note: string | null; reserveSlug: string | null; createdAt: string; usedAt: string | null };

export default function InvitesPage() {
 const [invites, setInvites] = useState<Invite[]>([]);
 const [loading, setLoading] = useState(true);
 const [email, setEmail] = useState("");
 const [note, setNote] = useState("");
 const [reserveSlug, setReserveSlug] = useState("");
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState<string | null>(null);
 const [confirm, setConfirm] = useState<string | null>(null);

 const load = useCallback(async () => {
  const res = await fetch("/api/admin/invites").catch(() => null);
  if (!res?.ok) { setErr(res?.status === 404 ? "Sign in as the VYA owner to see this." : "Couldn't load the list."); setLoading(false); return; }
  const d = await res.json().catch(() => null);
  if (d?.ok) setInvites(d.invites || []);
  setLoading(false);
 }, []);
 useEffect(() => { void load(); }, [load]);

 async function add() {
  setBusy(true); setErr(null);
  const r = await fetch("/api/admin/invites", {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ email, note: note || null, reserveSlug: reserveSlug || null }),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(false);
  if (!r?.ok) { setErr(r?.d?.error || "Couldn't add that."); return; }
  setInvites(r.d.invites || []); setEmail(""); setNote(""); setReserveSlug("");
 }

 async function revoke(e: string) {
  setBusy(true);
  const r = await fetch(`/api/admin/invites?email=${encodeURIComponent(e)}`, { method: "DELETE" })
   .then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(false); setConfirm(null);
  if (r?.ok) setInvites(r.d.invites || []);
 }

 const input = "w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none focus:border-stone-400";

 return (
  <AdminPage>
   <AdminHeader
    eyebrow="Settings · VYA"
    title="Who can open a store"
    subtitle="VYA is invite-only. Only the emails on this list can create a store — everyone else is turned away at signup."
    actions={<span className="font-mono text-[11px] uppercase tracking-[0.12em] text-stone-400">{invites.length} invited</span>}
   />

   {err && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700" role="alert">{err}</div>}

   <TechCard className="mb-4 p-5">
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
     <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-stone-700">Email</span>
      <input className={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="them@theirshop.com"
       onKeyDown={(e) => { if (e.key === "Enter" && email.trim()) void add(); }} />
     </label>
     <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-stone-700">Note</span>
      <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Met at the Brooklyn market" />
     </label>
     <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-stone-700">Hold a store for them</span>
      <input className={input} value={reserveSlug} onChange={(e) => setReserveSlug(e.target.value)} placeholder="their-store-slug" />
     </label>
     <TechButton onClick={add} disabled={busy || !email.trim()}>{busy ? "Adding…" : "Invite"}</TechButton>
    </div>
    <p className="mt-3 max-w-[80ch] text-[11.5px] leading-relaxed text-stone-400">
     Holding a store is for someone whose site we&rsquo;ve already imported: when they sign up and say they
     have a website, they get that shop with its pieces already in it, instead of an empty one. Leave it
     blank for everyone else.
    </p>
   </TechCard>

   {loading ? (
    <TechCard className="px-5 py-8 text-center text-[13px] text-stone-400">Loading…</TechCard>
   ) : invites.length === 0 ? (
    <TechCard className="px-5 py-10 text-center">
     <Mail size={22} className="mx-auto mb-2 text-stone-300" />
     <p className="text-[13.5px] text-stone-600">Nobody is invited yet.</p>
     <p className="mt-1 text-[12.5px] text-stone-400">Nobody can open a store until you add an email above.</p>
    </TechCard>
   ) : (
    <TechCard className="overflow-hidden">
     <div className="divide-y divide-stone-100">
      {invites.map((i) => (
       <div key={i.email} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
        <div className="min-w-0 flex-1">
         <p className="truncate text-[13.5px] text-stone-800">{i.email}</p>
         <p className="mt-0.5 text-[12px] text-stone-400">
          {i.note ? `${i.note} · ` : ""}invited {new Date(i.createdAt).toLocaleDateString()}
          {i.reserveSlug ? ` · holding ${i.reserveSlug}` : ""}
         </p>
        </div>
        <StatusPill tone={i.usedAt ? "live" : "neutral"} dot={Boolean(i.usedAt)}>
         {i.usedAt ? "Opened a store" : "Not started"}
        </StatusPill>
        {confirm === i.email ? (
         <>
          <span className="text-[12px] text-stone-500">Remove their invite?</span>
          <button onClick={() => revoke(i.email)} disabled={busy} className="rounded-md bg-rose-600 px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-50">Remove</button>
          <button onClick={() => setConfirm(null)} className="text-[12px] text-stone-400 hover:text-stone-700">Cancel</button>
         </>
        ) : (
         <button onClick={() => setConfirm(i.email)} className={cn("text-[12px] text-stone-400 hover:text-rose-600")}>Remove</button>
        )}
       </div>
      ))}
     </div>
     <p className="border-t border-stone-100 px-5 py-3 text-[11.5px] leading-relaxed text-stone-400">
      Removing an invite stops someone signing up. It never touches a store they&rsquo;ve already opened —
      a shop that&rsquo;s running stays running.
     </p>
    </TechCard>
   )}
  </AdminPage>
 );
}
