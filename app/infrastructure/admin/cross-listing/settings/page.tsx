"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Puzzle, Download } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, TechButtonLink, Toggle } from "../../ui";

// The VYA Cross-Lister browser extension on the Chrome Web Store (Unlisted). Live once Google's
// review passes; the ID is fixed from the dev-console item.
const EXTENSION_URL = "https://chromewebstore.google.com/detail/jcbjeoingkdkodflfbachfpllmkgojkp";
import { Input } from "@/app/store/ui";

type Platform = { key: string; name: string; hasApi: boolean; mode: "api" | "extension" | "soon" };
type Account = { platform: string; handle: string; autoList: boolean };
type Ebay = { configured: boolean; connected: boolean; user: string | null };
type EbayReady = { readyToList: boolean; tokenValid: boolean; sellerRegistered?: boolean; hasLocation?: boolean; policies: { fulfillment: boolean; payment: boolean; return: boolean }; reason?: string | null };

// Sort order in the list: real API first, extension channels next, coming-soon last.
const RANK: Record<Platform["mode"], number> = { api: 0, extension: 1, soon: 2 };

export default function CrossListingSettingsPage() {
 const [platforms, setPlatforms] = useState<Platform[]>([]);
 const [accounts, setAccounts] = useState<Account[]>([]);
 const [ebay, setEbay] = useState<Ebay | null>(null);
 const [loading, setLoading] = useState(true);
 const [handles, setHandles] = useState<Record<string, string>>({});
 const [ebayReady, setEbayReady] = useState<EbayReady | null>(null);
 const [ebaySetupBusy, setEbaySetupBusy] = useState(false);
 const [extInstalled, setExtInstalled] = useState(false);
 const [importStarted, setImportStarted] = useState(false);
 const [importedAlready, setImportedAlready] = useState(false);

 async function load() {
 const r = await fetch("/api/store/cross-listing").then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (r) { setPlatforms(r.platforms); setAccounts(r.accounts); setEbay(r.ebay); }
 setLoading(false);
 }
 useEffect(() => {
 let active = true;
 (async () => {
 const r = await fetch("/api/store/cross-listing").then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (r && active) { setPlatforms(r.platforms); setAccounts(r.accounts); setEbay(r.ebay); }
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

 // The VYA extension tags the page when installed; the Depop import needs it.
 useEffect(() => {
 fetch("/api/store/onboarding-status").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && d.importedElsewhere) setImportedAlready(true); }).catch(() => {});
 const check = () => setExtInstalled(document.documentElement.getAttribute("data-vya-ext") === "1");
 check();
 const obs = new MutationObserver(check);
 obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-vya-ext"] });
 return () => obs.disconnect();
 }, []);

 // One button to pull a Depop-native seller's whole shop into VYA: the page tells the extension, the
 // extension opens Depop and imports, and the drafts land back here in Inventory.
 function startImport() {
 try { window.postMessage({ source: "vya-crosslist", type: "import-depop" }, window.location.origin); } catch { /* ignore */ }
 setImportStarted(true);
 }

 async function runEbaySetup() {
 setEbaySetupBusy(true);
 await fetch("/api/store/cross-listing/ebay/setup", { method: "POST" }).catch(() => null);
 // Re-read the real status so the badge reflects the actual outcome (and its reason if still not ready).
 const st = await fetch("/api/store/cross-listing/ebay/status").then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (st?.ok) setEbayReady(st);
 setEbaySetupBusy(false);
 }

 return (
 <AdminPage>
 <Link href="/admin/cross-listing" className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-stone-500 hover:text-stone-800"><ArrowLeft size={13} /> Cross-listing</Link>
 <AdminHeader eyebrow="Sell · Cross-listing · Settings" title="Connected marketplaces" subtitle="Connect the shops you also sell on. New VYA listings queue to every auto-list channel automatically, and a sale anywhere pulls the piece from everywhere so it never double-sells." />

 {/* Extension install — required for the Depop/Vestiaire (extension) channels to auto-fill. */}
 <TechCard className="mb-5 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
 <div className="flex items-start gap-3">
 <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft,#eafaf3)] text-[var(--accent-ink,#0b7a5c)]"><Puzzle size={18} /></span>
 <div>
 <p className="text-[14px] font-semibold text-stone-900">Install the VYA Cross-Lister extension</p>
 <p className="mt-0.5 text-[13px] leading-relaxed text-stone-500">One-time, installs in seconds. It auto-fills your Depop &amp; Vestiaire listings right in your own browser — nothing leaves your session. Required for those channels.</p>
 </div>
 </div>
 <TechButtonLink href={EXTENSION_URL} target="_blank" rel="noopener" className="shrink-0"><Download size={14} /> Add to Chrome</TechButtonLink>
 </TechCard>

 {/* Onboarding: pull an existing Depop shop into VYA in one pass. Hidden once they've imported. */}
 {!importedAlready && (
 <TechCard className="mb-5 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
 <div>
 <p className="text-[14px] font-semibold text-stone-900">Coming from Depop? Import your shop</p>
 <p className="mt-0.5 text-[13px] leading-relaxed text-stone-500">Pull your whole Depop catalog — listings <span className="text-stone-400">and</span> sold history — into VYA as drafts in one pass, so you don&apos;t re-list a thing. {extInstalled ? "Opens Depop and imports on its own." : "Install the extension above first."}</p>
 {importStarted && <p className="mt-1.5 text-[12px] font-medium text-[var(--accent-ink,#0b7a5c)]">Opening Depop and importing… watch the panel there, then come back — your drafts appear in Inventory.</p>}
 </div>
 {extInstalled
 ? <TechButton onClick={startImport} disabled={importStarted} className="shrink-0">{importStarted ? "Importing…" : "Import my Depop shop"}</TechButton>
 : <TechButtonLink href={EXTENSION_URL} target="_blank" rel="noopener" className="shrink-0"><Download size={14} /> Get the extension</TechButtonLink>}
 </TechCard>
 )}

 <TechCard className="overflow-hidden">
 {loading ? (
 <div className="flex items-center justify-center py-16 text-sm text-stone-400">Loading…</div>
 ) : (
 <div className="divide-y divide-stone-100">
 {[...platforms].sort((x, y) => RANK[x.mode] - RANK[y.mode]).map((p) => {
 const a = acct(p.key);

 // Coming soon — greyed, not connectable.
 if (p.mode === "soon") {
 return (
 <div key={p.key} className="flex items-center gap-3 px-5 py-3.5 opacity-55">
 <div className="w-40 shrink-0 text-[13px] font-medium text-stone-500">{p.name}</div>
 <span className="flex-1 text-[12px] text-stone-400">Not available yet</span>
 <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-400">Coming soon</span>
 </div>
 );
 }

 // eBay — the one real API integration (OAuth, auto-posts + auto-removes).
 if (p.key === "ebay") {
 return (
 <div key={p.key} className="flex items-center gap-3 px-5 py-3.5">
 <div className="w-40 shrink-0"><span className="text-[13px] font-medium text-stone-800">eBay</span><span className="ml-1.5 rounded bg-[var(--accent-soft,#eafaf3)] px-1 text-[10px] text-[var(--accent-ink,#0b7a5c)]">API</span></div>
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
 <span className="text-[11px] text-amber-600">{ebayReady.reason || "Finish eBay setup before it can list."}</span>
 {ebayReady.sellerRegistered === false ? (
 <span className="text-[11px] text-stone-400">Reconnect your eBay seller account below.</span>
 ) : (
 <button onClick={runEbaySetup} disabled={ebaySetupBusy} className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-200 disabled:opacity-50">{ebaySetupBusy ? "Setting up…" : "Set up automatically"}</button>
 )}
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

 // Extension channels (Depop, Vestiaire) — connect a handle; the VYA browser extension posts on
 // your own logged-in session and reports engagement back. No credentials leave your browser.
 return (
 <div key={p.key} className="flex items-center gap-3 px-5 py-3.5">
 <div className="w-40 shrink-0">
 <span className="text-[13px] font-medium text-stone-800">{p.name}</span>
 <span className="ml-1.5 rounded bg-sky-50 px-1 text-[10px] text-sky-600">Extension</span>
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
 <p className="mt-3 text-[11px] text-stone-400">eBay connects over its API and auto-posts/auto-removes for real. Depop &amp; Vestiaire post through the VYA browser extension — it fills the listing on your own logged-in session (no credentials leave your browser) and reports likes, offers &amp; views back to your dashboard. More marketplaces are coming soon.</p>
 </AdminPage>
 );
}
