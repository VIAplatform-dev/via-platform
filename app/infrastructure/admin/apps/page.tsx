"use client";

import { useEffect, useState } from "react";
import { Input, Field } from "@/app/store/ui";
import { AdminPage, AdminHeader, TechCard, TechButton, StatusPill } from "../ui";
import { Mail, Megaphone, ShoppingBag, X, Check } from "lucide-react";

type KStatus = { connected: boolean; accountName: string | null; oauth?: boolean };

const COMING: { name: string; category: string; blurb: string; icon: typeof Mail; tint: string }[] = [
 { name: "Meta", category: "Ads & social", blurb: "Sync your catalog to Instagram & Facebook Shops.", icon: Megaphone, tint: "#1877F2" },
 { name: "Google Shopping", category: "Ads", blurb: "List your pieces in Google Shopping results.", icon: ShoppingBag, tint: "#34A853" },
];

export default function AppsPage() {
 const [k, setK] = useState<KStatus | null>(null);
 const [open, setOpen] = useState(false);
 const [showKey, setShowKey] = useState(false);
 const [apiKey, setApiKey] = useState("");
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState("");
 const [syncMsg, setSyncMsg] = useState("");
 const [notice, setNotice] = useState("");

 useEffect(() => {
 (async () => {
 const d = await fetch("/api/store/klaviyo").then((r) => (r.ok ? r.json() : null)).catch(() => null);
 if (d) setK(d);
 const q = new URLSearchParams(window.location.search).get("klaviyo");
 if (q === "connected") setNotice("Klaviyo connected ✓");
 else if (q === "error") setNotice("Couldn’t finish connecting to Klaviyo — try again.");
 else if (q === "unavailable") setNotice("Klaviyo login isn’t set up on the server yet.");
 if (q) window.history.replaceState({}, "", window.location.pathname);
 })();
 }, []);

 async function connectKey() {
 setBusy(true); setErr("");
 const r = await fetch("/api/store/klaviyo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey }) });
 const d = await r.json().catch(() => ({}));
 setBusy(false);
 if (!r.ok) { setErr(d.error || "Couldn’t connect."); return; }
 setK({ connected: true, accountName: d.accountName, oauth: k?.oauth }); setApiKey("");
 }
 async function disconnect() {
 if (!window.confirm("Disconnect Klaviyo? VYA will stop sending your customers and orders to it.")) return;
 await fetch("/api/store/klaviyo", { method: "DELETE" }).catch(() => {});
 setK({ connected: false, accountName: null, oauth: k?.oauth }); setSyncMsg("");
 }
 async function sync() {
 setBusy(true); setSyncMsg("Syncing…");
 const r = await fetch("/api/store/klaviyo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync" }) });
 const d = await r.json().catch(() => ({}));
 setBusy(false);
 setSyncMsg(r.ok ? `Synced ${d.synced} of ${d.total} customer${d.total === 1 ? "" : "s"}. ✓` : "Sync failed — try again.");
 }

 const keyForm = (
 <div className="space-y-3">
 <ol className="space-y-1.5 text-[13px] text-stone-600">
 <li><span className="font-medium text-stone-800">1.</span> In Klaviyo → <span className="font-medium">Settings → API keys</span>, copy a <span className="font-medium">Private API key</span> (<span className="font-mono text-[12px]">pk_…</span>).</li>
 <li><span className="font-medium text-stone-800">2.</span> Paste it here.</li>
 </ol>
 <Field label="Klaviyo private API key"><Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="pk_••••••••••••••••" /></Field>
 <div className="flex flex-wrap items-center gap-2">
 <TechButton onClick={connectKey} disabled={busy || !apiKey.trim()}>{busy ? "Connecting…" : "Connect"}</TechButton>
 {err && <span className="text-[12px] text-rose-600">{err}</span>}
 </div>
 </div>
 );

 return (
 <AdminPage className="max-w-3xl">
 <AdminHeader eyebrow="Apps · Integrations" title="Apps & integrations" subtitle="Optional add-ons to extend your store." />

 {notice && <div className="mb-4 rounded-lg bg-[var(--accent-soft,#eafaf3)] px-4 py-2.5 text-[13px] font-medium text-[var(--accent-ink,#0b7a5c)]">{notice}</div>}

 <div className="mb-5 rounded-xl border border-stone-200/70 bg-stone-50/70 px-4 py-3 text-[12.5px] leading-relaxed text-stone-500">
 Everything in VYA works without these. Your storefront, checkout, email <span className="font-medium text-stone-600">Campaigns</span>, and <span className="font-medium text-stone-600">Automations</span> all run on their own — connect an app only if you want its extra power.
 </div>

 <div className="grid gap-3 sm:grid-cols-2">
 <TechCard
 role="button"
 tabIndex={0}
 onClick={() => setOpen(true)}
 onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}
 className="flex cursor-pointer flex-col p-4 text-left transition hover:border-stone-300"
 >
 <div className="flex items-center gap-3">
 <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: "#232426" }}><Mail size={18} /></span>
 <div>
 <p className="text-[14px] font-semibold text-stone-900">Klaviyo</p>
 <p className="text-[11px] uppercase tracking-[0.08em] text-stone-400">Email marketing</p>
 </div>
 {k?.connected && <StatusPill tone="live" dot className="ml-auto">Connected</StatusPill>}
 </div>
 <p className="mt-3 text-[12.5px] leading-relaxed text-stone-500">Sends your customers + orders to Klaviyo so you can build powerful emails and automated flows there.</p>
 <span className="mt-3 text-[12px] font-medium text-[var(--accent-ink,#0b7a5c)]">{k?.connected ? "Manage →" : "Connect →"}</span>
 </TechCard>

 {COMING.map((a) => (
 <TechCard key={a.name} className="flex flex-col border-stone-200/60 bg-stone-50/40 p-4 shadow-none">
 <div className="flex items-center gap-3">
 <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white opacity-70" style={{ background: a.tint }}><a.icon size={18} /></span>
 <div>
 <p className="text-[14px] font-semibold text-stone-500">{a.name}</p>
 <p className="text-[11px] uppercase tracking-[0.08em] text-stone-400">{a.category}</p>
 </div>
 <StatusPill tone="neutral" className="ml-auto">Soon</StatusPill>
 </div>
 <p className="mt-3 text-[12.5px] leading-relaxed text-stone-400">{a.blurb}</p>
 </TechCard>
 ))}
 </div>

 {open && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => setOpen(false)}>
 <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
 <div className="mb-4 flex items-center gap-3">
 <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: "#232426" }}><Mail size={18} /></span>
 <div><p className="text-[15px] font-semibold text-stone-900">Klaviyo</p><p className="text-[11px] uppercase tracking-[0.08em] text-stone-400">Email marketing · optional</p></div>
 <button onClick={() => setOpen(false)} className="ml-auto rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"><X size={16} /></button>
 </div>

 {k?.connected ? (
 <div className="space-y-4">
 <div className="flex items-center gap-2 rounded-lg bg-[var(--accent-soft,#eafaf3)] px-3 py-2.5 text-[13px] font-medium text-[var(--accent-ink,#0b7a5c)]"><Check size={14} /> Connected{k.accountName ? ` to ${k.accountName}` : ""}</div>
 <p className="text-[13px] leading-relaxed text-stone-600">New orders sync automatically. Back-fill your existing customers so your Klaviyo flows have an audience:</p>
 <div className="flex flex-wrap items-center gap-2">
 <TechButton onClick={sync} disabled={busy}>{busy ? "Syncing…" : "Sync my customers now"}</TechButton>
 {syncMsg && <span className="text-[12px] text-stone-600">{syncMsg}</span>}
 </div>
 <button onClick={disconnect} className="text-[12px] text-stone-400 transition hover:text-rose-600">Disconnect</button>
 </div>
 ) : (
 <div className="space-y-4">
 <p className="text-[13px] leading-relaxed text-stone-600">Connect your Klaviyo account and VYA will feed it your customers and every sale — then you build emails and flows in Klaviyo. You’ll need a Klaviyo account.</p>
 {k?.oauth ? (
 <div className="space-y-2">
 <a href="/api/store/klaviyo/connect" className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium text-white transition hover:opacity-90" style={{ background: "#232426" }}><Mail size={15} /> Log in with Klaviyo</a>
 {!showKey ? (
 <button onClick={() => setShowKey(true)} className="text-[12px] text-stone-400 underline hover:text-stone-600">or paste an API key instead</button>
 ) : keyForm}
 </div>
 ) : keyForm}
 </div>
 )}
 </div>
 </div>
 )}

 <p className="mt-4 text-[12px] leading-relaxed text-stone-400">Not sure? Skip this entirely — VYA’s built-in Campaigns and Automations cover email on their own.</p>
 </AdminPage>
 );
}
