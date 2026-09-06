"use client";

import { useEffect, useState } from "react";
import { missingShipFrom, describeMissing } from "@/app/lib/ship-from-core";
import { MapPin, Store as StoreIcon } from "lucide-react";
import { AdminHeader, TechCard, TechButton, StatusPill, cn } from "../../ui";

// The store's addresses, in one place.
//
// These were three separate ideas that are really one: the address parcels leave FROM, the address
// buyers collect FROM, and the place Market Mode sells at. Ship-from and collect-from lived in a
// tab inside General, which is why nobody found them — and ship-from is required before a label can
// be bought or a tax registration added, so a store that never found it was blocked twice over
// without being told why.

type Addr = { name?: string; street1?: string; street2?: string; city?: string; state?: string; zip?: string; country?: string; phone?: string };
type Pickup = { enabled: boolean; address: Addr; instructions: string | null } | null;

const LINE: { key: keyof Addr; label: string; wide?: boolean }[] = [
 { key: "street1", label: "Street address", wide: true },
 { key: "street2", label: "Apt, suite (optional)", wide: true },
 { key: "city", label: "City" },
 { key: "state", label: "State / region" },
 { key: "zip", label: "Postcode" },
 { key: "country", label: "Country (2 letters)" },
];

export default function LocationsPage() {
 const [from, setFrom] = useState<Addr>({});
 const [pickup, setPickup] = useState<Pickup>(null);
 const [loading, setLoading] = useState(true);
 const [busy, setBusy] = useState(false);
 const [msg, setMsg] = useState<string | null>(null);
 const [err, setErr] = useState<string | null>(null);
 // Arrived here from "Connect eBay": eBay won't publish without somewhere to ship from, so the
 // connect route sends her here first rather than failing after she's signed in.
 const [why, setWhy] = useState<string | null>(null);
 useEffect(() => {
  let active = true;
  (async () => {
   const need = new URLSearchParams(window.location.search).get("need");
   if (!active || need !== "ebay") return;
   setWhy("eBay needs to know where your pieces ship from before it can list them. Add it here and you’ll go straight back to connecting.");
  })();
  return () => { active = false; };
 }, []);

 useEffect(() => {
  let active = true;
  (async () => {
   const d = await fetch("/api/store/shipping").then((r) => (r.ok ? r.json() : null)).catch(() => null);
   if (!active) return;
   if (d) { setFrom(d.shipFrom || {}); setPickup(d.pickup ?? null); }
   setLoading(false);
  })();
  return () => { active = false; };
 }, []);

 async function save() {
  setBusy(true); setErr(null); setMsg(null);
  // Only the address fields — the shipping API merges, so this can't disturb zones or duty.
  const r = await fetch("/api/store/shipping", {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({
    shipFrom: from,
    pickup: pickup?.enabled
     ? { enabled: true, ...pickup.address, instructions: pickup.instructions }
     : { enabled: false },
   }),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(false);
  if (!r || !r.ok) { setErr(r?.d?.error || "Couldn’t save that."); return; }
  setMsg("Saved.");
 }

 const setA = (k: keyof Addr, v: string) => setFrom((a) => ({ ...a, [k]: v }));
 const setP = (k: keyof Addr, v: string) => setPickup((p) => ({ enabled: true, instructions: p?.instructions ?? null, address: { ...(p?.address ?? {}), [k]: v } }));
 // Same rule publishing uses — this page used to call an address complete without a state or
 // postcode, then publishing refused it, which is a maddening thing to be told twice.
 const missing = missingShipFrom(from);
 const complete = missing.length === 0;

 return (
  <>
   <AdminHeader eyebrow="Settings" title="Locations" subtitle="The address you post from, and anywhere buyers can collect in person." />
   {why && (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
     {why}
     <a href="/api/store/cross-listing/ebay/connect" className="ml-auto shrink-0 font-semibold underline underline-offset-2">Back to eBay</a>
    </div>
   )}
   {err && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700" role="alert">{err}</div>}
   {msg && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">{msg}</div>}

   {loading ? (
    <TechCard className="px-5 py-8 text-center text-[13px] text-stone-400">Loading…</TechCard>
   ) : (
    <>
     <TechCard className="mb-5 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
       <MapPin size={15} className="text-stone-400" />
       <h2 className="text-[13px] font-semibold text-stone-800">Ship from</h2>
       {complete ? <StatusPill tone="live">Set</StatusPill> : <StatusPill tone="pending">Needed</StatusPill>}
      </div>
      {!complete && (
       <p className="border-b border-stone-100 bg-amber-50 px-5 py-2.5 text-[12.5px] text-amber-900">
        Add your {describeMissing(missing)} — carriers need all of it before you can publish a live listing or print a label.
       </p>
      )}
      {!complete && (
       <p className="border-b border-stone-100 bg-amber-50 px-5 py-3 text-[12.5px] leading-relaxed text-amber-900">
        Shipping labels and tax registrations both need this before they’ll work.
       </p>
      )}
      <div className="grid grid-cols-2 gap-4 px-5 py-5 max-sm:grid-cols-1">
       <label className="col-span-2 max-sm:col-span-1">
        <span className="mb-1 block text-[12px] font-medium text-stone-700">Name on the parcel</span>
        <input value={from.name ?? ""} onChange={(e) => setA("name", e.target.value)} className="w-full rounded-md border border-stone-300 px-2.5 py-2 text-[13px] outline-none focus:border-stone-500" />
       </label>
       {LINE.map((f) => (
        <label key={f.key} className={f.wide ? "col-span-2 max-sm:col-span-1" : ""}>
         <span className="mb-1 block text-[12px] font-medium text-stone-700">{f.label}</span>
         <input value={(from[f.key] as string) ?? ""} onChange={(e) => setA(f.key, e.target.value)} className="w-full rounded-md border border-stone-300 px-2.5 py-2 text-[13px] outline-none focus:border-stone-500" />
        </label>
       ))}
       <label className="col-span-2 max-sm:col-span-1">
        <span className="mb-1 block text-[12px] font-medium text-stone-700">Phone</span>
        <input value={from.phone ?? ""} onChange={(e) => setA("phone", e.target.value)} inputMode="tel" className="w-full rounded-md border border-stone-300 px-2.5 py-2 text-[13px] outline-none focus:border-stone-500" />
        <span className="mt-1 block text-[11.5px] text-stone-400">Couriers require one on international parcels.</span>
       </label>
      </div>
     </TechCard>

     <TechCard className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
       <StoreIcon size={15} className="text-stone-400" />
       <h2 className="text-[13px] font-semibold text-stone-800">Collect in store</h2>
      </div>
      <label className="flex cursor-pointer items-start gap-3 px-5 py-4">
       <input
        type="checkbox"
        checked={Boolean(pickup?.enabled)}
        onChange={(e) => setPickup(e.target.checked ? { enabled: true, address: pickup?.address ?? {}, instructions: pickup?.instructions ?? null } : null)}
        className="mt-1"
       />
       <span>
        <span className="block text-[13.5px] font-medium text-stone-800">Let buyers collect instead of posting</span>
        <span className="block text-[12px] leading-relaxed text-stone-500">They pick it at checkout, pay no shipping, and you print no label.</span>
       </span>
      </label>

      {pickup?.enabled && (
       <div className={cn("grid grid-cols-2 gap-4 border-t border-stone-100 px-5 py-5 max-sm:grid-cols-1")}>
        {LINE.map((f) => (
         <label key={f.key} className={f.wide ? "col-span-2 max-sm:col-span-1" : ""}>
          <span className="mb-1 block text-[12px] font-medium text-stone-700">{f.label}</span>
          <input value={(pickup.address[f.key] as string) ?? ""} onChange={(e) => setP(f.key, e.target.value)} className="w-full rounded-md border border-stone-300 px-2.5 py-2 text-[13px] outline-none focus:border-stone-500" />
         </label>
        ))}
        <label className="col-span-2 max-sm:col-span-1">
         <span className="mb-1 block text-[12px] font-medium text-stone-700">When and how to collect</span>
         <textarea
          value={pickup.instructions ?? ""}
          onChange={(e) => setPickup({ ...pickup, instructions: e.target.value })}
          rows={3}
          placeholder="Thursday–Saturday, 11–6. Ring the bell on the left."
          className="w-full resize-y rounded-md border border-stone-300 px-2.5 py-2 text-[13px] outline-none focus:border-stone-500"
         />
         <span className="mt-1 block text-[11.5px] text-stone-400">Sent to the buyer with their order confirmation.</span>
        </label>
       </div>
      )}

      <div className="border-t border-stone-100 px-5 py-3.5">
       <TechButton onClick={save} disabled={busy}>{busy ? "Saving…" : "Save locations"}</TechButton>
      </div>
     </TechCard>
    </>
   )}
  </>
 );
}
