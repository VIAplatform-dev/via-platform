"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, X, Clock, Settings2 } from "lucide-react";
import VisitPanel from "./VisitPanel";
import { AdminPage, AdminHeader, TechCard, TechButton, StatusPill, cn } from "../ui";

// The store's schedule — its own page, because a shop that only sells still takes appointments.
//
// Opens on the MONTH. A seller arriving here is usually asking a month-shaped question: how busy is
// next week, does anything clash with the market on the 14th, when could I fit someone in. The week
// view is for working a day, and it's one click away — but landing there meant scrolling forward
// week by week to answer anything about the month.
//
// Empty open days still draw their slots, so an open Thursday with nobody in it reads as available
// rather than as a blank.

type Appointment = {
 id: string; kind: string; day: string; start: string; end: string;
 customerName: string | null; customerEmail: string | null; customerPhone: string | null;
 note: string | null; status: string;
};
type Slot = { day: string; start: string; end: string; taken: number; capacity: number; free: boolean };
type Config = { openingHours: { day: number; start: string; end: string }[]; slotMinutes: number; slotCapacity: number; types: string[]; enabled: boolean };

function withStore(path: string): string {
 if (typeof window === "undefined") return path;
 const s = new URLSearchParams(window.location.search).get("store");
 return s ? `${path}${path.includes("?") ? "&" : "?"}store=${encodeURIComponent(s)}` : path;
}

const MS = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * MS).toISOString().slice(0, 10);
/** The Monday on or before a date — the week a shop thinks in. */
function weekStart(d: string): string {
 const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
 return addDays(d, -((wd + 6) % 7));
}
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" });
const monthLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = (d: string) => weekStart(`${d.slice(0, 7)}-01`);
/** Same day-of-month, n months away — clamped by the Date itself, so 31 Jan + 1 lands in February. */
function monthShift(d: string, n: number): string {
 const t = new Date(`${d}T00:00:00Z`);
 t.setUTCMonth(t.getUTCMonth() + n, 1);
 return t.toISOString().slice(0, 10);
}
const longDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
/** 24h "14:30" → "2:30 PM". A shop writes its hours in 24h; nobody reads a diary that way. */
const clock = (t: string) => { const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };

export default function RentalCalendarPage() {
 // The month, not the week. A shop wants to see the shape of the whole month when it opens this —
 // whether next week is full, whether anything clashes with a market — and can drop to a week when
 // it's actually working a day.
 const [span, setSpan] = useState<"week" | "month">("month");
 const [from, setFrom] = useState(() => monthStart(today()));
 const [appts, setAppts] = useState<Appointment[]>([]);
 const [slots, setSlots] = useState<Slot[]>([]);
 const [cfg, setCfg] = useState<Config | null>(null);
 const [loading, setLoading] = useState(true);
 const [err, setErr] = useState<string | null>(null);
 const [adding, setAdding] = useState<{ day: string; start: string } | null>(null);
 const [form, setForm] = useState({ name: "", email: "", phone: "", kind: "", note: "" });
 const [busy, setBusy] = useState(false);
 // Everything waiting on an answer, WHATEVER week it falls in. The diary only ever showed the week
 // on screen, so a request for a fortnight away was invisible — a store clicked "approve" in its
 // email, landed here, and found nothing to approve.
 const [pending, setPending] = useState<Appointment[]>([]);
 const [open, setOpen] = useState<Appointment | null>(null);

 // A month view starts on the Monday on or before the 1st, so weeks stay whole and every column is
 // the same weekday all the way down.
 const to = span === "week" ? addDays(from, 6) : addDays(from, 41);
 const step = (n: number) => (span === "week" ? addDays(from, 7 * n) : weekStart(monthShift(from, n)));

 const load = useCallback(async () => {
  setLoading(true);
  const [d, p] = await Promise.all([
   fetch(withStore(`/api/store/appointments?from=${from}&to=${to}`)).then((r) => (r.ok ? r.json() : null)).catch(() => null),
   fetch(withStore("/api/store/appointments/pending?list=1")).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  setLoading(false);
  setPending(p?.appointments ?? []);
  if (!d) { setErr("Couldn't load your calendar."); return; }
  setAppts(d.appointments ?? []);
  setSlots(d.slots ?? []);
  setCfg(d.settings ?? null);
 }, [from, to]);

 useEffect(() => { void Promise.resolve().then(() => { void load(); }); }, [load]);

 async function book() {
  if (!adding) return;
  setBusy(true); setErr(null);
  const r = await fetch(withStore("/api/store/appointments"), {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ ...adding, ...form }),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(false);
  if (!r?.ok || r.d?.ok === false) { setErr(r?.d?.error || "That time isn't free any more."); return; }
  setAdding(null); setForm({ name: "", email: "", phone: "", kind: "", note: "" });
  await load();
 }

 async function mark(id: string, status: string) {
  setBusy(true);
  await fetch(withStore(`/api/store/appointments/${id}`), {
   method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
  }).catch(() => null);
  setBusy(false);
  await load();
 }

 const days = Array.from({ length: span === "week" ? 7 : 42 }, (_, i) => addDays(from, i));
 const apptAt = (day: string, start: string) => appts.find((a) => a.day === day && a.start === start);
 const noHours = cfg && cfg.openingHours.length === 0;

 return (
  <AdminPage>
   <AdminHeader
    eyebrow="Appointments"
    title="Your schedule"
    subtitle="Everyone coming in, and when: try-ons, collections and drop-offs."
    actions={
     <div className="flex flex-wrap items-center gap-2">
      {/* A month for "how does September look", a week for "what's Thursday". Both are real
          questions and neither answers the other. */}
      <div className="flex overflow-hidden rounded-lg border border-stone-200">
       {(["week", "month"] as const).map((s) => (
        <button key={s} type="button" onClick={() => setSpan(s)}
         className={cn("px-3 py-1.5 text-[12.5px] font-medium capitalize transition", span === s ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-50")}>{s}</button>
       ))}
      </div>
      <TechButton variant="ghost" onClick={() => setFrom(span === "week" ? weekStart(today()) : monthStart(today()))}>Today</TechButton>
      <TechButton variant="secondary" onClick={() => setFrom(step(-1))} aria-label={`Previous ${span}`}><ChevronLeft size={15} /></TechButton>
      <TechButton variant="secondary" onClick={() => setFrom(step(1))} aria-label={`Next ${span}`}><ChevronRight size={15} /></TechButton>
      {/* The hours, deposits and approval rule that govern everything on this page live in
          settings — reachable from the thing they govern, not only from the settings index. */}
      <a href={withStore("/admin/settings/appointments")}
       className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-[12.5px] font-medium text-stone-600 transition hover:bg-stone-50">
       <Settings2 size={14} /> Settings
      </a>
     </div>
    }
   />

   {err && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700" role="alert">{err}</div>}

   {open && (
    <VisitPanel appt={open} withStore={withStore} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); void load(); }} />
   )}

   {cfg && !cfg.enabled && (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
     Appointments are switched off, so nothing here is visible to customers.{" "}
     <a href={withStore("/admin/settings/appointments")} className="font-semibold underline underline-offset-2">Turn them on</a>.
    </div>
   )}
   {noHours && (
    <div className="mb-4 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-[13px] text-stone-600">
     You haven&rsquo;t set any opening hours yet, so there are no times to book.{" "}
     <a href={withStore("/admin/settings/appointments")} className="font-semibold text-stone-900 underline underline-offset-2">Set your hours</a>.
    </div>
   )}

   {/* Approvals first, and never hidden behind whichever week is on screen. This is the only thing
       on the page that's actually waiting on the seller, so it sits above the diary and stays put
       until it's dealt with. */}
   {pending.length > 0 && (
    <TechCard className="mb-5 overflow-hidden p-0">
     <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3">
      <Clock size={15} className="text-amber-700" />
      <p className="text-[13px] font-semibold text-amber-900">
       {pending.length} {pending.length === 1 ? "booking is" : "bookings are"} waiting on you
      </p>
      <span className="ml-auto text-[12px] text-amber-900/70">Their time is held until you answer</span>
     </div>
     <div className="divide-y divide-stone-100">
      {pending.map((a) => (
       <div key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
        <button type="button" onClick={() => setOpen(a)} className="min-w-0 flex-1 text-left">
         <p className="truncate text-[13.5px] font-medium text-stone-900">{a.customerName || a.customerEmail || "Someone"}</p>
         <p className="truncate text-[12.5px] text-stone-500">
          {longDay(a.day)} · {clock(a.start)} · {a.kind}
          {a.note ? <span className="text-stone-400"> · &ldquo;{a.note}&rdquo;</span> : null}
         </p>
        </button>
        <div className="flex shrink-0 gap-2">
         <TechButton onClick={() => mark(a.id, "booked")} disabled={busy}>Confirm</TechButton>
         <TechButton variant="ghost" onClick={() => mark(a.id, "cancelled")} disabled={busy}>Decline</TechButton>
        </div>
       </div>
      ))}
     </div>
    </TechCard>
   )}

   <p className="mb-3 text-[13px] text-stone-500">{monthLabel(span === "week" ? from : addDays(from, 20))}</p>

   {loading ? (
    <TechCard className="px-5 py-10 text-center text-[13px] text-stone-400">Loading…</TechCard>
   ) : span === "month" ? (
    /* A month answers "how busy is September", not "what's at 2pm" — so a day is a count and a
       date, and clicking one drops into that week where the times actually fit. */
    <div className="overflow-x-auto">
     <div className="grid min-w-[42rem] grid-cols-7 gap-px rounded-xl bg-stone-200 p-px">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
       <div key={d} className="bg-stone-50 py-2 text-center text-[11px] font-medium uppercase tracking-[0.1em] text-stone-400">{d}</div>
      ))}
      {days.map((d) => {
       const dayAppts = appts.filter((a) => a.day === d && a.status !== "cancelled");
       const waiting = dayAppts.filter((a) => a.status === "pending").length;
       const isToday = d === today();
       const thisMonth = d.slice(0, 7) === addDays(from, 20).slice(0, 7);
       return (
        <button key={d} type="button" onClick={() => { setSpan("week"); setFrom(weekStart(d)); }}
         className={cn("min-h-[5.5rem] bg-white p-2 text-left transition hover:bg-stone-50", !thisMonth && "bg-stone-50/60")}>
         <span className={cn("text-[12px] tabular-nums", isToday ? "font-semibold text-stone-900" : thisMonth ? "text-stone-500" : "text-stone-300")}>
          {Number(d.slice(8, 10))}
         </span>
         <span className="mt-1.5 block space-y-1">
          {dayAppts.slice(0, 3).map((a) => (
           <span key={a.id} className={cn("block truncate rounded px-1.5 py-0.5 text-[10.5px]", a.status === "pending" ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-700")}>
            {clock(a.start)} {a.customerName || a.customerEmail || "Booked"}
           </span>
          ))}
          {dayAppts.length > 3 && <span className="block px-1.5 text-[10.5px] text-stone-400">+{dayAppts.length - 3} more</span>}
         </span>
         {waiting > 0 && <span className="mt-1 block text-[10px] font-medium text-amber-700">{waiting} to confirm</span>}
        </button>
       );
      })}
     </div>
    </div>
   ) : (
    <div className="overflow-x-auto">
     <div className="grid min-w-[56rem] grid-cols-7 gap-2">
      {days.map((d) => {
       const daySlots = slots.filter((s) => s.day === d);
       const isToday = d === today();
       return (
        <div key={d} className="min-w-0">
         <p className={cn("mb-2 text-[12px] font-medium", isToday ? "text-stone-900" : "text-stone-500")}>
          {dayLabel(d)}{isToday && <span className="ml-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--accent-ink,#0b7a5c)]">today</span>}
         </p>
         <div className="flex flex-col gap-1.5">
          {daySlots.length === 0 && (
           <p className="rounded-lg border border-dashed border-stone-200 px-2 py-3 text-center text-[11px] text-stone-300">Closed</p>
          )}
          {daySlots.map((s) => {
           const a = apptAt(d, s.start);
           if (a) {
            const waiting = a.status === "pending";
            return (
             <div key={s.start} onClick={() => setOpen(a)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") setOpen(a); }}
              className={cn("cursor-pointer rounded-lg border p-2 transition hover:border-stone-400", waiting ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white")}>
              <p className={cn("text-[11px] font-medium tabular-nums", waiting ? "text-amber-900" : "text-stone-900")}>{s.start}</p>
              <p className="mt-0.5 truncate text-[12px] text-stone-800">{a.customerName || a.customerEmail || "Booked"}</p>
              <p className="truncate text-[10.5px] text-stone-400">{a.kind}</p>
              {waiting && <StatusPill tone="pending" className="mt-1">Wants this time</StatusPill>}
              {!waiting && a.status !== "booked" && <StatusPill tone={a.status === "no-show" ? "down" : "neutral"} className="mt-1">{a.status}</StatusPill>}
              {waiting ? (
               // Someone booked this themselves. The slot is already held for them, so the only
               // question is whether the store wants it.
               <div className="mt-1.5 flex gap-1">
                <button onClick={(e) => { e.stopPropagation(); mark(a.id, "booked"); }} disabled={busy} className="rounded bg-stone-900 px-2 py-0.5 text-[10px] font-medium text-white">Confirm</button>
                <button onClick={(e) => { e.stopPropagation(); mark(a.id, "cancelled"); }} disabled={busy} className="rounded px-1.5 py-0.5 text-[10px] text-stone-600 hover:bg-amber-100">Decline</button>
               </div>
              ) : a.status === "booked" ? (
               <div className="mt-1.5 flex gap-1">
                <button onClick={(e) => { e.stopPropagation(); mark(a.id, "attended"); }} disabled={busy} className="rounded px-1.5 py-0.5 text-[10px] text-stone-500 hover:bg-stone-100">Came</button>
                <button onClick={(e) => { e.stopPropagation(); mark(a.id, "no-show"); }} disabled={busy} className="rounded px-1.5 py-0.5 text-[10px] text-stone-500 hover:bg-stone-100">No-show</button>
                <button onClick={(e) => { e.stopPropagation(); mark(a.id, "cancelled"); }} disabled={busy} aria-label="Cancel" className="ml-auto rounded px-1 text-stone-400 hover:bg-stone-100"><X size={11} /></button>
               </div>
              ) : null}
             </div>
            );
           }
           return (
            <button
             key={s.start}
             type="button"
             onClick={() => { setAdding({ day: d, start: s.start }); setForm((f) => ({ ...f, kind: cfg?.types[0] || "Try-on" })); }}
             className="rounded-lg border border-stone-200 bg-stone-50/60 px-2 py-2 text-left transition hover:border-stone-300 hover:bg-white"
            >
             <span className="block text-[11px] tabular-nums text-stone-500">{s.start}</span>
             <span className="block text-[10.5px] text-stone-300">Free</span>
            </button>
           );
          })}
         </div>
        </div>
       );
      })}
     </div>
    </div>
   )}

   {adding && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => setAdding(null)}>
     <TechCard className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
       <CalendarRange size={16} className="text-stone-400" />
       <h2 className="text-[15px] font-semibold text-stone-900">
        {dayLabel(adding.day)} at {adding.start}
       </h2>
      </div>
      <p className="mt-1 text-[12.5px] text-stone-500">Writing someone into the book yourself — a phone call, or a walk-in.</p>
      <div className="mt-4 flex flex-col gap-2">
       {cfg && cfg.types.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
         {cfg.types.map((t) => (
          <button
           key={t} type="button" onClick={() => setForm((f) => ({ ...f, kind: t }))}
           className={cn("rounded-full border px-3 py-1.5 text-[12px] transition",
            form.kind === t ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 text-stone-600 hover:border-stone-300")}
          >{t}</button>
         ))}
        </div>
       )}
       {([["name", "Name"], ["email", "Email"], ["phone", "Phone (optional)"]] as const).map(([k, ph]) => (
        <input key={k} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} placeholder={ph}
         className="rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none focus:border-stone-400" />
       ))}
       <textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} rows={2} placeholder="What it's for"
        className="rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none focus:border-stone-400" />
      </div>
      <div className="mt-4 flex justify-end gap-3">
       <TechButton variant="ghost" onClick={() => setAdding(null)}>Cancel</TechButton>
       <TechButton onClick={book} disabled={busy}>{busy ? "Saving…" : "Add to the book"}</TechButton>
      </div>
     </TechCard>
    </div>
   )}
  </AdminPage>
 );
}
