"use client";

import { useEffect, useRef, useState } from "react";
import { Truck, Globe, Check, Plug, FileText, Lock, ArrowRight, Clock } from "lucide-react";
import { AdminHeader, TechCard, TechButton, StatusPill, Toggle, cn } from "../../ui";
import { withStore } from "@/app/infrastructure/admin/market/ui";
import { currencySymbol } from "@/app/lib/formatPrice";
import { billsTheStore } from "@/app/lib/store-card";
import { barredDestinations } from "@/app/lib/shipping-embargo";
import { describeZoneCoverage } from "@/app/lib/ships-to-core";

// Shipping: who pays for postage, and who pays customs duty.
//
// They read like the same question and behave completely differently. Postage is known the second
// the label is bought, so VYA buys it and settles up immediately. Duty is invoiced by the courier
// weeks later, in an amount nobody knew at purchase, so VYA won't carry it for a store, and
// "duties covered" is only offered once the store's own courier account is connected and the
// courier is billing THEM. That rule is enforced server-side (resolveDutyMode); this page's job is
// to make it legible rather than mysterious.

type DutyMode = "absorbed" | "collected" | "buyer_pays";
type ShipMode = "buyer_pays" | "store_pays" | "free_over";

type State = {
 /** The store's currency. Every price on this page is in it. A London store never sees a "$". */
 currency: string;
 mode: ShipMode;
 freeThresholdUsd: number | null;
 dutyMode: DutyMode;
 effectiveDutyMode: DutyMode;
 dutyDowngraded: boolean;
 carrierConnected: boolean;
 /** Whether VYA holds a card it can bill. The two "you absorb it" modes need one. */
 canAbsorb: boolean;
 zones: ZoneConfig;
 /** Working days before a parcel goes out. Null = she has not said. */
 dispatchDays: number | null;
 /** Her country. A zone's membership depends on it: domestic wins, so a US store's North America is Canada and Mexico. */
 homeCountry: string | null;
};

type ZoneId = "domestic" | "europe" | "north_america" | "rest_of_world";
type ZoneRate = { enabled: boolean; rates?: Record<string, number> };
type ZoneConfig = Partial<Record<ZoneId, ZoneRate>>;

// No blurbs. What each zone covers is worked out from the store's own country and printed as
// country names (describeZoneCoverage), because a hand-written line cannot keep up: "United States,
// Canada, Mexico" was wrong for every US store on the page it appeared on.
const ZONES: { id: ZoneId; label: string }[] = [
 { id: "domestic", label: "Your own country" },
 { id: "europe", label: "Europe" },
 { id: "north_america", label: "North America" },
 { id: "rest_of_world", label: "Rest of world" },
];

type CarrierDef = { type: string; label: string; ddp: boolean; fields: { key: string; label: string; hint?: string }[] };

const SHIP_MODES: { key: ShipMode; label: string; blurb: string }[] = [
 { key: "buyer_pays", label: "Buyer pays", blurb: "Postage is added at checkout. Their payment covers the label." },
 { key: "store_pays", label: "You pay: free for the buyer", blurb: "No postage at checkout. The label goes on your card when you print it." },
 { key: "free_over", label: "Free over an amount", blurb: "They pay postage on small orders. Spend more and you cover it." },
];

const DUTY_MODES: { key: DutyMode; label: string; blurb: string; needsCarrier: boolean }[] = [
 { key: "buyer_pays", label: "Buyer pays on delivery", blurb: "The courier bills them before handing the parcel over. Nothing to set up, but say so on your storefront, or it's a surprise at the door.", needsCarrier: false },
 { key: "absorbed", label: "You pay, priced in", blurb: "They see one number and are never billed again. You've added duty to your prices; the courier bills you.", needsCarrier: true },
 { key: "collected", label: "You pay, shown at checkout", blurb: "Duty is its own line at checkout. Same cost to them, just not hidden.", needsCarrier: true },
];

export default function ShippingSettingsPage() {
 const [s, setS] = useState<State | null>(null);
 const [carriers, setCarriers] = useState<CarrierDef[]>([]);
 const [shipConfigured, setShipConfigured] = useState(true);
 const [threshold, setThreshold] = useState("");
 const [busy, setBusy] = useState(false);
 const [msg, setMsg] = useState<string | null>(null);
 const [err, setErr] = useState<string | null>(null);

 // Which zone has its country list open. One at a time: Europe alone is thirty-nine names.
 const [openZone, setOpenZone] = useState<ZoneId | null>(null);
 const [connecting, setConnecting] = useState(false);
 const courierRef = useRef<HTMLDivElement>(null);
 const [carrierType, setCarrierType] = useState("");
 const [creds, setCreds] = useState<Record<string, string>>({});

 useEffect(() => {
  let active = true;
  (async () => {
   const [ship, carrier] = await Promise.all([
    fetch("/api/store/shipping").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("/api/store/shipping/carrier").then((r) => (r.ok ? r.json() : null)).catch(() => null),
   ]);
   if (!active) return;
   if (ship) {
    setS({
     currency: ship.currency || "USD",
     mode: ship.mode, freeThresholdUsd: ship.freeThresholdUsd,
     dutyMode: ship.dutyMode, effectiveDutyMode: ship.effectiveDutyMode,
     dutyDowngraded: Boolean(ship.dutyDowngraded), carrierConnected: Boolean(ship.carrierConnected),
     canAbsorb: Boolean(ship.canAbsorb),
     zones: (ship.zones || {}) as ZoneConfig,
     dispatchDays: typeof ship.dispatchDays === "number" ? ship.dispatchDays : null,
     homeCountry: ship.shipFrom?.country ?? null,
    });
    setThreshold(ship.freeThresholdUsd != null ? String(ship.freeThresholdUsd) : "");
   }
   if (carrier) { setCarriers(carrier.carriers || []); setShipConfigured(Boolean(carrier.configured)); }
  })();
  return () => { active = false; };
 }, []);

 /**
  * Open the courier card and put it in front of her.
  *
  * The duty options said "connect your courier account below", which was true and useless: below
  * was four cards down a page she had to know to scroll. This opens the connect form and brings it
  * onto the screen, so the sentence that explains the lock is also the thing that lifts it.
  */
 function openCourier() {
  setConnecting(true);
  // After the state lands, so the form it scrolls to is the one that just appeared.
  requestAnimationFrame(() => courierRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
 }

 async function save(next: Partial<State>) {
  if (!s) return;
  const merged = { ...s, ...next };
  setS(merged); setBusy(true); setErr(null); setMsg(null);
  const r = await fetch("/api/store/shipping", {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({
    mode: merged.mode,
    freeThresholdUsd: threshold === "" ? null : Number(threshold),
    dutyMode: merged.dutyMode,
    zones: merged.zones,
    dispatchDays: merged.dispatchDays,
   }),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(false);
  if (!r || !r.ok) { setErr(r?.d?.error || "Couldn’t save that."); return; }
  setS({ ...merged, effectiveDutyMode: r.d.effectiveDutyMode ?? merged.dutyMode, dutyDowngraded: Boolean(r.d.dutyDowngraded) });
  setMsg("Saved.");
 }

 async function connect() {
  setBusy(true); setErr(null); setMsg(null);
  const r = await fetch("/api/store/shipping/carrier", {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ type: carrierType, credentials: creds }),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(false);
  if (!r || !r.ok) { setErr(r?.d?.error || "Couldn’t connect that account."); return; }
  setConnecting(false); setCreds({}); setCarrierType("");
  if (s) setS({ ...s, carrierConnected: true, effectiveDutyMode: s.dutyMode, dutyDowngraded: false });
  setMsg("Courier account connected.");
 }

 async function disconnect() {
  setBusy(true); setErr(null);
  await fetch("/api/store/shipping/carrier", { method: "DELETE" }).catch(() => null);
  setBusy(false);
  if (s) setS({ ...s, carrierConnected: false, effectiveDutyMode: "buyer_pays", dutyDowngraded: s.dutyMode !== "buyer_pays" });
  setMsg("Disconnected. You're back on VYA's rates.");
 }

 const chosen = carriers.find((c) => c.type === carrierType);

 // One parcel-size price box. The table (tablet and up) and the stacked cards (phone) both draw it,
 // so the two can never disagree about what a keystroke does.

 return (
  <>
   <AdminHeader eyebrow="Settings" title="Shipping & duties" subtitle="Who pays for postage, and who pays customs on orders going abroad." />

   {err && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700" role="alert">{err}</div>}
   {msg && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">{msg}</div>}

   {!s ? (
    <TechCard className="px-5 py-8 text-center text-[13px] text-stone-400">Loading…</TechCard>
   ) : (
    <>
     {/* ── postage ────────────────────────────────────────────────── */}
     <TechCard className="mb-5 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
       <Truck size={15} className="text-stone-400" />
       <h2 className="text-[13px] font-semibold text-stone-800">Who pays for shipping</h2>
      </div>
      <div className="divide-y divide-stone-100">
       {SHIP_MODES.map((m) => {
        // Absorbing shipping bills the store. Without a card on file it is a promise to buyers that
        // cannot be kept, and the moment anyone finds out is when the first label won't print, so
        // the choice is closed here rather than explained later. Already on one of these with no
        // card? It stays selectable, so a card that lapsed doesn't lock her out of her own setting.
        const needsCard = billsTheStore(m.key) && !s.canAbsorb && s.mode !== m.key;
        return (
        // THE REASON IS NOT GREYED OUT WITH THE OPTION. It used to be: `opacity-60` wrapped the
        // whole row, so the sentence explaining the lock and the link that undoes it were dimmed
        // along with the thing they explained, and the whole block read as "switched off, no
        // explanation". Only the label and blurb dim now. The way out is at full contrast, with a
        // Locked chip so it is obvious at a glance that this is a condition and not a dead option.
        <label key={m.key} className={cn("flex items-start gap-3 px-5 py-3.5", needsCard ? "cursor-not-allowed" : "cursor-pointer hover:bg-stone-50/60")}>
         <input type="radio" name="shipmode" checked={s.mode === m.key} onChange={() => save({ mode: m.key })} disabled={busy || needsCard} className="mt-1" />
         <span className="min-w-0">
          <span className={cn("block text-[13.5px] font-medium text-stone-800", needsCard && "opacity-55")}>
           {m.label}
           {needsCard && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-[10.5px] font-semibold uppercase tracking-[0.08em] text-amber-800 opacity-100">
             <Lock size={9} /> Locked
            </span>
           )}
          </span>
          <span className={cn("block text-[12px] leading-relaxed text-stone-500", needsCard && "opacity-55")}>{m.blurb}</span>
          {needsCard && (
           <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="text-[12px] leading-relaxed text-stone-600">
             You need a card on file. The label is charged to it the moment you print it.
            </span>
            {/* ?add=card, not the bare page: Billing opens on plan tiers, and "Add a card" landing on
                a price list is what made this feel like the wrong place. The flag scrolls the card
                row into view and rings it. */}
            <a
             href="/admin/settings/plan?add=card"
             onClick={(e) => e.stopPropagation()}
             className="inline-flex items-center gap-1 rounded-md bg-stone-900 px-2.5 py-1 text-[12px] font-medium text-white transition hover:bg-stone-700"
            >
             Add a card <ArrowRight size={12} />
            </a>
           </span>
          )}
          {m.key === "free_over" && s.mode === "free_over" && (
           <span className="mt-2 flex items-center gap-2">
            <span className="text-[12px] text-stone-500">Free at {currencySymbol(s.currency)}</span>
            <input
             value={threshold}
             onChange={(e) => setThreshold(e.target.value.replace(/[^\d.]/g, ""))}
             onBlur={() => save({})}
             inputMode="decimal"
             className="w-24 rounded-md border border-stone-300 px-2 py-1 text-[13px] outline-none focus:border-stone-500"
            />
            <span className="text-[12px] text-stone-500">and above</span>
           </span>
          )}
         </span>
        </label>
        );
       })}
      </div>
      <p className="border-t border-stone-100 px-5 py-3 text-[11.5px] leading-relaxed text-stone-400">
       When you pay the postage, the label goes on your card the moment you print it. It never comes out
       of your payout.{" "}
       <a href="/admin/settings/plan?add=card" className="underline underline-offset-2 hover:text-stone-600">
        Add a card under Billing
       </a>{" "}if you haven’t.
      </p>
     </TechCard>

     {/* ── where she ships ────────────────────────────────────────── */}
     <TechCard className="mb-5 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
       <Globe size={15} className="text-stone-400" />
       <h2 className="text-[13px] font-semibold text-stone-800">Where you ship</h2>
      </div>
      <div className="divide-y divide-stone-100">
       {ZONES.map((z) => {
        const cfg = s.zones[z.id] || { enabled: z.id === "domestic" };
        const locked = z.id === "domestic";
        return (
         <div key={z.id} className="px-5 py-3.5">
          <label className={cn("flex items-start gap-3", locked ? "cursor-default" : "cursor-pointer")}>
           <input
            type="checkbox"
            checked={Boolean(cfg.enabled) || locked}
            disabled={busy || locked}
            onChange={(e) => save({ zones: { ...s.zones, [z.id]: { ...cfg, enabled: e.target.checked } } })}
            className="mt-1"
           />
           <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium text-stone-800">{z.label}</span>
            {/* WHAT IS ACTUALLY IN IT. The blurbs said "the EEA and its near neighbours" and
                "everywhere else we can reach", neither of which settles whether a customer in
                Israel, Switzerland or Serbia is covered. North America's said "United States,
                Canada, Mexico" on a page where, for a US store, the United States is a different
                zone. Computed from the store's own country now (ships-to-core.ts). */}
            <span className="block text-[12px] leading-relaxed text-stone-500">
             {describeZoneCoverage(z.id, s.homeCountry).summary}
            </span>
           </span>
          </label>

          {/* Europe is thirty-nine countries and nobody can hold that in their head. */}
          {(describeZoneCoverage(z.id, s.homeCountry).count ?? 0) > 3 && (
           <div className="mt-1.5 pl-[27px]">
            <button
             type="button"
             onClick={() => setOpenZone(openZone === z.id ? null : z.id)}
             aria-expanded={openZone === z.id}
             className="text-[11.5px] text-stone-400 underline underline-offset-2 hover:text-stone-700"
            >
             {openZone === z.id ? "Hide the list" : "See all of them"}
            </button>
            {openZone === z.id && (
             <p className="mt-1.5 text-[11.5px] leading-relaxed text-stone-500">
              {describeZoneCoverage(z.id, s.homeCountry).names.join(", ")}.
             </p>
            )}
           </div>
          )}
         </div>
        );
       })}
      </div>
      <p className="border-t border-stone-100 px-5 py-3 text-[11.5px] leading-relaxed text-stone-400">
       Leaving a region off doesn’t make it free. It means you don’t post there. Shoppers in that region
       are told so, instead of buying something you can’t send.
      </p>

      {/* NAMED, NOT ALLUDED TO. This said "a few destinations are never available", which answers
          nothing: a seller reading it wants to know WHICH, and her alternative is finding out from
          a customer who couldn't check out. The list is built from the same sets the checkout
          enforces (shipping-embargo.ts), so it cannot drift from what actually happens. */}
      <div className="border-t border-stone-100 px-5 py-3.5">
       <p className="text-[12px] leading-relaxed text-stone-500">
        <span className="font-medium text-stone-700">Some places are never available</span>, whichever
        regions you tick. Not your call or ours:
       </p>
       <div className="mt-2 flex flex-col gap-1.5">
        {barredDestinations().map((group) => (
         <div key={group.reason} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[11px] uppercase tracking-[0.08em] text-stone-400">{group.label}</span>
          <span className="text-[12px] text-stone-600">{group.places.map((p) => p.name).join(", ")}</span>
         </div>
        ))}
       </div>
       <p className="mt-2 text-[11.5px] leading-relaxed text-stone-400">
        Shoppers there are told why at checkout, and that it isn’t your shop’s doing.
       </p>
      </div>
     </TechCard>
     {/* ── how fast she posts ──────────────────────────────────────────
         
         THE ONE THING NO OTHER SETTING CAN ANSWER. A carrier quotes transit time, not how long a
         parcel sits on her table first, so "2 to 5 days" tells a buyer nothing until she knows
         whether it goes tomorrow or on Saturday. It is also the first line of her shipping policy,
         which is why it lives here rather than being typed twice. */}
     <TechCard className="mb-5 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
       <Clock size={15} className="text-stone-400" />
       <h2 className="text-[13px] font-semibold text-stone-800">How fast you post</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2.5 px-5 py-4">
       <span className="text-[13px] text-stone-700">Orders go out within</span>
       <input
        value={s.dispatchDays ?? ""}
        onChange={(e) => {
         const v = e.target.value.replace(/[^\d]/g, "").slice(0, 2);
         setS({ ...s, dispatchDays: v === "" ? null : Number(v) });
        }}
        onBlur={() => save({})}
        inputMode="numeric"
        placeholder="2"
        aria-label="Working days before a parcel goes out"
        className="w-16 rounded-md border border-stone-300 px-2 py-1.5 text-center text-[13px] tabular-nums outline-none focus:border-stone-500"
       />
       <span className="text-[13px] text-stone-700">working days.</span>
       <span className="ml-1 text-[11.5px] text-stone-400">
        {s.dispatchDays ? "Shown to buyers and used in your shipping policy." : "Leave blank and we won’t promise a time on your behalf."}
       </span>
      </div>
     </TechCard>

     {/* ── postage prices ─────────────────────────────────────────────
         
         NOT HERS TO SET, AND THE PAGE NO LONGER PRETENDS OTHERWISE.
         
         This was a grid of price boxes per region and parcel size, plus a switch between VYA
         pricing the postage and the store pricing it. The switch never made sense: VYA buys every
         label and the buyer's postage goes to VYA in the application fee (see cart-intent), so a
         seller typing her own numbers was setting VYA's revenue and VYA's loss on a cost she never
         pays. It was a decision offered to the wrong party, and forty boxes of it.
         
         What IS hers is above: where she ships, and whether she absorbs postage for her buyers.
         Both of those are about her shop. What a parcel costs to send is not.
         
         The per-zone fallback table still exists in shipping-prices-core.ts, and still matters: it
         is what a quote falls back to when the carrier cannot be reached. It just isn't a form. */}
     <TechCard className="mb-5 overflow-hidden" data-testid="tier-prices">
      <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
       <Truck size={15} className="text-stone-400" />
       <h2 className="text-[13px] font-semibold text-stone-800">What buyers pay for postage</h2>
      </div>
      <div className="px-5 py-4">
       <p className="text-[12.5px] leading-relaxed text-stone-600">
        <span className="font-medium text-stone-800">VYA works this out and buys the label.</span>{" "}
        Your buyer puts in their address at checkout, sees one postage price for it, and pays it
        there. It never comes out of your payout, and there is nothing to set up.
       </p>
       <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5">
        <p className="text-[12.5px] leading-relaxed text-stone-700">
         <span className="font-medium text-stone-900">Measure your pieces.</span> The quote and the
         label are both built from the size and weight on the piece. If the parcel is bigger than
         that, the carrier re-rates it after it has shipped and the correction is charged back to
         you. That is the only part of postage that is.
        </p>
       </div>
      </div>
     </TechCard>

     {/* ── duty ───────────────────────────────────────────────────── */}
     <TechCard className="mb-5 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
       <Globe size={15} className="text-stone-400" />
       <h2 className="text-[13px] font-semibold text-stone-800">Customs duty on international orders</h2>
       {s.carrierConnected && <StatusPill tone="live">Own courier</StatusPill>}
      </div>

      {s.dutyDowngraded && (
       <div className="border-b border-amber-200 bg-amber-50 px-5 py-3">
        <p className="text-[12.5px] leading-relaxed text-amber-900">
         <b>Your buyers are still being billed for duty.</b> Covering it yourself needs your own courier
         account, until then VYA ships duty-unpaid, whatever is selected here. Don’t promise “duties
         covered” on your storefront yet.
        </p>
       </div>
      )}

      <div className="divide-y divide-stone-100">
       {DUTY_MODES.map((m) => {
        const locked = m.needsCarrier && !s.carrierConnected;
        return (
         // Same rule as the postage modes above: the option dims, the reason does not. "Connect
         // your courier account below" is also a button now rather than a direction, because
         // "below" was four cards down a scrolling page.
         <label key={m.key} className={cn("flex items-start gap-3 px-5 py-3.5", locked ? "cursor-not-allowed" : "cursor-pointer hover:bg-stone-50/60")}>
          <input type="radio" name="dutymode" checked={s.dutyMode === m.key} onChange={() => !locked && save({ dutyMode: m.key })} disabled={busy || locked} className="mt-1" />
          <span className="min-w-0">
           <span className={cn("block text-[13.5px] font-medium text-stone-800", locked && "opacity-55")}>
            {m.label}
            {locked && (
             <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-[10.5px] font-semibold uppercase tracking-[0.08em] text-amber-800">
              <Lock size={9} /> Locked
             </span>
            )}
           </span>
           <span className={cn("block text-[12px] leading-relaxed text-stone-500", locked && "opacity-55")}>{m.blurb}</span>
           {/* WHY IT WON'T CLICK, in the place you find out it won't.
               
               This was a four-word grey aside beside the label, "needs your own courier account",
               which reads as a note about the option rather than the reason it is refusing you. The
               answer to "why can't I pick this" belongs under the option, in a sentence, next to the
               thing that fixes it. */}
           {locked && (
            <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
             <span className="text-[12px] leading-relaxed text-stone-600">
              This needs your own courier account. VYA can’t cover duty on your behalf.
             </span>
             <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); openCourier(); }}
              className="inline-flex items-center gap-1 rounded-md bg-stone-900 px-2.5 py-1 text-[12px] font-medium text-white transition hover:bg-stone-700"
             >
              Connect an account <ArrowRight size={12} />
             </button>
            </span>
           )}
          </span>
         </label>
        );
       })}
      </div>

      <p className="border-t border-stone-100 px-5 py-3 text-[11.5px] leading-relaxed text-stone-400">
       Duty isn’t like postage. The courier invoices it weeks after the parcel goes, once customs has
       worked out what it owes, on a $760 dress it can be $190. VYA won’t carry that for you, so covering
       duty is only available once the courier is billing you directly.
      </p>
     </TechCard>

     {/* ── carrier account ────────────────────────────────────────── */}
     <TechCard className="overflow-hidden" ref={courierRef}>
      <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
       <Plug size={15} className="text-stone-400" />
       <h2 className="text-[13px] font-semibold text-stone-800">Your courier account</h2>
      </div>

      {!shipConfigured ? (
       <p className="px-5 py-6 text-[13px] text-stone-400">Shipping isn’t switched on for VYA yet.</p>
      ) : s.carrierConnected ? (
       <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <Check size={15} className="text-emerald-600" />
        <p className="min-w-0 flex-1 text-[13px] text-stone-700">
         Connected. You ship on your own rates, and you can cover duty for your buyers.
        </p>
        <button onClick={disconnect} disabled={busy} className="text-[12px] text-stone-400 hover:text-rose-600">Disconnect</button>
       </div>
      ) : !connecting ? (
       <div className="px-5 py-4">
        <p className="mb-3 text-[13px] leading-relaxed text-stone-600">
         Connect a DHL, FedEx or UPS account and you ship on your own negotiated rates, and you can cover
         customs duty for your buyers instead of leaving them a bill at the door.
        </p>
        <TechButton onClick={() => setConnecting(true)}>Connect an account</TechButton>
       </div>
      ) : (
       <div className="px-5 py-4">
        <label className="mb-3 block">
         <span className="mb-1 block text-[12px] text-stone-500">Courier</span>
         <select
          value={carrierType}
          onChange={(e) => { setCarrierType(e.target.value); setCreds({}); }}
          className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-stone-500"
         >
          <option value="">Choose…</option>
          {carriers.map((c) => <option key={c.type} value={c.type}>{c.label}</option>)}
         </select>
        </label>

        {chosen?.fields.map((f) => (
         <label key={f.key} className="mb-3 block">
          <span className="mb-1 block text-[12px] text-stone-500">{f.label}</span>
          <input
           value={creds[f.key] ?? ""}
           onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))}
           placeholder={f.hint}
           className="w-full rounded-md border border-stone-300 px-2.5 py-2 text-[13px] outline-none focus:border-stone-500"
          />
         </label>
        ))}

        <div className="mt-4 flex flex-wrap items-center gap-2">
         <TechButton onClick={connect} disabled={busy || !carrierType}>{busy ? "Connecting…" : "Connect"}</TechButton>
         <button onClick={() => { setConnecting(false); setCreds({}); setCarrierType(""); }} className="text-[12px] text-stone-400 hover:text-stone-700">Cancel</button>
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-stone-400">
         These go straight to our shipping provider and are never stored by VYA. Postage and duty are
         billed by the courier to you, not through us.
        </p>
       </div>
      )}
     </TechCard>

     {/* ── what the storefront says ───────────────────────────────── */}
     <ProductNotesCard />
    </>
   )}
  </>
 );
}

/**
 * Whether her product pages carry "Ships to … · Shipping from $X · All sales final".
 *
 * IT WAS NEVER A CHOICE. Saving a ship-from address here, which a store does so labels can be
 * bought: also published a postage quote on every piece on its own website. "From $8" is the
 * DOMESTIC rate: the buyer three states away pays more, and the shop had promised a floor it never
 * agreed to say. So it starts off for everyone, including the stores that had it, and comes back
 * only when the seller turns it on having read what it will say.
 *
 * Its own fetch and its own POST, like Saved pieces: the form above posts its whole self on save,
 * and a switch folded into it would be flipped back by a save that never mentioned it.
 */
function ProductNotesCard() {
 const [on, setOn] = useState<boolean | null>(null);
 const [handle, setHandle] = useState("");
 const [saved, setSaved] = useState(false);
 const [error, setError] = useState<string | null>(null);

 useEffect(() => {
  let active = true;
  fetch(withStore("/api/store/storefront"))
   .then((r) => (r.ok ? r.json() : null))
   .then((d) => {
    if (!active) return;
    setOn(Boolean(d?.settings?.productNotesEnabled));
    setHandle(String(d?.settings?.handle || ""));
   })
   .catch(() => active && setOn(false));
  return () => { active = false; };
 }, []);

 async function set(next: boolean) {
  const was = on;
  setOn(next);
  setError(null);
  const r = await fetch(withStore("/api/store/storefront"), {
   method: "POST",
   headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ handle, productNotesEnabled: next }),
  }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (r?.settings) {
   setOn(Boolean(r.settings.productNotesEnabled));
   setSaved(true);
   setTimeout(() => setSaved(false), 1500);
  } else {
   setOn(was ?? false);
   setError("Couldn’t save that. Try again.");
  }
 }

 if (on === null) return null;

 return (
  <TechCard className="mt-5 overflow-hidden">
   <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
    <FileText size={15} className="text-stone-400" />
    <h2 className="text-[13px] font-semibold text-stone-800">Shipping &amp; returns on your product pages</h2>
    {saved && <StatusPill tone="live" dot>Saved</StatusPill>}
   </div>

   <div className="px-5 py-4">
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
     <div className="min-w-0 max-w-[58ch]">
      <p className="text-[13.5px] font-medium text-stone-900">
       {on ? "Your pieces show where you ship and what returns you take" : "Your pieces say nothing about shipping"}
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-stone-500">
       {on
        ? "A short line under each piece: where you ship, a price to start from, and your returns policy in one sentence."
        : "Off. Shoppers see postage at checkout, once they’ve told you where they are, which is the only point it can be exact."}
      </p>
     </div>
     <div className="shrink-0">
      <Toggle on={on} onClick={() => void set(!on)} />
     </div>
    </div>

    {on && (
     <p className="mt-4 rounded-lg bg-stone-50 px-3.5 py-3 text-[12px] leading-relaxed text-stone-600">
      The price shown is your <strong className="font-medium">home-country</strong> rate for that
      parcel, written as “from”. A buyer further out pays more, and checkout works it out properly.
      Pieces you haven’t weighed or measured show where you ship but no price. We won’t put a
      number on a parcel nobody has been near.
     </p>
    )}

    {error && <p className="mt-3 text-[12.5px] text-rose-600">{error}</p>}
   </div>
  </TechCard>
 );
}
