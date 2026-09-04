"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarRange, Inbox, PackageCheck, Truck, AlertTriangle } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, TechEmpty, StatusPill, TagRow } from "../ui";

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
 title?: string | null; image?: string | null;
};
type Request = {
 id: string; itemId: string; requesterName: string | null; requesterEmail: string | null;
 affiliation: string | null; wanted: Span | null; message: string | null;
 status: string; quotedCents: number | null; holdsDates: boolean; holdExpiresAt: string | null;
};

const TABS = ["today", "upcoming", "out", "inspect", "requests"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { today: "Today", upcoming: "Upcoming", out: "With customers", inspect: "To check", requests: "Applications" };

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

 const row = (b: Booking) => {
  const next = NEXT[b.status];
  const late = b.dueBack && b.dueBack < t && (b.status === "out" || b.status === "due");
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
    </div>
    <div className="flex shrink-0 items-center gap-2">
     {late
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
    actions={<TechButton variant="secondary" onClick={() => { void load(); }}>Refresh</TechButton>}
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
   </div>

   {loading ? (
    <TechCard className="px-5 py-10 text-center text-[13px] text-stone-400">Loading…</TechCard>
   ) : tab === "requests" ? (
    (requests ?? []).length === 0
     ? <TechEmpty icon={<Inbox size={20} />} title="No applications waiting" body="When someone applies to rent a piece, it lands here with their dates held." />
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
