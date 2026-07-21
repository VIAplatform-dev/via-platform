"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { Check, Copy, ChevronDown, Heart, Tag, Eye, Bookmark } from "lucide-react";
import { Card, CardHeader, PageHeader, Button, Input, EmptyState } from "@/app/store/ui";

type Platform = { key: string; name: string; hasApi: boolean };
type Account = { platform: string; handle: string; autoList: boolean };
type Ebay = { configured: boolean; connected: boolean; user: string | null };
type Etsy = { configured: boolean; connected: boolean; shop: string | null };
type PlatformStats = { likes: number; offers: number; views: number; watchers: number };
type BoardRow = { itemId: string; title: string; priceCents: number; image: string | null; status: string; listings: Record<string, string>; stats?: { totals: PlatformStats; byPlatform: Record<string, PlatformStats> } };
type Content = { title: string; body: string; tags: string[]; price: string };

const money = (c: number) => `$${Math.round(c / 100).toLocaleString()}`;

const STATUS: Record<string, { label: string; cls: string }> = {
 pending: { label: "Queued", cls: "bg-amber-100 text-amber-700" },
 listed: { label: "Listed", cls: "bg-emerald-100 text-emerald-700" },
 removed: { label: "Pull", cls: "bg-rose-100 text-rose-700" },
 sold: { label: "Sold", cls: "bg-stone-800 text-white" },
 error: { label: "Failed", cls: "bg-rose-200 text-rose-800" },
};

export default function CrossListingPage() {
 const [platforms, setPlatforms] = useState<Platform[]>([]);
 const [accounts, setAccounts] = useState<Account[]>([]);
 const [ebay, setEbay] = useState<Ebay | null>(null);
 const [etsy, setEtsy] = useState<Etsy | null>(null);
 const [board, setBoard] = useState<BoardRow[]>([]);
 const [loading, setLoading] = useState(true);
 const [handles, setHandles] = useState<Record<string, string>>({});
 const [open, setOpen] = useState<string | null>(null);
 const [content, setContent] = useState<Record<string, Content> | null>(null);
 const [copied, setCopied] = useState<string | null>(null);
 const [soldMenu, setSoldMenu] = useState<string | null>(null);

 async function load() {
 const r = await fetch("/api/store/cross-listing").then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (r) { setPlatforms(r.platforms); setAccounts(r.accounts); setBoard(r.board); setEbay(r.ebay); setEtsy(r.etsy); }
 setLoading(false);
 }
 useEffect(() => {
 let active = true;
 (async () => {
 const r = await fetch("/api/store/cross-listing").then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (r && active) { setPlatforms(r.platforms); setAccounts(r.accounts); setBoard(r.board); setEbay(r.ebay); setEtsy(r.etsy); }
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
 // Refresh EVERYTHING (not just accounts) — eBay/Etsy connected state lives in ebay/etsy, so
 // updating only accounts would leave an OAuth platform still showing "Connected" after disconnect.
 if (r.ok) await load();
 }
 async function toggleAuto(a: Account) {
 const r = await fetch("/api/store/cross-listing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: a.platform, handle: a.handle, autoList: !a.autoList }) });
 const d = await r.json(); if (r.ok) setAccounts(d.accounts);
 }
 async function openContent(itemId: string) {
 if (open === itemId) { setOpen(null); return; }
 setOpen(itemId); setContent(null);
 const r = await fetch(`/api/store/cross-listing/content?itemId=${itemId}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (r) setContent(r.content);
 }
 async function markSold(itemId: string, platform: string) {
 setSoldMenu(null);
 await fetch("/api/store/cross-listing", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, platform }) });
 load();
 }
 async function copy(key: string, v: string) {
 try { await navigator.clipboard.writeText(v); setCopied(key); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500); } catch { /* ignore */ }
 }

 const connected = platforms.filter((p) => acct(p.key) || (p.key === "ebay" && ebay?.connected) || (p.key === "etsy" && etsy?.connected));

 // Engagement roll-up helpers: a human name per channel + a per-platform breakdown for the tooltip.
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

 return (
 <div className="mx-auto max-w-3xl px-6 py-8">
 <PageHeader title="Cross-listing" subtitle="Publish once to VYA and list to your other marketplaces — and when a piece sells anywhere, pull it from everywhere so it never double-sells." />

 {/* connect platforms */}
 <Card className="mb-5">
 <CardHeader title="Your marketplaces" subtitle="Connect the shops you also sell on. New VYA listings queue here automatically." />
 <div className="divide-y divide-stone-100">
 {platforms.map((p) => {
 const a = acct(p.key);
 // eBay uses OAuth (real auto-posting), not a handle.
 if (p.key === "ebay") {
 return (
 <div key={p.key} className="flex items-center gap-3 px-5 py-3">
 <div className="w-24 shrink-0"><span className="text-[13px] font-medium text-stone-800">eBay</span><span className="ml-1 rounded bg-emerald-50 px-1 text-[10px] text-emerald-600">API</span></div>
 {!ebay?.configured ? (
 <span className="flex-1 text-[12px] text-stone-400">Not set up on the server yet (needs eBay app keys).</span>
 ) : ebay?.connected ? (
 <>
 <span className="flex-1 truncate text-[13px] text-emerald-700">✓ Connected{ebay.user ? ` · ${ebay.user}` : ""} — auto-posts for real</span>
 <button onClick={() => disconnect("ebay")} className="text-[12px] text-stone-400 hover:text-rose-600">Disconnect</button>
 </>
 ) : (
 <>
 <span className="flex-1 text-[12px] text-stone-500">Connect your eBay account to auto-post &amp; auto-remove.</span>
 <a href="/api/store/cross-listing/ebay/connect"><Button>Connect eBay</Button></a>
 </>
 )}
 </div>
 );
 }
 // Etsy uses OAuth (real auto-posting + auto-delisting), not a handle.
 if (p.key === "etsy") {
 return (
 <div key={p.key} className="flex items-center gap-3 px-5 py-3">
 <div className="w-24 shrink-0"><span className="text-[13px] font-medium text-stone-800">Etsy</span><span className="ml-1 rounded bg-emerald-50 px-1 text-[10px] text-emerald-600">API</span></div>
 {!etsy?.configured ? (
 <span className="flex-1 text-[12px] text-stone-400">Not set up on the server yet (needs Etsy app keys).</span>
 ) : etsy?.connected ? (
 <>
 <span className="flex-1 truncate text-[13px] text-emerald-700">✓ Connected{etsy.shop ? ` · ${etsy.shop}` : ""} — auto-posts &amp; delists</span>
 <button onClick={() => disconnect("etsy")} className="text-[12px] text-stone-400 hover:text-rose-600">Disconnect</button>
 </>
 ) : (
 <>
 <span className="flex-1 text-[12px] text-stone-500">Connect your Etsy shop to auto-post &amp; auto-delist.</span>
 <a href="/api/store/cross-listing/etsy/connect"><Button>Connect Etsy</Button></a>
 </>
 )}
 </div>
 );
 }
 return (
 <div key={p.key} className="flex items-center gap-3 px-5 py-3">
 <div className="w-24 shrink-0">
 <span className="text-[13px] font-medium text-stone-800">{p.name}</span>
 {!p.hasApi && <span className="ml-1 text-[10px] text-stone-400">copy</span>}
 </div>
 {a ? (
 <>
 <span className="flex-1 truncate text-[13px] text-stone-500">@{a.handle}</span>
 <label className="flex items-center gap-1.5 text-[12px] text-stone-500">
 <input type="checkbox" checked={a.autoList} onChange={() => toggleAuto(a)} className="accent-[#5D0F17]" /> Auto-list
 </label>
 <button onClick={() => disconnect(p.key)} className="text-[12px] text-stone-400 hover:text-rose-600">Remove</button>
 </>
 ) : (
 <>
 <Input value={handles[p.key] || ""} onChange={(e) => setHandles((h) => ({ ...h, [p.key]: e.target.value }))} placeholder={`your ${p.name} handle`} className="flex-1" />
 <Button onClick={() => connect(p.key)}>Connect</Button>
 </>
 )}
 </div>
 );
 })}
 </div>
 </Card>

 {/* the board */}
 <Card>
 <CardHeader title="Listings" subtitle="Where each active piece stands across your marketplaces." />
 {loading ? (
 <div className="py-16 text-center text-sm text-stone-400">Loading…</div>
 ) : board.length === 0 ? (
 <EmptyState title="No active listings" body="Publish a piece to VYA and it’ll show here, ready to cross-list." />
 ) : (
 <div className="divide-y divide-stone-100">
 {board.map((it) => (
 <div key={it.itemId} className="px-5 py-3">
 <div className="flex items-center gap-3">
 <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-stone-100">{it.image && <img src={it.image} alt="" className="h-full w-full object-cover" />}</div>
 <div className="min-w-0 flex-1">
 <p className="truncate text-[13px] font-medium text-stone-800">{it.title}</p>
 <div className="flex items-center gap-2.5 text-[12px] text-stone-400">
 <span>{money(it.priceCents)}</span>
 {it.stats && (it.stats.totals.likes + it.stats.totals.offers + it.stats.totals.views + it.stats.totals.watchers) > 0 && (
 <span className="flex items-center gap-2.5" title={statTip(it.stats.byPlatform)}>
 {it.stats.totals.likes > 0 && <span className="inline-flex items-center gap-1 text-stone-500"><Heart size={11} className="text-rose-400" fill="currentColor" />{it.stats.totals.likes}</span>}
 {it.stats.totals.offers > 0 && <span className="inline-flex items-center gap-1 font-medium text-[#5D0F17]"><Tag size={11} />{it.stats.totals.offers}</span>}
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
 return <span key={p.key} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${meta ? meta.cls : "bg-stone-100 text-stone-400"}`}>{p.name}{meta ? `: ${meta.label}` : ""}</span>;
 })}
 </div>
 <div className="relative flex shrink-0 items-center gap-2">
 <button onClick={() => openContent(it.itemId)} className="text-[12px] font-medium text-[#5D0F17] hover:underline">Content</button>
 <button onClick={() => setSoldMenu(soldMenu === it.itemId ? null : it.itemId)} className="flex items-center gap-0.5 text-[12px] text-stone-500 hover:text-stone-800">Sold <ChevronDown size={13} /></button>
 {soldMenu === it.itemId && (
 <div className="absolute right-0 top-6 z-10 w-40 rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
 <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-stone-400">Sold on…</p>
 {[{ key: "vya", name: "VYA" }, ...connected].map((p) => (
 <button key={p.key} onClick={() => markSold(it.itemId, p.key)} className="block w-full px-3 py-1.5 text-left text-[13px] text-stone-700 hover:bg-stone-50">{p.name}</button>
 ))}
 </div>
 )}
 </div>
 </div>

 {open === it.itemId && (
 <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50/60 p-3">
 {!content ? <p className="py-3 text-center text-[12px] text-stone-400">Generating…</p> : (
 <div className="space-y-3">
 {connected.length === 0 && <p className="text-[12px] text-stone-500">Connect a marketplace above to get tailored content.</p>}
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
 </Card>

 <p className="mt-3 text-[11px] text-stone-400">eBay auto-posts your listing and pulls it back automatically when the piece sells on VYA. More marketplaces are coming soon.</p>
 </div>
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
