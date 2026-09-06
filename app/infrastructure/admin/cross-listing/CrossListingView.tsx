"use client";
/* eslint-disable @next/next/no-img-element */

import { Fragment, useEffect, useRef, useState } from "react";
import { Check, Copy, ChevronDown, Heart, Tag, Eye, Bookmark, Settings2, Download, ExternalLink, Ban , PlugZap } from "lucide-react";
import { vestiaireReadiness } from "@/app/lib/vestiaire";
import { AdminPage, AdminHeader, TechCard, TechButtonLink, TechEmpty, StatusPill, MetricCard, TH, TD } from "../ui";

// VYA Cross-Lister on the Chrome Web Store — reviewed and published (Unlisted, so it's reachable by
// this link rather than by search, which is why the button matters).
const EXTENSION_URL = "https://chromewebstore.google.com/detail/vya-cross-lister/jcbjeoingkdkodflfbachfpllmkgojkp";

// Where each extension-marketplace's "create a listing" page lives (opened after queueing).
const CREATE_URL: Record<string, string> = {
 depop: "https://www.depop.com/products/create/",
 vestiaire: "https://www.vestiairecollective.com/sell-clothes-online/",
};
// Extension marketplaces that have a working queue endpoint today. Add a key here when its
// queue endpoint + extension fill flow ships (e.g. "vestiaire").
const QUEUEABLE = new Set(["depop", "vestiaire"]);

type Platform = { key: string; name: string; hasApi: boolean; mode?: string };
type Account = { platform: string; handle: string; autoList: boolean };
type Ebay = { connected: boolean };
type Etsy = { connected: boolean };
type PlatformStats = { likes: number; offers: number; views: number; watchers: number };
type BoardRow = { itemId: string; title: string; priceCents: number; image: string | null; status: string; brand?: string | null;
 photoCount?: number; category?: string | null; condition?: string | null; material?: string | null; size?: string | null; description?: string | null;
 listings: Record<string, string>; errors?: Record<string, string>; stats?: { totals: PlatformStats; byPlatform: Record<string, PlatformStats> } };
type Rollup = { platform: string; listed: number; queued: number; error: number; offers: number; likes: number; views: number; watchers: number; sold: number; revenueCents: number };
type Content = { title: string; body: string; tags: string[]; price: string };

const money = (c: number) => `$${Math.round(c / 100).toLocaleString()}`;

const STATUS: Record<string, { label: string; tone: "live" | "pending" | "neutral" | "down" }> = {
 pending: { label: "Queued", tone: "pending" },
 listed: { label: "Listed", tone: "live" },
 removed: { label: "Pull", tone: "down" },
 sold: { label: "Sold", tone: "neutral" },
 error: { label: "Failed", tone: "down" },
};

export default function CrossListingView({ view }: { view: "listings" | "overview" }) {
 const [platforms, setPlatforms] = useState<Platform[]>([]);
 const [accounts, setAccounts] = useState<Account[]>([]);
 const [ebay, setEbay] = useState<Ebay | null>(null);
 const [etsy, setEtsy] = useState<Etsy | null>(null);
 const [board, setBoard] = useState<BoardRow[]>([]);
 const [rollup, setRollup] = useState<Rollup[]>([]);
 const [loading, setLoading] = useState(true);
 const [selected, setSelected] = useState<Set<string>>(new Set());
 const [open, setOpen] = useState<string | null>(null);
 const [content, setContent] = useState<Record<string, Content> | null>(null);
 const [copied, setCopied] = useState<string | null>(null);
 const [soldMenu, setSoldMenu] = useState<string | null>(null);
 const [retrying, setRetrying] = useState<string | null>(null);
 const [extInstalled, setExtInstalled] = useState(false);
 // Keyed "platform:itemId", NOT itemId.
 //
 // With one key per item, queueing a piece for Depop turned its VESTIAIRE cell green too — same
 // item, same key — so a piece that had never been sent to Vestiaire read "Queued ✓", the server
 // had no record of it, and the "Open Vestiaire to list" card never appeared because nothing was
 // actually queued. A cell must only ever reflect its own marketplace.
 const [queueState, setQueueState] = useState<Record<string, "queuing" | "ok" | "err">>({});
 // "platform:itemId" → staged into the extension during this session. The card below follows this
 // as well as the server's own record, so a staged piece always has somewhere to click.
 const [queuedHere, setQueuedHere] = useState<Record<string, boolean>>({});
 const [errors, setErrors] = useState<Record<string, string>>({});
 const [notice, setNotice] = useState<string | null>(null);

 function apply(r: { platforms: Platform[]; accounts: Account[]; board: BoardRow[]; rollup?: Rollup[]; ebay: Ebay; etsy: Etsy }) {
 setPlatforms(r.platforms); setAccounts(r.accounts); setBoard(r.board); setRollup(r.rollup || []); setEbay(r.ebay); setEtsy(r.etsy);
 }
 async function load() {
 const r = await fetch("/api/store/cross-listing").then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (r) apply(r);
 setLoading(false);
 }
 useEffect(() => {
 let active = true;
 (async () => {
 const r = await fetch("/api/store/cross-listing").then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (r && active) apply(r);
 if (active) setLoading(false);
 })();
 return () => { active = false; };
 }, []);
 // The VYA Chrome extension tags the page (data-vya-ext) and answers our queue messages.
 useEffect(() => {
 const check = () => setExtInstalled(document.documentElement.getAttribute("data-vya-ext") === "1");
 check();
 const obs = new MutationObserver(check);
 obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-vya-ext"] });
 const onMsg = (e: MessageEvent) => {
 const d = e.data;
 if (!d || d.source !== "vya-ext" || d.type !== "queued") return;
 // The extension's reply carries the item but not the marketplace, so settle whichever cell for
 // that item is currently waiting — never every cell for it.
 setQueueState((st) => {
  const next = { ...st };
  for (const k of Object.keys(st)) if (k.endsWith(`:${d.itemId}`) && st[k] === "queuing") next[k] = d.ok ? "ok" : "err";
  return next;
 });
   // A marketplace can refuse a piece outright (Vestiaire only takes designer brands). Its reason
   // is more useful than "couldn't queue", so it goes straight to the seller.
   if (!d.ok && d.error) setErrors((e) => ({ ...e, [d.itemId]: String(d.error) }));
 // A reconciled item was already pending server-side, so its status can't have changed — skip the
 // reload, or staging a big backlog would refetch the board once per item.
 if (d.ok && !reconciledRef.current.has(d.itemId)) load();
 };
 window.addEventListener("message", onMsg);
 return () => { obs.disconnect(); window.removeEventListener("message", onMsg); };
 }, []);

 // An item can become "pending" for an extension marketplace WITHOUT this board ever being involved:
 // publishing a piece queues it server-side (createCrossListingsForItem), and so does the scheduled-
 // publish cron. But the extension only learns of an item when the board posts queue-{platform} at it,
 // which only happened on a click here. So a piece queued at publish showed as "queued" on this board
 // while the extension's own queue was empty — and "Open Depop to list" opened a create form with
 // nothing to fill in.
 //
 // Reconcile: whatever the server calls pending, stage into the extension too. vya.js replaces by item
 // id, so re-staging is idempotent; the ref only stops us re-posting on every board reload.
 const reconciledRef = useRef<Set<string>>(new Set());
 useEffect(() => {
 if (!extInstalled) return;
 for (const key of QUEUEABLE) {
 for (const it of board) {
 const seen = `${key}:${it.itemId}`;
 if (it.listings[key] !== "pending" || reconciledRef.current.has(seen)) continue;
 reconciledRef.current.add(seen);
 reconciledRef.current.add(it.itemId);
 try { window.postMessage({ source: "vya-crosslist", type: `queue-${key}`, itemId: it.itemId, title: it.title }, window.location.origin); } catch { /* ignore */ }
 }
 }
 }, [board, extInstalled]);

 // A board row carries only what the board needs; the check wants the listing's shape.
/**
 * A blocking reason, short enough for a table cell.
 *
 * The full sentence is written for a seller reading it on its own ("Vestiaire only takes pieces
 * with a designer brand — add one first"), and in a column three words wide it wrapped over three
 * lines and pushed the row apart. The whole sentence is still there on hover.
 */
function shortBlock(reason: string): string {
 const r = reason.toLowerCase();
 if (/brand/.test(r)) return "Needs a brand";
 if (/photo/.test(r)) return /only (\d+)/.test(r) ? `Needs 3 photos (has ${(r.match(/only (\d+)/) || [])[1] ?? "1"})` : "Needs 3 photos";
 if (/material/.test(r)) return "Needs a material";
 if (/colou?r/.test(r)) return "Needs a colour";
 if (/condition/.test(r)) return "Needs a condition";
 if (/categor/.test(r)) return "Needs a category";
 if (/price/.test(r)) return "Needs a price";
 if (/doesn.t accept/.test(r)) return "Brand not accepted";
 return reason.length > 28 ? reason.slice(0, 27).trimEnd() + "…" : reason;
}

 const vestReady = (it: BoardRow) => vestiaireReadiness({
  title: it.title, brand: it.brand, category: it.category, condition: it.condition,
  material: it.material, size: it.size, description: it.description, priceCents: it.priceCents,
  // The board sends a count, not the URLs — enough to know whether Vestiaire's minimum is met.
  images: Array.from({ length: it.photoCount ?? 0 }, (_, i) => `https://x/${i}`),
 });

 const acct = (k: string) => accounts.find((a) => a.platform === k);

 async function openContent(itemId: string) {
 if (open === itemId) { setOpen(null); return; }
 setOpen(itemId); setContent(null);
 const r = await fetch(`/api/store/cross-listing/content?itemId=${itemId}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (r) setContent(r.content);
 }

 // Stage one item into an extension marketplace's queue (+ record intent server-side). Doesn't reload —
 // callers reload once so a single click and a bulk run behave the same.
 async function queueOne(itemId: string, title: string, platformKey: string) {
 if (!QUEUEABLE.has(platformKey)) return;
 const key = `${platformKey}:${itemId}`;
 setQueueState((st) => ({ ...st, [key]: "queuing" }));
 setQueuedHere((q) => ({ ...q, [key]: true }));
 // Tell the extension to stage the payload (no-op if the extension isn't installed)…
 try { window.postMessage({ source: "vya-crosslist", type: `queue-${platformKey}`, itemId, title }, window.location.origin); } catch { /* ignore */ }
 // …and record intent so the board shows "Queued" and it survives a reload.
 // Reported, not swallowed. When this fails the row still says "Queued ✓" from the optimistic
 // settle below, and the disagreement between the two is invisible — which is how a queued piece
 // ended up with no "Open … to list" card and no explanation.
 const rec = await fetch(`/api/store/cross-listing/${platformKey}/queue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId }) })
  .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) as { error?: string } })).catch(() => null);
 if (!rec?.ok) setErrors((e) => ({ ...e, [itemId]: rec?.d?.error || "Staged for the extension, but VYA couldn't record it — the board won't remember after a reload." }));
 // No extension → no "queued" message comes back; settle the button optimistically off the server write.
 setTimeout(() => setQueueState((st) => (st[key] === "queuing" ? { ...st, [key]: "ok" } : st)), 1200);
 }
 async function queueForPlatform(itemId: string, title: string, platformKey: string) {
 await queueOne(itemId, title, platformKey);
 load();
 }
 // Bulk: queue every selected item that isn't already listed/sold on this marketplace.
 async function bulkQueue(platformKey: string) {
 const eligible = (it: BoardRow) => platformKey !== "vestiaire" || vestReady(it).ready;
 const chosen = board.filter((it) => selected.has(it.itemId) && it.listings[platformKey] !== "listed" && it.listings[platformKey] !== "sold");
 // A marketplace that won't take the piece shouldn't be queued it in bulk either.
 const targets = chosen.filter(eligible);
 const skipped = chosen.length - targets.length;
 for (const it of targets) await queueOne(it.itemId, it.title, platformKey);
 if (skipped > 0) setNotice(`${skipped} ${skipped === 1 ? "piece isn’t" : "pieces aren’t"} accepted on ${nameFor(platformKey)} — they need a designer brand.`);
 setSelected(new Set());
 load();
 }

 async function markSold(itemId: string, platform: string) {
 setSoldMenu(null);
 await fetch("/api/store/cross-listing", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, platform }) });
 load();
 }
 async function retry(itemId: string, channels?: string[]) {
 setRetrying(itemId);
 const r = await fetch("/api/store/cross-listing/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, channels }) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (r?.ok && r.board) setBoard(r.board);
 setRetrying(null);
 }
 async function copy(key: string, v: string) {
 try { await navigator.clipboard.writeText(v); setCopied(key); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500); } catch { /* ignore */ }
 }

 const connected = platforms.filter((p) => acct(p.key) || (p.key === "ebay" && ebay?.connected) || (p.key === "etsy" && etsy?.connected));
 const extMarketplaces = connected.filter((p) => p.mode === "extension"); // Depop, Vestiaire — listed via the extension
 const nameFor = (k: string) => (k === "vya" ? "VYA" : platforms.find((p) => p.key === k)?.name || k);
 const statTip = (bp?: Record<string, PlatformStats>) => {
 if (!bp) return "";
 return Object.entries(bp)
 .map(([k, s]) => {
 const parts = [s.likes ? `${s.likes} liked` : "", s.offers ? `${s.offers} offer${s.offers === 1 ? "" : "s"}` : "", s.views ? `${s.views} views` : "", s.watchers ? `${s.watchers} watching` : ""].filter(Boolean);
 return parts.length ? `${nameFor(k)}: ${parts.join(", ")}` : "";
 })
 .filter(Boolean)
 .join("\n");
 };

 // ── Per-marketplace summary (external channels only; VYA's own revenue lives in Analytics) ──
 const rollupBy: Record<string, Rollup> = Object.fromEntries(rollup.map((r) => [r.platform, r]));
 const marketKeys = Array.from(new Set<string>([...connected.map((p) => p.key), ...rollup.map((r) => r.platform).filter((k) => k !== "vya")]));
 const marketRows = marketKeys
 .map((k) => ({ key: k, name: nameFor(k), ...(rollupBy[k] || { listed: 0, queued: 0, error: 0, offers: 0, likes: 0, views: 0, watchers: 0, sold: 0, revenueCents: 0 }) }))
 .sort((a, b) => b.revenueCents - a.revenueCents || b.listed - a.listed);

 const totalOffers = rollup.reduce((s, r) => s + r.offers, 0);
 const totalSold = marketRows.reduce((s, r) => s + r.sold, 0);
 const mktRevenue = marketRows.reduce((s, r) => s + r.revenueCents, 0);
 const crossListedCount = board.filter((it) => Object.entries(it.listings).some(([k, st]) => k !== "vya" && (st === "listed" || st === "pending"))).length;

 // Selection helpers.
 const toggleSelect = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
 const allSelected = board.length > 0 && board.every((it) => selected.has(it.itemId));
 const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(board.map((it) => it.itemId)));

 const settingsBtn = <TechButtonLink variant="secondary" href="/admin/cross-listing/settings"><Settings2 size={14} /> Marketplace settings</TechButtonLink>;
 const installBtn = <TechButtonLink variant="secondary" href={EXTENSION_URL} target="_blank" rel="noopener"><Download size={14} /> Install the extension</TechButtonLink>;


 return (
 <AdminPage>
 <AdminHeader
 eyebrow="Sell · Cross-listing"
 title="Cross-listing"
 subtitle="List your pieces on the other sites you sell on, and see what’s live, what’s waiting, and where your sales come from."
 actions={<>{installBtn}{settingsBtn}</>}
 />

   {/* Whether the extension is actually talking to this page.
       Depop and Vestiaire are filled by the extension, so if it isn't here NOTHING happens when a
       piece is queued — the board says "queued", the server agrees, and the extension's own queue
       stays empty. That was invisible: the only hint was which button appeared. Now it's stated. */}
   {!extInstalled ? (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
     <PlugZap size={15} className="shrink-0 text-amber-700" />
     <p className="text-[13px] text-amber-900">
      <span className="font-semibold">The VYA extension isn&rsquo;t running on this page.</span>{" "}
      Depop and Vestiaire are filled by it, so pieces will queue here but nothing will be waiting when you open them.
     </p>
     <a href={EXTENSION_URL} target="_blank" rel="noopener" className="ml-auto shrink-0 rounded-lg bg-amber-900 px-3 py-1.5 text-[12.5px] font-medium text-white transition hover:opacity-90">Install it</a>
    </div>
   ) : (
    <p className="mb-4 flex items-center gap-1.5 text-[12px] text-stone-400">
     <PlugZap size={13} /> Extension connected
    </p>
   )}

 {loading ? (
 <div className="flex items-center justify-center py-32 text-sm text-stone-400">Loading…</div>
 ) : connected.length === 0 && board.length === 0 ? (
 <TechEmpty
 icon={<Tag size={28} strokeWidth={1.5} />}
 title="No marketplaces connected yet"
 body="Connect eBay, Depop, Poshmark and others. Publish a piece once on VYA and it goes to all of them. You’ll see sales and offers from each site here."
 action={<TechButtonLink href="/admin/cross-listing/settings">Connect a marketplace</TechButtonLink>}
 />
 ) : (
 <>
 {view === "overview" ? (
 <>
 {/* KPI strip */}
 <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
 <MetricCard label="Cross-listed" value={crossListedCount} sub={`${board.length} live on VYA`} />
 <MetricCard label="Open offers" value={totalOffers} sub="Across all channels" />
 <MetricCard label="Sold off-VYA" value={totalSold} sub="On marketplaces" />
 <MetricCard label="Marketplace revenue" value={money(mktRevenue)} sub="Sold off-VYA (from here on)" />
 </div>

 {/* Per-marketplace rollup */}
 <TechCard className="overflow-hidden">
 <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
 <div>
 <h3 className="text-[13px] font-semibold text-stone-900">By marketplace</h3>
 <p className="mt-0.5 text-[12px] text-stone-500">Listings, offers and revenue on each channel you sell on.</p>
 </div>
 {settingsBtn}
 </div>
 {marketRows.length === 0 ? (
 <div className="px-5 py-8 text-center text-[13px] text-stone-400">No marketplaces connected — <a href="/admin/cross-listing/settings" className="text-[var(--accent-ink,#0b7a5c)] hover:underline">connect one</a> to start.</div>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full text-[13px]">
 <thead>
 <tr>
 <TH className="px-5">Marketplace</TH>
 <TH right className="px-4">Listed</TH>
 <TH right className="px-4">Queued</TH>
 <TH right className="px-4">Offers</TH>
 <TH right className="px-4">Sold</TH>
 <TH right className="px-5">Revenue</TH>
 </tr>
 </thead>
 <tbody>
 {marketRows.map((m) => (
 <tr key={m.key} className="transition hover:bg-stone-50/70">
 <TD className="px-5">
 <span className="flex items-center gap-2">
 <span className="font-medium text-stone-800">{m.name}</span>
 {acct(m.key) || (m.key === "ebay" && ebay?.connected) || (m.key === "etsy" && etsy?.connected)
 ? <StatusPill tone="live" dot className="px-1.5 py-0.5 text-[10px]">Connected</StatusPill>
 : <StatusPill tone="neutral" className="px-1.5 py-0.5 text-[10px]">Not connected</StatusPill>}
 </span>
 </TD>
 <TD right className="px-4 text-stone-600">{m.listed || <span className="text-stone-300">—</span>}</TD>
 <TD right className="px-4 text-stone-500">{platforms.find((p) => p.key === m.key)?.mode === "extension" && m.queued ? m.queued : <span className="text-stone-300">—</span>}</TD>
 <TD right className="px-4">{m.offers ? <span className="font-medium text-[var(--accent-ink,#0b7a5c)]">{m.offers}</span> : <span className="text-stone-300">—</span>}</TD>
 <TD right className="px-4 text-stone-600">{m.sold || <span className="text-stone-300">—</span>}</TD>
 <TD right className="px-5 font-medium text-stone-800">{m.revenueCents ? money(m.revenueCents) : <span className="font-normal text-stone-300">—</span>}</TD>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 <p className="border-t border-stone-100 px-5 py-2.5 text-[11px] text-stone-400">Offers &amp; engagement are reported by the browser extension and the eBay/Etsy APIs. Buyer messages per marketplace aren’t synced yet.</p>
 </TechCard>
 </>
 ) : (
 <>
 {/* One banner, not one per marketplace.
     Every queue was drawing its own full-width card with the same sentence in it, so two queues
     meant two stacked green boxes saying nearly the same thing above the only table on the page.
     The counts differ; the explanation doesn't — so the explanation is said once. */}
 {(() => {
 // Server-pending OR staged in this session. The extension's own queue is what "open the site and
 // list" actually depends on, so a piece that reached it should offer the button even when the
 // server write didn't land — otherwise a seller stages something and has nowhere to click.
 const queues = extMarketplaces
  .map((p) => ({ p, n: board.filter((it) => it.listings[p.key] === "pending" || queuedHere[`${p.key}:${it.itemId}`]).length }))
  .filter((q) => q.n > 0);
 if (!queues.length) return null;
 return (
 <div className="mb-4 rounded-xl border border-[var(--accent-ink,#0b7a5c)]/25 bg-[var(--accent-ink,#0b7a5c)]/[0.06] px-4 py-3">
 <p className="text-[12.5px] text-stone-600">
 {extInstalled
  ? "Open each site and the extension fills the listing in. Check it over and press publish."
  : "Install the VYA extension first, then open each site and it fills the listing in for you."}
 </p>
 <div className="mt-2.5 flex flex-wrap gap-2">
 {extInstalled
  ? queues.map(({ p, n }) => (
   <TechButtonLink key={p.key} href={CREATE_URL[p.key] || "#"} target="_blank" rel="noopener">
    <ExternalLink size={14} /> {p.name} ({n})
   </TechButtonLink>
  ))
  : <TechButtonLink href={EXTENSION_URL} target="_blank" rel="noopener"><Download size={14} /> Install the extension</TechButtonLink>}
 </div>
 </div>
 );
 })()}

 {notice && (
 <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-900">
  {notice}
  <button onClick={() => setNotice(null)} className="ml-auto text-[12px] text-amber-700/70 hover:text-amber-900">Dismiss</button>
 </div>
 )}

 {/* Bulk action bar — queue many at once for one extension marketplace (eBay auto-lists, so it's not here). */}
 {selected.size > 0 && (
 <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 shadow-sm">
 <span className="text-[13px] font-medium text-stone-700">{selected.size} selected</span>
 {extMarketplaces.filter((p) => QUEUEABLE.has(p.key)).length > 0 ? (
 <>
 <span className="text-[12px] text-stone-400">·  Queue for</span>
 {extMarketplaces.filter((p) => QUEUEABLE.has(p.key)).map((p) => (
 <button key={p.key} onClick={() => bulkQueue(p.key)} className="rounded-md bg-[var(--accent-ink,#0b7a5c)] px-2.5 py-1 text-[12px] font-medium text-white hover:opacity-90">{p.name}</button>
 ))}
 </>
 ) : (
 <span className="text-[12px] text-stone-400">·  Connect Depop to queue in bulk</span>
 )}
 <button onClick={() => setSelected(new Set())} className="ml-auto text-[12px] text-stone-400 hover:text-stone-700">Clear</button>
 </div>
 )}

 {/* the products board — a marketplace matrix: item on the left, one status cell per channel */}
 <TechCard className="overflow-hidden">
 <div className="flex items-center gap-3 border-b border-stone-100 px-5 py-3">
 {board.length > 0 && (
 <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--accent-ink,#0b7a5c)]" title="Select all" />
 )}
 <div className="flex-1">
 <h3 className="text-[13px] font-semibold text-stone-900">Listings</h3>
 <p className="mt-0.5 text-[12px] text-stone-500">Where each piece stands on each site. Tick several to queue them together.</p>
 </div>
 </div>
 {board.length === 0 ? (
 <div className="p-3">
 <TechEmpty icon={<Tag size={28} strokeWidth={1.5} />} title="No active listings" body="Publish a piece on VYA and it appears here, ready to list on other sites." />
 </div>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full min-w-[560px] text-[13px]">
 <thead>
 <tr className="border-b border-stone-100">
 <th className="w-9 px-4 py-2.5"></th>
 <th className="px-1 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-stone-400">Item</th>
 {connected.map((p) => (
 <th key={p.key} className="whitespace-nowrap px-3 py-2.5 text-center text-[11px] font-medium uppercase tracking-wide text-stone-400">{p.name}</th>
 ))}
 </tr>
 </thead>
 <tbody className="divide-y divide-stone-100">
 {board.map((it) => {
 return (
 <Fragment key={it.itemId}>
 <tr className={selected.has(it.itemId) ? "bg-[var(--accent-ink,#0b7a5c)]/[0.04]" : "hover:bg-stone-50/60"}>
 <td className="px-4 py-3"><input type="checkbox" checked={selected.has(it.itemId)} onChange={() => toggleSelect(it.itemId)} className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent-ink,#0b7a5c)]" /></td>
 <td className="px-1 py-3">
 <div className="flex items-center gap-3">
 <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-stone-100">{it.image && <img src={it.image} alt="" className="h-full w-full object-cover" />}</div>
 <div className="min-w-0 max-w-[240px]">
 {/* Openable. The board answers "where is this piece listed"; the next question is always
     "and what does it say", which was a trip back to Inventory and a search by name.
     ?item= is the deep link Inventory already honours. */}
 <a href={`/admin/inventory?item=${it.itemId}`} className="block truncate text-[13px] font-medium text-stone-800 hover:text-[var(--accent-ink,#0b7a5c)] hover:underline" title={`Open ${it.title}`}>{it.title}</a>
 <div className="flex items-center gap-2 text-[12px] text-stone-400">
 <span>{money(it.priceCents)}</span>
 {it.status === "draft" && <span className="rounded-full bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-700">Draft</span>}
 {it.stats && it.stats.totals.offers > 0 && <span className="inline-flex items-center gap-1 font-medium text-[var(--accent-ink,#0b7a5c)]" title={statTip(it.stats.byPlatform)}><Tag size={11} />{it.stats.totals.offers}</span>}
 {it.stats && it.stats.totals.likes > 0 && <span className="inline-flex items-center gap-1 text-stone-400"><Heart size={11} className="text-rose-400" fill="currentColor" />{it.stats.totals.likes}</span>}
 </div>
 </div>
 </div>
 </td>
 {connected.map((p) => {
 const st = it.listings[p.key];
 const isExt = p.mode === "extension" && QUEUEABLE.has(p.key);
 // Vestiaire is curated — it only takes designer brands. Saying so in the cell beats letting her
 // queue it and meet a refusal at the end of their form.
 // Everything Vestiaire's five-step form would refuse — brand, three photos, material, condition,
     // category, price — checked here so it's said before she opens their site, not four screens in.
     const vest = p.key === "vestiaire" && !st ? vestReady(it) : null;
 // A draft is on this board so she can find it, not so she can list it — nothing can go to a
 // marketplace before it is live on her own shop.
 const isDraft = it.status === "draft";
     // Per cell, not per row: this is the marketplace whose button we're drawing. Computed once
     // per row before, which is how Depop's "Queued ✓" appeared in the Vestiaire column.
     const qs = queueState[`${p.key}:${it.itemId}`];
 return (
 <td key={p.key} className="whitespace-nowrap px-3 py-3 text-center">
 {isDraft && !st ? (
 <span className="text-[11px] text-stone-400">Publish first</span>
 ) : vest && !vest.ready ? (
              // The first thing standing in the way, with the rest on hover — a cell can hold one
              // sentence, and "only 1 photo" is the one that matters most often.
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-700" title={vest.blocking.join("\n")}>
               <Ban size={12} />{shortBlock(vest.blocking[0])}
              </span>
 ) : st === "listed" ? (
 <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600"><Check size={13} strokeWidth={2.6} />Listed</span>
 ) : st === "pending" ? (
 <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Queued</span>
 ) : st === "sold" ? (
 <span className="text-[11px] text-stone-500">Sold</span>
 ) : st === "error" ? (
 <button onClick={() => retry(it.itemId)} disabled={retrying === it.itemId} className="text-[11px] font-medium text-rose-600 hover:underline disabled:opacity-50">{retrying === it.itemId ? "…" : "Failed"}</button>
 ) : isExt ? (
 <button onClick={() => queueForPlatform(it.itemId, it.title, p.key)} disabled={qs === "queuing" || qs === "ok"} className="rounded-full border border-stone-200 px-2.5 py-0.5 text-[11px] text-stone-500 transition hover:border-[var(--accent-ink,#0b7a5c)] hover:text-[var(--accent-ink,#0b7a5c)] disabled:opacity-60">{qs === "queuing" ? "…" : qs === "ok" ? "Queued ✓" : "List"}</button>
 ) : p.hasApi ? (
 <button onClick={() => retry(it.itemId, [p.key])} disabled={retrying === it.itemId} className="rounded-full border border-stone-200 px-2.5 py-0.5 text-[11px] text-stone-500 transition hover:border-[var(--accent-ink,#0b7a5c)] hover:text-[var(--accent-ink,#0b7a5c)] disabled:opacity-60">{retrying === it.itemId ? "Listing…" : "List"}</button>
 ) : (
 <span className="text-[13px] text-stone-300">—</span>
 )}
 </td>
 );
 })}
  </tr>
 {(Object.keys(it.errors || {}).length > 0 || errors[it.itemId]) && (
 <tr><td colSpan={connected.length + 2} className="px-5 pb-3">
 <div className="rounded-md border border-rose-200 bg-rose-50/70 px-3 py-2">
 {/* A marketplace can refuse a piece outright — Vestiaire only takes designer brands — and its
     reason belongs on the row it's about, not in a separate banner. */}
 {errors[it.itemId] && <p className="text-[11px] leading-snug text-rose-700">{errors[it.itemId]}</p>}
 {Object.entries(it.errors || {}).map(([k, msg]) => (
 <p key={k} className="text-[11px] leading-snug text-rose-700"><span className="font-semibold">{nameFor(k)} couldn’t list:</span> {msg}</p>
 ))}
 </div>
 </td></tr>
 )}
  </Fragment>
 );
 })}
 </tbody>
 </table>
 </div>
 )}
 </TechCard>
 </>
 )}
 </>
 )}
 </AdminPage>
 );
}

function Field({ label, val, k, copied, copy, multiline }: { label: string; val: string; k: string; copied: string | null; copy: (k: string, v: string) => void; multiline?: boolean }) {
 return (
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0"><span className="text-[10px] uppercase tracking-wide text-stone-400">{label}</span><p className={`text-stone-700 ${multiline ? "whitespace-pre-wrap" : "truncate"}`}>{val}</p></div>
 <button onClick={() => copy(k, val)} className="shrink-0 text-stone-300 hover:text-stone-600">{copied === k ? <Check size={13} /> : <Copy size={13} />}</button>
 </div>
 );
}
