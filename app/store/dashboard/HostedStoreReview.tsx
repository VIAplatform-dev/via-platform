"use client";

import { useCallback, useEffect, useState } from "react";

type Finding = { tier: "blocking" | "degrading" | "cosmetic"; page?: string; message: string };
type Screen = { page: string; ours: string; source: string };
type Health = { verdict: "pass" | "warn" | "fail" | "unknown"; findings: Finding[]; screens: Screen[]; checkedAt: string };
type Review = { id: string; page: string; answer: "looks_right" | "something_off" | "skip"; note: string | null; createdAt: string };

const TIER_LABEL = { blocking: "Needs fixing", degrading: "Worth fixing", cosmetic: "Minor" } as const;
const TIER_STYLE = {
 blocking: "bg-[#5D0F17] text-[#FFFDF8]",
 degrading: "bg-[#5D0F17]/10 text-[#5D0F17]",
 cosmetic: "border border-[#5D0F17]/15 text-[#5D0F17]/60",
} as const;
const pageName = (p: string) => (p === "/" ? "Home page" : p.startsWith("/collections/") ? "A collection page" : p.startsWith("/products/") ? "A product page" : p);

export default function HostedStoreReview({ previewStore }: { previewStore: string | null }) {
 const withStore = useCallback(
  (path: string) => (previewStore ? `${path}${path.includes("?") ? "&" : "?"}store=${encodeURIComponent(previewStore)}` : path),
  [previewStore],
 );
 const [health, setHealth] = useState<Health | null | undefined>(undefined);
 const [reviews, setReviews] = useState<Review[]>([]);
 const [notes, setNotes] = useState<Record<string, string>>({});
 const [busy, setBusy] = useState<string | null>(null);
 const [error, setError] = useState<string | null>(null);

 useEffect(() => {
  let alive = true;
  fetch(withStore("/api/store/hosted-review"))
   .then((r) => r.json())
   .then((j) => { if (!alive) return; setHealth(j.health ?? null); setReviews(j.reviews ?? []); })
   .catch(() => alive && setHealth(null));
  return () => { alive = false; };
 }, [withStore]);

 const answer = async (page: string, a: Review["answer"]) => {
  setBusy(page); setError(null);
  const res = await fetch(withStore("/api/store/hosted-review"), {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ page, answer: a, note: notes[page] ?? "" }),
  });
  const j = await res.json().catch(() => ({}));
  setBusy(null);
  if (!res.ok) { setError(j.error ?? "Could not save"); return; }
  setReviews(j.reviews ?? []);
 };

 if (health === undefined) return <p className="text-sm text-[#5D0F17]/60">Loading…</p>;
 if (!health) return <p className="text-sm text-[#5D0F17]/70">Your hosted copy hasn’t been checked yet. We’ll show a side-by-side here once it has.</p>;

 const latest = new Map<string, Review>();
 for (const r of [...reviews].reverse()) latest.set(r.page, r);
 const blocking = health.findings.filter((f) => f.tier === "blocking");

 return (
  <div className="space-y-10">
   <section className="space-y-3">
    <p className="text-sm text-[#5D0F17]/70">
     Checked {new Date(health.checkedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.{" "}
     {blocking.length === 0
      ? "Nothing is stopping your hosted copy from selling correctly."
      : `${blocking.length} thing${blocking.length === 1 ? "" : "s"} need${blocking.length === 1 ? "s" : ""} fixing before your hosted copy can sell correctly.`}
    </p>
    {health.findings.length > 0 && (
     <ul className="space-y-2">
      {health.findings.map((f, i) => (
       <li key={i} className="flex items-start gap-3 text-sm text-[#5D0F17]">
        <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${TIER_STYLE[f.tier]}`}>{TIER_LABEL[f.tier]}</span>
        <span>{f.page && <span className="text-[#5D0F17]/50">{pageName(f.page)} · </span>}{f.message}</span>
       </li>
      ))}
     </ul>
    )}
   </section>

   {health.screens.length > 0 && (
    <section className="space-y-8">
     <div>
      <h2 className="font-serif text-xl text-[#5D0F17]">Does it look right?</h2>
      <p className="text-sm text-[#5D0F17]/60">Your site on the left, our hosted copy on the right. You know what your store should look like — tell us if something is off.</p>
     </div>
     {health.screens.map((s) => {
      const done = latest.get(s.page);
      return (
       <div key={s.page} className="space-y-3">
        <h3 className="text-sm font-medium text-[#5D0F17]">{pageName(s.page)} <span className="font-normal text-[#5D0F17]/50">{s.page}</span></h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
         {[["Your site", s.source], ["Hosted copy", s.ours]].map(([label, src]) => (
          <figure key={label} className="overflow-hidden rounded-lg border border-[#5D0F17]/15 bg-white">
           {/* eslint-disable-next-line @next/next/no-img-element */}
           <img src={src} alt={`${label}: ${s.page}`} className="block h-auto w-full" loading="lazy" />
           <figcaption className="px-3 py-2 text-xs text-[#5D0F17]/60">{label}</figcaption>
          </figure>
         ))}
        </div>
        {done ? (
         <p className="text-sm text-[#5D0F17]/70">
          {done.answer === "looks_right" ? "You said this looks right." : done.answer === "skip" ? "Skipped." : `You said something’s off: “${done.note}”`}{" "}
          <button className="underline" onClick={() => { const n = new Map(latest); n.delete(s.page); setReviews((rs) => rs.filter((r) => r.page !== s.page)); }}>Change</button>
         </p>
        ) : (
         <div className="space-y-2">
          <textarea
           className="w-full rounded-md border border-[#5D0F17]/15 px-3 py-2 text-sm"
           rows={2}
           placeholder="If something’s off, what is it? (e.g. the banner photo is missing)"
           value={notes[s.page] ?? ""}
           onChange={(e) => setNotes((n) => ({ ...n, [s.page]: e.target.value }))}
          />
          <div className="flex flex-wrap gap-2">
           <button disabled={busy === s.page} onClick={() => answer(s.page, "looks_right")} className="rounded-full bg-[#5D0F17] px-4 py-1.5 text-sm text-[#FFFDF8] disabled:opacity-50">Looks right</button>
           <button disabled={busy === s.page} onClick={() => answer(s.page, "something_off")} className="rounded-full border border-[#5D0F17] px-4 py-1.5 text-sm text-[#5D0F17] disabled:opacity-50">Something’s off</button>
           <button disabled={busy === s.page} onClick={() => answer(s.page, "skip")} className="px-3 py-1.5 text-sm text-[#5D0F17]/60 disabled:opacity-50">Skip</button>
          </div>
         </div>
        )}
       </div>
      );
     })}
     {error && <p className="text-sm text-[#5D0F17]">{error}</p>}
    </section>
   )}
  </div>
 );
}
