"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, Check, AlertTriangle, RefreshCw } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, StatusPill, Toggle, cn } from "../../ui";

// Connect the email tool a store already uses.
//
// The pitch is honest about what this does and doesn't do: VYA sends WHO your customers are and what
// they bought. The store still writes and sends from Klaviyo or Mailchimp, because that's where
// their flows and templates live and we're not going to do a worse version of them.

type List = { id: string; name: string; members?: number };
type Connected = {
 provider: "klaviyo" | "mailchimp";
 accountName: string | null;
 keyMask: string;
 listId: string | null;
 listName: string | null;
 autoSync: boolean;
 handOverMarketing: boolean;
 ownership: { summary: string; vya: string[]; esp: string[] } | null;
 lastSyncAt: string | null;
 lastSyncNote: string | null;
 lists: List[];
 problem: string | null;
};
type Provider = { key: "klaviyo" | "mailchimp"; name: string; keyHint: string; where: string; available: boolean };

// What went wrong, said the way a shop owner would say it. They pressed a button and came back;
// "invalid_grant" is not an explanation.
const ERRORS: Record<string, string> = {
 cancelled: "No problem — nothing was connected.",
 expired: "That took a little too long. Press Connect and try again.",
 state: "That didn't come back the way it went out. Press Connect and try again.",
 exchange: "They didn't finish signing you in. Press Connect and try again.",
 metadata: "Mailchimp signed you in but didn't say which of their servers your account is on. Try again.",
 nocode: "They sent us back without signing you in. Try again.",
 signin: "Sign in to VYA first.",
 unavailable: "This isn't switched on yet — we're finishing the approval with them.",
};

export default function EspPage() {
 const [providers, setProviders] = useState<Provider[]>([]);
 const [connected, setConnected] = useState<Connected | null>(null);
 const [loading, setLoading] = useState(true);
 const params = useSearchParams();

 // Where "Open Mailchimp" goes. Their campaign builder is the thing a seller wants next.
 const HOME: Record<"klaviyo" | "mailchimp", string> = {
  mailchimp: "https://admin.mailchimp.com/campaigns/",
  klaviyo: "https://www.klaviyo.com/campaigns",
 };
 const [busy, setBusy] = useState<string | null>(null);
 const [err, setErr] = useState<string | null>(null);
 const [note, setNote] = useState<string | null>(null);

 // The seller is coming back from Mailchimp or Klaviyo — say what happened before anything else.
 useEffect(() => {
  const e = params.get("error");
  if (e) setErr(ERRORS[e] || "That didn't work. Try again.");
  if (params.get("connected")) setNote("Connected.");
 }, [params]);

 const load = useCallback(async () => {
  // Say when this fails. Swallowing it rendered an empty card with no buttons and no explanation —
  // which looks like the feature is broken rather than like the page couldn't load.
  const res = await fetch("/api/store/marketing/esp").catch(() => null);
  if (!res) { setErr("Couldn't reach VYA. Check your connection and reload."); setLoading(false); return; }
  if (res.status === 401) { setErr("Your session has expired here. Sign in again and reload this page."); setLoading(false); return; }
  const d = await res.json().catch(() => null);
  if (!d?.ok) { setErr(d?.error || `Couldn't load this page (${res.status}).`); setLoading(false); return; }
  setProviders(d.providers || []);
  setConnected(d.connected);
  setLoading(false);
 }, []);
 useEffect(() => { void load(); }, [load]);

 async function post(body: unknown, label: string) {
  setBusy(label); setErr(null); setNote(null);
  const r = await fetch("/api/store/marketing/esp", {
   method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(null);
  if (!r?.ok) { setErr(r?.d?.error || "That didn't work."); return null; }
  await load();
  return r.d;
 }

 async function sync() {
  const d = await post({ sync: true }, "sync");
  if (d) setNote(d.note || "Sent.");
 }
 async function disconnect() {
  setBusy("disconnect");
  await fetch("/api/store/marketing/esp", { method: "DELETE" }).catch(() => {});
  setBusy(null); setConnected(null); setNote("Disconnected. Your key has been deleted.");
 }


 const providerName = connected ? (connected.provider === "mailchimp" ? "Mailchimp" : "Klaviyo") : "";

 return (
  <AdminPage>
   <AdminHeader
    eyebrow="Apps · Integrations"
    title="Klaviyo & Mailchimp"
    subtitle="Already send your emails from Klaviyo or Mailchimp? Sign in and VYA keeps your customer list there up to date: who they are, what they bought, and who has unsubscribed. You carry on writing and sending from there."
   />

   {err && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700" role="alert">{err}</div>}
   {note && <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800"><Check size={14} />{note}</div>}

   {loading ? (
    <TechCard className="px-5 py-8 text-center text-[13px] text-stone-400">Loading…</TechCard>
   ) : connected ? (
    <div className="flex flex-col gap-4">
     {/* One card, not four. The state here is small — which account, which audience, who sends the
         marketing, when it last synced — and splitting it across four panels with two unlabelled
         toggles made it look like more decisions than it is. */}
     <TechCard className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-5 py-4">
       <Mail size={16} className="shrink-0 text-stone-400" />
       <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-stone-900">
         {providerName}
         {connected.accountName ? <span className="font-normal text-stone-400"> · {connected.accountName}</span> : null}
        </p>
        <p className="mt-0.5 text-[12px] text-stone-500">
         {connected.keyMask === "Signed in" ? `Signed in through ${providerName}` : `Key ${connected.keyMask}`}
        </p>
       </div>
       <StatusPill tone={connected.problem ? "down" : "live"} dot>{connected.problem ? "Not working" : "Connected"}</StatusPill>
       <a href={HOME[connected.provider]} target="_blank" rel="noreferrer"
        className="rounded-lg border border-stone-200 px-2.5 py-1 text-[12px] text-stone-600 transition hover:bg-stone-50">
        Open {providerName}
       </a>
       <button onClick={disconnect} disabled={busy === "disconnect"} className="text-[12px] text-stone-400 hover:text-rose-600">Disconnect</button>
      </div>

      {connected.problem && (
       <p className="flex items-start gap-2 bg-amber-50 px-5 py-3 text-[12.5px] leading-relaxed text-amber-900">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />{connected.problem}
       </p>
      )}

      {/* Audience + sync on one line: choosing where people go and putting them there is one task. */}
      <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-5 py-4">
       <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-stone-900">
         {connected.provider === "klaviyo" ? "List" : "Audience"}
        </p>
        <p className="mt-0.5 text-[12px] text-stone-500">
         {connected.lastSyncAt
          ? `Last synced ${new Date(connected.lastSyncAt).toLocaleString()}${connected.lastSyncNote ? ` — ${connected.lastSyncNote}` : ""}`
          : "Nobody has been sent across yet."}
        </p>
       </div>
       <div className="flex flex-wrap items-center gap-1.5">
        {connected.lists.length === 0 && <span className="text-[12.5px] text-stone-400">None found — make one in {providerName} first.</span>}
        {connected.lists.map((l) => (
         <button
          key={l.id} type="button"
          onClick={() => post({ listId: l.id, listName: l.name }, "list")}
          className={cn("rounded-lg border px-2.5 py-1.5 text-[12.5px] transition",
           connected.listId === l.id ? "border-stone-900 bg-stone-900/[0.03] ring-1 ring-stone-900" : "border-stone-200 hover:bg-stone-50")}
         >
          {l.name}{typeof l.members === "number" && <span className="ml-1.5 text-[11px] text-stone-400">{l.members}</span>}
         </button>
        ))}
        <TechButton onClick={sync} disabled={busy === "sync" || !connected.listId}>
         <RefreshCw size={13} className={busy === "sync" ? "animate-spin" : ""} />
         {busy === "sync" ? "Sending…" : "Sync now"}
        </TechButton>
       </div>
      </div>

      {/* Who sends what. The one thing here that can go wrong invisibly, so it says what it does. */}
      <div className="px-5 py-4">
       <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
         <p className="text-[13px] font-medium text-stone-900">
          Let {providerName} send the marketing
         </p>
         <p className="mt-0.5 max-w-[62ch] text-[12.5px] leading-relaxed text-stone-500">{connected.ownership?.summary}</p>
        </div>
        <Toggle on={connected.handOverMarketing} onClick={() => post({ handOverMarketing: !connected.handOverMarketing }, "handover")} />
       </div>
       {connected.ownership && (
        <div className="mt-4 grid gap-x-8 gap-y-1 rounded-xl bg-stone-50 p-4 sm:grid-cols-2">
         <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400 sm:col-span-1">VYA sends</p>
         <p className="hidden text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400 sm:block">
          {connected.handOverMarketing ? `${providerName} sends` : "VYA also sends"}
         </p>
         <ul className="flex flex-col gap-0.5">
          {connected.ownership.vya.map((x) => <li key={x} className="text-[12.5px] text-stone-600">{x}</li>)}
         </ul>
         <ul className="mt-3 flex flex-col gap-0.5 sm:mt-0">
          <li className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400 sm:hidden">
           {connected.handOverMarketing ? `${providerName} sends` : "VYA also sends"}
          </li>
          {connected.ownership.esp.map((x) => <li key={x} className="text-[12.5px] text-stone-600">{x}</li>)}
         </ul>
        </div>
       )}
      </div>

      {/* Live updates: a small setting, so a small row rather than its own card. */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-stone-100 px-5 py-3.5">
       <p className="text-[12.5px] text-stone-600">
        Send people across the moment they sign up, buy, or unsubscribe
       </p>
       <Toggle on={connected.autoSync} onClick={() => post({ autoSync: !connected.autoSync }, "auto")} />
      </div>
     </TechCard>

     <p className="px-1 text-[12px] leading-relaxed text-stone-400">
      Write and send in {providerName} as you always have. Your pieces and orders go across too, so you can
      drop real products into an email there, segment by what someone bought, and see what each campaign earned.
     </p>
    </div>
   ) : (
    <TechCard className="p-6">
     <p className="text-[13.5px] leading-relaxed text-stone-600">
      Sign in to the one you use. You&rsquo;ll land on their own login page, and come straight back here.
     </p>
     {providers.length === 0 && (
      <p className="mt-3 text-[13px] text-stone-400">No email tools are available right now — reload the page.</p>
     )}
     <div className="mt-4 flex flex-wrap gap-2.5">
      {providers.map((p) => (
       p.available ? (
        <a
         key={p.key}
         href={`/api/store/marketing/esp/connect/${p.key}`}
         className="rounded-lg bg-stone-900 px-4 py-2.5 text-[13.5px] font-medium text-white transition hover:opacity-90"
        >Connect {p.name}</a>
       ) : (
        <span key={p.key} className="rounded-lg border border-stone-200 px-4 py-2.5 text-[13.5px] text-stone-400" title="Not switched on yet">
         {p.name} — coming soon
        </span>
       )
      ))}
     </div>
     <p className="mt-4 text-[11.5px] leading-relaxed text-stone-400">
      VYA never sees your password, and you can disconnect it here — or from {providers.length ? providers.map((p) => p.name).join(" or ") : "your email tool"} — at any time.
     </p>
    </TechCard>
   )}
  </AdminPage>
 );
}
