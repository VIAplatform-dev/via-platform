"use client";

import { useEffect, useState } from "react";
import { Bell, Mail, Smartphone } from "lucide-react";
import { AdminHeader, TechCard, Toggle, cn } from "../../ui";
import { PUSH_EVENTS, EMAIL_EVENTS, PUSH_LABELS, EMAIL_LABELS, normalizePrefs, mergePrefs, type NotificationPrefs, type NotificationPrefsPatch, type PushEvent, type EmailEvent } from "@/app/lib/notification-prefs-core";

// Notifications: the same seven switches the phone's Notifications screen shows, on the web.
//
// One toggle is one PUT naming only the key that changed — the server merges it — so a flip here
// never overwrites a choice made on the phone a minute ago. Push needs the phone app (a browser
// tab cannot buzz); the page says so rather than offering a switch that can do nothing here.

function withStore(path: string): string {
 if (typeof window === "undefined") return path;
 const s = new URLSearchParams(window.location.search).get("store");
 return s ? `${path}${path.includes("?") ? "&" : "?"}store=${encodeURIComponent(s)}` : path;
}

export default function NotificationsSettingsPage() {
 const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
 const [err, setErr] = useState<string | null>(null);
 const [msg, setMsg] = useState<string | null>(null);
 const [busyKey, setBusyKey] = useState<string | null>(null);

 useEffect(() => {
  let active = true;
  fetch(withStore("/api/store/notification-prefs"))
   .then((r) => (r.ok ? r.json() : null))
   .then((d) => { if (active) setPrefs(normalizePrefs(d?.prefs)); })
   .catch(() => { if (active) { setPrefs(normalizePrefs(null)); setErr("Couldn’t load your notification settings."); } });
  return () => { active = false; };
 }, []);

 async function flip(patch: NotificationPrefsPatch, key: string) {
  if (!prefs) return;
  const before = prefs;
  const next = mergePrefs(prefs, patch);
  setPrefs(next); setBusyKey(key); setErr(null); setMsg(null);
  const r = await fetch(withStore("/api/store/notification-prefs"), {
   method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusyKey(null);
  if (!r || !r.ok) { setPrefs(before); setErr(r?.d?.error || "Couldn’t save that."); return; }
  setPrefs(normalizePrefs(r.d?.prefs));
  setMsg("Saved.");
 }

 const row = (label: string, on: boolean, onClick: () => void, busy: boolean, testId: string) => (
  <div key={testId} className="flex items-center justify-between gap-4 py-3" data-testid={testId}>
   <span className="text-[13.5px] text-stone-800">{label}</span>
   <Toggle on={on} onClick={onClick} className={cn(busy && "opacity-60")} />
  </div>
 );

 return (
  <>
   <AdminHeader eyebrow="Settings" title="Notifications" subtitle="Which sales, messages and summaries reach your phone and your inbox." />
   {err && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{err}</div>}
   {msg && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">{msg}</div>}

   <TechCard className="mb-4 p-5">
    <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-stone-400"><Smartphone size={13} /> Push</div>
    <p className="mb-2 text-[12.5px] text-stone-500">Buzzes the VYA app on your phone. Needs the app installed and signed in — a browser tab can’t be pushed to.</p>
    <div className="divide-y divide-stone-100">
     {prefs ? PUSH_EVENTS.map((k: PushEvent) => row(PUSH_LABELS[k], prefs.push[k], () => flip({ push: { [k]: !prefs.push[k] } }, `push:${k}`), busyKey === `push:${k}`, `pref-push-${k}`)) : <p className="py-3 text-[13px] text-stone-400">Loading…</p>}
    </div>
   </TechCard>

   <TechCard className="p-5">
    <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-stone-400"><Mail size={13} /> Email</div>
    <p className="mb-2 text-[12.5px] text-stone-500">Sent to the store’s contact address.</p>
    <div className="divide-y divide-stone-100">
     {prefs ? EMAIL_EVENTS.map((k: EmailEvent) => row(EMAIL_LABELS[k], prefs.email[k], () => flip({ email: { [k]: !prefs.email[k] } }, `email:${k}`), busyKey === `email:${k}`, `pref-email-${k}`)) : <p className="py-3 text-[13px] text-stone-400">Loading…</p>}
    </div>
   </TechCard>

   <p className="mt-4 flex items-start gap-2 text-[12px] text-stone-400"><Bell size={13} className="mt-0.5 shrink-0" /> Sales and messages are on by default. Everything else you opt into — a phone that buzzes for nothing gets silenced, and then the two that matter are lost with it.</p>
  </>
 );
}
