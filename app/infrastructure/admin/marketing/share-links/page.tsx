"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { AdminPage, AdminHeader, TechCard } from "../../ui";

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
 const [campaign, setCampaign] = useState<"bio" | "post">("bio");
 const [copied, setCopied] = useState<string | null>(null);

 useEffect(() => {
 fetch("/api/store/storefront").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.settings?.handle) setHandle(d.settings.handle); }).catch(() => {});
 }, []);

 const baseUrl = handle ? `https://vyaplatform.com/s/${handle}` : "https://vyaplatform.com";
 const linkFor = (src: string) => `${baseUrl}?utm_source=${src}&utm_medium=social&utm_campaign=${campaign}`;

 async function copy(key: string, url: string) {
 try { await navigator.clipboard.writeText(url); setCopied(key); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500); } catch { /* ignore */ }
 }

 return (
 <AdminPage className="max-w-2xl">
 <AdminHeader eyebrow="Store · Marketing · Share links" title="Share links" subtitle="Ready-made links for your socials — tagged so every click is tracked in Audience + Performance." />

 <div className="mb-4 inline-flex rounded-full border border-stone-200 bg-white p-[3px] text-[12px]">
 {(["bio", "post"] as const).map((c) => (
 <button key={c} onClick={() => setCampaign(c)} className={`rounded-full px-3 py-1 transition ${campaign === c ? "bg-stone-900 text-white" : "text-stone-500 hover:text-stone-800"}`}>
 {c === "bio" ? "Bio / profile link" : "Post / caption link"}
 </button>
 ))}
 </div>

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
 {handle ? <>Links point to your storefront <span className="font-mono">/s/{handle}</span>.</> : "Set your storefront handle to point these at your store; for now they point to VYA."}
 {" "}Paste the <b>bio link</b> in your profile, and a <b>post link</b> when you drop something in a caption.
 </p>
 </AdminPage>
 );
}
