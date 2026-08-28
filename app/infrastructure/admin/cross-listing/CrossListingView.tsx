"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { Check, Copy, ChevronDown, Heart, Tag, Eye, Bookmark, Settings2, Download, ExternalLink } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButtonLink, TechEmpty, StatusPill, MetricCard, TH, TD } from "../ui";

// VYA Cross-Lister on the Chrome Web Store (Unlisted) — live once Google's review passes.
const EXTENSION_URL = "https://chromewebstore.google.com/detail/jcbjeoingkdkodflfbachfpllmkgojkp";

// Where each extension-marketplace's "create a listing" page lives (opened after queueing).
const CREATE_URL: Record<string, string> = {
 depop: "https://www.depop.com/products/create/",
 vestiaire: "https://www.vestiairecollective.com/sell-clothes-online/",
};
// Extension marketplaces that have a working queue endpoint today. Add a key here when its
// queue endpoint + extension fill flow ships (e.g. "vestiaire").
const QUEUEABLE = new Set(["depop"]);

type Platform = { key: string; name: string; hasApi: boolean; mode?: string };
type Account = { platform: string; handle: string; autoList: boolean };
type Ebay = { connected: boolean };
type Etsy = { connected: boolean };
type PlatformStats = { likes: number; offers: number; views: number; watchers: number };
type BoardRow = { itemId: string; title: string; priceCents: number; image: string | null; status: string; listings: Record<string, string>; errors?: Record<string, string>; stats?: { totals: PlatformStats; byPlatform: Record<string, PlatformStats> } };
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
 const [queueState, setQueueState] = useState<Record<string, "queuing" | "ok" | "err">>({});

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
 setQueueState((st) => ({ ...st, [d.itemId]: d.ok ? "ok" : "err" }));
 if (d.ok) load();
 };
 window.addEventListener("message", onMsg);
 return () => { obs.disconnect(); window.removeEventListener("message", onMsg); };
 }, []);

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
 setQueueState((st) => ({ ...st, [itemId]: "queuing" }));
 // Tell the extension to stage the payload (no-op if the extension isn't installed)…
 try { window.postMessage({ source: "vya-crosslist", type: `queue-${platformKey}`, itemId, title }, window.location.origin); } catch { /* ignore */ }
 // …and record intent so the board shows "Queued" and it survives a reload.
 await fetch(`/api/store/cross-listing/${platformKey}/queue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId }) }).catch(() => null);
 // No extension → no "queued" message comes back; settle the button optimistically off the server write.
 setTimeout(() => setQueueState((st) => (st[itemId] === "queuing" ? { ...st, [itemId]: "ok" } : st)), 1200);
 }
 async function queueForPlatform(itemId: string, title: string, platformKey: string) {
 await queueOne(itemId, title, platformKey);
 load();
 }
 // Bulk: queue every selected item that isn't already listed/sold on this marketplace.
 async function bulkQueue(platformKey: string) {
 const targets = board.filter((it) => selected.has(it.itemId) && it.listings[platformKey] !== "listed" && it.listings[platformKey] !== "sold");
 for (const it of targets) await queueOne(it.itemId, it.title, platformKey);
 setSelected(new Set());
 load();
 }

 async function markSold(itemId: string, platform: string) {
 setSoldMenu(null);
 await fetch("/api/store/cross-listing", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, platform }) });
 load();
 }
 async function retry(itemId: string) {
 setRetrying(itemId);
 const r = await fetch("/api/store/cross-listing/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId }) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
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
 const installBtn = <TechButtonLink variant="secondary" href={EXTENSION_URL} target="_blank" rel="noopener"><Download size={14} /> Get the extension</TechButtonLink>;


 return (
 <AdminPage>
 <AdminHeader
 eyebrow="Sell · Cross-listing"
 title="Cross-listing"
 subtitle="List every piece everywhere you sell — and see what's live, what's queued, and where the sales come from."
 actions={<>{installBtn}{settingsBtn}</>}
 />

 {loading ? (
 <div className="flex items-center justify-center py-32 text-sm text-stone-400">Loading…</div>
 ) : connected.length === 0 && board.length === 0 ? (
 <TechEmpty
 icon={<Tag size={28} strokeWidth={1.5} />}
 title="No marketplaces connected yet"
 body="Connect eBay, Depop, Poshmark and more — then publish once to VYA and list everywhere. Sales, offers and revenue per channel show up here."
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
 {/* Posting CTAs — one per extension marketplace with queued items. Makes "now go post these" obvious. */}
 {extMarketplaces.map((p) => {
 const n = board.filter((it) => it.listings[p.key] === "pending").length;
 if (!n) return null;
 return (
 <div key={p.key} className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--accent-ink,#0b7a5c)]/25 bg-[var(--accent-ink,#0b7a5c)]/[0.06] px-4 py-3">
 <div className="min-w-0 flex-1">
 <p className="text-[13px] font-semibold text-stone-800">{n} item{n === 1 ? "" : "s"} queued for {p.name}</p>
 <p className="text-[12px] text-stone-500">{extInstalled ? `Open ${p.name} and the VYA extension auto-fills each listing — review and press Post.` : `Install the VYA extension, then open ${p.name} and it auto-fills each listing.`}</p>
 </div>
 {extInstalled
 ? <TechButtonLink href={CREATE_URL[p.key] || "#"} target="_blank" rel="noopener"><ExternalLink size={14} /> Open {p.name} to list ({n})</TechButtonLink>
 : <TechButtonLink href={EXTENSION_URL} target="_blank" rel="noopener"><Download size={14} /> Get the extension</TechButtonLink>}
 </div>
 );
 })}

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

 {/* the products board */}
 <TechCard className="overflow-hidden">
 <div className="flex items-center gap-3 border-b border-stone-100 px-5 py-3">
 {board.length > 0 && (
 <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--accent-ink,#0b7a5c)]" title="Select all" />
 )}
 <div className="flex-1">
 <h3 className="text-[13px] font-semibold text-stone-900">Listings</h3>
 <p className="mt-0.5 text-[12px] text-stone-500">Where each active piece stands — select items to queue them in bulk.</p>
 </div>
 </div>
 {board.length === 0 ? (
 <div className="p-3">
 <TechEmpty icon={<Tag size={28} strokeWidth={1.5} />} title="No active listings" body="Publish a piece to VYA and it’ll show here, ready to cross-list." />
 </div>
 ) : (
 <div className="divide-y divide-stone-100">
 {board.map((it) => (
 <div key={it.itemId} className={`px-5 py-3 ${selected.has(it.itemId) ? "bg-[var(--accent-ink,#0b7a5c)]/[0.04]" : ""}`}>
 <div className="flex items-center gap-3">
 <input type="checkbox" checked={selected.has(it.itemId)} onChange={() => toggleSelect(it.itemId)} className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--accent-ink,#0b7a5c)]" />
 <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-stone-100">{it.image && <img src={it.image} alt="" className="h-full w-full object-cover" />}</div>
 <div className="min-w-0 flex-1">
 <p className="truncate text-[13px] font-medium text-stone-800">{it.title}</p>
 <div className="flex items-center gap-2.5 text-[12px] text-stone-400">
 <span>{money(it.priceCents)}</span>
 {it.stats && (it.stats.totals.likes + it.stats.totals.offers + it.stats.totals.views + it.stats.totals.watchers) > 0 && (
 <span className="flex items-center gap-2.5" title={statTip(it.stats.byPlatform)}>
 {it.stats.totals.likes > 0 && <span className="inline-flex items-center gap-1 text-stone-500"><Heart size={11} className="text-rose-400" fill="currentColor" />{it.stats.totals.likes}</span>}
 {it.stats.totals.offers > 0 && <span className="inline-flex items-center gap-1 font-medium text-[var(--accent-ink,#0b7a5c)]"><Tag size={11} />{it.stats.totals.offers}</span>}
 {it.stats.totals.views > 0 && <span className="inline-flex items-center gap-1 text-stone-500"><Eye size={11} />{it.stats.totals.views}</span>}
 {it.stats.totals.watchers > 0 && <span className="inline-flex items-center gap-1 text-stone-500"><Bookmark size={11} />{it.stats.totals.watchers}</span>}
 </span>
 )}
 </div>
 </div>
 <div className="hidden flex-wrap justify-end gap-1 sm:flex">
 {connected.map((p) => {
 const st = it.listings[p.key];
 const meta = st ? STATUS[st] : null;
 return (
 <StatusPill key={p.key} tone={meta?.tone || "neutral"} className="px-1.5 py-0.5 text-[10px]">
 {p.name}{meta ? `: ${meta.label}` : ""}
 </StatusPill>
 );
 })}
 </div>
 <div className="relative flex shrink-0 items-center gap-2">
 {extMarketplaces.filter((p) => QUEUEABLE.has(p.key) && it.listings[p.key] !== "listed" && it.listings[p.key] !== "sold").map((p) => (
 <button key={p.key} onClick={() => queueForPlatform(it.itemId, it.title, p.key)} disabled={queueState[it.itemId] === "queuing" || queueState[it.itemId] === "ok"} title={extInstalled ? `Stage this item and open it on ${p.name} from the extension` : `Marks it queued; install the VYA extension to auto-fill ${p.name}`} className="rounded bg-[var(--accent-ink,#0b7a5c)] px-2 py-0.5 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-60">
 {queueState[it.itemId] === "queuing" ? "Queuing…" : queueState[it.itemId] === "ok" ? "Queued ✓" : queueState[it.itemId] === "err" ? "Retry" : `Queue for ${p.name}`}
 </button>
 ))}
 <button onClick={() => openContent(it.itemId)} className="text-[12px] font-medium text-[var(--accent-ink,#0b7a5c)] hover:underline">Content</button>
 <button onClick={() => setSoldMenu(soldMenu === it.itemId ? null : it.itemId)} className="flex items-center gap-0.5 text-[12px] text-stone-500 hover:text-stone-800">Sold <ChevronDown size={13} /></button>
 {soldMenu === it.itemId && (
 <div className="absolute right-0 top-6 z-10 w-40 rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
 <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-stone-400">Sold on…</p>
 {[{ key: "vya", name: "VYA" }, ...connected].map((p) => (
 <button key={p.key} onClick={() => markSold(it.itemId, p.key)} className="block w-full px-3 py-1.5 text-left text-[13px] text-stone-700 hover:bg-stone-50">{p.name}</button>
 ))}
 </div>
 )}
 </div>
 </div>

 {it.errors && Object.keys(it.errors).length > 0 && (
 <div className="mt-2 rounded-md border border-rose-200 bg-rose-50/70 px-3 py-2">
 {Object.entries(it.errors).map(([k, msg]) => (
 <p key={k} className="text-[11px] leading-snug text-rose-700"><span className="font-semibold">{nameFor(k)} couldn’t list:</span> {msg}</p>
 ))}
 <button onClick={() => retry(it.itemId)} disabled={retrying === it.itemId} className="mt-1.5 rounded bg-rose-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-rose-700 disabled:opacity-50">{retrying === it.itemId ? "Retrying…" : "Retry"}</button>
 </div>
 )}

 {open === it.itemId && (
 <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50/60 p-3">
 {!content ? <p className="py-3 text-center text-[12px] text-stone-400">Generating…</p> : (
 <div className="space-y-3">
 {connected.length === 0 && <p className="text-[12px] text-stone-500">Connect a marketplace in settings to get tailored content.</p>}
 {(connected.length ? connected : platforms).map((p) => {
 const c = content[p.key]; if (!c) return null;
 return (
 <div key={p.key} className="rounded-md border border-stone-200 bg-white p-3">
 <p className="mb-1.5 text-[12px] font-semibold text-stone-700">{p.name} <span className="font-normal text-stone-400">· {c.price}</span></p>
 <div className="space-y-1.5 text-[12px]">
 <Field label="Title" val={c.title} k={`${it.itemId}-${p.key}-t`} copied={copied} copy={copy} />
 <Field label="Description" val={c.body} k={`${it.itemId}-${p.key}-b`} copied={copied} copy={copy} multiline />
 </div>
 </div>
 );
 })}
 </div>
 )}
 </div>
 )}
 </div>
 ))}
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
