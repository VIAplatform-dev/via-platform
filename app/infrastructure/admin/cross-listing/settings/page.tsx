"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Puzzle, Download } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, TechButtonLink, Toggle } from "../../ui";

// The VYA Cross-Lister browser extension on the Chrome Web Store (Unlisted). Live once Google's
// review passes; the ID is fixed from the dev-console item.
const EXTENSION_URL = "https://chromewebstore.google.com/detail/jcbjeoingkdkodflfbachfpllmkgojkp";
import { Input } from "@/app/store/ui";
import { describeOptIn } from "@/app/lib/marketplace-optin";
import { demandLabel } from "@/app/lib/marketplace-votes";

type Platform = { key: string; name: string; hasApi: boolean; mode: "api" | "extension" | "soon" };
type Account = { platform: string; handle: string; autoList: boolean };
// Which coming-soon channel a shop wants next. A vote, not a promise: no dates, nothing to be held
// to, just the count. See app/lib/marketplace-votes.ts.
type Demand = { key: string; name: string; votes: number; wanted: boolean };
type Ebay = { configured: boolean; connected: boolean; user: string | null };
type EbayReady = { readyToList: boolean; tokenValid: boolean; sellerRegistered?: boolean; hasLocation?: boolean; policies: { fulfillment: boolean; payment: boolean; return: boolean }; reason?: string | null };
// Instant eBay sale notifications. VYA admin only (the owner runs setup by curl; this just shows it working).
type NotifyStatus = {
 summary: string; subscribed: number; verificationTokenSet: boolean; endpoint: string;
 stores: Array<{ slug: string; status: string; since: string | null; lastError: string | null; lastNotificationAt: string | null; lastOutcome: string | null }>;
 recent: Array<{ id: number; topic: string; storeSlug: string | null; receivedAt: string; outcome: string; detail: string | null }>;
};

// Sort order in the list: real API first, extension channels next, coming-soon last.
const RANK: Record<Platform["mode"], number> = { api: 0, extension: 1, soon: 2 };

export default function CrossListingSettingsPage() {
 const [platforms, setPlatforms] = useState<Platform[]>([]);
 const [accounts, setAccounts] = useState<Account[]>([]);
 const [ebay, setEbay] = useState<Ebay | null>(null);
 // Chrome hasn't approved the extension yet, so there is nothing to install and the channels that
 // need it are offered as coming soon. The server decides (EXTENSION_IN_REVIEW): one flag, flipped
 // the day it is approved, rather than copy in here that someone has to remember to change.
 const [extInReview, setExtInReview] = useState(false);
 const [loading, setLoading] = useState(true);
 const [handles, setHandles] = useState<Record<string, string>>({});
 const [ebayReady, setEbayReady] = useState<EbayReady | null>(null);
 const [ebaySetupBusy, setEbaySetupBusy] = useState(false);
 const [extInstalled, setExtInstalled] = useState(false);
 const [importStarted, setImportStarted] = useState(false);
 const [importedAlready, setImportedAlready] = useState(false);
 const [notify, setNotify] = useState<NotifyStatus | null>(null);
 // Running setup used to mean pasting a curl command with a hashed admin cookie in it. The route
 // already takes a POST behind the same admin check this page is behind, so there was never a
 // reason for it to be a command. Idempotent, so a second press creates nothing.
 const [notifyBusy, setNotifyBusy] = useState(false);
 const [notifyReport, setNotifyReport] = useState<string | null>(null);
 // Building one of these is weeks of work and most have no public API, so the order is worth
 // asking about rather than guessing at.
 const [demand, setDemand] = useState<Demand[]>([]);
 const [voting, setVoting] = useState<string | null>(null);
 const [writeIn, setWriteIn] = useState("");
 const [writeInSaid, setWriteInSaid] = useState<string | null>(null);
 // VYA's own read: who asked for what, and the channels nobody thought to list. Only ever populated
 // for the owner, because the route only sends it to an admin request.
 const [voteAdmin, setVoteAdmin] = useState<{ voters: Record<string, string[]>; suggestions: Array<{ name: string; count: number }> } | null>(null);

 async function vote(key: string) {
 setVoting(key);
 // The server answers with the whole tally, so her click never has to guess what it did to
 // everyone else's counts.
 const d = await fetch("/api/store/cross-listing/vote", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: key }),
 }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
 if (d?.demand) setDemand(d.demand);
 setVoting(null);
 }

 async function sendWriteIn() {
 const text = writeIn.trim();
 if (!text) return;
 setVoting("__writein");
 const d = await fetch("/api/store/cross-listing/vote", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ suggestion: text }),
 }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
 if (d?.demand) setDemand(d.demand);
 // When what she typed is already on the list, say so: her vote went there rather than nowhere.
 const hit = d?.matchedKey ? d.demand?.find((x: Demand) => x.key === d.matchedKey) : null;
 setWriteInSaid(!d ? "Couldn't save that. Try again." : hit ? `${hit.name} is already on the list, so we counted your vote for it.` : "Noted, thank you.");
 if (d) setWriteIn("");
 setVoting(null);
 }

 async function runNotifySetup() {
 setNotifyBusy(true); setNotifyReport(null);
 try {
  const r = await fetch("/api/admin/ebay-notifications/setup", { method: "POST" });
  const d = await r.json().catch(() => null);
  // Every "no" from eBay comes back as a sentence in the report rather than an exception, so the
  // failures worth reading are per store. Say what happened either way.
  const failed = (d?.stores ?? []).filter((x: { action: string }) => x.action === "failed");
  setNotifyReport(
   !d ? "Setup didn't answer. Try again."
   : d.error ? d.error
   : failed.length ? `${failed.length} store${failed.length === 1 ? "" : "s"} failed: ${failed.map((x: { slug: string; error?: string }) => `${x.slug} (${x.error ?? "no reason given"})`).join("; ")}`
   : d.destination?.action === "failed" ? `Couldn't set up the endpoint: ${d.destination.error ?? "no reason given"}`
   : `Done. ${(d.stores ?? []).length} store${(d.stores ?? []).length === 1 ? "" : "s"} subscribed.`,
  );
  // Whatever it did, show the truth from the server rather than what we hoped.
  await fetch("/api/admin/ebay-notifications/status").then((x) => (x.ok ? x.json() : null)).then((n) => { if (n?.ok) setNotify(n); }).catch(() => {});
 } catch {
  setNotifyReport("Setup didn't answer. Try again.");
 }
 setNotifyBusy(false);
 }

 async function load() {
 const r = await fetch("/api/store/cross-listing").then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (r) { setPlatforms(r.platforms); setAccounts(r.accounts); setEbay(r.ebay);  setExtInReview(!!r.extensionInReview); }
 // Separate call, and a failure here must not take the page down with it: the votes are the least
 // important thing on a screen a seller opened to connect eBay.
 fetch("/api/store/cross-listing/vote").then((x) => (x.ok ? x.json() : null))
  .then((d) => { if (d?.demand) setDemand(d.demand); if (d?.admin) setVoteAdmin(d.admin); }).catch(() => {});
 setLoading(false);
 }
 // ── The VYA marketplace ────────────────────────────────────────────────────
 // Not a cross-listing channel, and deliberately first: the others POST her pieces to somebody
 // else's site using her own account there. This is whether vyaplatform.com. A separate product
 // from the shop she runs here. May show the pieces she already has on VYA. Nothing is copied.
 const [mkt, setMkt] = useState<{ listed: boolean; livePieces: number } | null>(null);
 const [mktBusy, setMktBusy] = useState(false);
 useEffect(() => {
  let active = true;
  fetch("/api/store/marketplace").then((r) => (r.ok ? r.json() : null)).then((d) => { if (active && d) setMkt({ listed: !!d.listed, livePieces: Number(d.livePieces) || 0 }); }).catch(() => {});
  return () => { active = false; };
 }, []);
 async function setListed(next: boolean) {
  if (mktBusy) return;
  setMktBusy(true);
  const prev = mkt;
  setMkt((m) => (m ? { ...m, listed: next } : m));
  const r = await fetch("/api/store/marketplace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listed: next }) }).catch(() => null);
  if (!r?.ok) setMkt(prev); // put the switch back rather than claim a change that never saved
  setMktBusy(false);
 }

 useEffect(() => {
 let active = true;
 (async () => {
 const r = await fetch("/api/store/cross-listing").then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (r && active) { setPlatforms(r.platforms); setAccounts(r.accounts); setEbay(r.ebay);  setExtInReview(!!r.extensionInReview); }
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

 // Owner only: is the eBay push side on, and when did we last hear from eBay? Sellers never see this
 // (the status route is admin-gated, and a 401 leaves the block unrendered).
 useEffect(() => {
 let active = true;
 /* no-store: this answer decides whether she is sent to the signup wizard. A cached "no store" survives the fix that gave her one, and strands her in the wizard on every reload. */
 fetch("/api/infrastructure/whoami", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
 if (!active || d?.admin !== true) return;
 return fetch("/api/admin/ebay-notifications/status").then((r) => (r.ok ? r.json() : null)).then((n) => { if (active && n?.ok) setNotify(n); });
 }).catch(() => {});
 return () => { active = false; };
 }, []);

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
 <AdminHeader eyebrow="Sell · Cross-listing · Settings" title="Connected marketplaces" subtitle="Connect the other sites you sell on. New listings go out automatically, and a piece that sells anywhere comes down everywhere." />

 {/* The VYA marketplace. Off until she says otherwise. See app/lib/marketplace-optin.ts. */}
 <TechCard className="mb-5 p-5">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
   <div className="min-w-0">
    <p className="text-[14px] font-medium text-stone-900">Sell on the VYA marketplace</p>
    <p className="mt-1 max-w-[70ch] text-[12.5px] leading-relaxed text-stone-500">
     vyaplatform.com is VYA&apos;s own marketplace, separate from the shop you run here. Switch this
     on and your live pieces show there too. Bought through your VYA checkout, same orders, same
     payouts. Nothing is posted to another site.
    </p>
   </div>
   <Toggle on={!!mkt?.listed} disabled={!mkt || mktBusy} onClick={() => setListed(!mkt?.listed)} />
  </div>
  {mkt && (
   <p className="mt-3 border-t border-stone-100 pt-3 text-[12px] leading-relaxed text-stone-500">
    {describeOptIn({ listed: mkt.listed, decidedAt: null }, mkt.livePieces)}
   </p>
  )}
 </TechCard>
 {/* Extension install: required for the Depop/Vestiaire (extension) channels to auto-fill. */}
 <TechCard className="mb-5 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
 <div className="flex items-start gap-3">
 <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft,#eafaf3)] text-[var(--accent-ink,#0b7a5c)]"><Puzzle size={18} /></span>
 <div>
 <p className="text-[14px] font-semibold text-stone-900">{extInReview ? "Extension with other marketplaces. Coming soon" : "Install the VYA Cross-Lister extension"}</p>
 <p className="mt-0.5 text-[13px] leading-relaxed text-stone-500">
  {extInReview
   ? "eBay is live now and lists through eBay's own API. Nothing to install. Depop and Vestiaire arrive with our browser extension, which is with Google for review. We'll switch them on here the moment it's approved."
   : <>Fills in your Depop and Vestiaire listings in your own browser. Required for those two channels.</>}
 </p>
 </div>
 </div>
 {!extInReview && <TechButtonLink href={EXTENSION_URL} target="_blank" rel="noopener" className="shrink-0"><Download size={14} /> Add to Chrome</TechButtonLink>}
 </TechCard>

 {/* Onboarding: pull an existing Depop shop into VYA in one pass. Hidden once they've imported. */}
 {!importedAlready && !extInReview && (
 <TechCard className="mb-5 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
 <div>
 <p className="text-[14px] font-semibold text-stone-900">Coming from Depop? Import your shop</p>
 <p className="mt-0.5 text-[13px] leading-relaxed text-stone-500">Pull your whole Depop catalog, listings <span className="text-stone-400">and</span> sold history. Into VYA as drafts in one pass, so you don&apos;t re-list a thing. {extInstalled ? "Opens Depop and imports on its own." : "Install the extension above first."}</p>
 {importStarted && <p className="mt-1.5 text-[12px] font-medium text-[var(--accent-ink,#0b7a5c)]">Opening Depop and importing… watch the panel there, then come back. Your drafts appear in Inventory.</p>}
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

 // Coming soon: not connectable, but she can say she wants it. The row used to be greyed to 55%
 // and inert, which is the right look for something you cannot have and the wrong one for
 // something you can ask for, so the name and the button read at full strength.
 if (p.mode === "soon") {
 const d = demand.find((x) => x.key === p.key);
 return (
 <div key={p.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5 sm:flex-nowrap">
 <div className="w-full shrink-0 text-[13px] font-medium text-stone-600 sm:w-40">{p.name}</div>
 <span className="flex-1 text-[12px] text-stone-400">
  {d ? demandLabel(d.votes, d.wanted) : "Not available yet"}
 </span>
 <button
  type="button"
  onClick={() => vote(p.key)}
  disabled={voting === p.key || !d}
  aria-pressed={!!d?.wanted}
  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition disabled:opacity-40 ${
   d?.wanted
    ? "border-[var(--accent-ink,#0b7a5c)] bg-[var(--accent-soft,#eafaf3)] text-[var(--accent-ink,#0b7a5c)]"
    : "border-stone-300 text-stone-500 hover:border-stone-400 hover:text-stone-700"
  }`}
 >
  {d?.wanted ? "\u2713 Wanted" : "I want this"}
 </button>
 </div>
 );
 }

 // eBay: the one real API integration (OAuth, auto-posts + auto-removes).
 if (p.key === "ebay") {
 return (
 <div key={p.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5 sm:flex-nowrap">
 <div className="w-full shrink-0 sm:w-40"><span className="text-[13px] font-medium text-stone-800">eBay</span><span className="ml-1.5 rounded bg-[var(--accent-soft,#eafaf3)] px-1 text-[10px] text-[var(--accent-ink,#0b7a5c)]">API</span></div>
 {!ebay?.configured ? (
 <span className="flex-1 text-[12px] text-stone-400">Not set up on the server yet (needs eBay app keys).</span>
 ) : ebay?.connected ? (
 <>
 <div className="min-w-0 flex-1">
 <p className="truncate text-[13px] text-[var(--accent-ink,#0b7a5c)]">✓ Connected{ebay.user ? ` · ${ebay.user}` : ""}: auto-posts for real</p>
 {ebayReady && (ebayReady.readyToList ? (
 <p className="text-[11px] text-[var(--accent-ink,#0b7a5c)]">Ready to list: payment, shipping &amp; returns are set.</p>
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

 // Extension channels (Depop, Vestiaire): connect a handle; the VYA browser extension posts on
 // your own logged-in session and reports engagement back. No credentials leave your browser.
 return (
 <div key={p.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5 sm:flex-nowrap">
 {/* On a phone the name takes its own line. Beside a fixed 160px name column the handle box
     was left a sliver to type in. */}
 <div className="w-full shrink-0 sm:w-40">
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
 <Input value={handles[p.key] || ""} onChange={(e) => setHandles((h) => ({ ...h, [p.key]: e.target.value }))} placeholder={`your ${p.name} handle`} className="min-w-0 flex-1" />
 <TechButton onClick={() => connect(p.key)}>Connect</TechButton>
 </>
 )}
 </div>
 );
 })}
 </div>
 )}
 </TechCard>
 {notify && (
 <TechCard className="mt-5 p-5" data-testid="ebay-notify-block">
 <div className="flex flex-wrap items-baseline justify-between gap-2">
 <p className="text-[13px] font-semibold text-stone-900">Instant eBay sale notifications <span className="ml-1.5 rounded bg-stone-100 px-1 text-[10px] font-medium text-stone-500">VYA admin</span></p>
 <p className={`text-[12px] ${notify.subscribed > 0 ? "text-[var(--accent-ink,#0b7a5c)]" : "text-amber-600"}`}>{notify.summary}{notify.subscribed > 0 ? ` · ${notify.subscribed} of ${notify.stores.length} store${notify.stores.length === 1 ? "" : "s"}` : ""}</p>
 </div>
 {!notify.verificationTokenSet && <p className="mt-1 text-[11px] text-amber-600">EBAY_NOTIFY_VERIFICATION_TOKEN is not set on this server. Setup will refuse until it is.</p>}
 {notify.stores.some((st) => st.lastError) && (
 <ul className="mt-2 space-y-0.5 text-[11px] text-rose-600">
 {notify.stores.filter((st) => st.lastError).map((st) => <li key={st.slug}>{st.slug}: {st.lastError}</li>)}
 </ul>
 )}
 {notify.recent.length > 0 ? (
 <div className="mt-3 overflow-x-auto">
 <table className="w-full text-[11px]">
 <thead><tr className="text-left text-stone-400"><th className="py-1 pr-3 font-medium">Received</th><th className="py-1 pr-3 font-medium">Topic</th><th className="py-1 pr-3 font-medium">Store</th><th className="py-1 pr-3 font-medium">Outcome</th><th className="py-1 font-medium">Detail</th></tr></thead>
 <tbody>
 {notify.recent.map((r) => (
 <tr key={r.id} className="border-t border-stone-100 text-stone-600">
 <td className="whitespace-nowrap py-1 pr-3">{new Date(r.receivedAt).toLocaleString()}</td>
 <td className="py-1 pr-3">{r.topic}</td>
 <td className="py-1 pr-3">{r.storeSlug ?? "-"}</td>
 <td className={`py-1 pr-3 ${r.outcome === "synced" ? "text-[var(--accent-ink,#0b7a5c)]" : r.outcome === "unknown-store" || r.outcome === "sync-error" || r.outcome === "timeout" ? "text-amber-600" : ""}`}>{r.outcome}</td>
 <td className="max-w-[28rem] truncate py-1 text-stone-400" title={r.detail ?? undefined}>{r.detail ?? ""}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 ) : (
 <p className="mt-2 text-[11px] text-stone-400">No deliveries yet. eBay posts here the moment a piece sells; until then sales are picked up by the hourly sync.</p>
 )}
 <div className="mt-3 flex flex-wrap items-center gap-3">
 <button
  type="button"
  onClick={runNotifySetup}
  disabled={notifyBusy || !notify.verificationTokenSet}
  title={notify.verificationTokenSet ? undefined : "Set EBAY_NOTIFY_VERIFICATION_TOKEN on this server first."}
  className="rounded-md border border-stone-300 px-3 py-1.5 text-[12px] font-medium text-stone-700 transition hover:border-stone-400 disabled:cursor-not-allowed disabled:opacity-40"
 >
  {notifyBusy ? "Setting up…" : notify.subscribed > 0 ? "Re-run setup" : "Run setup"}
 </button>
 <span className="text-[11px] text-stone-400">Safe to run again: it adopts what already exists.</span>
 </div>
 {notifyReport && <p className="mt-2 text-[11px] text-stone-600">{notifyReport}</p>}
 </TechCard>
 )}
 {/* VYA only: the same question, answered. Who asked for what, and what nobody put on the list. */}
 {voteAdmin && (
 <TechCard className="mt-5 p-5">
 <p className="text-[13px] font-semibold text-stone-900">What shops want next <span className="ml-1.5 rounded bg-stone-100 px-1 text-[10px] font-medium text-stone-500">VYA admin</span></p>
 {demand.every((d) => d.votes === 0) && voteAdmin.suggestions.length === 0 ? (
  <p className="mt-2 text-[11px] text-stone-400">Nobody has voted yet.</p>
 ) : (
  <>
  <ul className="mt-2 space-y-1">
   {demand.filter((d) => d.votes > 0).map((d) => (
   <li key={d.key} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
    <span className="w-28 shrink-0 font-medium text-stone-700">{d.name}</span>
    <span className="tabular-nums text-stone-500">{d.votes}</span>
    <span className="text-[11px] text-stone-400">{(voteAdmin.voters[d.key] ?? []).join(", ")}</span>
   </li>
   ))}
  </ul>
  {voteAdmin.suggestions.length > 0 && (
   <>
   <p className="mt-3 text-[11px] font-medium text-stone-500">Not on the list</p>
   <ul className="mt-1 space-y-0.5">
    {voteAdmin.suggestions.map((sg) => (
    <li key={sg.name} className="text-[12px] text-stone-600"><span className="tabular-nums text-stone-400">{sg.count}x</span> {sg.name}</li>
    ))}
   </ul>
   </>
  )}
  </>
 )}
 </TechCard>
 )}

 {/* The channel she wants that isn't on the list: the answer we could not have guessed. Typing
     one we already have counts as a vote for it rather than starting a second tally. */}
 {demand.length > 0 && (
 <TechCard className="mt-5 p-5">
 <p className="text-[13px] font-semibold text-stone-900">Somewhere else you sell?</p>
 <p className="mt-0.5 text-[12px] text-stone-500">Tell us and we&apos;ll count it. What shops ask for is the order we build these in.</p>
 <div className="mt-3 flex flex-wrap items-center gap-2">
  <div className="w-full max-w-xs">
   <Input
    value={writeIn}
    onChange={(e) => { setWriteIn(e.target.value); setWriteInSaid(null); }}
    onKeyDown={(e) => { if (e.key === "Enter") sendWriteIn(); }}
    placeholder="The RealReal, 1stDibs…"
    maxLength={60}
    aria-label="A marketplace that isn't on the list"
   />
  </div>
  <button
   type="button"
   onClick={sendWriteIn}
   disabled={!writeIn.trim() || voting === "__writein"}
   className="rounded-md border border-stone-300 px-3 py-1.5 text-[12px] font-medium text-stone-700 transition hover:border-stone-400 disabled:opacity-40"
  >
   {voting === "__writein" ? "Sending…" : "Send"}
  </button>
  {writeInSaid && <span className="text-[11px] text-stone-500">{writeInSaid}</span>}
 </div>
 </TechCard>
 )}

 <p className="mt-3 text-[11px] text-stone-400">eBay connects over its API and auto-posts/auto-removes for real. Depop &amp; Vestiaire post through the VYA browser extension. It fills the listing on your own logged-in session (no credentials leave your browser) and reports likes, offers &amp; views back to your dashboard. More marketplaces are coming soon.</p>
 </AdminPage>
 );
}
