"use client";

import { useEffect, useState } from "react";
import BookingEmbedFrame from "./BookingEmbedFrame";
import DepositForm, { type Deposit } from "./DepositForm";
import type { BookingEmbed } from "@/app/lib/appointments/embed-core";

/**
 * Booking a time with the shop.
 *
 * Deliberately not tied to rentals — a store that only sells still takes fittings, sourcing chats
 * and collections. It works from a STORE (an appointments section anywhere on the site) or from a
 * PIECE (the rent box, which knows its item), and the shape is the same either way.
 *
 * Days first, then times. A shopper picks "Thursday" before "2pm", and showing 40 times at once
 * asks them to do the filtering the page should have done.
 */

type Slot = { day: string; start: string; end: string };

const dayName = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const dayNum = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
const pretty = (d: string, t: string) =>
 `${new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })} at ${t}`;

export default function AppointmentBooker({
 accent, storeSlug, itemId, cta = "Book it",
}: { accent: string; storeSlug?: string; itemId?: string; cta?: string }) {
 const [slots, setSlots] = useState<Slot[] | null>(null);
 const [types, setTypes] = useState<string[]>([]);
 const [external, setExternal] = useState<{ url: string; embed: BookingEmbed | null } | null>(null);
 // The endpoint 404s when a shop hasn't turned appointments on — worth saying, not hiding.
 const [off, setOff] = useState(false);
 // Hours never set, versus set but nothing free — different problems, different words.
 const [configured, setConfigured] = useState(true);
 const [day, setDay] = useState("");
 const [start, setStart] = useState("");
 const [kind, setKind] = useState("");
 const [form, setForm] = useState({ name: "", email: "", phone: "", note: "" });
 const [busy, setBusy] = useState(false);
 const [done, setDone] = useState<{ day: string; start: string } | null>(null);
 // A deposit the shop asks for to hold the slot. The booking row exists either way; until this is
 // paid the time isn't held and the sweep releases it — so it's a step, not a receipt.
 const [deposit, setDeposit] = useState<Deposit | null>(null);
 const [err, setErr] = useState<string | null>(null);

 useEffect(() => {
  let live = true;
  // Nothing to identify the shop by means we're in the editor — the API resolves it from the session.
  const q = itemId ? `?itemId=${encodeURIComponent(itemId)}` : storeSlug ? `?store=${encodeURIComponent(storeSlug)}` : "";
  fetch(`/api/store/appointments/slots${q}`)
   .then(async (r) => (r.ok ? r.json() : { __off: r.status === 404 }))
   .then((d) => {
    if (!live) return;
    if (!d || d.__off) { setOff(Boolean(d?.__off)); setSlots([]); return; }
    if (d.bookingUrl) setExternal({ url: d.bookingUrl, embed: d.embed ?? null });
    setConfigured(d.configured !== false);
    setSlots(d.slots ?? []);
    setTypes(d.types ?? []);
    setKind((d.types ?? [])[0] ?? "");
   })
   .catch(() => { if (live) setSlots([]); });
  return () => { live = false; };
 }, [itemId, storeSlug]);

 async function book() {
  setBusy(true); setErr(null);
  const d = await fetch("/api/store/appointments/slots", {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ itemId, store: storeSlug, day, start, kind, ...form }),
  }).then((r) => r.json()).catch(() => null);
  setBusy(false);
  if (!d?.ok) {
   setErr(d?.error
    || (d?.reason === "full" ? "Someone just took that time. Pick another."
     : d?.reason === "payments-off" ? "This shop asks for a deposit but hasn't finished setting up payments. Do get in touch."
     : "Couldn't book that. Try again."));
   return;
  }
  // A deposit means one more step before the time is actually held.
  if (d.deposit?.clientSecret) { setDeposit(d.deposit as Deposit); return; }
  setDone({ day, start });
 }

 if (slots === null) return <p className="text-[13px] opacity-50">Loading times…</p>;

 // The shop keeps its diary somewhere else. Show that calendar if it can be framed, link it if not.
 if (external) {
  return external.embed
   ? <BookingEmbedFrame embed={external.embed} url={external.url} accent={accent} cta={cta} />
   : (
    <a href={external.url} target="_blank" rel="noreferrer"
     className="vya-cta block w-full px-8 py-3.5 text-center text-[11px] uppercase tracking-[0.2em] transition hover:opacity-85"
     style={{ background: accent, color: "#fff" }}>{cta}</a>
   );
 }

 if (deposit) {
  return <DepositForm deposit={deposit} accent={accent} cta={cta} onPaid={() => { setDeposit(null); setDone({ day, start }); }} />;
 }

 if (done) {
  return (
   <div className="vya-round border border-current/15 px-5 py-6 text-center">
    <p className="text-[14px]">Requested</p>
    <p className="mx-auto mt-2 max-w-[38ch] text-[12.5px] leading-relaxed opacity-65">
     {pretty(done.day, done.start)}. The shop will confirm — your time is held until they do.
    </p>
   </div>
  );
 }

 if (!slots.length) {
  return (
   <p className="text-[13px] opacity-55">
    {off ? "Appointments aren't switched on for this shop yet."
     : !configured ? "This shop hasn't published any opening times yet."
     : "No times are open at the moment. Do get in touch."}
   </p>
  );
 }

 const days = [...new Set(slots.map((s) => s.day))];
 const times = slots.filter((s) => s.day === day);

 return (
  <div className="flex flex-col gap-4">
   {types.length > 1 && (
    <div className="flex flex-wrap gap-2">
     {types.map((t) => (
      <button
       key={t} type="button" onClick={() => setKind(t)}
       className="vya-round border px-4 py-2 text-[12.5px] transition"
       style={kind === t ? { background: accent, color: "#fff", borderColor: accent } : { borderColor: "currentColor", opacity: 0.6 }}
      >{t}</button>
     ))}
    </div>
   )}

   <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
    {days.map((d) => (
     <button
      key={d} type="button"
      onClick={() => { setDay(d); setStart(""); setErr(null); }}
      className="vya-round shrink-0 border px-4 py-2.5 text-center transition"
      style={day === d ? { background: accent, color: "#fff", borderColor: accent } : { borderColor: "currentColor", opacity: 0.55 }}
     >
      <span className="block text-[11px] uppercase tracking-[0.12em]">{dayName(d)}</span>
      <span className="mt-0.5 block text-[13px]">{dayNum(d)}</span>
     </button>
    ))}
   </div>

   {day && (
    <div className="flex flex-wrap gap-2">
     {times.map((s) => (
      <button
       key={s.start} type="button" onClick={() => { setStart(s.start); setErr(null); }}
       className="vya-round border px-3.5 py-2 text-[12.5px] tabular-nums transition"
       style={start === s.start ? { background: accent, color: "#fff", borderColor: accent } : { borderColor: "currentColor", opacity: 0.6 }}
      >{s.start}</button>
     ))}
    </div>
   )}

   {start && (
    <div className="flex flex-col gap-2">
     {([["name", "Your name"], ["email", "Email"], ["phone", "Phone (optional)"]] as const).map(([k, ph]) => (
      <input
       key={k} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} placeholder={ph}
       className="vya-field vya-round border border-current/20 bg-transparent px-3.5 py-3 text-[13px] outline-none placeholder:opacity-45 focus:border-current/45"
      />
     ))}
     <textarea
      value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} rows={2} placeholder="Anything we should know"
      className="vya-field vya-round border border-current/20 bg-transparent px-3.5 py-3 text-[13px] outline-none placeholder:opacity-45 focus:border-current/45"
     />
     <button
      type="button" disabled={busy || !form.email.trim()} onClick={book}
      className="vya-cta mt-1 w-full py-4 text-center text-[11px] uppercase tracking-[0.2em] text-white transition disabled:opacity-35"
      style={{ background: accent }}
     >{busy ? "Sending…" : cta}</button>
     <p className="text-[11px] opacity-55">{pretty(day, start)}</p>
    </div>
   )}

   {err && <p className="text-[12.5px]" role="alert" style={{ color: accent }}>{err}</p>}
  </div>
 );
}
