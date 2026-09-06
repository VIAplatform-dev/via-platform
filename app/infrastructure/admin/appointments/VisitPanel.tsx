"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Search, Mail, Check } from "lucide-react";
import { TechButton, StatusPill, cn } from "../ui";

// One visit, in full — who came, what they handled, and every other time they've been in.
//
// The record is why a shop takes appointments: someone comes in, tries six things and leaves. Kept
// here rather than on the diary tile because a tile has room for a name and a time and nothing else.

export type Appt = {
 id: string; kind: string; day: string; start: string; end: string;
 customerName: string | null; customerEmail: string | null; customerPhone: string | null;
 note: string | null; status: string;
};
type VisitItem = { itemId: string; outcome: "tried" | "liked" | "bought"; title: string | null; priceCents: number | null; currency: string | null; image: string | null };
type Listing = { id: string; title: string; images?: string[] | null; priceCents?: number | null; price?: number | null };

const OUTCOMES: { key: VisitItem["outcome"]; label: string }[] = [
 { key: "tried", label: "Tried on" },
 { key: "liked", label: "Loved it" },
 { key: "bought", label: "Bought" },
];
const money = (c: number | null, cur: string | null) =>
 c == null ? "" : `$${Math.round(c / 100).toLocaleString()}${cur && cur.toUpperCase() !== "USD" ? ` ${cur.toUpperCase()}` : ""}`;
const longDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const clock = (t: string) => { const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };

export default function VisitPanel({ appt, withStore, onClose, onChanged }: {
 appt: Appt; withStore: (p: string) => string; onClose: () => void; onChanged: () => void;
}) {
 const [items, setItems] = useState<VisitItem[]>([]);
 const [history, setHistory] = useState<Appt[]>([]);
 const [listings, setListings] = useState<Listing[]>([]);
 const [q, setQ] = useState("");
 const [busy, setBusy] = useState(false);
 const [note, setNote] = useState("");
 const [sent, setSent] = useState<string | null>(null);
 const [err, setErr] = useState<string | null>(null);

 const load = useCallback(async () => {
  const d = await fetch(withStore(`/api/store/appointments/${appt.id}/visit`))
   .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!d) return;
  setItems(d.items ?? []);
  setHistory(d.history ?? []);
 }, [appt.id, withStore]);

 useEffect(() => { void Promise.resolve().then(() => { void load(); }); }, [load]);
 useEffect(() => {
  // The catalogue, for the picker. Loaded once when the panel opens rather than per keystroke.
  void Promise.resolve().then(() => {
   void fetch(withStore("/api/store/items")).then((r) => (r.ok ? r.json() : null))
    .then((d) => setListings(d?.items ?? d?.listings ?? [])).catch(() => {});
  });
 }, [withStore]);

 async function tag(itemId: string, outcome: VisitItem["outcome"] | "remove") {
  setBusy(true);
  const body = outcome === "remove" ? { itemId, remove: true } : { itemId, outcome };
  const d = await fetch(withStore(`/api/store/appointments/${appt.id}/visit`), {
   method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  setBusy(false);
  if (d?.items) setItems(d.items);
 }

 async function sendFollowUp() {
  setBusy(true); setErr(null);
  const r = await fetch(withStore(`/api/store/appointments/${appt.id}/follow-up`), {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ message: note, itemIds: items.map((i) => i.itemId) }),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(false);
  if (!r?.ok) { setErr(r?.d?.error || "Couldn't send that just now."); return; }
  setSent(r.d.sent); setNote("");
 }

 async function mark(status: string) {
  setBusy(true);
  await fetch(withStore(`/api/store/appointments/${appt.id}`), {
   method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
  }).catch(() => null);
  setBusy(false);
  onChanged();
 }

 const tagged = new Set(items.map((i) => i.itemId));
 const matches = q.trim()
  ? listings.filter((l) => !tagged.has(l.id) && l.title?.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6)
  : [];

 return (
  <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
   <div className="h-full w-full max-w-md overflow-y-auto bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
    <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-stone-200 bg-white px-5 py-4">
     <div className="min-w-0">
      <p className="truncate text-[15px] font-semibold text-stone-900">{appt.customerName || appt.customerEmail || "Someone"}</p>
      <p className="mt-0.5 text-[12.5px] text-stone-500">{longDay(appt.day)} · {clock(appt.start)} · {appt.kind}</p>
     </div>
     <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-stone-400 hover:bg-stone-100"><X size={16} /></button>
    </div>

    <div className="space-y-6 px-5 py-5">
     {appt.status === "pending" && (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
       <p className="text-[13px] font-medium text-amber-900">Waiting on you</p>
       <p className="mt-1 text-[12.5px] leading-relaxed text-amber-900/80">The time is held until you answer, and they&rsquo;re emailed either way.</p>
       <div className="mt-3 flex gap-2">
        <TechButton onClick={() => mark("booked")} disabled={busy}>Confirm</TechButton>
        <TechButton variant="ghost" onClick={() => mark("cancelled")} disabled={busy}>Decline</TechButton>
       </div>
      </div>
     )}

     <section>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Who</p>
      <div className="mt-2 space-y-1 text-[13px] text-stone-700">
       {appt.customerEmail && <p><a href={`mailto:${appt.customerEmail}`} className="underline underline-offset-2">{appt.customerEmail}</a></p>}
       {appt.customerPhone && <p>{appt.customerPhone}</p>}
       {appt.note && <p className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-[12.5px] leading-relaxed text-stone-600">&ldquo;{appt.note}&rdquo;</p>}
      </div>
     </section>

     <section>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">What they handled</p>
      <p className="mt-1 text-[12px] leading-snug text-stone-400">Note pieces as you go, so the follow-up writes itself.</p>

      <div className="mt-3 space-y-2">
       {items.map((i) => (
        <div key={i.itemId} className="flex items-center gap-3 rounded-lg border border-stone-200 p-2">
         {/* eslint-disable-next-line @next/next/no-img-element */}
         {i.image ? <img src={i.image} alt="" className="h-11 w-11 shrink-0 rounded object-cover" /> : <div className="h-11 w-11 shrink-0 rounded bg-stone-100" />}
         <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-medium text-stone-800">{i.title || "A piece"}</p>
          <p className="text-[11.5px] tabular-nums text-stone-400">{money(i.priceCents, i.currency)}</p>
         </div>
         <div className="flex shrink-0 gap-1">
          {OUTCOMES.map((o) => (
           <button key={o.key} type="button" disabled={busy} onClick={() => tag(i.itemId, o.key)}
            className={cn("rounded px-1.5 py-0.5 text-[10.5px] transition", i.outcome === o.key ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100")}>
            {o.label}
           </button>
          ))}
          <button type="button" disabled={busy} onClick={() => tag(i.itemId, "remove")} aria-label="Remove" className="rounded px-1 text-stone-300 hover:text-rose-600"><X size={12} /></button>
         </div>
        </div>
       ))}
       {items.length === 0 && <p className="rounded-lg border border-dashed border-stone-200 px-3 py-4 text-center text-[12px] text-stone-400">Nothing noted yet.</p>}
      </div>

      <div className="mt-3">
       <div className="flex items-center gap-2 rounded-lg border border-stone-200 px-2.5 py-1.5">
        <Search size={13} className="shrink-0 text-stone-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a piece they tried…"
         className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-stone-400" />
       </div>
       {matches.length > 0 && (
        <div className="mt-1.5 overflow-hidden rounded-lg border border-stone-200">
         {matches.map((l) => (
          <button key={l.id} type="button" onClick={() => { void tag(l.id, "tried"); setQ(""); }}
           className="flex w-full items-center gap-2.5 border-b border-stone-100 px-2.5 py-2 text-left last:border-0 hover:bg-stone-50">
           {/* eslint-disable-next-line @next/next/no-img-element */}
           {l.images?.[0] ? <img src={l.images[0]} alt="" className="h-8 w-8 rounded object-cover" /> : <div className="h-8 w-8 rounded bg-stone-100" />}
           <span className="truncate text-[12.5px] text-stone-700">{l.title}</span>
          </button>
         ))}
        </div>
       )}
      </div>
     </section>

     {appt.customerEmail && (
      <section>
       <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Follow up</p>
       {sent ? (
        <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-emerald-700"><Check size={14} /> Sent to {sent}.</p>
       ) : (
        <>
         <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
          placeholder={`Hi ${appt.customerName || "there"}, lovely to see you — the pieces you looked at are below if you'd like any of them.`}
          className="mt-2 w-full resize-y rounded-lg border border-stone-200 px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:border-stone-400" />
         <p className="mt-1 text-[11.5px] text-stone-400">Everything noted above goes with it, with prices.</p>
         <TechButton className="mt-2" onClick={sendFollowUp} disabled={busy || !note.trim()}><Mail size={13} /> Send</TechButton>
         {err && <p className="mt-1.5 text-[12px] text-rose-600" role="alert">{err}</p>}
        </>
       )}
      </section>
     )}

     {history.length > 0 && (
      <section>
       <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Been in before</p>
       <div className="mt-2 space-y-1.5">
        {history.map((h) => (
         <div key={h.id} className="flex items-center justify-between gap-3 rounded-lg bg-stone-50 px-3 py-2">
          <span className="truncate text-[12.5px] text-stone-700">{longDay(h.day)}</span>
          <StatusPill tone={h.status === "attended" ? "live" : h.status === "no-show" ? "down" : "neutral"}>{h.status}</StatusPill>
         </div>
        ))}
       </div>
      </section>
     )}

     {appt.status === "booked" && (
      <section className="border-t border-stone-100 pt-4">
       <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">On the day</p>
       <div className="flex gap-2">
        <TechButton variant="secondary" onClick={() => mark("attended")} disabled={busy}>They came</TechButton>
        <TechButton variant="ghost" onClick={() => mark("no-show")} disabled={busy}>No-show</TechButton>
       </div>
      </section>
     )}
    </div>
   </div>
  </div>
 );
}
