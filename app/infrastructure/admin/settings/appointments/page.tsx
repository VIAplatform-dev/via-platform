"use client";

import { useEffect, useState } from "react";
import { CalendarClock, AlertTriangle, Check } from "lucide-react";
import { AdminHeader, TechCard, TechButton, StatusPill, Toggle, Tag, cn } from "../../ui";
import type { AppointmentSettings } from "@/app/lib/appointments/settings-core";
import { bookingEmbed } from "@/app/lib/appointments/embed-core";

// A shop's diary, on its own.
//
// These rules used to live under Rentals, which meant a store that only sells had to switch on
// renting to open its diary. Appointments are their own thing: fittings, collections, sourcing
// chats, drop-offs.

type Warning = "no-hours" | "deposit-without-payments" | "external-link-hides-diary";
const WARNING_TEXT: Record<Warning, string> = {
 "no-hours": "You haven't set any opening hours, so there are no times for anyone to book.",
 "deposit-without-payments": "A deposit needs card payments switched on — finish Stripe setup in Payments, or set the deposit to zero.",
 "external-link-hides-diary": "You've set an external booking link, so your own opening hours below are ignored. Clear the link to use them.",
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const money = (c: number) => (c ? String(Math.round(c) / 100) : "");
const cents = (v: string) => {
 const n = Number(v);
 return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
 return (
  <div className="flex items-start justify-between gap-6 border-t border-stone-100 py-3.5 first:border-t-0 first:pt-0">
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
   <input inputMode="decimal" value={String(value)} onChange={(e) => onChange(e.target.value)}
    className={cn(width, "rounded-lg border border-stone-200 px-2.5 py-1.5 text-right text-[13.5px] tabular-nums outline-none focus:border-stone-400")} />
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

export default function AppointmentSettingsPage() {
 const [s, setS] = useState<AppointmentSettings | null>(null);
 const [warnings, setWarnings] = useState<Warning[]>([]);
 // Resolved server-side — a store's reply-to, or the address it overrode it with.
 const [notifyTo, setNotifyTo] = useState<string | null>(null);
 const [busy, setBusy] = useState(false);
 const [saved, setSaved] = useState(false);
 const [err, setErr] = useState<string | null>(null);

 useEffect(() => {
  let active = true;
  (async () => {
   const d = await fetch("/api/store/appointments/settings").then((r) => (r.ok ? r.json() : null)).catch(() => null);
   if (!active) return;
   if (d?.settings) { setS(d.settings); setWarnings(d.warnings ?? []); setNotifyTo(d.notifyTo ?? null); }
   else setErr("Couldn't load your appointment settings.");
  })();
  return () => { active = false; };
 }, []);

 const set = <K extends keyof AppointmentSettings>(k: K, v: AppointmentSettings[K]) => {
  setSaved(false);
  setS((cur) => (cur ? { ...cur, [k]: v } : cur));
 };

 async function save() {
  if (!s) return;
  setBusy(true); setErr(null); setSaved(false);
  const r = await fetch("/api/store/appointments/settings", {
   method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(false);
  if (!r?.ok) { setErr(r?.d?.error || "Couldn't save that."); return; }
  setS(r.d.settings); setWarnings(r.d.warnings ?? []); setNotifyTo(r.d.notifyTo ?? null); setSaved(true);
 }

 if (!s) {
  return (
   <>
    <AdminHeader eyebrow="Settings" title="Appointments" subtitle="Let people book a time with you." />
    {err ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700" role="alert">{err}</div>
         : <p className="text-[13px] text-stone-400">Loading…</p>}
   </>
  );
 }

 const external = Boolean(s.bookingUrl);
 // Only some providers can be framed; the toggle shouldn't promise what the link can't do.
 const embeddable = Boolean(bookingEmbed(s.bookingUrl));

 return (
  <>
   <AdminHeader
    eyebrow="Settings"
    title="Appointments"
    subtitle="Let people book a time with you for fittings, collections or sourcing chats. You set the hours. You don’t need to rent anything to use this."
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
      <CalendarClock size={20} className="mt-0.5 shrink-0 text-stone-400" />
      <div className="min-w-0">
       <p className="text-[14px] font-medium text-stone-900">{s.enabled ? "Taking appointments" : "Not taking appointments"}</p>
       <p className="mt-0.5 max-w-[58ch] text-[12.5px] leading-relaxed text-stone-500">
        {s.enabled
         ? "Add an Appointments section to any page of your storefront and people can book a time."
         : "Turn this on, then drop an Appointments section onto your storefront from the Layout panel."}
       </p>
      </div>
     </div>
     <Toggle on={s.enabled} onClick={() => set("enabled", !s.enabled)} />
    </TechCard>

    {warnings.length > 0 && (
     <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
      <p className="flex items-center gap-2 text-[12.5px] font-semibold text-amber-900"><AlertTriangle size={14} /> Worth a look</p>
      <ul className="mt-2 flex flex-col gap-1.5">
       {warnings.map((w) => <li key={w} className="text-[12.5px] leading-relaxed text-amber-900/90">{WARNING_TEXT[w] ?? w}</li>)}
      </ul>
     </div>
    )}

    <Card title="Already use Calendly?" blurb="Paste your link and we'll use that instead. Everything below is then ignored.">
     <Row label="Booking link" hint="Works with Calendly, Cal.com, Acuity, Google appointment schedules, or any booking page you already use.">
      <input
       value={s.bookingUrl ?? ""}
       onChange={(e) => {
        const url = e.target.value.trim() || null;
        setSaved(false);
        // Pasting a booking link IS the decision to take appointments. Leaving the master switch
        // off after that is a trap: the section quietly falls back to the built-in picker and
        // nothing says why.
        setS((cur) => (cur ? { ...cur, bookingUrl: url, enabled: url ? true : cur.enabled } : cur));
       }}
       placeholder="https://calendly.com/…"
       className="w-72 rounded-lg border border-stone-200 px-3 py-1.5 text-[13.5px] outline-none focus:border-stone-400"
      />
     </Row>
     {s.bookingUrl && !s.enabled && (
      <p className="mt-3 rounded-xl bg-stone-50 px-4 py-3 text-[12.5px] text-stone-600">
       Appointments are off, so this link isn&rsquo;t live yet — turn them on above.
      </p>
     )}
     {s.bookingUrl && (
      <Row
       label="Show your opening hours on the page"
       hint={embeddable
        ? "Your real calendar appears in the section, so nobody has to leave your site to pick a time."
        : "We can show Calendly, Cal.com, Google appointment schedules and Acuity in the page. This link isn't one of those, so it stays a button."}
      >
       <Toggle on={s.embedBooking && embeddable} onClick={() => embeddable && set("embedBooking", !s.embedBooking)} />
      </Row>
     )}
    </Card>

    <div className={cn("flex flex-col gap-4 transition", external && "pointer-events-none opacity-40")}>
     <Card title="When people can come in" blurb="Days you leave closed simply don't appear.">
      <div className="flex flex-col gap-1">
       {DAYS.map((name, dow) => {
        const win = s.openingHours.find((h) => h.day === dow);
        return (
         <div key={dow} className="flex items-center gap-3 border-t border-stone-100 py-2.5 first:border-t-0 first:pt-0">
          <span className="w-24 shrink-0 text-[13.5px] text-stone-800">{name}</span>
          <Toggle
           on={Boolean(win)}
           onClick={() => set("openingHours", win
            ? s.openingHours.filter((h) => h.day !== dow)
            : [...s.openingHours, { day: dow, start: "11:00", end: "18:00" }].sort((a, b) => a.day - b.day))}
          />
          {win ? (
           <span className="flex items-center gap-2">
            {(["start", "end"] as const).map((edge) => (
             <input key={edge} type="time" value={win[edge]}
              onChange={(e) => set("openingHours", s.openingHours.map((h) => (h.day === dow ? { ...h, [edge]: e.target.value } : h)))}
              className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[13px] tabular-nums outline-none focus:border-stone-400" />
            ))}
           </span>
          ) : <span className="text-[12.5px] text-stone-400">Closed</span>}
         </div>
        );
       })}
      </div>
     </Card>

     <Card title="How long each appointment is">
      <Row label="How long is an appointment" hint="Each appointment lasts this long, and the last one has to finish before you close.">
       <Num value={s.slotMinutes} onChange={(v) => set("slotMinutes", Math.max(5, Math.round(Number(v) || 0)))} suffix="minutes" />
      </Row>
      <Row label="How many at once" hint="How many people can book the same time. Two fitting rooms means two.">
       <Num value={s.slotCapacity} onChange={(v) => set("slotCapacity", Math.max(1, Math.round(Number(v) || 0)))} suffix="at a time" width="w-16" />
      </Row>
      <Row label="Notice needed" hint="Set in hours, so you can require notice on the same day. 0 means someone can book the next free slot.">
       <Num value={s.leadHours} onChange={(v) => set("leadHours", Math.max(0, Math.round(Number(v) || 0)))} suffix="hours" />
      </Row>
      <Row label="Book up to" hint="Dates beyond this don’t show on the calendar.">
       <Num value={s.horizonDays} onChange={(v) => set("horizonDays", Math.max(1, Math.round(Number(v) || 0)))} suffix="days ahead" />
      </Row>
     </Card>

     <Card title="What people can book">
      <Row label="Types" hint="The options someone picks from when booking. Add one for each kind of visit you take.">
       <input
        value={s.types.join(", ")}
        onChange={(e) => set("types", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))}
        placeholder="Try-on, Pickup, Return"
        className="w-72 rounded-lg border border-stone-200 px-3 py-1.5 text-[13.5px] outline-none focus:border-stone-400"
       />
      </Row>
      <Row
       label="Confirm each booking yourself"
       hint={s.requireApproval
        ? "Bookings arrive as requests and the time is held until you answer."
        : "Bookings are confirmed the moment they're made."}
      >
       <Toggle on={s.requireApproval} onClick={() => set("requireApproval", !s.requireApproval)} />
      </Row>
      <Row label="Note shown above the times" hint="A short line about what to expect. Optional.">
       <input
        value={s.intro ?? ""}
        onChange={(e) => set("intro", e.target.value || null)}
        placeholder="Come and see the archive — 45 minutes, one on one."
        className="w-72 rounded-lg border border-stone-200 px-3 py-1.5 text-[13.5px] outline-none focus:border-stone-400"
       />
      </Row>
     </Card>

     <Card title="Deposit" blurb="Charge a deposit to hold the slot. It cuts down no-shows, and you can take it off what they spend.">
      <Row label="Amount" hint="Zero means booking is free.">
       <span className="flex items-center gap-1.5">
        <span className="text-[13px] text-stone-400">$</span>
        <Num value={money(s.depositCents)} onChange={(v) => set("depositCents", cents(v))} width="w-24" />
       </span>
      </Row>
      {s.depositCents > 0 && (
       <Row label="What happens to the deposit">
        <span className="flex gap-1.5">
         <Tag on={s.depositCredits} onClick={() => set("depositCredits", true)}>Comes off their purchase</Tag>
         <Tag on={!s.depositCredits} onClick={() => set("depositCredits", false)}>Booking fee, kept</Tag>
        </span>
       </Row>
      )}
      {s.depositCents > 0 && (
       <p className="mt-3 rounded-xl bg-stone-50 px-4 py-3 text-[12.5px] leading-relaxed text-stone-600">
        A slot isn&rsquo;t held until the deposit is paid, so an abandoned payment can&rsquo;t block your schedule.
        {s.depositCredits && " Credit against a purchase is applied by you at checkout — it isn't automatic yet."}
       </p>
      )}
     </Card>

     <Card title="Emails" blurb="The emails sent when someone books, and the reminder before their appointment.">
      <Row label="Email me every booking" hint="The customer always gets a confirmation. This is about whether you get one too.">
       <Toggle on={s.notifyOnBooking} onClick={() => set("notifyOnBooking", !s.notifyOnBooking)} />
      </Row>
      {s.notifyOnBooking && (
       <Row label="Send those to" hint={notifyTo ? `Now going to ${notifyTo}. Leave empty to keep using that.` : "Leave empty to use the address you already send from."}>
        <input
         value={s.notifyEmail ?? ""}
         onChange={(e) => set("notifyEmail", e.target.value.trim() || null)}
         placeholder="bookings@yourshop.com"
         className="w-72 rounded-lg border border-stone-200 px-3 py-1.5 text-[13.5px] outline-none focus:border-stone-400"
        />
       </Row>
      )}
      <Row label="Remind them before" hint="How many hours before the appointment to send it. 24 is the day before. 0 sends nothing.">
       <Num value={s.reminderHours} onChange={(v) => set("reminderHours", Math.max(0, Math.round(Number(v) || 0)))} suffix="hours before" />
      </Row>
      <p className="mt-3 rounded-xl bg-stone-50 px-4 py-3 text-[12.5px] leading-relaxed text-stone-600">
       Want to say more than that? Write your own in{" "}
       <a href="/infrastructure/admin/marketing/automations" className="underline underline-offset-2">Marketing &rsaquo; Automations</a>
       {" "}— there are triggers for a booking, a confirmation, a cancellation and this reminder, and you can
       use <code className="rounded bg-white px-1 py-0.5 text-[11.5px]">{"{{name}}"}</code>,{" "}
       <code className="rounded bg-white px-1 py-0.5 text-[11.5px]">{"{{when}}"}</code>,{" "}
       <code className="rounded bg-white px-1 py-0.5 text-[11.5px]">{"{{date}}"}</code>,{" "}
       <code className="rounded bg-white px-1 py-0.5 text-[11.5px]">{"{{time}}"}</code>,{" "}
       <code className="rounded bg-white px-1 py-0.5 text-[11.5px]">{"{{type}}"}</code> and{" "}
       <code className="rounded bg-white px-1 py-0.5 text-[11.5px]">{"{{store}}"}</code> in them.
      </p>
     </Card>
    </div>

    <div className="flex items-center justify-end gap-3 pb-2">
     {saved && <span className="flex items-center gap-1.5 text-[12.5px] text-emerald-700"><Check size={14} /> Saved</span>}
     <TechButton onClick={save} disabled={busy}>{busy ? "Saving…" : "Save appointment settings"}</TechButton>
    </div>
   </div>
  </>
 );
}
