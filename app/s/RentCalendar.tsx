"use client";

import { useMemo, useState } from "react";

// The rental date picker.
//
// A native <input type="date"> can't do the one thing that matters here: show that the 14th to the
// 18th is already gone. A renter needs to see the shape of what's free before they pick, so this is
// two months side by side with taken days struck through and unpickable — the convention every
// rental site uses, because it's the only one that answers "when CAN I have it".
//
// Selection is a range: first click sets the start, second sets the end. Clicking a day that would
// span something taken restarts the range from that day rather than silently refusing.

export type Span = { start: string; end: string };

const MS = 86_400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d: string, n: number) => new Date(ms(d) + n * MS).toISOString().slice(0, 10);
const iso = (y: number, m: number, day: number) =>
 `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Days a rental could actually cover, as a set — cheap at a 90-day horizon and simple to read. */
function freeDaySet(free: Span[]): Set<string> {
 const out = new Set<string>();
 for (const s of free || []) {
  for (let d = s.start; ms(d) <= ms(s.end); d = addDays(d, 1)) out.add(d);
 }
 return out;
}

function monthGrid(year: number, month: number): (number | null)[] {
 const first = new Date(Date.UTC(year, month, 1));
 // Monday-first, like the reference and most of the world.
 const lead = (first.getUTCDay() + 6) % 7;
 const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
 return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
}

export default function RentCalendar({
 today, free, minDays, maxDays, leadDays, horizonDays, value, accent, onApply, onClose,
}: {
 today: string; free: Span[];
 minDays: number; maxDays: number; leadDays: number; horizonDays: number;
 value: { start: string; end: string };
 accent: string;
 onApply: (start: string, end: string) => void;
 onClose: () => void;
}) {
 const earliest = addDays(today, leadDays);
 const latest = addDays(today, horizonDays);
 const available = useMemo(() => freeDaySet(free), [free]);

 const [cursor, setCursor] = useState(() => {
  const base = value.start && ms(value.start) >= ms(earliest) ? value.start : earliest;
  return { y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 };
 });
 const [start, setStart] = useState(value.start || "");
 const [end, setEnd] = useState(value.end || "");

 const pickable = (d: string) => available.has(d) && ms(d) >= ms(earliest) && ms(d) <= ms(latest);
 /** Every day from a to b is free — a range can't hop over someone else's rental. */
 const runIsClear = (a: string, b: string) => {
  for (let d = a; ms(d) <= ms(b); d = addDays(d, 1)) if (!available.has(d)) return false;
  return true;
 };

 function choose(d: string) {
  if (!pickable(d)) return;
  if (!start || (start && end)) { setStart(d); setEnd(""); return; }
  if (ms(d) < ms(start)) { setStart(d); return; }
  const len = Math.round((ms(d) - ms(start)) / MS) + 1;
  if (len < minDays || len > maxDays || !runIsClear(start, d)) { setStart(d); setEnd(""); return; }
  setEnd(d);
 }

 const inRange = (d: string) => Boolean(start && end && ms(d) >= ms(start) && ms(d) <= ms(end));
 const isEdge = (d: string) => d === start || d === end;

 const month = (y: number, m: number) => (
  <div className="min-w-[15rem] flex-1">
   <p className="mb-3 text-[15px]">{MONTHS[m]} {y}</p>
   <div className="grid grid-cols-7 gap-y-1 text-center">
    {DOW.map((d, i) => <span key={i} className="pb-1 text-[11px] opacity-45">{d}</span>)}
    {monthGrid(y, m).map((day, i) => {
     if (day == null) return <span key={i} />;
     const d = iso(y, m, day);
     const ok = pickable(d);
     const sel = isEdge(d);
     const mid = inRange(d) && !sel;
     return (
      <button
       key={i}
       type="button"
       disabled={!ok}
       onClick={() => choose(d)}
       aria-label={d}
       className={[
        "mx-auto grid h-9 w-9 place-items-center rounded-full text-[13px] transition",
        ok ? "cursor-pointer hover:ring-1 hover:ring-current/30" : "cursor-not-allowed line-through opacity-25",
        mid ? "bg-current/10" : "",
       ].join(" ")}
       style={sel ? { background: accent, color: "#fff" } : undefined}
      >{day}</button>
     );
    })}
   </div>
  </div>
 );

 const nextM = cursor.m === 11 ? { y: cursor.y + 1, m: 0 } : { y: cursor.y, m: cursor.m + 1 };
 const step = (n: number) => setCursor((c) => {
  const t = new Date(Date.UTC(c.y, c.m + n, 1));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() };
 });
 const len = start && end ? Math.round((ms(end) - ms(start)) / MS) + 1 : 0;

 return (
  <div className="absolute left-0 right-0 top-full z-40 mt-2 border border-current/15 bg-[canvas] p-5 shadow-[0_18px_50px_-20px_rgba(0,0,0,.35)] sm:min-w-[34rem]">
   <div className="mb-1 flex justify-end gap-1">
    <button type="button" aria-label="Previous month" onClick={() => step(-1)} className="grid h-8 w-8 place-items-center rounded-full text-[15px] hover:bg-current/10">‹</button>
    <button type="button" aria-label="Next month" onClick={() => step(1)} className="grid h-8 w-8 place-items-center rounded-full text-[15px] hover:bg-current/10">›</button>
   </div>

   <div className="flex flex-col gap-7 sm:flex-row sm:gap-9">
    {month(cursor.y, cursor.m)}
    <div className="hidden sm:block">{month(nextM.y, nextM.m)}</div>
   </div>

   <p className="mt-4 text-[11.5px] opacity-55">
    {start && !end ? `Now pick the return date — ${minDays}–${maxDays} days.`
     : len ? `${len} ${len === 1 ? "day" : "days"} selected.`
     : `Struck-through dates are already booked. ${minDays}–${maxDays} days.`}
   </p>

   <div className="mt-4 flex items-center justify-end gap-5">
    <button type="button" onClick={() => { setStart(""); setEnd(""); }} className="text-[12.5px] underline underline-offset-4 opacity-70 hover:opacity-100">Clear dates</button>
    <button
     type="button"
     disabled={!start || !end}
     onClick={() => { onApply(start, end); onClose(); }}
     className="border px-7 py-2.5 text-[11px] uppercase tracking-[0.18em] transition disabled:opacity-30"
     style={{ borderColor: accent, color: start && end ? "#fff" : undefined, background: start && end ? accent : "transparent" }}
    >Apply</button>
   </div>
  </div>
 );
}
