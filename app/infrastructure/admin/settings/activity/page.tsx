"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Circle } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, cn } from "../../ui";
import { describeActivity, collapse, ago, isNavigation, type Activity } from "@/app/lib/seller-activity";

// What one seller has actually been doing.
//
// PostHog answers "how many" across everyone. This answers "what happened to her" — the question you
// have when a single store is trying VYA for the first time and you want to know whether she got
// stuck on step two or listed nine pieces and left happy.

type Store = { storeSlug: string | null; email: string | null; last: string; events: number };

export default function ActivityPage() {
 const [events, setEvents] = useState<Activity[]>([]);
 const [stores, setStores] = useState<Store[]>([]);
 const [store, setStore] = useState<string | null>(null);
 const [loading, setLoading] = useState(true);
 const [err, setErr] = useState<string | null>(null);

 const load = useCallback(async (slug: string | null) => {
  const res = await fetch(`/api/admin/activity${slug ? `?store=${encodeURIComponent(slug)}` : ""}`).catch(() => null);
  if (!res?.ok) { setErr(res?.status === 404 ? "Sign in as the VYA owner to see this." : "Couldn't load the log."); setLoading(false); return; }
  const d = await res.json().catch(() => null);
  if (d?.ok) { setEvents(d.events || []); setStores(d.stores || []); setErr(null); }
  setLoading(false);
 }, []);

 useEffect(() => { void load(store); }, [load, store]);
 // A log you're watching should keep up on its own — you're usually looking at it while someone
 // is mid-signup, and refreshing by hand is how you miss the step that went wrong.
 useEffect(() => {
  const t = setInterval(() => void load(store), 20_000);
  return () => clearInterval(t);
 }, [load, store]);

 const rows = collapse(events);

 return (
  <AdminPage>
   <AdminHeader
    eyebrow="Settings · VYA"
    title="What sellers are doing"
    subtitle="Every screen opened and every piece published, as it happens. Recorded on our own servers, so it survives an ad blocker."
    actions={
     <button onClick={() => void load(store)} className="inline-flex items-center gap-1.5 text-[13px] text-stone-500 hover:text-stone-900">
      <RefreshCw size={13} /> Refresh
     </button>
    }
   />

   {err && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700" role="alert">{err}</div>}

   <div className="mb-4 flex flex-wrap gap-1.5">
    <button type="button" onClick={() => setStore(null)}
     className={cn("rounded-full px-3 py-1.5 text-[12.5px] transition", !store ? "bg-stone-900 text-white" : "border border-stone-200 text-stone-600 hover:bg-stone-50")}>
     Everyone
    </button>
    {stores.map((s) => (
     <button key={s.storeSlug ?? "none"} type="button" onClick={() => setStore(s.storeSlug)}
      className={cn("rounded-full px-3 py-1.5 text-[12.5px] transition",
       store === s.storeSlug ? "bg-stone-900 text-white" : "border border-stone-200 text-stone-600 hover:bg-stone-50")}>
      {s.storeSlug || "no store yet"}
      <span className={cn("ml-1.5 tabular-nums", store === s.storeSlug ? "text-white/60" : "text-stone-400")}>{s.events}</span>
     </button>
    ))}
   </div>

   {loading ? (
    <TechCard className="px-5 py-8 text-center text-[13px] text-stone-400">Loading…</TechCard>
   ) : rows.length === 0 ? (
    <TechCard className="px-5 py-12 text-center">
     <p className="text-[13.5px] text-stone-600">Nothing yet.</p>
     <p className="mx-auto mt-1 max-w-[46ch] text-[12.5px] leading-relaxed text-stone-400">
      The moment a seller signs in and opens a screen, it appears here. This page checks again every
      twenty seconds on its own.
     </p>
    </TechCard>
   ) : (
    <TechCard className="overflow-hidden">
     <div className="divide-y divide-stone-100">
      {rows.map((e, i) => {
       const nav = isNavigation(e.kind);
       return (
        <div key={e.id ?? i} className="flex items-baseline gap-3 px-5 py-2.5">
         {/* Actions are what you're scanning for; navigation is the trail between them. */}
         <Circle size={7} className={cn("mt-1.5 shrink-0", nav ? "text-stone-200" : "fill-current text-[var(--accent-ink,#0b7a5c)]")} />
         <div className="min-w-0 flex-1">
          <p className={cn("text-[13.5px]", nav ? "text-stone-500" : "font-medium text-stone-900")}>
           {describeActivity(e)}
           {e.times > 1 && <span className="ml-1.5 text-[12px] text-stone-400">×{e.times}</span>}
          </p>
          {!store && (e.storeSlug || e.email) && (
           <p className="mt-0.5 text-[11.5px] text-stone-400">{e.storeSlug || e.email}</p>
          )}
         </div>
         <span className="shrink-0 whitespace-nowrap text-[11.5px] tabular-nums text-stone-400">{ago(e.at)}</span>
        </div>
       );
      })}
     </div>
     <p className="border-t border-stone-100 px-5 py-3 text-[11.5px] leading-relaxed text-stone-400">
      Newest first, up to 300. Repeated visits to the same screen are collapsed with a count, so what
      someone actually <em>did</em> isn&rsquo;t buried under where they clicked.
     </p>
    </TechCard>
   )}
  </AdminPage>
 );
}
