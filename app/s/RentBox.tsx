"use client";

import { useEffect, useMemo, useState } from "react";
import RentCalendar, { type Span } from "./RentCalendar";

// Renting, from the customer's side.
//
// The order follows what a renter decides: is it my size, what's it worth, what does it cost, when
// do I need it, how do I get it. Dates come before the button because the price depends on them —
// "From $195" is a starting point, not the price, and the real number only exists once two dates
// are picked and the server has agreed they're free.
//
// Every label here is the store's to write. A vintage archive and a bridal showroom describe the
// same transaction differently, and "NYC Pickup" is a real answer where "Local pickup" is not.

type Tier = { days: number; cents: number };
type Rules = {
 bookingMode: "open" | "request" | "both";
 minDays: number; maxDays: number; leadDays: number; horizonDays: number;
 fulfilment: "ship" | "pickup" | "both";
 dryCleaning: boolean; prepaidLabel: boolean;
 lateFees: boolean; lateFeeCentsPerDay: number;
 security: "none" | "deposit" | "waiver";
 depositCents: number | null; waiverPct: number;
 termsText: string | null;
 rentLabel: string; pickupLabel: string; deliverLabel: string;
 fitGuideUrl: string | null; highlightsText: string | null;
};
type Availability = { today: string; free: Span[]; tiers: Tier[]; fitsSizes: string | null; marketValueCents: number | null; rules: Rules };
type Quote =
 | { ok: true; days: number; rentCents: number; waiverCents: number; depositCents: number | null; totalCents?: number; totalDueCents: number; rented: Span }
 | { ok: false; reason: string };

const REFUSAL: Record<string, string> = {
 "too-short": "That's shorter than this store rents for.",
 "too-long": "That's longer than this store rents for.",
 "too-soon": "That's too soon — pick a later start date.",
 "beyond-horizon": "That's further ahead than bookings are open.",
 "no-price": "There's no price for a rental that long.",
 unavailable: "Those dates have gone. Pick another window.",
 "request-only": "This piece is by request only.",
 "bad-dates": "Check those dates.",
};

const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
const pretty = (d: string) =>
 d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "";

export default function RentBox({ itemId, accent, alsoForSale }: { itemId: string; accent: string; alsoForSale: boolean }) {
 const [a, setA] = useState<Availability | null>(null);
 const [start, setStart] = useState("");
 const [end, setEnd] = useState("");
 const [openCal, setOpenCal] = useState(false);
 const [q, setQ] = useState<Quote | null>(null);
 const [method, setMethod] = useState<"ship" | "pickup">("ship");
 const [agreed, setAgreed] = useState(false);
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState<string | null>(null);

 const [applying, setApplying] = useState(false);
 const [form, setForm] = useState({ name: "", email: "", phone: "", affiliation: "", message: "" });
 const [sent, setSent] = useState(false);

 useEffect(() => {
  let live = true;
  (async () => {
   const d = await fetch(`/api/store/rentals/availability?itemId=${encodeURIComponent(itemId)}`)
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
   if (!live || !d?.rules) return;
   setA(d);
   setMethod(d.rules.fulfilment === "pickup" ? "pickup" : "ship");
  })();
  return () => { live = false; };
 }, [itemId]);

 // The server prices it. What was shown in the calendar is a proposal, never the answer.
 useEffect(() => {
  if (!a || !start || !end) { void Promise.resolve().then(() => setQ(null)); return; }
  let live = true;
  (async () => {
   const d = await fetch("/api/store/rentals/quote", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId, start, end }),
   }).then((r) => r.json()).catch(() => null);
   if (live) setQ(d ?? null);
  })();
  return () => { live = false; };
 }, [a, itemId, start, end]);

 const from = useMemo(() => {
  const priced = (a?.tiers ?? []).filter((t) => t.cents > 0).sort((x, y) => x.cents - y.cents);
  return priced[0]?.cents ?? null;
 }, [a]);

 if (!a || from == null) return null;

 const r = a.rules;
 const byRequest = r.bookingMode === "request";
 const total = q?.ok ? (q.totalDueCents ?? q.totalCents ?? q.rentCents) : 0;
 const ready = q?.ok === true && (!r.termsText || agreed);

 async function rentNow() {
  if (!q?.ok) return;
  setBusy(true); setErr(null);
  const d = await fetch("/api/store/rentals/hold", {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ itemId, start, end }),
  }).then((x) => x.json()).catch(() => null);
  setBusy(false);
  if (!d?.ok) { setErr(REFUSAL[d?.reason] || "Those dates just went. Pick another window."); setQ(null); return; }
  window.location.href = `/checkout?rental=${d.booking.id}`;
 }

 async function apply() {
  setBusy(true); setErr(null);
  const d = await fetch("/api/store/rentals/apply", {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ itemId, start, end, ...form }),
  }).then((x) => x.json()).catch(() => null);
  setBusy(false);
  if (!d?.ok) { setErr(d?.error || REFUSAL[d?.reason] || "Couldn't send that. Try again."); return; }
  setSent(true);
 }

 if (sent) {
  return (
   <div className="border border-current/15 px-5 py-6 text-center">
    <p className="text-[14px]">Request sent</p>
    <p className="mx-auto mt-2 max-w-[36ch] text-[12.5px] leading-relaxed opacity-60">
     The store will be in touch. If they approve it you&rsquo;ll get a link to pay, and the dates are held until then.
    </p>
   </div>
  );
 }

 const highlights = r.highlightsText || [
  r.dryCleaning && "Arrives dry-cleaned, ready to wear.",
  r.prepaidLabel && method === "ship" && "A prepaid return label is in the box.",
  method === "pickup" && "Collect and return in person.",
  r.lateFees && r.lateFeeCentsPerDay > 0 && `Late returns are ${usd(r.lateFeeCentsPerDay)} a day.`,
 ].filter(Boolean).join(" ");

 return (
  <div>
   {a.marketValueCents != null && (
    <p className="text-[13px] opacity-55">Market value {usd(a.marketValueCents)}</p>
   )}

   {(a.fitsSizes || r.fitGuideUrl) && (
    <div className="mt-5 flex items-baseline justify-between gap-4 border-b border-current/15 pb-3">
     {a.fitsSizes
      ? <p className="text-[11px] uppercase tracking-[0.18em] opacity-70">Fits size {a.fitsSizes}</p>
      : <span />}
     {r.fitGuideUrl && (
      <a href={r.fitGuideUrl} target="_blank" rel="noreferrer" className="shrink-0 text-[12.5px] underline underline-offset-4 opacity-80 hover:opacity-100">Will this fit?</a>
     )}
    </div>
   )}

   <p className="mt-5 text-2xl">From {usd(from)}</p>

   {/* One control, two fields — clicking either opens the calendar, as the reference does. */}
   <div className="relative mt-4">
    <div className="vya-round flex border border-current/20">
     {([["Arrive by", start], ["Return by", end]] as const).map(([label, val], i) => (
      <button
       key={label}
       type="button"
       onClick={() => { setOpenCal(true); setErr(null); }}
       className={`flex-1 px-4 py-3 text-left transition hover:bg-current/[0.03] ${i ? "border-l border-current/20" : ""}`}
      >
       <span className="block text-[13px]">{label}</span>
       <span className={`mt-0.5 block text-[13px] ${val ? "" : "opacity-45"}`}>{val ? pretty(val) : "Add date"}</span>
      </button>
     ))}
    </div>

    {openCal && (
     <>
      <div className="fixed inset-0 z-30" onClick={() => setOpenCal(false)} aria-hidden />
      <RentCalendar
       today={a.today}
       free={a.free}
       minDays={r.minDays}
       maxDays={r.maxDays}
       leadDays={r.leadDays}
       horizonDays={r.horizonDays}
       value={{ start, end }}
       accent={accent}
       onApply={(s, e) => { setStart(s); setEnd(e); }}
       onClose={() => setOpenCal(false)}
      />
     </>
    )}
   </div>

   {r.fulfilment === "both" && (
    <div className="mt-4 flex gap-2">
     {([["ship", r.deliverLabel], ["pickup", r.pickupLabel]] as const).map(([m, label]) => (
      <button
       key={m}
       type="button"
       onClick={() => setMethod(m as "ship" | "pickup")}
       className="vya-round border px-5 py-2.5 text-[12.5px] transition"
       style={method === m
        ? { background: accent, color: "#fff", borderColor: accent }
        : { borderColor: "currentColor", opacity: 0.6 }}
      >{label}</button>
     ))}
    </div>
   )}

   {q && !q.ok && <p className="mt-4 text-[12.5px] opacity-70">{REFUSAL[q.reason] || "Those dates don't work."}</p>}

   {q?.ok && (
    <dl className="mt-5 space-y-1.5 border-t border-current/10 pt-4 text-[13px]">
     <div className="flex justify-between"><dt className="opacity-60">{q.days} {q.days === 1 ? "day" : "days"}</dt><dd>{usd(q.rentCents)}</dd></div>
     {q.waiverCents > 0 && (
      <div className="flex justify-between"><dt className="opacity-60">Damage waiver</dt><dd>{usd(q.waiverCents)}</dd></div>
     )}
     <div className="flex justify-between border-t border-current/10 pt-1.5 font-medium"><dt>Total</dt><dd>{usd(total)}</dd></div>
     {q.depositCents ? <p className="pt-1 text-[11.5px] opacity-55">{usd(q.depositCents)} deposit held separately, released when it&rsquo;s back.</p> : null}
    </dl>
   )}

   {r.termsText && (
    <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-[11.5px] leading-relaxed opacity-75">
     <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 shrink-0" />
     <span>I agree to the rental terms.<span className="mt-1 block opacity-70">{r.termsText}</span></span>
    </label>
   )}

   {err && <p className="mt-4 text-[12.5px]" role="alert" style={{ color: accent }}>{err}</p>}

   {byRequest && applying ? (
    <div className="mt-5 flex flex-col gap-2">
     {([["name", "Your name"], ["email", "Email"], ["phone", "Phone (optional)"], ["affiliation", "Agency, publication or shoot"]] as const).map(([k, ph]) => (
      <input
       key={k}
       value={form[k]}
       onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
       placeholder={ph}
       className="border border-current/20 bg-transparent px-3.5 py-3 text-[13px] outline-none placeholder:opacity-45 focus:border-current/45"
      />
     ))}
     <textarea
      value={form.message}
      onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
      rows={3}
      placeholder="What it's for"
      className="border border-current/20 bg-transparent px-3.5 py-3 text-[13px] outline-none placeholder:opacity-45 focus:border-current/45"
     />
     <button
      type="button"
      disabled={busy || !q?.ok || !form.email.trim()}
      onClick={apply}
      className="vya-cta mt-1 w-full py-4 text-center text-[11px] uppercase tracking-[0.2em] text-white transition disabled:opacity-35"
      style={{ background: accent }}
     >{busy ? "Sending…" : "Send request"}</button>
    </div>
   ) : (
    <button
     type="button"
     disabled={(!ready && !byRequest) || busy || (byRequest && !q?.ok)}
     onClick={() => (byRequest ? setApplying(true) : rentNow())}
     className="vya-cta mt-5 w-full py-4 text-center text-[11px] uppercase tracking-[0.2em] text-white transition hover:opacity-90 disabled:opacity-30"
     style={{ background: accent }}
    >
     {busy ? "One moment…"
      : byRequest ? "Request to rent"
      : !start || !end ? "Add dates to rent"
      : ready ? `${r.rentLabel} — ${usd(total)}`
      : r.rentLabel}
    </button>
   )}

   {highlights && <p className="mt-4 text-[11.5px] leading-relaxed opacity-55">{highlights}</p>}
   {alsoForSale && <p className="mt-1 text-[11.5px] leading-relaxed opacity-55">This piece can also be bought outright.</p>}
  </div>
 );
}
