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
 // The address her store actually answers on — {slug}.vyasites.com, or her own domain. The API has
 // resolved this since storePublicOrigin existed; this page was still assembling
 // "vyaplatform.com/s/{handle}" out of a handle, which is a VYA path, not her shop.
 const [publicOrigin, setPublicOrigin] = useState<string | null>(null);
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
  if (d?.publicOrigin) setPublicOrigin(d.publicOrigin);
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
 : publicOrigin
  ? publicOrigin
  : handle
   ? `https://vyaplatform.com/s/${handle}`
   : "https://vyaplatform.com";
 // Product pages live at /p/<id> under whichever base the store publishes on.
 const target = itemId ? `${baseUrl}/p/${itemId}` : baseUrl;
 const linkFor = (src: string) => `${target}?utm_source=${src}&utm_medium=social&utm_campaign=${itemId ? "product" : "bio"}`;
 const chosen = items.find((i) => i.id === itemId) ?? null;
 const matches = query.trim()
 ? items.filter((i) => i.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
 : items.slice(0, 8);

 async function copy(key: string, url: string) {
 try { await navigator.clipboard.writeText(url); setCopied(key); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500); } catch { /* ignore */ }
 }

 return (
 <AdminPage className="max-w-2xl">
 <AdminHeader
 eyebrow="Store · Marketing · Share links"
 title="Share links"
 subtitle="One link to your own shop, written out once per platform. They all open the same page — the tag on the end is what tells you which post someone came from."
 />
 <p className="mb-4 text-[12px] leading-relaxed text-stone-500">
  These aren&rsquo;t links to your Instagram or Pinterest — they&rsquo;re links <b>to your store</b>, for you to
  paste <i>into</i> those places. Put the Instagram one in your Instagram bio, the TikTok one in your
  TikTok bio, and so on. Then{" "}
  <a href="/admin/analytics" className="font-medium text-stone-700 underline underline-offset-2 hover:text-stone-900">Analytics</a>{" "}
  shows how many people each one brought, and what they bought.
 </p>



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
 placeholder="…or type a piece's name to link straight to it"
 className="w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px] text-stone-700 outline-none placeholder:text-stone-400 focus:border-stone-400"
 />
 {query.trim() && (
 <div className="mt-2 divide-y divide-stone-100 overflow-hidden rounded-lg border border-stone-200">
 {matches.length === 0 && <p className="px-3 py-2.5 text-[12px] text-stone-400">No live piece by that name. This searches your own listings — it isn&rsquo;t a place to paste a link.</p>}
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
 {" "}Clicks and sales for each one are in <a href="/admin/analytics" className="underline underline-offset-2 hover:text-stone-600">Analytics</a>.
 </p>
 </AdminPage>
 );
}
