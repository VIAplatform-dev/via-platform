"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { AdminPage, AdminHeader, TechCard } from "../../ui";

type Item = { id: string; title: string; priceCents: number; image: string | null };

const PLATFORMS: { key: string; label: string }[] = [
 { key: "instagram", label: "Instagram" },
 { key: "tiktok", label: "TikTok" },
 { key: "pinterest", label: "Pinterest" },
 { key: "facebook", label: "Facebook" },
 { key: "twitter", label: "X / Twitter" },
 { key: "youtube", label: "YouTube" },
 { key: "linkedin", label: "LinkedIn" },
];

export default function ShareLinksPage() {
 const [handle, setHandle] = useState<string | null>(null);
 const [customDomain, setCustomDomain] = useState<string | null>(null);
 const [campaign, setCampaign] = useState<"bio" | "post">("bio");
 // Sharing one piece is the most common social post there is — a Story with a
 // single item — so the picker below points the same tagged links at that item.
 const [items, setItems] = useState<Item[]>([]);
 const [itemId, setItemId] = useState<string>("");
 const [query, setQuery] = useState("");
 const [copied, setCopied] = useState<string | null>(null);

 useEffect(() => {
 fetch("/api/store/storefront").then((r) => (r.ok ? r.json() : null)).then((d) => {
  if (d?.settings?.handle) setHandle(d.settings.handle);
  if (d?.settings?.customDomain) setCustomDomain(d.settings.customDomain);
 }).catch(() => {});
 fetch("/api/store/items").then((r) => (r.ok ? r.json() : null)).then((d) => {
  const live = (d?.items || []).filter((i: { status: string }) => i.status === "active");
  setItems(live.map((i: { id: string; title: string; priceCents: number; images?: string[] }) => ({
   id: i.id, title: i.title, priceCents: i.priceCents, image: i.images?.[0] ?? null,
  })));
 }).catch(() => {});
 }, []);

 // A store on its own domain must get links to THAT domain — sending their audience
 // to vyaplatform.com is the fastest way to make them stop using these. Matches how
 // instagram-publish.ts already builds a shareable item URL.
 const baseUrl = customDomain
 ? `https://${customDomain}`
 : handle
  ? `https://vyaplatform.com/s/${handle}`
  : "https://vyaplatform.com";
 // Product pages live at /p/<id> under whichever base the store publishes on.
 const target = itemId ? `${baseUrl}/p/${itemId}` : baseUrl;
 const linkFor = (src: string) => `${target}?utm_source=${src}&utm_medium=social&utm_campaign=${itemId ? "product" : campaign}`;
 const chosen = items.find((i) => i.id === itemId) ?? null;
 const matches = query.trim()
 ? items.filter((i) => i.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
 : items.slice(0, 8);

 async function copy(key: string, url: string) {
 try { await navigator.clipboard.writeText(url); setCopied(key); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500); } catch { /* ignore */ }
 }

 return (
 <AdminPage className="max-w-2xl">
 <AdminHeader eyebrow="Store · Marketing · Share links" title="Share links" subtitle="Links to post on social media. Each one is tagged, so you can see how many people clicked it and what they bought." />

 <div className={`mb-4 inline-flex rounded-full border border-stone-200 bg-white p-[3px] text-[12px] ${itemId ? "hidden" : ""}`}>
 {(["bio", "post"] as const).map((c) => (
 <button key={c} onClick={() => setCampaign(c)} className={`rounded-full px-3 py-1 transition ${campaign === c ? "bg-stone-900 text-white" : "text-stone-500 hover:text-stone-800"}`}>
 {c === "bio" ? "Bio / profile link" : "Post / caption link"}
 </button>
 ))}
 </div>

 <TechCard className="mb-4 p-4">
 <p className="mb-1 text-[13px] font-medium text-stone-700">What are you linking to?</p>
 <p className="mb-3 text-[11px] text-stone-400">Your whole storefront, or one piece — the links below update either way.</p>
 <div className="flex flex-wrap gap-2">
 <button
 onClick={() => { setItemId(""); setQuery(""); }}
 className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${!itemId ? "border-[var(--accent,#0e9f76)] bg-[var(--accent,#0e9f76)] text-white" : "border-stone-200 bg-white text-stone-500 hover:text-stone-800"}`}
 >
 My storefront
 </button>
 {chosen && (
 <span className="inline-flex items-center gap-2 rounded-full border border-[var(--accent,#0e9f76)] bg-[var(--accent-soft,#eafaf3)] px-3 py-1.5 text-[12px] font-medium text-[var(--accent-ink,#0b7a5c)]">
 {chosen.image && <img src={chosen.image} alt="" className="h-4 w-4 rounded object-cover" />}
 <span className="max-w-[220px] truncate">{chosen.title}</span>
 <button onClick={() => setItemId("")} aria-label="Clear selected piece" className="text-[13px] leading-none opacity-60 hover:opacity-100">×</button>
 </span>
 )}
 </div>
 {!chosen && items.length > 0 && (
 <div className="mt-3">
 <input
 value={query}
 onChange={(e) => setQuery(e.target.value)}
 placeholder="…or search a piece to link to"
 className="w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px] text-stone-700 outline-none placeholder:text-stone-400 focus:border-stone-400"
 />
 {query.trim() && (
 <div className="mt-2 divide-y divide-stone-100 overflow-hidden rounded-lg border border-stone-200">
 {matches.length === 0 && <p className="px-3 py-2.5 text-[12px] text-stone-400">Nothing live matches that.</p>}
 {matches.map((i) => (
 <button key={i.id} onClick={() => { setItemId(i.id); setQuery(""); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-stone-50">
 <span className="h-7 w-7 shrink-0 overflow-hidden rounded bg-stone-100">{i.image && <img src={i.image} alt="" className="h-full w-full object-cover" />}</span>
 <span className="min-w-0 flex-1 truncate text-[13px] text-stone-700">{i.title}</span>
 <span className="shrink-0 text-[12px] tabular-nums text-stone-400">${Math.round(i.priceCents / 100)}</span>
 </button>
 ))}
 </div>
 )}
 </div>
 )}
 </TechCard>

 <TechCard className="divide-y divide-stone-100">
 {PLATFORMS.map((p) => {
 const url = linkFor(p.key);
 const isCopied = copied === p.key;
 return (
 <div key={p.key} className="flex items-center gap-3 px-4 py-3">
 <span className="w-24 shrink-0 text-[13px] font-medium text-stone-800">{p.label}</span>
 <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-stone-500">{url}</span>
 <button onClick={() => copy(p.key, url)} className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1.5 text-[12px] font-medium transition ${isCopied ? "border-[var(--accent,#0e9f76)]/30 bg-[var(--accent-soft,#eafaf3)] text-[var(--accent-ink,#0b7a5c)]" : "border-stone-300 text-stone-700 hover:bg-stone-50"}`}>
 {isCopied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
 </button>
 </div>
 );
 })}
 </TechCard>

 <p className="mt-3 text-[11px] text-stone-400">
 {customDomain
 ? <>Links point to your own domain <span className="font-mono">{customDomain}</span>.</>
 : handle
  ? <>Links point to your storefront <span className="font-mono">/s/{handle}</span>.</>
  : "Set your storefront handle to point these at your store; for now they point to VYA."}
 {" "}Paste the <b>bio link</b> in your profile, and a <b>post link</b> when you drop something in a caption.
 </p>
 </AdminPage>
 );
}
