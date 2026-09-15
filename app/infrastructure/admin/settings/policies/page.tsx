"use client";

import { useEffect, useState } from "react";
import { ScrollText, Check } from "lucide-react";
import { AdminHeader, TechCard, TechButton, StatusPill, cn } from "../../ui";
import { Sparkles } from "lucide-react";

// What the store promises its buyers.
//
// Every hosted storefront already links to Returns, Shipping, Privacy and Terms. Until now only
// returns existed, buried in a settings tab. The other three linked to pages with nothing behind
// them. Marketplaces and Stripe both ask for these too, so the blanks weren't only a storefront
// problem.
//
// One at a time, and saved independently: a seller writes her returns policy in one sitting and
// gets to terms weeks later, and the page shouldn't imply she has to do all four.

type Key = "returns" | "shipping" | "privacy" | "terms";
type Policies = Record<Key, string>;

const TABS: { key: Key; label: string; blurb: string; placeholder: string }[] = [
 {
  key: "returns", label: "Returns",
  blurb: "How long buyers have, what condition you'll accept, and who pays return postage.",
  placeholder: "We accept returns within 14 days of delivery, provided the piece is unworn with tags attached. Return postage is the buyer's unless the piece was misdescribed…",
 },
 {
  key: "shipping", label: "Shipping",
  blurb: "How fast you post, where you ship, and what happens with customs.",
  placeholder: "Orders are posted within 2 business days. International orders may be charged customs duty on delivery, which is the buyer's responsibility…",
 },
 {
  key: "privacy", label: "Privacy",
  blurb: "What you collect and what you do with it. Required in the UK and EU.",
  placeholder: "We collect your name, address and email to fulfil your order…",
 },
 {
  key: "terms", label: "Terms of service",
  blurb: "The rules of buying from you.",
  placeholder: "By placing an order you agree that…",
 },
];

export default function PoliciesPage() {
 const [p, setP] = useState<Policies | null>(null);
 const [tab, setTab] = useState<Key>("returns");
 const [busy, setBusy] = useState(false);
 const [saved, setSaved] = useState<Key | null>(null);
 const [err, setErr] = useState<string | null>(null);
 // Which tabs are currently showing words WE wrote rather than hers. A tab leaves this set the
 // moment she types in it, so the "we drafted this" note never sits over her own writing.
 const [drafted, setDrafted] = useState<Set<Key>>(new Set());

 useEffect(() => {
  let active = true;
  (async () => {
   const d = await fetch("/api/store/profile").then((r) => (r.ok ? r.json() : null)).catch(() => null);
   if (active) setP(d?.profile?.policies ?? { returns: "", shipping: "", privacy: "", terms: "" });
   const w = await fetch("/api/store/policies/draft").then((r) => (r.ok ? r.json() : null)).catch(() => null);
   if (!active || !w?.ok) return;
   // WRITTEN ALREADY, not offered behind a button.
   //
   // Four empty boxes is why most stores have no policies at all: writing a returns policy from
   // nothing is an afternoon nobody has. She has already answered every part of it in the settings
   // screens, so the box arrives full and her job is editing rather than starting.
   //
   // ONLY THE EMPTY ONES. Anything she has written is hers and is never touched, and nothing is
   // saved until she presses Save, so a draft she disagrees with dies when she closes the tab.
   setP((cur) => {
    if (!cur) return cur;
    const next = { ...cur };
    const filled = new Set<Key>();
    for (const k of (w.available ?? []) as Key[]) {
     if (!next[k]?.trim() && w.drafts?.[k]) { next[k] = w.drafts[k]; filled.add(k); }
    }
    setDrafted(filled);
    return next;
   });
  })();
  return () => { active = false; };
 }, []);

 async function save() {
  if (!p) return;
  setBusy(true); setErr(null); setSaved(null);
  const r = await fetch("/api/store/profile", {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ policies: { [tab]: p[tab] } }),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(false);
  if (!r || !r.ok) { setErr(r?.d?.error || "Couldn’t save that."); return; }
  if (r.d.profile?.policies) setP(r.d.profile.policies);
  setSaved(tab);
 }

 const current = TABS.find((t) => t.key === tab)!;
 const written = (k: Key) => Boolean(p && p[k]?.trim());

 return (
  <>
   <AdminHeader eyebrow="Settings" title="Policies" subtitle="Buyers read this at checkout and agree to it. Linked from every page of your storefront." />
   {err && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700" role="alert">{err}</div>}

   {!p ? (
    <TechCard className="px-5 py-8 text-center text-[13px] text-stone-400">Loading…</TechCard>
   ) : (
    <TechCard className="overflow-hidden">
     <div className="flex flex-wrap items-center gap-1 border-b border-stone-100 px-3 py-2">
      {TABS.map((t) => (
       <button
        key={t.key}
        onClick={() => { setTab(t.key); setSaved(null); }}
        className={cn(
         "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
         tab === t.key ? "bg-stone-900/[0.06] font-medium text-stone-900" : "text-stone-500 hover:text-stone-900",
        )}
       >
        {t.label}
        {/* A tick beside the written ones, so she can see at a glance what's still blank. */}
        {written(t.key) && <Check size={12} className="text-emerald-600" />}
       </button>
      ))}
     </div>

     <div className="px-5 py-5">
      <div className="mb-3 flex items-start gap-2">
       <ScrollText size={15} className="mt-0.5 shrink-0 text-stone-400" />
       <p className="text-[12.5px] leading-relaxed text-stone-500">{current.blurb}</p>
      </div>
      {tab === "returns" && (
       <p className="mb-3 rounded-lg bg-stone-50 px-3 py-2.5 text-[12px] leading-relaxed text-stone-500">
        This is the page buyers read, and the same text as the returns box under General → Returns,
        edit it in either place. The <span className="font-medium text-stone-700">rules</span> a refund
        actually follows, how many days, any restocking fee, who pays return postage. Are set there too.
       </p>
      )}
      {/* OUR WORDS, SAID SO. The box is already full, so she has to know whose sentences these are
          before she publishes them under her shop's name. It disappears the moment she edits. */}
      {drafted.has(tab) && (
       <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5">
        <Sparkles size={14} className="mt-0.5 shrink-0 text-amber-700" />
        <p className="text-[12.5px] leading-relaxed text-stone-700">
         <span className="font-medium text-stone-900">This is a draft we wrote from your settings.</span>{" "}
         Read it, change anything that isn&rsquo;t how your shop works, then save it. Nothing is live
         until you do.
        </p>
       </div>
      )}
      <textarea
       value={p[tab]}
       onChange={(e) => { setP({ ...p, [tab]: e.target.value }); setSaved(null); setDrafted((d) => { const n = new Set(d); n.delete(tab); return n; }); }}
       placeholder={current.placeholder}
       rows={16}
       className="w-full resize-y rounded-lg border border-stone-300 px-3 py-2.5 text-[13px] leading-relaxed outline-none focus:border-stone-500"
      />
     </div>

     <div className="flex flex-wrap items-center gap-3 border-t border-stone-100 px-5 py-3.5">
      <TechButton onClick={save} disabled={busy}>{busy ? "Saving…" : `Save ${current.label.toLowerCase()}`}</TechButton>
      {saved === tab && <StatusPill tone="live">Saved</StatusPill>}
      {drafted.has(tab) && saved !== tab && <StatusPill tone="pending">Not saved yet</StatusPill>}
      <span className="ml-auto text-[11.5px] text-stone-400">
       {written(tab) ? "Live on your storefront, on VYA pages. A site you imported keeps its own policy pages." : "Not written yet: your storefront won’t link to it."}
      </span>
     </div>
    </TechCard>
   )}
  </>
 );
}
