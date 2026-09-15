"use client";

import { useEffect, useState } from "react";

type Admin = { id: number; email: string; active: boolean; hasPassword: boolean; createdAt: string };

export default function AdminUsersPage() {
 const [admins, setAdmins] = useState<Admin[]>([]);
 const [email, setEmail] = useState("");
 const [busy, setBusy] = useState(false);
 const [msg, setMsg] = useState<string | null>(null);
 const [err, setErr] = useState<string | null>(null);
 const [loading, setLoading] = useState(true);

 async function load() {
 try {
 const r = await fetch("/api/admin/users");
 if (r.ok) { const d = await r.json(); setAdmins(d.admins || []); }
 else if (r.status === 401) setErr("Sign in as an admin to manage admins.");
 } catch { /* ignore */ }
 setLoading(false);
 }
 useEffect(() => { (async () => { await load(); })(); }, []);

 async function invite() {
 if (!email.trim()) return;
 setBusy(true); setMsg(null); setErr(null);
 try {
 const r = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
 const d = await r.json();
 if (!r.ok) setErr(d.error || "Couldn't send the invite.");
 else { setAdmins(d.admins || []); setMsg(`Invite emailed to ${d.invited}. They'll set their own password.`); setEmail(""); }
 } catch { setErr("Couldn't send the invite."); }
 setBusy(false);
 }

 async function remove(em: string) {
 if (!window.confirm(`Remove ${em}'s admin access?`)) return;
 const r = await fetch("/api/admin/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: em }) });
 const d = await r.json().catch(() => null);
 if (r.ok && d) setAdmins(d.admins || []);
 }

 const input = "flex-1 border border-[#5D0F17]/20 bg-white px-3.5 py-2.5 text-sm text-[#5D0F17] outline-none focus:border-[#5D0F17]/50 transition";

 return (
 <main className="min-h-screen bg-[#FFFDF8] text-[#5D0F17]">
 <div className="mx-auto max-w-xl px-6 py-14">
 <p className="mb-2 text-[10px] uppercase tracking-[0.25em] text-[#5D0F17]/45">Admin</p>
 <h1 className="mb-2 font-serif text-3xl">Team access</h1>
 <p className="mb-8 text-sm text-[#5D0F17]/55">Invite someone to the VYA admin. They get an email to set their own password, then sign in with their email, password, and a one-time code sent to them.</p>

 {err && <p className="mb-6 border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}

 <div className="mb-3 flex gap-2">
 <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && invite()} placeholder="name@theviaplatform.com" />
 <button onClick={invite} disabled={busy || !email.trim()} className="shrink-0 bg-[#5D0F17] px-5 text-xs uppercase tracking-[0.15em] text-[#FFFDF8] transition hover:bg-[#5D0F17]/85 disabled:opacity-50">{busy ? "Sending…" : "Invite"}</button>
 </div>
 {msg && <p className="mb-6 text-xs text-green-700">{msg}</p>}

 <div className="mt-8">
 <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-[#5D0F17]/45">Admins</p>
 {loading ? (
 <p className="text-sm text-[#5D0F17]/40">Loading…</p>
 ) : admins.length === 0 ? (
 <p className="text-sm text-[#5D0F17]/40">No invited admins yet. The shared password still works.</p>
 ) : (
 <div className="divide-y divide-[#5D0F17]/10 border-y border-[#5D0F17]/10">
 {admins.map((a) => (
 <div key={a.id} className="flex items-center justify-between gap-3 py-3">
 <div>
 <p className="text-sm">{a.email}</p>
 <p className="text-xs text-[#5D0F17]/45">{a.active ? "Active" : a.hasPassword ? "Set up" : "Invited. Pending password"}</p>
 </div>
 <button onClick={() => remove(a.email)} className="text-[11px] uppercase tracking-[0.14em] text-[#5D0F17]/40 hover:text-red-700">Remove</button>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 </main>
 );
}
