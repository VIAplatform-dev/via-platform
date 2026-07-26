"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, TechButtonLink, Toggle } from "../../ui";
import { Input } from "@/app/store/ui";

type Platform = { key: string; name: string; hasApi: boolean };
type Account = { platform: string; handle: string; autoList: boolean };
type Ebay = { configured: boolean; connected: boolean; user: string | null };
type Etsy = { configured: boolean; connected: boolean; shop: string | null };
type EbayReady = { readyToList: boolean; tokenValid: boolean; policies: { fulfillment: boolean; payment: boolean; return: boolean } };

export default function CrossListingSettingsPage() {
 const [platforms, setPlatforms] = useState<Platform[]>([]);
 const [accounts, setAccounts] = useState<Account[]>([]);
 const [ebay, setEbay] = useState<Ebay | null>(null);
 const [etsy, setEtsy] = useState<Etsy | null>(null);
 const [loading, setLoading] = useState(true);
 const [handles, setHandles] = useState<Record<string, string>>({});
 const [ebayReady, setEbayReady] = useState<EbayReady | null>(null);
 const [ebaySetupBusy, setEbaySetupBusy] = useState(false);

 async function load() {
 const r = await fetch("/api/store/cross-listing").then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (r) { setPlatforms(r.platforms); setAccounts(r.accounts); setEbay(r.ebay); setEtsy(r.etsy); }
 setLoading(false);
 }
 useEffect(() => {
 let active = true;
 (async () => {
 const r = await fetch("/api/store/cross-listing").then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (r && active) { setPlatforms(r.platforms); setAccounts(r.accounts); setEbay(r.ebay); setEtsy(r.etsy); }
 if (active) setLoading(false);
 })();
 return () => { active = false; };
 }, []);

 const acct = (k: string) => accounts.find((a) => a.platform === k);

 async function connect(k: string) {
 const handle = (handles[k] || "").trim();
 if (!handle) return;
 const r = await fetch("/api/store/cross-listing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: k, handle }) });
 const d = await r.json(); if (r.ok) setAccounts(d.accounts);
 }
 async function disconnect(k: string) {
 const r = await fetch(`/api/store/cross-listing?platform=${k}`, { method: "DELETE" });
 if (r.ok) await load();
 }
 async function toggleAuto(a: Account) {
 const r = await fetch("/api/store/cross-listing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: a.platform, handle: a.handle, autoList: !a.autoList }) });
 const d = await r.json(); if (r.ok) setAccounts(d.accounts);
 }

 // Once eBay is connected, check whether it's actually ready to list (opted in + all 3 policies).
 useEffect(() => {
 if (!ebay?.connected) return;
 let active = true;
 fetch("/api/store/cross-listing/ebay/status").then((x) => (x.ok ? x.json() : null)).then((r) => { if (active && r?.ok) setEbayReady(r); }).catch(() => {});
 return () => { active = false; };
 }, [ebay?.connected]);

 async function runEbaySetup() {
 setEbaySetupBusy(true);
 const r = await fetch("/api/store/cross-listing/ebay/setup", { method: "POST" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (r) setEbayReady({ readyToList: !!r.ok, tokenValid: true, policies: r.policies });
 setEbaySetupBusy(false);
 }

 return (
 <AdminPage>
 <Link href="/infrastructure/admin/cross-listing" className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-stone-500 hover:text-stone-800"><ArrowLeft size={13} /> Cross-listing</Link>
 <AdminHeader eyebrow="Sell · Cross-listing · Settings" title="Connected marketplaces" subtitle="Connect the shops you also sell on. New VYA listings queue to every auto-list channel automatically, and a sale anywhere pulls the piece from everywhere so it never double-sells." />

 <TechCard className="overflow-hidden">
 {loading ? (
 <div className="flex items-center justify-center py-16 text-sm text-stone-400">Loading…</div>
 ) : (
 <div className="divide-y divide-stone-100">
 {platforms.map((p) => {
 const a = acct(p.key);
 // eBay uses OAuth (real auto-posting), not a handle.
 if (p.key === "ebay") {
 return (
 <div key={p.key} className="flex items-center gap-3 px-5 py-3.5">
 <div className="w-28 shrink-0"><span className="text-[13px] font-medium text-stone-800">eBay</span><span className="ml-1 rounded bg-[var(--accent-soft,#eafaf3)] px-1 text-[10px] text-[var(--accent-ink,#0b7a5c)]">API</span></div>
 {!ebay?.configured ? (
 <span className="flex-1 text-[12px] text-stone-400">Not set up on the server yet (needs eBay app keys).</span>
 ) : ebay?.connected ? (
 <>
 <div className="min-w-0 flex-1">
 <p className="truncate text-[13px] text-[var(--accent-ink,#0b7a5c)]">✓ Connected{ebay.user ? ` · ${ebay.user}` : ""} — auto-posts for real</p>
 {ebayReady && (ebayReady.readyToList ? (
 <p className="text-[11px] text-[var(--accent-ink,#0b7a5c)]">Ready to list — payment, shipping &amp; returns are set.</p>
 ) : (
 <div className="mt-0.5 flex flex-wrap items-center gap-2">
 <span className="text-[11px] text-amber-600">eBay needs business policies before it can list.</span>
 <button onClick={runEbaySetup} disabled={ebaySetupBusy} className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-200 disabled:opacity-50">{ebaySetupBusy ? "Setting up…" : "Set up automatically"}</button>
 </div>
 ))}
 </div>
 <button onClick={() => disconnect("ebay")} className="self-start text-[12px] text-stone-400 hover:text-rose-600">Disconnect</button>
 </>
 ) : (
 <>
 <span className="flex-1 text-[12px] text-stone-500">Connect your eBay account to auto-post &amp; auto-remove.</span>
 <TechButtonLink href="/api/store/cross-listing/ebay/connect">Connect eBay</TechButtonLink>
 </>
 )}
 </div>
 );
 }
 // Etsy uses OAuth (real auto-posting + auto-delisting), not a handle.
 if (p.key === "etsy") {
 return (
 <div key={p.key} className="flex items-center gap-3 px-5 py-3.5">
 <div className="w-28 shrink-0"><span className="text-[13px] font-medium text-stone-800">Etsy</span><span className="ml-1 rounded bg-[var(--accent-soft,#eafaf3)] px-1 text-[10px] text-[var(--accent-ink,#0b7a5c)]">API</span></div>
 {!etsy?.configured ? (
 <span className="flex-1 text-[12px] text-stone-400">Not set up on the server yet (needs Etsy app keys).</span>
 ) : etsy?.connected ? (
 <>
 <span className="flex-1 truncate text-[13px] text-[var(--accent-ink,#0b7a5c)]">✓ Connected{etsy.shop ? ` · ${etsy.shop}` : ""} — auto-posts &amp; delists</span>
 <button onClick={() => disconnect("etsy")} className="text-[12px] text-stone-400 hover:text-rose-600">Disconnect</button>
 </>
 ) : (
 <>
 <span className="flex-1 text-[12px] text-stone-500">Connect your Etsy shop to auto-post &amp; auto-delist.</span>
 <TechButtonLink href="/api/store/cross-listing/etsy/connect">Connect Etsy</TechButtonLink>
 </>
 )}
 </div>
 );
 }
 return (
 <div key={p.key} className="flex items-center gap-3 px-5 py-3.5">
 <div className="w-28 shrink-0">
 <span className="text-[13px] font-medium text-stone-800">{p.name}</span>
 {!p.hasApi && <span className="ml-1 text-[10px] text-stone-400">copy</span>}
 </div>
 {a ? (
 <>
 <span className="flex-1 truncate text-[13px] text-stone-500">@{a.handle}</span>
 <label className="flex items-center gap-1.5 text-[12px] text-stone-500">
 <Toggle on={a.autoList} onClick={() => toggleAuto(a)} /> Auto-list
 </label>
 <button onClick={() => disconnect(p.key)} className="text-[12px] text-stone-400 hover:text-rose-600">Remove</button>
 </>
 ) : (
 <>
 <Input value={handles[p.key] || ""} onChange={(e) => setHandles((h) => ({ ...h, [p.key]: e.target.value }))} placeholder={`your ${p.name} handle`} className="flex-1" />
 <TechButton onClick={() => connect(p.key)}>Connect</TechButton>
 </>
 )}
 </div>
 );
 })}
 </div>
 )}
 </TechCard>
 <p className="mt-3 text-[11px] text-stone-400">eBay &amp; Etsy connect over their API and auto-post/auto-delist. The rest are copy channels — VYA writes each a tailored title &amp; description; the browser extension posts them and reports likes, offers &amp; views back to your dashboard.</p>
 </AdminPage>
 );
}
