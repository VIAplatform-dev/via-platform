"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarRange, Inbox, PackageCheck, Truck, AlertTriangle, Settings2 } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, TechEmpty, StatusPill, TagRow, cn } from "../ui";

// The rental day, as a queue.
//
// A seller with rentals out has four questions and they're all about time: what leaves today, what's
// with a customer, what's late, what came back and needs checking. So the tabs are those questions,
// not the underlying statuses — "Out" quietly covers both `out` and `due`, because a piece being
// late doesn't move it anywhere physical.
//
// Applications live here too. A request holding dates is inventory the store can't sell, so leaving
// it in an inbox somewhere else is how a gown ends up blocked for a fortnight.

type Span = { start: string; end: string };
type Booking = {
 id: string; itemId: string; status: string; origin: string;
 rented: Span | null; blocked: Span | null; shipBy: string | null; dueBack: string | null;
 priceCents: number | null; lateFeeCents: number; damageCents: number;
 renterName?: string | null; renterEmail?: string | null; renterPhone?: string | null;
 delivery?: "ship" | "pickup";
 returnLabelUrl?: string | null; returnTracking?: string | null;
 /** Where the carrier says it is — the estimate corrected by a real scan. Null when nothing is known. */
 whereabouts?: { stage: string; line: string; expected: string | null; runningLate: boolean } | null;
 title?: string | null; image?: string | null;
};
type Request = {
 id: string; itemId: string; requesterName: string | null; requesterEmail: string | null;
 affiliation: string | null; wanted: Span | null; message: string | null;
 status: string; quotedCents: number | null; holdsDates: boolean; holdExpiresAt: string | null;
};

const TABS = ["today", "upcoming", "out", "inspect", "requests"] as const;
type Tab = (typeof TABS)[number];
// Named for the STAGE THE PIECE IS AT, in the order it travels: pack it, it's booked, it's away,
// it's back. The old set mixed three vocabularies — "Today" and "Upcoming" are times, "With
// customers" is a place, "To check" is a job — so nothing told you they were one sequence.
const TAB_LABEL: Record<Tab, string> = {
 today: "Pack today",
 upcoming: "Booked ahead",
 out: "Away",
 inspect: "Back to check",
 requests: "Requests",
};
/** One line under the row, so a tab never has to carry the whole explanation in two words. */
const TAB_HINT: Record<Tab, string> = {
 today: "Going out today — pack these and get them posted or ready to collect.",
 upcoming: "Paid and dated, leaving another day. Nothing to do yet.",
 out: "With a customer right now. Anything past its return date is flagged above.",
 inspect: "Come back and waiting on you — check them over, then put them back on the rack.",
 requests: "People asking to rent. Their dates are held while you decide, so answering frees the piece up.",
};

function withStore(path: string): string {
 if (typeof window === "undefined") return path;
 const s = new URLSearchParams(window.location.search).get("store");
 return s ? `${path}${path.includes("?") ? "&" : "?"}store=${encodeURIComponent(s)}` : path;
}

const usd = (c: number | null | undefined) => (c == null ? "—" : `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`);
const day = (d?: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—");
const todayIso = () => new Date().toISOString().slice(0, 10);

/** What the seller does next, per state. One action per row — a queue with choices isn't a queue. */
const NEXT: Record<string, { to: string; label: string } | undefined> = {
 booked: { to: "picking", label: "Start picking" },
 picking: { to: "out", label: "Mark sent" },
 out: { to: "returned", label: "Mark returned" },
 due: { to: "returned", label: "Mark returned" },
 returned: { to: "inspected", label: "Looks fine" },
 inspected: { to: "closed", label: "Put back on the rack" },
};

export default function RentalsQueuePage() {
 const [tab, setTab] = useState<Tab>("today");
 const [bookings, setBookings] = useState<Booking[] | null>(null);
 const [requests, setRequests] = useState<Request[] | null>(null);
 const [busy, setBusy] = useState<string | null>(null);
 const [err, setErr] = useState<string | null>(null);
 const [damaging, setDamaging] = useState<string | null>(null);
 const [damageAmt, setDamageAmt] = useState("");

 const load = useCallback(async () => {
  const [b, r] = await Promise.all([
   fetch(withStore("/api/store/rentals/bookings")).then((x) => (x.ok ? x.json() : null)).catch(() => null),
   fetch(withStore("/api/store/rentals/requests?status=new")).then((x) => (x.ok ? x.json() : null)).catch(() => null),
  ]);
  setBookings(b?.bookings ?? []);
  setRequests(r?.requests ?? []);
 }, []);

 useEffect(() => { void Promise.resolve().then(() => { void load(); }); }, [load]);

 async function move(id: string, to: string, patch?: Record<string, unknown>) {
  setBusy(id); setErr(null);
  const r = await fetch(withStore(`/api/store/rentals/bookings/${id}`), {
   method: "PATCH", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ status: to, ...patch }),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(null);
  if (!r?.ok) { setErr(r?.d?.error || "Couldn't update that rental."); return; }
  setDamaging(null); setDamageAmt("");
  await load();
 }

 async function answer(id: string, action: "approve" | "decline", quotedCents?: number) {
  setBusy(id); setErr(null);
  const r = await fetch(withStore(`/api/store/rentals/requests/${id}`), {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ action, ...(quotedCents != null ? { quotedCents } : {}) }),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(null);
  if (!r?.ok || r.d?.ok === false) { setErr(r?.d?.error || "Those dates were taken while this sat here."); return; }
  await load();
 }

 const t = todayIso();
 const all = bookings ?? [];
 const overdue = all.filter((b) => (b.status === "out" || b.status === "due") && b.dueBack && b.dueBack < t);
 const buckets: Record<Tab, Booking[]> = {
  today: all.filter((b) => (b.status === "booked" || b.status === "picking") && b.shipBy && b.shipBy <= t),
  upcoming: all.filter((b) => (b.status === "booked" || b.status === "picking") && (!b.shipBy || b.shipBy > t)),
  out: all.filter((b) => b.status === "out" || b.status === "due"),
  inspect: all.filter((b) => b.status === "returned" || b.status === "inspected"),
  requests: [],
 };
 const counts: Record<Tab, number> = {
  today: buckets.today.length, upcoming: buckets.upcoming.length,
  out: buckets.out.length, inspect: buckets.inspect.length, requests: (requests ?? []).length,
 };

 async function buyReturnLabel(id: string) {
  setBusy(id); setErr(null);
  const r = await fetch(withStore(`/api/store/rentals/bookings/${id}/return-label`), { method: "POST" })
   .then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(null);
  // The reasons are things a seller can act on — a missing ship-from, a setting that says the
  // renter pays — so they're shown as written rather than collapsed into "something went wrong".
  if (!r?.ok) { setErr(r?.d?.error || "Couldn't buy a label just now."); return; }
  await load();
 }

 const row = (b: Booking) => {
  const next = NEXT[b.status];
  const w = b.whereabouts ?? null;
  // A scan outranks the calendar: something moving isn't late, whatever the due date says.
  const late = b.dueBack && b.dueBack < t && (b.status === "out" || b.status === "due")
   && w?.stage !== "coming-back" && w?.stage !== "back";
  return (
   <TechCard key={b.id} className="flex flex-wrap items-center gap-4 p-4">
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-stone-100">
     {/* eslint-disable-next-line @next/next/no-img-element */}
     {b.image && <img src={b.image} alt="" className="h-full w-full object-cover" />}
    </div>
    <div className="min-w-[12rem] flex-1">
     <p className="truncate text-[14px] font-medium text-stone-900">{b.title || "Untitled piece"}</p>
     <p className="mt-0.5 text-[12px] text-stone-500">
      {day(b.rented?.start)} – {day(b.rented?.end)} · {usd(b.priceCents)}
      {b.origin === "request" && " · by application"}
     </p>
     {(b.renterName || b.renterEmail) && (
      <p className="mt-0.5 truncate text-[12px] text-stone-600">
       {b.renterName || b.renterEmail}
       {b.renterEmail && b.renterName ? <span className="text-stone-400"> · {b.renterEmail}</span> : null}
       {b.delivery === "pickup" ? <span className="text-stone-400"> · collecting</span> : null}
      </p>
     )}
     {/* One line saying where it actually is. Only when a carrier has told us something the dates
         didn't already say — repeating "due back Sep 10" under a pill that says the same is noise. */}
     {w && (w.stage === "coming-back" || w.stage === "back" || w.runningLate) && (
      <p className={cn("mt-1 text-[12px] leading-relaxed", w.runningLate ? "text-amber-700" : "text-stone-500")}>
       {w.line}
       {b.returnTracking && <span className="text-stone-400"> · {b.returnTracking}</span>}
      </p>
     )}
    </div>
    <div className="flex shrink-0 items-center gap-2">
     {/* The label "a prepaid return label is in the box" promises. Offered once a piece is with
         someone and only when it was posted — there's nothing to post back to a collection. */}
     {(b.status === "out" || b.status === "due") && b.delivery !== "pickup" && (
      b.returnLabelUrl
       ? <a href={b.returnLabelUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-stone-200 px-2.5 py-1 text-[12px] font-medium text-stone-600 transition hover:bg-stone-50">Return label</a>
       : <button type="button" onClick={() => buyReturnLabel(b.id)} disabled={busy === b.id} className="rounded-lg border border-stone-200 px-2.5 py-1 text-[12px] font-medium text-stone-600 transition hover:bg-stone-50 disabled:opacity-40">Buy return label</button>
     )}
     {/* The carrier's word beats ours. A piece scanned into the post is on its way back even when
         our own due date has passed, and calling that "overdue" sends a store chasing a customer
         who has already returned it. */}
     {w?.stage === "coming-back"
      ? <StatusPill tone="pending">On its way back</StatusPill>
      : w?.stage === "back" && b.status !== "returned"
       ? <StatusPill tone="live">Delivered back</StatusPill>
       : late
        ? <StatusPill tone="down">{`Due back ${day(b.dueBack)}`}</StatusPill>
        : <StatusPill tone={b.status === "returned" ? "pending" : "neutral"}>{b.status === "due" ? "Out" : b.status}</StatusPill>}
     {b.damageCents > 0 && <StatusPill tone="down">{usd(b.damageCents)} damage</StatusPill>}
    </div>
    <div className="flex shrink-0 items-center gap-2">
     {b.status === "returned" && (
      <TechButton variant="ghost" onClick={() => { setDamaging(damaging === b.id ? null : b.id); setDamageAmt(""); }}>
       Something&rsquo;s wrong
      </TechButton>
     )}
     {next && (
      <TechButton onClick={() => move(b.id, next.to)} disabled={busy === b.id}>
       {busy === b.id ? "…" : next.label}
      </TechButton>
     )}
    </div>

    {damaging === b.id && (
     <div className="flex w-full flex-wrap items-center gap-3 border-t border-stone-100 pt-3">
      <p className="text-[12.5px] text-stone-600">Charge for damage — this goes on the card saved at booking.</p>
      <span className="flex items-center gap-1.5">
       <span className="text-[13px] text-stone-400">$</span>
       <input
        inputMode="decimal" value={damageAmt} onChange={(e) => setDamageAmt(e.target.value)} placeholder="0"
        className="w-24 rounded-lg border border-stone-200 px-2.5 py-1.5 text-right text-[13px] tabular-nums outline-none focus:border-stone-400"
       />
      </span>
      <TechButton
       onClick={() => move(b.id, "inspected", { damageCents: Math.round((Number(damageAmt) || 0) * 100) })}
       disabled={busy === b.id || !(Number(damageAmt) > 0)}
      >Record damage</TechButton>
      <TechButton variant="ghost" onClick={() => setDamaging(null)}>Cancel</TechButton>
     </div>
    )}
   </TechCard>
  );
 };

 const reqRow = (q: Request) => (
  <TechCard key={q.id} className="p-4">
   <div className="flex flex-wrap items-start gap-4">
    <div className="min-w-[14rem] flex-1">
     <p className="text-[14px] font-medium text-stone-900">{q.requesterName || q.requesterEmail || "Someone"}</p>
     <p className="mt-0.5 text-[12px] text-stone-500">
      {q.affiliation ? `${q.affiliation} · ` : ""}{day(q.wanted?.start)} – {day(q.wanted?.end)}
     </p>
     {q.message && <p className="mt-2 max-w-[60ch] text-[12.5px] leading-relaxed text-stone-600">{q.message}</p>}
     {q.requesterEmail && <p className="mt-1.5 text-[11.5px] text-stone-400">{q.requesterEmail}</p>}
    </div>
    <div className="flex shrink-0 flex-col items-end gap-2">
     {q.holdsDates
      ? <StatusPill tone="pending">Dates held{q.holdExpiresAt ? ` until ${new Date(q.holdExpiresAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : ""}</StatusPill>
      : <StatusPill tone="neutral">Dates not held</StatusPill>}
     <div className="flex gap-2">
      <TechButton variant="ghost" onClick={() => answer(q.id, "decline")} disabled={busy === q.id}>Decline</TechButton>
      <TechButton onClick={() => answer(q.id, "approve")} disabled={busy === q.id}>{busy === q.id ? "…" : "Approve"}</TechButton>
     </div>
    </div>
   </div>
  </TechCard>
 );

 const shown = buckets[tab];
 const loading = bookings === null;

 return (
  <AdminPage>
   <AdminHeader
    eyebrow="Rentals"
    title="Rental queue"
    subtitle="What goes out, what's with a customer, and what's come back to check."
    actions={
     <div className="flex items-center gap-2">
      <TechButton variant="secondary" onClick={() => { void load(); }}>Refresh</TechButton>
      {/* The terms this queue runs on — timelines, late fees, deposits — reachable from the thing
          they govern rather than only from the settings index. */}
      <a href={withStore("/admin/settings/rentals")}
       className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-[12.5px] font-medium text-stone-600 transition hover:bg-stone-50">
       <Settings2 size={14} /> Settings
      </a>
     </div>
    }
   />

   {err && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700" role="alert">{err}</div>}

   {overdue.length > 0 && (
    <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
     <AlertTriangle size={15} className="shrink-0" />
     {overdue.length} {overdue.length === 1 ? "rental is" : "rentals are"} past their return date.
    </div>
   )}

   <div className="mb-5">
    <TagRow
     options={[...TABS]}
     value={tab}
     onChange={(v) => setTab((v as Tab) ?? tab)}
     labelFor={(v) => TAB_LABEL[v as Tab]}
     counts={counts}
    />
    <p className="mt-2 text-[12.5px] leading-snug text-stone-500">{TAB_HINT[tab]}</p>
   </div>

   {loading ? (
    <TechCard className="px-5 py-10 text-center text-[13px] text-stone-400">Loading…</TechCard>
   ) : tab === "requests" ? (
    (requests ?? []).length === 0
     ? <TechEmpty icon={<Inbox size={20} />} title="No applications waiting" body="When someone asks to rent a piece, it appears here and their dates are held until you answer." />
     : <div className="flex flex-col gap-3">{(requests ?? []).map(reqRow)}</div>
   ) : shown.length === 0 ? (
    <TechEmpty
     icon={tab === "out" ? <Truck size={20} /> : tab === "inspect" ? <PackageCheck size={20} /> : <CalendarRange size={20} />}
     title={
      tab === "today" ? "Nothing goes out today"
      : tab === "upcoming" ? "No rentals booked yet"
      : tab === "out" ? "Nothing is with a customer"
      : "Nothing to check"
     }
     body={tab === "upcoming" ? "Bookings appear here as soon as they're paid for." : undefined}
    />
   ) : (
    <div className="flex flex-col gap-3">{shown.map(row)}</div>
   )}
  </AdminPage>
 );
}
