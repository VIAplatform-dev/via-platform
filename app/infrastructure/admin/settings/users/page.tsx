"use client";

import { useEffect, useState } from "react";
import { Users as UsersIcon, Crown } from "lucide-react";
import { AdminHeader, TechCard, TechButton, StatusPill, cn } from "../../ui";

// Who can get into this store.
//
// Seats include the owner, which is how a seller reads "2 seats" — the owner plus one. The limit
// comes from her plan, and the page shows it as a count rather than only failing on submit: finding
// out you're full at the moment you invite someone is a worse experience than knowing beforehand.

type Role = "owner" | "staff";
type StoreUser = { email: string; role: Role; createdAt: string };
type Seats = { used: number; limit: number; remaining: number };

export default function UsersSettingsPage() {
 const [users, setUsers] = useState<StoreUser[]>([]);
 const [seats, setSeats] = useState<Seats | null>(null);
 const [loading, setLoading] = useState(true);
 const [email, setEmail] = useState("");
 const [role, setRole] = useState<Role>("staff");
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState<string | null>(null);
 const [confirm, setConfirm] = useState<string | null>(null);

 useEffect(() => {
  let active = true;
  (async () => {
   const d = await fetch("/api/store/users").then((r) => (r.ok ? r.json() : null)).catch(() => null);
   if (!active) return;
   if (d?.ok) { setUsers(d.users || []); setSeats(d.seats || null); }
   setLoading(false);
  })();
  return () => { active = false; };
 }, []);

 function apply(d: { users?: StoreUser[]; seats?: Seats }) {
  if (d.users) setUsers(d.users);
  if (d.seats) setSeats(d.seats);
 }

 async function invite() {
  setBusy(true); setErr(null);
  const r = await fetch("/api/store/users", {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ email: email.trim(), role }),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(false);
  if (!r || !r.ok) { setErr(r?.d?.error || "Couldn’t add them."); return; }
  setEmail(""); apply(r.d);
 }

 async function remove(target: string) {
  setBusy(true); setErr(null);
  const r = await fetch(`/api/store/users?email=${encodeURIComponent(target)}`, { method: "DELETE" })
   .then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(false); setConfirm(null);
  if (!r || !r.ok) { setErr(r?.d?.error || "Couldn’t remove them."); return; }
  apply(r.d);
 }

 const full = seats ? seats.remaining <= 0 : false;

 return (
  <>
   <AdminHeader
    eyebrow="Settings"
    title="People"
    subtitle="Who can sign in and work on this store."
    actions={seats ? <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-stone-400">{seats.used} of {seats.limit} seats</span> : undefined}
   />

   {err && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700" role="alert">{err}</div>}

   {loading ? (
    <TechCard className="px-5 py-8 text-center text-[13px] text-stone-400">Loading…</TechCard>
   ) : (
    <TechCard className="overflow-hidden">
     <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
      <UsersIcon size={15} className="text-stone-400" />
      <h2 className="text-[13px] font-semibold text-stone-800">On this store</h2>
     </div>

     <div className="divide-y divide-stone-100">
      {users.map((u) => (
       <div key={u.email} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
        <span className="min-w-0 flex-1">
         <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[13.5px] text-stone-800">{u.email}</span>
          {u.role === "owner" && <StatusPill tone="live"><Crown size={10} className="mr-1 inline" />Owner</StatusPill>}
         </span>
        </span>
        {u.role !== "owner" && (
         confirm === u.email ? (
          <>
           <span className="text-[12px] text-stone-500">Remove them?</span>
           <button onClick={() => remove(u.email)} disabled={busy} className="rounded-md bg-rose-600 px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-50">Remove</button>
           <button onClick={() => setConfirm(null)} className="text-[12px] text-stone-400 hover:text-stone-700">Cancel</button>
          </>
         ) : (
          <button onClick={() => setConfirm(u.email)} className="text-[12px] text-stone-400 hover:text-rose-600">Remove</button>
         )
        )}
       </div>
      ))}
     </div>

     <div className="border-t border-stone-100 px-5 py-4">
      {full ? (
       <p className="text-[13px] leading-relaxed text-stone-600">
        You’re using all {seats?.limit} of your seats. Remove someone, or move up a plan under{" "}
        <a href="/admin/settings/plan" className="underline underline-offset-2 hover:text-stone-900">Plan &amp; billing</a>.
       </p>
      ) : (
       <>
        <div className="flex flex-wrap items-end gap-2">
         <label className="min-w-0 flex-1 text-[11px] text-stone-500">
          <span className="mb-1 block">Email</span>
          <input
           value={email}
           onChange={(e) => setEmail(e.target.value)}
           onKeyDown={(e) => { if (e.key === "Enter" && email.trim()) invite(); }}
           placeholder="them@example.com"
           inputMode="email"
           className="w-full rounded-md border border-stone-300 px-2.5 py-2 text-[13px] outline-none focus:border-stone-500"
          />
         </label>
         <label className="text-[11px] text-stone-500">
          <span className="mb-1 block">Access</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded-md border border-stone-300 bg-white px-2 py-2 text-[13px] outline-none focus:border-stone-500">
           <option value="staff">Staff</option>
           <option value="owner">Owner</option>
          </select>
         </label>
         <TechButton onClick={invite} disabled={busy || !email.trim()}>{busy ? "Adding…" : "Add person"}</TechButton>
        </div>
        <p className={cn("mt-3 text-[11.5px] leading-relaxed text-stone-400")}>
         Staff can work in the store — list, fulfil, message buyers. Owners can also change settings, billing
         and who else has access. {seats ? `${seats.remaining} ${seats.remaining === 1 ? "seat" : "seats"} left on your plan.` : ""}
        </p>
       </>
      )}
     </div>
    </TechCard>
   )}
  </>
 );
}
