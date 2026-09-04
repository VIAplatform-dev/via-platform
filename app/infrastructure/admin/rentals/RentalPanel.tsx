"use client";

import { useEffect, useState } from "react";
import { CalendarRange, Plus, X } from "lucide-react";
import { TechButton, Toggle, SectionLabel, cn } from "../ui";

// Renting one piece.
//
// Lives inside the listing editor and saves itself, separately from the listing. That's deliberate:
// rental terms are a different decision from price and description, a seller changes them on their
// own schedule, and a half-finished rental setup must never block saving the listing.
//
// A piece is rentable when terms exist for it. Switching this off deletes them, which is also what
// takes the booking calendar off the storefront.
//
// Two modes, because a seller shouldn't have to publish a piece before deciding to rent it. With an
// itemId it saves itself. Without one — on the Add listing screen, where the piece doesn't exist yet
// — it holds the terms and hands them up, and the parent writes them the moment the item has an id.

type Tier = { days: number; cents: number };
type Terms = {
 itemId: string; tiers: Tier[]; replacementCents: number | null;
 fitsSizes: string | null; alsoForSale: boolean;
};
type Settings = { enabled: boolean; minDays: number; maxDays: number; showMarketValue: boolean; bookingMode: string };

function withStore(path: string): string {
 if (typeof window === "undefined") return path;
 const s = new URLSearchParams(window.location.search).get("store");
 return s ? `${path}${path.includes("?") ? "&" : "?"}store=${encodeURIComponent(s)}` : path;
}

const dollars = (cents: number | null | undefined) => (cents == null ? "" : String(Math.round(cents) / 100));
const toCents = (v: string) => {
 const n = Number(v);
 return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};

/** What a store starts from when it first rents a piece: a short, a week, a month. */
const STARTER: Tier[] = [{ days: 4, cents: 0 }, { days: 7, cents: 0 }, { days: 28, cents: 0 }];

export type TermsDraft = { tiers: Tier[]; replacementCents: number | null; fitsSizes: string | null; alsoForSale: boolean };

export default function RentalPanel({ itemId, priceCents, onDraftChange }: {
 /** Omitted while the listing is still being created — the panel then reports upward instead of saving. */
 itemId?: string;
 priceCents?: number | null;
 onDraftChange?: (draft: TermsDraft | null) => void;
}) {
 const deferred = !itemId;
 const [settings, setSettings] = useState<Settings | null>(null);
 const [on, setOn] = useState(false);
 const [tiers, setTiers] = useState<Tier[]>(STARTER);
 const [fits, setFits] = useState("");
 const [market, setMarket] = useState("");
 const [alsoForSale, setAlsoForSale] = useState(true);
 const [busy, setBusy] = useState(false);
 const [saved, setSaved] = useState(false);
 const [err, setErr] = useState<string | null>(null);

 useEffect(() => {
  let active = true;
  (async () => {
   const d = await fetch(withStore(itemId ? `/api/store/rentals/terms/${itemId}` : "/api/store/rentals/settings"))
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
   if (!active) return;
   setSettings(d?.settings ?? null);
   const t: Terms | null = d?.terms ?? null;
   if (t) {
    setOn(true);
    setTiers(t.tiers?.length ? t.tiers : STARTER);
    setFits(t.fitsSizes ?? "");
    setMarket(dollars(t.replacementCents));
    setAlsoForSale(t.alsoForSale !== false);
   } else if (priceCents) {
    // Nothing set yet — seed the market value from what the piece sells for.
    setMarket(dollars(priceCents));
   }
  })();
  return () => { active = false; };
 }, [itemId, priceCents]);

 const dirty = () => { setSaved(false); setErr(null); };

 // In deferred mode the parent owns persistence, so it needs the current answer at all times —
 // including "not renting this", which is a real answer and not the same as having said nothing.
 useEffect(() => {
  if (!onDraftChange) return;
  const priced = tiers.filter((t) => t.days > 0 && t.cents > 0).sort((a, b) => a.days - b.days);
  onDraftChange(
   on && priced.length
    ? { tiers: priced, replacementCents: market.trim() ? toCents(market) : null, fitsSizes: fits.trim() || null, alsoForSale }
    : null,
  );
 }, [on, tiers, market, fits, alsoForSale, onDraftChange]);
 const setTier = (i: number, patch: Partial<Tier>) => {
  dirty();
  setTiers((t) => t.map((x, n) => (n === i ? { ...x, ...patch } : x)));
 };

 async function save() {
  setBusy(true); setErr(null); setSaved(false);
  const priced = tiers.filter((t) => t.days > 0 && t.cents > 0).sort((a, b) => a.days - b.days);
  if (!priced.length) { setBusy(false); setErr("Give at least one length a price."); return; }
  const r = await fetch(withStore(`/api/store/rentals/terms/${itemId}`), {
   method: "PUT", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({
    tiers: priced,
    replacementCents: market.trim() ? toCents(market) : null,
    fitsSizes: fits.trim() || null,
    alsoForSale,
   }),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(false);
  if (!r?.ok) { setErr(r?.d?.error || "Couldn't save the rental terms."); return; }
  setTiers(r.d.terms?.tiers ?? priced);
  setSaved(true);
 }

 async function turnOff() {
  if (deferred) { setOn(false); return; }
  setBusy(true); setErr(null);
  const r = await fetch(withStore(`/api/store/rentals/terms/${itemId}`), { method: "DELETE" }).catch(() => null);
  setBusy(false);
  if (!r?.ok) { setErr("Couldn't turn renting off for this piece."); return; }
  setOn(false); setSaved(false);
 }

 // Rentals off for the whole store — say so once, rather than offering a switch that does nothing.
 if (settings && !settings.enabled) {
  return (
   <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
    <p className="flex items-center gap-2 text-[12.5px] text-stone-600">
     <CalendarRange size={14} className="shrink-0 text-stone-400" />
     Renting is off for your store.{" "}
     <a href={withStore("/admin/settings/rentals")} className="font-medium text-stone-900 underline underline-offset-2">Turn it on in Settings</a>
     {" "}to rent pieces out.
    </p>
   </div>
  );
 }

 return (
  <div className="mt-5 rounded-xl border border-stone-200 p-4">
   <div className="flex items-start justify-between gap-6">
    <div className="min-w-0">
     <SectionLabel className="mb-0">Renting</SectionLabel>
     <p className="mt-1 max-w-[52ch] text-[12px] leading-relaxed text-stone-500">
      {on
       ? "Customers can book this piece for a set of dates. It stays yours."
       : "Rent this piece out instead of selling it once. You keep it and rent it again."}
     </p>
    </div>
    <Toggle
     on={on}
     onClick={() => { if (on) { void turnOff(); } else { dirty(); setOn(true); } }}
    />
   </div>

   {on && (
    <div className="mt-4 flex flex-col gap-4 border-t border-stone-100 pt-4">
     <div>
      <label className="mb-1.5 block text-[12px] font-medium text-stone-500">
       What it costs to rent
       {settings && <span className="font-normal text-stone-400"> — your store allows {settings.minDays}–{settings.maxDays} days</span>}
      </label>
      <div className="flex flex-col gap-2">
       {tiers.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
         <input
          inputMode="numeric"
          value={t.days || ""}
          onChange={(e) => setTier(i, { days: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
          className="w-16 rounded-lg border border-stone-200 px-2.5 py-2 text-right text-[13px] tabular-nums outline-none focus:border-stone-400"
         />
         <span className="text-[12.5px] text-stone-500">days</span>
         <span className="ml-2 text-[13px] text-stone-400">$</span>
         <input
          inputMode="decimal"
          value={t.cents ? dollars(t.cents) : ""}
          onChange={(e) => setTier(i, { cents: toCents(e.target.value) })}
          placeholder="0"
          className="w-24 rounded-lg border border-stone-200 px-2.5 py-2 text-right text-[13px] tabular-nums outline-none focus:border-stone-400"
         />
         {tiers.length > 1 && (
          <button
           type="button"
           aria-label="Remove this length"
           onClick={() => { dirty(); setTiers((x) => x.filter((_, n) => n !== i)); }}
           className="grid h-7 w-7 place-items-center rounded-full text-stone-400 hover:bg-stone-100"
          ><X size={14} /></button>
         )}
        </div>
       ))}
      </div>
      <button
       type="button"
       onClick={() => { dirty(); setTiers((x) => [...x, { days: 0, cents: 0 }]); }}
       className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-stone-600 hover:text-stone-900"
      ><Plus size={13} /> Add another length</button>
      <p className="mt-2 text-[11.5px] leading-relaxed text-stone-400">
       A customer pays the cheapest length that covers their dates — five days pays your seven-day price. Longer than your longest length can&rsquo;t be booked.
      </p>
     </div>

     <div className="grid gap-3 sm:grid-cols-2">
      <div>
       <label className="mb-1.5 block text-[12px] font-medium text-stone-500">Fits sizes <span className="font-normal text-stone-400">— shown on the listing</span></label>
       <input
        value={fits}
        onChange={(e) => { dirty(); setFits(e.target.value); }}
        placeholder="2 to 6"
        className="w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none focus:border-stone-400"
       />
      </div>
      <div>
       <label className="mb-1.5 block text-[12px] font-medium text-stone-500">
        Market value
        <span className="font-normal text-stone-400">
         {settings?.showMarketValue ? " — shown beside the rental price" : " — hidden on listings"}
        </span>
       </label>
       <div className="flex items-center gap-1.5">
        <span className="text-[13px] text-stone-400">$</span>
        <input
         inputMode="decimal"
         value={market}
         onChange={(e) => { dirty(); setMarket(e.target.value); }}
         placeholder="995"
         className="w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px] tabular-nums outline-none focus:border-stone-400"
        />
       </div>
      </div>
     </div>

     <div className="flex items-start justify-between gap-6 rounded-lg bg-stone-50 px-3.5 py-3">
      <div className="min-w-0">
       <p className="text-[13px] font-medium text-stone-900">Can also be bought outright</p>
       <p className="mt-0.5 max-w-[48ch] text-[11.5px] leading-relaxed text-stone-500">
        {alsoForSale
         ? "The listing shows Rent and Buy. Once someone has a booking, buying is blocked so the piece can't be sold out from under them."
         : "Rental only. The Buy button is hidden on this piece."}
       </p>
      </div>
      <Toggle on={alsoForSale} onClick={() => { dirty(); setAlsoForSale(!alsoForSale); }} />
     </div>

     {err && <p className="text-[12.5px] text-rose-600" role="alert">{err}</p>}

     {deferred ? (
      <p className="text-[11.5px] leading-relaxed text-stone-400">
       Saved with the listing.
      </p>
     ) : (
      <div className="flex items-center justify-end gap-3">
       {saved && <span className="text-[12px] text-emerald-700">Rental terms saved</span>}
       <TechButton variant="ghost" onClick={() => { void turnOff(); }} disabled={busy}>Don&rsquo;t rent this</TechButton>
       <TechButton onClick={save} disabled={busy} className={cn(busy && "opacity-70")}>
        {busy ? "Saving…" : "Save rental terms"}
       </TechButton>
      </div>
     )}
    </div>
   )}
  </div>
 );
}
