"use client";

import { useEffect, useState } from "react";
import { CalendarRange, Check, AlertTriangle } from "lucide-react";
import { AdminHeader, TechCard, TechButton, StatusPill, Toggle, Tag, cn } from "../../ui";
import type { RentalSettings } from "@/app/lib/rentals/settings-core";

// Renting, on the store's terms.
//
// Nothing about how a rental works is decided by us. A bridal archive renting one gown a month and
// a stylist showroom pulling forty pieces a week both have to fit, so every number here is the
// store's — and every one has a default, so a shop that opens this page and saves gets a sensible
// rental business without reading a word.
//
// Presets exist because thirteen switches is a lot to face cold. They write the whole block; nothing
// is locked afterwards.

type Warning =
 | "deposit-outlives-authorisation" | "pickup-with-prepaid-label"
 | "late-fee-without-late-fees" | "deposit-without-amount";

const WARNING_TEXT: Record<Warning, string> = {
 "deposit-outlives-authorisation":
  "A hold on a card only lasts about 7 days, and your longest rental is longer than that. On those rentals the deposit will have expired before the piece is due back. Use a waiver fee instead, or shorten your longest rental.",
 "deposit-without-amount": "You've chosen a deposit but haven't set an amount.",
 "pickup-with-prepaid-label": "You don't post pieces out, so a prepaid return label won't be used.",
 "late-fee-without-late-fees": "Late fees are turned off, so this amount isn't charged.",
};

const PRESETS: { name: string; blurb: string; values: Partial<RentalSettings> }[] = [
 {
  name: "Direct to consumer",
  blurb: "Anyone can book online. You post it out, they post it back.",
  values: { bookingMode: "open", minDays: 4, maxDays: 28, leadDays: 2, shipOutDays: 1, shipBackDays: 2, turnaroundDays: 2, dryCleaning: true, prepaidLabel: true, fulfilment: "ship", lateFees: true, security: "waiver", appointments: false },
 },
 {
  name: "Stylists only",
  blurb: "You approve every booking. No deposits taken.",
  values: { bookingMode: "request", requestHoldsDates: true, requestHoldHours: 48, minDays: 1, maxDays: 14, leadDays: 1, security: "none", lateFees: true, fulfilment: "both", appointments: true },
 },
 {
  name: "Showroom pickup",
  blurb: "They collect and return in person. Nothing is posted.",
  values: { bookingMode: "both", minDays: 1, maxDays: 7, leadDays: 0, shipOutDays: 0, shipBackDays: 0, turnaroundDays: 1, dryCleaning: false, prepaidLabel: false, fulfilment: "pickup", appointments: true },
 },
];

/**
 * Which preset the current settings match, if any.
 *
 * Derived, never remembered. A preset that stayed lit because it was clicked would keep claiming to
 * describe settings that had since been changed — and a store whose setup is a mix of two would see
 * one of them highlighted, which is worse than seeing neither. Comparing the values means the
 * highlight is always true, and "your own mix" is a real answer rather than a missing one.
 */
function matchingPreset(s: RentalSettings): string | null {
 for (const p of PRESETS) {
  const keys = Object.keys(p.values) as (keyof RentalSettings)[];
  if (keys.every((k) => s[k] === p.values[k])) return p.name;
 }
 return null;
}

const money = (cents: number | null | undefined) => (cents == null ? "" : String(Math.round(cents) / 100));
const cents = (dollars: string) => {
 const n = Number(dollars);
 return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};

/** One setting: what it is on the left, the control on the right. */
function Row({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
 return (
  <div className={cn("flex items-start justify-between gap-6 border-t border-stone-100 py-3.5 first:border-t-0 first:pt-0", className)}>
   <div className="min-w-0">
    <p className="text-[13.5px] font-medium text-stone-900">{label}</p>
    {hint && <p className="mt-0.5 max-w-[46ch] text-[12.5px] leading-relaxed text-stone-500">{hint}</p>}
   </div>
   <div className="flex shrink-0 items-center gap-2">{children}</div>
  </div>
 );
}

function Num({ value, onChange, suffix, width = "w-20" }: { value: number | string; onChange: (v: string) => void; suffix?: string; width?: string }) {
 return (
  <span className="flex items-center gap-1.5">
   <input
    inputMode="decimal"
    value={String(value)}
    onChange={(e) => onChange(e.target.value)}
    className={cn(width, "rounded-lg border border-stone-200 px-2.5 py-1.5 text-right text-[13.5px] tabular-nums outline-none focus:border-stone-400")}
   />
   {suffix && <span className="text-[12.5px] text-stone-500">{suffix}</span>}
  </span>
 );
}

function Card({ title, blurb, children }: { title: string; blurb?: string; children: React.ReactNode }) {
 return (
  <TechCard className="p-5">
   <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">{title}</p>
   {blurb && <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-stone-500">{blurb}</p>}
   <div className="mt-4">{children}</div>
  </TechCard>
 );
}

export default function RentalSettingsPage() {
 const [s, setS] = useState<RentalSettings | null>(null);
 const [warnings, setWarnings] = useState<Warning[]>([]);
 const [busy, setBusy] = useState(false);
 const [saved, setSaved] = useState(false);
 const [err, setErr] = useState<string | null>(null);

 useEffect(() => {
  let active = true;
  (async () => {
   const d = await fetch("/api/store/rentals/settings").then((r) => (r.ok ? r.json() : null)).catch(() => null);
   if (!active) return;
   if (d?.settings) { setS(d.settings); setWarnings(d.warnings ?? []); }
   else setErr("Couldn't load your rental settings.");
  })();
  return () => { active = false; };
 }, []);

 const set = <K extends keyof RentalSettings>(k: K, v: RentalSettings[K]) => {
  setSaved(false);
  setS((cur) => (cur ? { ...cur, [k]: v } : cur));
 };
 const apply = (values: Partial<RentalSettings>) => { setSaved(false); setS((cur) => (cur ? { ...cur, ...values } : cur)); };

 async function save() {
  if (!s) return;
  setBusy(true); setErr(null); setSaved(false);
  const r = await fetch("/api/store/rentals/settings", {
   method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(false);
  if (!r?.ok) { setErr(r?.d?.error || "Couldn't save that."); return; }
  setS(r.d.settings); setWarnings(r.d.warnings ?? []); setSaved(true);
 }

 if (!s) {
  return (
   <>
    <AdminHeader eyebrow="Settings" title="Rentals" subtitle="Rent pieces out instead of selling them once." />
    {err ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700" role="alert">{err}</div>
         : <p className="text-[13px] text-stone-400">Loading…</p>}
   </>
  );
 }

 // A rental takes the piece off the floor for longer than it bills for. Shown live, because this
 // is the number that quietly decides how much of the calendar is actually sellable.
 const sample = Math.max(s.minDays, 1);
 const offFloor = sample + s.shipOutDays + s.shipBackDays + s.turnaroundDays;
 const matched = matchingPreset(s);

 return (
  <>
   <AdminHeader
    eyebrow="Settings"
    title="Rentals"
    subtitle="Rent pieces out instead of selling them once. These settings apply to every rental, unless you change them on a single piece."
    actions={
     <div className="flex items-center gap-3">
      {saved && <StatusPill tone="live" dot>Saved</StatusPill>}
      <TechButton onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</TechButton>
     </div>
    }
   />

   {err && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700" role="alert">{err}</div>}

   <div className="flex flex-col gap-4">
    <TechCard className="flex items-center justify-between gap-6 p-5">
     <div className="flex min-w-0 items-start gap-3.5">
      <CalendarRange size={20} className="mt-0.5 shrink-0 text-stone-400" />
      <div className="min-w-0">
       <p className="text-[14px] font-medium text-stone-900">{s.enabled ? "Rentals are on" : "Rentals are off"}</p>
       <p className="mt-0.5 max-w-[58ch] text-[12.5px] leading-relaxed text-stone-500">
        {s.enabled
         ? "Pieces with rental prices show a booking calendar on your storefront."
         : "Turn this on, then add rental prices to the pieces you want to rent. Nothing can be rented until a piece has its own prices."}
       </p>
      </div>
     </div>
     <Toggle on={s.enabled} onClick={() => set("enabled", !s.enabled)} />
    </TechCard>

    {warnings.length > 0 && (
     <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
      <p className="flex items-center gap-2 text-[12.5px] font-semibold text-amber-900">
       <AlertTriangle size={14} /> Check these
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
       {warnings.map((w) => (
        <li key={w} className="text-[12.5px] leading-relaxed text-amber-900/90">{WARNING_TEXT[w] ?? w}</li>
       ))}
      </ul>
     </div>
    )}

    <Card
     title="Common setups"
     blurb={matched
      ? "Your settings match this setup. Change anything below and this will update on its own."
      : "Your settings are a mix, which is fine. Pick one of these to replace them all."}
    >
     <div className="grid gap-2.5 sm:grid-cols-3">
      {PRESETS.map((p) => {
       const on = matched === p.name;
       return (
        <button
         key={p.name}
         type="button"
         onClick={() => apply(p.values)}
         aria-pressed={on}
         className={cn(
          "rounded-xl border p-3.5 text-left transition",
          on
           ? "border-stone-900 bg-stone-900/[0.03] ring-1 ring-stone-900"
           : "border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50",
         )}
        >
         <span className="flex items-center justify-between gap-2">
          <span className="text-[13.5px] font-medium text-stone-900">{p.name}</span>
          {on && <Check size={14} className="shrink-0 text-stone-900" />}
         </span>
         <span className="mt-1 block text-[12px] leading-relaxed text-stone-500">{p.blurb}</span>
        </button>
       );
      })}
     </div>
    </Card>

    <Card title="Who can book" blurb="Whether anyone can book straight away, or you approve each booking first.">
     <Row label="Bookings" hint="“You approve each one” means every booking comes to you as a request to accept or decline.">
      <span className="flex gap-1.5">
       <Tag on={s.bookingMode === "open"} onClick={() => set("bookingMode", "open")}>Anyone</Tag>
       <Tag on={s.bookingMode === "request"} onClick={() => set("bookingMode", "request")}>You approve each one</Tag>
       <Tag on={s.bookingMode === "both"} onClick={() => set("bookingMode", "both")}>Set per piece</Tag>
      </span>
     </Row>
     {s.bookingMode !== "open" && (
      <>
       <Row label="Hold the dates while you decide" hint="On: those dates are blocked while you decide. Off: someone else can book them before you answer.">
        <Toggle on={s.requestHoldsDates} onClick={() => set("requestHoldsDates", !s.requestHoldsDates)} />
       </Row>
       {s.requestHoldsDates && (
        <Row label="Open the dates back up after" hint="If you haven't answered by then, the dates go back on sale.">
         <Num value={s.requestHoldHours} onChange={(v) => set("requestHoldHours", Math.max(1, Math.round(Number(v) || 0)))} suffix="hours" />
        </Row>
       )}
      </>
     )}
    </Card>

    <Card title="Rental length and notice">
     <Row label="Shortest rental"><Num value={s.minDays} onChange={(v) => set("minDays", Math.max(1, Math.round(Number(v) || 0)))} suffix="days" /></Row>
     <Row label="Longest rental"><Num value={s.maxDays} onChange={(v) => set("maxDays", Math.max(1, Math.round(Number(v) || 0)))} suffix="days" /></Row>
     <Row label="Least notice before a rental starts" hint="0 means someone can book a piece for today.">
      <Num value={s.leadDays} onChange={(v) => set("leadDays", Math.max(0, Math.round(Number(v) || 0)))} suffix="days" />
     </Row>
     <Row label="How far ahead people can book" hint="Dates beyond this don't show on the calendar.">
      <Num value={s.horizonDays} onChange={(v) => set("horizonDays", Math.max(1, Math.round(Number(v) || 0)))} suffix="days ahead" />
     </Row>
    </Card>

    <Card
     title="Extra days to block off"
     blurb="A piece is unavailable for longer than the rental itself: it spends days in the post, and it needs cleaning before it can go out again. These days get blocked on your calendar so nothing else can book or buy it. Set any of them to 0 if they don't apply to you."
    >
     <Row label="Getting it to them" hint="Days in the post on the way out, or the day they collect it."><Num value={s.shipOutDays} onChange={(v) => set("shipOutDays", Math.max(0, Math.round(Number(v) || 0)))} suffix="days" /></Row>
     <Row label="Getting it back" hint="Days in the post on the way back, or the day they return it."><Num value={s.shipBackDays} onChange={(v) => set("shipBackDays", Math.max(0, Math.round(Number(v) || 0)))} suffix="days" /></Row>
     <Row label="Cleaning and checking" hint="Days after it's back before it can go out again.">
      <Num value={s.turnaroundDays} onChange={(v) => set("turnaroundDays", Math.max(0, Math.round(Number(v) || 0)))} suffix="days" />
     </Row>
     <div className="mt-3 rounded-xl bg-stone-50 px-4 py-3 text-[12.5px] leading-relaxed text-stone-600">
      So a <b className="font-semibold text-stone-900">{sample}-day</b> rental blocks{" "}
      <b className="font-semibold text-stone-900">{offFloor} days</b> on the calendar
      {offFloor > sample ? <> — the {sample} you're paid for, plus {offFloor - sample} you aren't.</> : "."}
      {s.prepaidLabel && (
       <>
        {" "}Once a return label is scanned, your rentals page uses the carrier&rsquo;s date instead of
        this estimate, so a piece already in the post isn&rsquo;t marked overdue.
       </>
      )}
     </div>
    </Card>

    <Card title="Delivery and returns">
     <Row
      label="How people get the piece"
      hint={
       s.fulfilment === "ship" ? "You post it out and they post it back. No collection option."
       : s.fulfilment === "pickup" ? "They collect it from you and bring it back. Nothing is posted."
       : "They choose at checkout: have it posted, or collect it from you."
      }
     >
      <span className="flex gap-1.5">
       <Tag on={s.fulfilment === "ship"} onClick={() => set("fulfilment", "ship")}>Deliver</Tag>
       <Tag on={s.fulfilment === "pickup"} onClick={() => set("fulfilment", "pickup")}>Local pickup</Tag>
       <Tag on={s.fulfilment === "both"} onClick={() => set("fulfilment", "both")}>Both</Tag>
      </span>
     </Row>
     <Row
      label="Say it arrives dry-cleaned"
      hint={
       s.dryCleaning
        ? "Your listings will say the piece arrives cleaned and ready to wear. This only changes what the page says. It doesn't change the cleaning days you set above."
        : "Your listings won't mention cleaning."
      }
     >
      <Toggle on={s.dryCleaning} onClick={() => set("dryCleaning", !s.dryCleaning)} />
     </Row>
     <Row
      label="Include a prepaid return label"
      hint={
       s.prepaidLabel
        ? "You pay for the return postage and put the label in the box. The return is tracked, so you can see where the piece is on your rentals page."
        : "The person renting arranges and pays for the return. You mark each piece back by hand when it arrives."
      }
     >
      <Toggle on={s.prepaidLabel} onClick={() => set("prepaidLabel", !s.prepaidLabel)} />
     </Row>
     <Row label="Appointments" hint="Try-ons, collections and drop-offs are set up on their own page.">
      <a href="/admin/settings/appointments" className="text-[13px] font-medium text-stone-900 underline underline-offset-2">Open appointment settings</a>
     </Row>
    </Card>

    <Card title="Damage and late returns">
     <Row label="If a piece comes back damaged" hint="What you charge, if anything, to cover it.">
      <span className="flex gap-1.5">
       <Tag on={s.security === "waiver"} onClick={() => set("security", "waiver")}>Waiver fee</Tag>
       <Tag on={s.security === "deposit"} onClick={() => set("security", "deposit")}>Deposit</Tag>
       <Tag on={s.security === "none"} onClick={() => set("security", "none")}>Nothing</Tag>
      </span>
     </Row>
     {s.security === "waiver" && (
      <Row label="Waiver fee" hint="A percentage added at checkout that they don't get back. Nothing is held on their card.">
       <Num value={s.waiverPct} onChange={(v) => set("waiverPct", Math.min(100, Math.max(0, Math.round(Number(v) || 0))))} suffix="%" width="w-16" />
      </Row>
     )}
     {s.security === "deposit" && (
      <Row label="Deposit" hint="Held on their card and released when the piece comes back.">
       <Num value={money(s.depositCents)} onChange={(v) => set("depositCents", cents(v))} suffix="$" width="w-24" />
      </Row>
     )}
     <Row label="Charge for late returns">
      <Toggle on={s.lateFees} onClick={() => set("lateFees", !s.lateFees)} />
     </Row>
     {s.lateFees && (
      <Row label="Late fee" hint="Charged for each day past the return date.">
       <Num value={money(s.lateFeeCentsPerDay)} onChange={(v) => set("lateFeeCentsPerDay", cents(v))} suffix="$ / day" width="w-24" />
      </Row>
     )}
    </Card>

    <Card title="What the listing shows">
     <Row label="Show the piece's normal price" hint={s.showMarketValue ? "Listings show “Market value $995” above the rental price, so people can see the difference." : "Listings show only the rental price."}>
      <Toggle on={s.showMarketValue} onClick={() => set("showMarketValue", !s.showMarketValue)} />
     </Row>
    </Card>

    <Card title="Wording on your storefront" blurb="Change any of these to your own words. Leave one blank to use the wording shown in the box.">
     <Row label="Rent button" hint="What the button says after dates are picked.">
      <input value={s.rentLabel} onChange={(e) => set("rentLabel", e.target.value)} placeholder="Rent now"
       className="w-44 rounded-lg border border-stone-200 px-3 py-1.5 text-[13.5px] outline-none focus:border-stone-400" />
     </Row>
     {s.fulfilment !== "pickup" && (
      <Row label="Delivery option" hint="The name of the delivery choice at checkout.">
       <input value={s.deliverLabel} onChange={(e) => set("deliverLabel", e.target.value)} placeholder="Deliver"
        className="w-44 rounded-lg border border-stone-200 px-3 py-1.5 text-[13.5px] outline-none focus:border-stone-400" />
      </Row>
     )}
     {s.fulfilment !== "ship" && (
      <Row label="Pickup option" hint="The name of the pickup choice at checkout. Name the place if it helps, like “NYC pickup”.">
       <input value={s.pickupLabel} onChange={(e) => set("pickupLabel", e.target.value)} placeholder="Local pickup"
        className="w-44 rounded-lg border border-stone-200 px-3 py-1.5 text-[13.5px] outline-none focus:border-stone-400" />
      </Row>
     )}
     <Row label="Size guide link" hint="Adds a “Will this fit?” link next to the sizes. Leave blank to hide it.">
      <input value={s.fitGuideUrl ?? ""} onChange={(e) => set("fitGuideUrl", e.target.value || null)} placeholder="https://…"
       className="w-64 rounded-lg border border-stone-200 px-3 py-1.5 text-[13.5px] outline-none focus:border-stone-400" />
     </Row>
     <div className="border-t border-stone-100 pt-3.5">
      <p className="text-[13.5px] font-medium text-stone-900">Text under the Rent button</p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-stone-500">
       Leave this blank and it&rsquo;s written from your settings above. Fill it in to say it your own way.
      </p>
      <textarea
       value={s.highlightsText ?? ""}
       onChange={(e) => set("highlightsText", e.target.value || null)}
       rows={2}
       placeholder="Arrives dry-cleaned, ready to wear. A prepaid return label is in the box. Late returns are $50 a day."
       className="mt-2 w-full rounded-xl border border-stone-200 p-3 text-[13px] leading-relaxed outline-none focus:border-stone-400"
      />
     </div>
    </Card>

    <Card title="Your rental agreement" blurb="Shown at checkout. People have to tick it before they can pay.">
     <textarea
      value={s.termsText ?? ""}
      onChange={(e) => set("termsText", e.target.value)}
      rows={7}
      placeholder="Pieces must be returned by the date shown. Do not attempt to clean or repair anything yourself. Late returns are charged daily…"
      className="w-full rounded-xl border border-stone-200 p-3.5 text-[13.5px] leading-relaxed outline-none focus:border-stone-400"
     />
    </Card>

    <div className="flex items-center justify-end gap-3 pb-2">
     {saved && <span className="flex items-center gap-1.5 text-[12.5px] text-emerald-700"><Check size={14} /> Saved</span>}
     <TechButton onClick={save} disabled={busy}>{busy ? "Saving…" : "Save rental settings"}</TechButton>
    </div>
   </div>
  </>
 );
}
