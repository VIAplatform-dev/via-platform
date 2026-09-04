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
  "Card holds lapse after about 7 days, but your longest rental is longer than that — a deposit on those won't be there to claim. Use a damage waiver, or shorten the maximum.",
 "deposit-without-amount": "You've chosen a deposit but haven't set an amount.",
 "pickup-with-prepaid-label": "You're not shipping, so a prepaid return label won't be used.",
 "late-fee-without-late-fees": "Late fees are off, so the daily amount is ignored.",
};

const PRESETS: { name: string; blurb: string; values: Partial<RentalSettings> }[] = [
 {
  name: "Direct to consumer",
  blurb: "Anyone books online. Ships out cleaned, comes back on your label.",
  values: { bookingMode: "open", minDays: 4, maxDays: 28, leadDays: 2, shipOutDays: 1, shipBackDays: 2, turnaroundDays: 2, dryCleaning: true, prepaidLabel: true, fulfilment: "ship", lateFees: true, security: "waiver", appointments: false },
 },
 {
  name: "Stylists only",
  blurb: "Every rental is an application you approve. Trade rates, no deposits.",
  values: { bookingMode: "request", requestHoldsDates: true, requestHoldHours: 48, minDays: 1, maxDays: 14, leadDays: 1, security: "none", lateFees: true, fulfilment: "both", appointments: true },
 },
 {
  name: "Showroom pickup",
  blurb: "Collected and returned in person. No shipping, no cleaning gap.",
  values: { bookingMode: "both", minDays: 1, maxDays: 7, leadDays: 0, shipOutDays: 0, shipBackDays: 0, turnaroundDays: 1, dryCleaning: false, prepaidLabel: false, fulfilment: "pickup", appointments: true },
 },
];

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

 return (
  <>
   <AdminHeader
    eyebrow="Settings"
    title="Rentals"
    subtitle="Rent pieces out instead of selling them once. Every rule below is yours."
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
         ? "Pieces you've given rental terms show a booking calendar on your storefront."
         : "Turn this on, then set rental terms on the pieces you want to rent. Nothing rents until a piece has its own prices."}
       </p>
      </div>
     </div>
     <Toggle on={s.enabled} onClick={() => set("enabled", !s.enabled)} />
    </TechCard>

    {warnings.length > 0 && (
     <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
      <p className="flex items-center gap-2 text-[12.5px] font-semibold text-amber-900">
       <AlertTriangle size={14} /> Worth a look
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
       {warnings.map((w) => (
        <li key={w} className="text-[12.5px] leading-relaxed text-amber-900/90">{WARNING_TEXT[w] ?? w}</li>
       ))}
      </ul>
     </div>
    )}

    <Card title="Start from" blurb="Fills everything in below. Change any of it afterwards.">
     <div className="grid gap-2.5 sm:grid-cols-3">
      {PRESETS.map((p) => (
       <button
        key={p.name}
        type="button"
        onClick={() => apply(p.values)}
        className="rounded-xl border border-stone-200 bg-white p-3.5 text-left transition hover:border-stone-300 hover:bg-stone-50"
       >
        <span className="block text-[13.5px] font-medium text-stone-900">{p.name}</span>
        <span className="mt-1 block text-[12px] leading-relaxed text-stone-500">{p.blurb}</span>
       </button>
      ))}
     </div>
    </Card>

    <Card title="Who can book" blurb="Some stores rent to anyone. Others only to stylists and studios they've spoken to.">
     <Row label="Booking" hint="“By request” means every rental is an application you approve or decline.">
      <span className="flex gap-1.5">
       <Tag on={s.bookingMode === "open"} onClick={() => set("bookingMode", "open")}>Anyone</Tag>
       <Tag on={s.bookingMode === "request"} onClick={() => set("bookingMode", "request")}>By request</Tag>
       <Tag on={s.bookingMode === "both"} onClick={() => set("bookingMode", "both")}>Per piece</Tag>
      </span>
     </Row>
     {s.bookingMode !== "open" && (
      <>
       <Row label="Hold the dates while you decide" hint="On: nobody else can book those dates while the application sits with you. Off: the dates stay open, and someone may take them before you answer.">
        <Toggle on={s.requestHoldsDates} onClick={() => set("requestHoldsDates", !s.requestHoldsDates)} />
       </Row>
       {s.requestHoldsDates && (
        <Row label="Release the hold after" hint="So one unanswered enquiry can't sit on a piece indefinitely.">
         <Num value={s.requestHoldHours} onChange={(v) => set("requestHoldHours", Math.max(1, Math.round(Number(v) || 0)))} suffix="hours" />
        </Row>
       )}
      </>
     )}
    </Card>

    <Card title="How long, how far ahead">
     <Row label="Shortest rental"><Num value={s.minDays} onChange={(v) => set("minDays", Math.max(1, Math.round(Number(v) || 0)))} suffix="days" /></Row>
     <Row label="Longest rental"><Num value={s.maxDays} onChange={(v) => set("maxDays", Math.max(1, Math.round(Number(v) || 0)))} suffix="days" /></Row>
     <Row label="Notice needed" hint="How soon a rental can start. Zero allows same-day.">
      <Num value={s.leadDays} onChange={(v) => set("leadDays", Math.max(0, Math.round(Number(v) || 0)))} suffix="days" />
     </Row>
     <Row label="Book up to" hint="How far ahead the calendar opens.">
      <Num value={s.horizonDays} onChange={(v) => set("horizonDays", Math.max(1, Math.round(Number(v) || 0)))} suffix="days ahead" />
     </Row>
    </Card>

    <Card title="Turnaround" blurb="The days around a rental when the piece is yours but unsellable. These are your own measurements — set them to zero if they don't apply.">
     <Row label="Getting it there"><Num value={s.shipOutDays} onChange={(v) => set("shipOutDays", Math.max(0, Math.round(Number(v) || 0)))} suffix="days" /></Row>
     <Row label="Getting it back"><Num value={s.shipBackDays} onChange={(v) => set("shipBackDays", Math.max(0, Math.round(Number(v) || 0)))} suffix="days" /></Row>
     <Row label="Cleaning and checking" hint="After it's back, before it can go out again.">
      <Num value={s.turnaroundDays} onChange={(v) => set("turnaroundDays", Math.max(0, Math.round(Number(v) || 0)))} suffix="days" />
     </Row>
     <div className="mt-3 rounded-xl bg-stone-50 px-4 py-3 text-[12.5px] leading-relaxed text-stone-600">
      A <b className="font-semibold text-stone-900">{sample}-day</b> rental keeps the piece off your floor for{" "}
      <b className="font-semibold text-stone-900">{offFloor} days</b>
      {offFloor > sample ? ` — ${offFloor - sample} of them unpaid.` : "."}
     </div>
    </Card>

    <Card title="Handling">
     <Row
      label="How customers get the piece"
      hint={
       s.fulfilment === "ship" ? "You post it out and they post it back."
       : s.fulfilment === "pickup" ? "They collect from you in person and bring it back. Nothing is posted."
       : "Customers choose at checkout — delivery, or collect from you in person."
      }
     >
      <span className="flex gap-1.5">
       <Tag on={s.fulfilment === "ship"} onClick={() => set("fulfilment", "ship")}>Deliver</Tag>
       <Tag on={s.fulfilment === "pickup"} onClick={() => set("fulfilment", "pickup")}>Local pickup</Tag>
       <Tag on={s.fulfilment === "both"} onClick={() => set("fulfilment", "both")}>Both</Tag>
      </span>
     </Row>
     <Row
      label="Promise it arrives dry-cleaned"
      hint={
       s.dryCleaning
        ? "Your listings tell customers the piece arrives cleaned and ready to wear. Only a claim on the page — it doesn't change your turnaround days above."
        : "Your listings say nothing about cleaning."
      }
     >
      <Toggle on={s.dryCleaning} onClick={() => set("dryCleaning", !s.dryCleaning)} />
     </Row>
     <Row
      label="Put a prepaid return label in the box"
      hint={
       s.prepaidLabel
        ? "You buy the return postage and enclose the label. The return tracks itself, so the piece is marked back automatically."
        : "The renter arranges and pays for the return, and you mark each one back by hand when it arrives."
      }
     >
      <Toggle on={s.prepaidLabel} onClick={() => set("prepaidLabel", !s.prepaidLabel)} />
     </Row>
     <Row label="Appointments" hint="Try-ons, collections and drop-offs now live on their own — a shop that only sells still takes appointments.">
      <a href="/admin/settings/appointments" className="text-[13px] font-medium text-stone-900 underline underline-offset-2">Open settings</a>
     </Row>
    </Card>

    <Card title="If something goes wrong">
     <Row label="Cover">
      <span className="flex gap-1.5">
       <Tag on={s.security === "waiver"} onClick={() => set("security", "waiver")}>Damage waiver</Tag>
       <Tag on={s.security === "deposit"} onClick={() => set("security", "deposit")}>Deposit</Tag>
       <Tag on={s.security === "none"} onClick={() => set("security", "none")}>Neither</Tag>
      </span>
     </Row>
     {s.security === "waiver" && (
      <Row label="Waiver" hint="A non-refundable percentage added at checkout. Nothing is held on the card.">
       <Num value={s.waiverPct} onChange={(v) => set("waiverPct", Math.min(100, Math.max(0, Math.round(Number(v) || 0))))} suffix="%" width="w-16" />
      </Row>
     )}
     {s.security === "deposit" && (
      <Row label="Deposit held" hint="Held on the card and released when the piece comes back.">
       <Num value={money(s.depositCents)} onChange={(v) => set("depositCents", cents(v))} suffix="$" width="w-24" />
      </Row>
     )}
     <Row label="Charge for late returns">
      <Toggle on={s.lateFees} onClick={() => set("lateFees", !s.lateFees)} />
     </Row>
     {s.lateFees && (
      <Row label="Late fee" hint="Per day past the return date.">
       <Num value={money(s.lateFeeCentsPerDay)} onChange={(v) => set("lateFeeCentsPerDay", cents(v))} suffix="$ / day" width="w-24" />
      </Row>
     )}
    </Card>

    <Card title="On the listing">
     <Row label="Show what the piece is worth" hint={s.showMarketValue ? "Listings show “Market value $995” above the rental price. The saving is often the pitch." : "Only the rental price is shown."}>
      <Toggle on={s.showMarketValue} onClick={() => set("showMarketValue", !s.showMarketValue)} />
     </Row>
    </Card>

    <Card title="How it reads on your storefront" blurb="Your words, not ours. Blank falls back to the defaults shown.">
     <Row label="Rent button" hint="What the button says once dates are picked.">
      <input value={s.rentLabel} onChange={(e) => set("rentLabel", e.target.value)} placeholder="Rent now"
       className="w-44 rounded-lg border border-stone-200 px-3 py-1.5 text-[13.5px] outline-none focus:border-stone-400" />
     </Row>
     {s.fulfilment !== "pickup" && (
      <Row label="Delivery option" hint="Shown when customers choose how to get the piece.">
       <input value={s.deliverLabel} onChange={(e) => set("deliverLabel", e.target.value)} placeholder="Deliver"
        className="w-44 rounded-lg border border-stone-200 px-3 py-1.5 text-[13.5px] outline-none focus:border-stone-400" />
      </Row>
     )}
     {s.fulfilment !== "ship" && (
      <Row label="Pickup option" hint="Name the place if it helps — “NYC Pickup”, “Collect in Hackney”.">
       <input value={s.pickupLabel} onChange={(e) => set("pickupLabel", e.target.value)} placeholder="Local pickup"
        className="w-44 rounded-lg border border-stone-200 px-3 py-1.5 text-[13.5px] outline-none focus:border-stone-400" />
      </Row>
     )}
     <Row label="Size guide link" hint="Adds a “Will this fit?” link beside the size range. Leave blank to hide it.">
      <input value={s.fitGuideUrl ?? ""} onChange={(e) => set("fitGuideUrl", e.target.value || null)} placeholder="https://…"
       className="w-64 rounded-lg border border-stone-200 px-3 py-1.5 text-[13.5px] outline-none focus:border-stone-400" />
     </Row>
     <div className="border-t border-stone-100 pt-3.5">
      <p className="text-[13.5px] font-medium text-stone-900">The line under the button</p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-stone-500">
       Left blank, it writes itself from your settings above. Fill it in to say it your own way.
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

    <Card title="Your rental agreement" blurb="Shown at checkout and ticked before anyone can pay.">
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
