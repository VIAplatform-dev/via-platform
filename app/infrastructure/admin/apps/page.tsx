"use client";

import { useEffect, useState } from "react";
import { Input, Field } from "@/app/store/ui";
import { AdminPage, AdminHeader, TechCard, TechButton, StatusPill } from "../ui";
import { Mail, Megaphone, ShoppingBag } from "lucide-react";

type KStatus = { connected: boolean; accountName: string | null; oauth?: boolean };

const COMING: { name: string; category: string; blurb: string; icon: typeof Mail; tint: string }[] = [
 { name: "Meta", category: "Ads & social", blurb: "Sync your catalog to Instagram & Facebook Shops.", icon: Megaphone, tint: "#1877F2" },
 { name: "Google Shopping", category: "Ads", blurb: "List your pieces in Google Shopping results.", icon: ShoppingBag, tint: "#34A853" },
];

export default function AppsPage() {
 // Only one thing this page needs to know: is an email tool connected. Setting it up lives on its
 // own page now, so the connect form, the key box and the sync button that used to be here are gone.
 const [k, setK] = useState<{ connected: boolean; provider?: string } | null>(null);
 const [notice, setNotice] = useState("");

 useEffect(() => {
  (async () => {
   const d = await fetch("/api/store/marketing/esp").then((r) => (r.ok ? r.json() : null)).catch(() => null);
   if (d?.ok) setK({ connected: Boolean(d.connected), provider: d.connected?.provider });
   const q = new URLSearchParams(window.location.search).get("klaviyo");
   if (q === "connected") setNotice("Connected.");
   if (q) window.history.replaceState({}, "", window.location.pathname);
  })();
 }, []);

 return (
 <AdminPage className="max-w-3xl">
 <AdminHeader eyebrow="Apps · Integrations" title="Apps & integrations" subtitle="Extra features you can turn on. Nothing here is required." />

 {notice && <div className="mb-4 rounded-lg bg-[var(--accent-soft,#eafaf3)] px-4 py-2.5 text-[13px] font-medium text-[var(--accent-ink,#0b7a5c)]">{notice}</div>}

 <div className="mb-5 rounded-xl border border-stone-200/70 bg-stone-50/70 px-4 py-3 text-[12.5px] leading-relaxed text-stone-500">
 Everything in VYA works without these. Your storefront, checkout, email <span className="font-medium text-stone-600">Campaigns</span>, and <span className="font-medium text-stone-600">Automations</span> all run on their own — connect an app only if you want its extra power.
 </div>

 <div className="grid gap-3 sm:grid-cols-2">
 {/* One card for both. They're the same job — "the email tool I already use" — and a shop picks
     between them rather than considering each on its own. Both are set up on the same page. */}
 <TechCard
 role="button"
 tabIndex={0}
 onClick={() => { window.location.href = "/admin/apps/email"; }}
 onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); window.location.href = "/admin/apps/email"; } }}
 className="flex cursor-pointer flex-col p-4 text-left transition hover:border-stone-300"
 >
 <div className="flex items-center gap-3">
 <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: "#232426" }}><Mail size={18} /></span>
 <div>
 <p className="text-[14px] font-semibold text-stone-900">Klaviyo &amp; Mailchimp</p>
 <p className="text-[11px] uppercase tracking-[0.08em] text-stone-400">Email marketing</p>
 </div>
 {k?.connected && <StatusPill tone="live" dot className="ml-auto">Connected</StatusPill>}
 </div>
 <p className="mt-3 text-[12.5px] leading-relaxed text-stone-500">
 Already send your emails from one of these? Sign in and VYA keeps your customer list, pieces and
 orders there up to date. You carry on writing and sending from there.
 </p>
 <span className="mt-3 text-[12px] font-medium text-[var(--accent-ink,#0b7a5c)]">{k?.connected ? "Manage →" : "Set up →"}</span>
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

 <p className="mt-4 text-[12px] leading-relaxed text-stone-400">Not sure? Skip this entirely — VYA&rsquo;s own Campaigns and Automations send your email on their own.</p>
 </AdminPage>
 );
}
