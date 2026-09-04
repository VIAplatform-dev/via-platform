"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, X } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, StatusPill, cn } from "../ui";

// The store's week — its own page, because a shop that only sells still takes appointments.
//
// A week, not a month: a shop taking fittings cares about "what's Thursday look like", and a month
// grid can't show times without becoming unreadable. Empty open days still draw their slots, so an
// open Thursday with nobody in it reads as available rather than as a blank.

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

export default function RentalCalendarPage() {
 const [from, setFrom] = useState(() => weekStart(today()));
 const [appts, setAppts] = useState<Appointment[]>([]);
 const [slots, setSlots] = useState<Slot[]>([]);
 const [cfg, setCfg] = useState<Config | null>(null);
 const [loading, setLoading] = useState(true);
 const [err, setErr] = useState<string | null>(null);
 const [adding, setAdding] = useState<{ day: string; start: string } | null>(null);
 const [form, setForm] = useState({ name: "", email: "", phone: "", kind: "", note: "" });
 const [busy, setBusy] = useState(false);

 const to = addDays(from, 6);

 const load = useCallback(async () => {
  setLoading(true);
  const d = await fetch(withStore(`/api/store/appointments?from=${from}&to=${to}`))
   .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  setLoading(false);
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

 const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
 const apptAt = (day: string, start: string) => appts.find((a) => a.day === day && a.start === start);
 const noHours = cfg && cfg.openingHours.length === 0;

 return (
  <AdminPage>
   <AdminHeader
    eyebrow="Appointments"
    title="Your diary"
    subtitle="Try-ons, collections and drop-offs — whoever's coming in, and when."
    actions={
     <div className="flex items-center gap-2">
      <TechButton variant="ghost" onClick={() => setFrom(weekStart(today()))}>This week</TechButton>
      <TechButton variant="secondary" onClick={() => setFrom(addDays(from, -7))} aria-label="Previous week"><ChevronLeft size={15} /></TechButton>
      <TechButton variant="secondary" onClick={() => setFrom(addDays(from, 7))} aria-label="Next week"><ChevronRight size={15} /></TechButton>
     </div>
    }
   />

   {err && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700" role="alert">{err}</div>}

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

   {appts.some((a) => a.status === "pending") && (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
     {appts.filter((a) => a.status === "pending").length} appointment{appts.filter((a) => a.status === "pending").length === 1 ? "" : "s"} to confirm this week — the times are held until you answer.
    </div>
   )}

   <p className="mb-3 text-[13px] text-stone-500">{monthLabel(from)}</p>

   {loading ? (
    <TechCard className="px-5 py-10 text-center text-[13px] text-stone-400">Loading…</TechCard>
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
             <div key={s.start} className={cn("rounded-lg border p-2", waiting ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white")}>
              <p className={cn("text-[11px] font-medium tabular-nums", waiting ? "text-amber-900" : "text-stone-900")}>{s.start}</p>
              <p className="mt-0.5 truncate text-[12px] text-stone-800">{a.customerName || a.customerEmail || "Booked"}</p>
              <p className="truncate text-[10.5px] text-stone-400">{a.kind}</p>
              {waiting && <StatusPill tone="pending" className="mt-1">Wants this time</StatusPill>}
              {!waiting && a.status !== "booked" && <StatusPill tone={a.status === "no-show" ? "down" : "neutral"} className="mt-1">{a.status}</StatusPill>}
              {waiting ? (
               // Someone booked this themselves. The slot is already held for them, so the only
               // question is whether the store wants it.
               <div className="mt-1.5 flex gap-1">
                <button onClick={() => mark(a.id, "booked")} disabled={busy} className="rounded bg-stone-900 px-2 py-0.5 text-[10px] font-medium text-white">Confirm</button>
                <button onClick={() => mark(a.id, "cancelled")} disabled={busy} className="rounded px-1.5 py-0.5 text-[10px] text-stone-600 hover:bg-amber-100">Decline</button>
               </div>
              ) : a.status === "booked" ? (
               <div className="mt-1.5 flex gap-1">
                <button onClick={() => mark(a.id, "attended")} disabled={busy} className="rounded px-1.5 py-0.5 text-[10px] text-stone-500 hover:bg-stone-100">Came</button>
                <button onClick={() => mark(a.id, "no-show")} disabled={busy} className="rounded px-1.5 py-0.5 text-[10px] text-stone-500 hover:bg-stone-100">No-show</button>
                <button onClick={() => mark(a.id, "cancelled")} disabled={busy} aria-label="Cancel" className="ml-auto rounded px-1 text-stone-400 hover:bg-stone-100"><X size={11} /></button>
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
