"use client";

import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import { AdminHeader, TechCard, TechButton, StatusPill, Toggle, cn } from "../../ui";
import { authorityFor } from "@/app/lib/tax-authorities";

// Sales tax. VYA calculates nothing: storefront sales are direct charges on the
// store's own Stripe account, so they're merchant of record and the
// registrations, collection and filing are theirs. This page explains that
// honestly and points them at the one place the work actually happens.

type TaxState = {
 enabled: boolean;
 productTaxCode: string | null;
 payoutsReady: boolean;
 stripeTaxActive: boolean;
 registrations: number;
};

export default function TaxSettingsPage() {
 const [s, setS] = useState<TaxState | null>(null);
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState<string | null>(null);

 useEffect(() => {
  let active = true;
  (async () => {
   try {
    const r = await fetch("/api/store/tax");
    const d = await r.json();
    if (active && r.ok) setS(d);
   } catch { /* leave the page empty rather than half-true */ }
  })();
  return () => { active = false; };
 }, []);

 async function toggle(next: boolean) {
  setBusy(true); setErr(null);
  const r = await fetch("/api/store/tax", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) setErr(d.error || "Couldn't save that.");
  else setS((x) => (x ? { ...x, enabled: d.enabled } : x));
  setBusy(false);
 }

 if (!s) return <><div className="py-24 text-center text-[13px] text-stone-400">Loading…</div></>;

 // Three states worth telling apart, because the fix is different in each.
 const collecting = s.enabled && s.stripeTaxActive && s.registrations > 0;
 const readyNoRegs = s.enabled && s.stripeTaxActive && s.registrations === 0;

 return (
  <div className="max-w-2xl">
   <AdminHeader
    eyebrow="Store · Settings"
    title="Sales tax"
    subtitle="Charged at checkout and paid to you, so you can file it. You sell as yourself, so the tax is yours to collect and remit — VYA never touches it."
   />

   <TechCard className="p-5">
    <div className="flex items-start justify-between gap-4">
     <div className="min-w-0">
      <p className="text-[13.5px] font-medium text-stone-800">Collect sales tax at checkout</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-stone-500">
       On by default, and safe to leave on: tax is only ever charged where you&apos;ve registered.
       In every other state nothing is added, because you can&apos;t collect tax you aren&apos;t registered for.
      </p>
     </div>
     <Toggle on={s.enabled} onClick={() => !busy && toggle(!s.enabled)} />
    </div>
    {err && <p className="mt-3 text-[12px] text-rose-600">{err}</p>}
   </TechCard>

   <TechCard className="mt-4 p-5">
    <div className="mb-3 flex items-center gap-2">
     <Receipt size={15} className="text-stone-400" />
     <p className="text-[13px] font-medium text-stone-700">Where you&apos;re registered</p>
     <StatusPill tone={collecting ? "live" : readyNoRegs ? "pending" : "neutral"} dot>
      {collecting ? `Collecting in ${s.registrations} ${s.registrations === 1 ? "place" : "places"}` : readyNoRegs ? "Nothing registered yet" : "Not set up"}
     </StatusPill>
    </div>

    {!s.payoutsReady ? (
     <p className="text-[12.5px] leading-relaxed text-stone-600">
      Finish setting up payments first — tax is calculated on your own Stripe account, so there needs to be one.
     </p>
    ) : collecting ? (
     <p className="text-[12.5px] leading-relaxed text-stone-600">
      You&apos;re registered in {s.registrations} {s.registrations === 1 ? "jurisdiction" : "jurisdictions"}, and buyers there are charged
      the right rate automatically. Add or remove registrations in your Stripe dashboard, under Tax.
     </p>
    ) : (
     <div className="space-y-2 text-[12.5px] leading-relaxed text-stone-600">
      <p>
       Nothing is being charged yet. Sales tax starts with registering for a permit in the states where you owe it —
       usually your home state, plus anywhere you&apos;ve passed that state&apos;s sales threshold.
      </p>
      <p>
       Once you&apos;ve registered, add each one in Stripe under <span className="font-medium text-stone-800">Tax → Registrations</span>.
       Checkout picks them up straight away — nothing to change here.
      </p>
     </div>
    )}
   </TechCard>

   <TechCard className="mt-4 p-5">
    <p className="text-[13px] font-medium text-stone-700">How your pieces are taxed</p>
    <p className="mt-1 text-[12.5px] leading-relaxed text-stone-500">
     Each listing is taxed as what it actually is, from its category. That matters more here than in most shops:
     New York exempts clothing and footwear under $110, and Pennsylvania and New Jersey exempt most apparel outright —
     but none of that covers bags, jewellery or sunglasses, which stay taxable everywhere.
    </p>
    <div className="mt-3 grid gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-2">
     {[
      ["Clothing & footwear", "Exempt in some states"],
      ["Bags, wallets, luggage", "Always taxable"],
      ["Jewellery & watches", "Always taxable"],
      ["Sunglasses", "Always taxable"],
      ["Belts & scarves", "Treated as apparel"],
      ["Anything else", "Ordinary goods"],
     ].map(([what, how]) => (
      <div key={what} className="flex items-baseline justify-between gap-3 border-b border-stone-100 pb-1.5">
       <span className="text-stone-700">{what}</span>
       <span className="shrink-0 text-[11.5px] text-stone-400">{how}</span>
      </div>
     ))}
    </div>
    <p className="mt-3 text-[11.5px] text-stone-400">
     Categorise a piece correctly when you list it and the rest follows.
     {s.productTaxCode ? " This store overrides all of the above with a single code." : ""}
    </p>
   </TechCard>

   <Registrations />

   <p className={cn("mt-4 text-[11.5px] leading-relaxed text-stone-400")}>
    Tax collected is shown separately in Profit &amp; loss and in your orders export — it isn&apos;t revenue, it&apos;s held
    for the state until you file. VYA doesn&apos;t file on your behalf, and this isn&apos;t tax advice.
   </p>
  </div>
 );
}

type Reg = { id: string; country: string; state: string | null; status: string; activeFrom: string | null };
type Gap = { zone: string; label: string; suggest: string[] };

/**
 * Where this store is registered to collect, and where it's selling without being.
 *
 * The gap list is the reason this exists. A store can open shipping to Europe and never register
 * for VAT anywhere in it; Stripe then calculates nothing, every sale goes through clean, and the
 * liability builds up silently against the seller. Nobody finds out until a tax authority does.
 */
function Registrations() {
 const [regs, setRegs] = useState<Reg[]>([]);
 const [gaps, setGaps] = useState<Gap[]>([]);
 const [connected, setConnected] = useState(true);
 const [hasAddress, setHasAddress] = useState(true);
 const [loading, setLoading] = useState(true);
 const [country, setCountry] = useState("");
 const [state, setState] = useState("");
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState<string | null>(null);

 const load = async () => {
  const d = await fetch("/api/store/tax/registrations").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (d) { setRegs(d.registrations || []); setGaps(d.gaps || []); setConnected(d.connected !== false); setHasAddress(d.hasAddress !== false); }
  setLoading(false);
 };
 // The codebase's pattern for this: an async IIFE with an `active` guard, so nothing is set on a
 // component that has already unmounted and nothing is set synchronously inside the effect body.
 useEffect(() => {
  let active = true;
  (async () => {
   const d = await fetch("/api/store/tax/registrations").then((r) => (r.ok ? r.json() : null)).catch(() => null);
   if (!active) return;
   if (d) { setRegs(d.registrations || []); setGaps(d.gaps || []); setConnected(d.connected !== false); setHasAddress(d.hasAddress !== false); }
   setLoading(false);
  })();
  return () => { active = false; };
 }, []);

 async function add() {
  setBusy(true); setErr(null);
  const r = await fetch("/api/store/tax/registrations", {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ country: country.trim().toUpperCase(), state: state.trim().toUpperCase() || null }),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(false);
  if (!r || !r.ok) { setErr(r?.d?.error || "Couldn’t add that."); return; }
  setCountry(""); setState("");
  void load();
 }

 async function end(id: string) {
  setBusy(true);
  await fetch(`/api/store/tax/registrations?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
  setBusy(false);
  void load();
 }

 return (
  <TechCard className="mt-5 overflow-hidden">
   <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
    <h2 className="text-[13px] font-semibold text-stone-800">Where you’re registered</h2>
    {!loading && <span className="text-[12px] text-stone-400">{regs.length}</span>}
   </div>

   {gaps.length > 0 && (
    <div className="border-b border-amber-200 bg-amber-50 px-5 py-3">
     <p className="text-[12.5px] leading-relaxed text-amber-900">
      <b>You ship to {gaps.map((g) => g.label).join(", ")} without a registration there.</b> Those sales are
      going out with no tax charged. Whether you owe any depends on how much you sell into each country —
      worth checking with an accountant before it accumulates.
     </p>
     <p className="mt-2 text-[12px] leading-relaxed text-amber-900">
      {gaps.flatMap((g) => g.suggest).slice(0, 4).map((c, i, arr) => {
       const a = authorityFor(c, null);
       if (!a || a.kind !== "authority") return null;
       return (
        <span key={c}>
         <a href={a.authority.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{c} · {a.authority.authority}</a>
         {i < arr.length - 1 ? "  ·  " : ""}
        </span>
       );
      })}
     </p>
    </div>
   )}

   {loading ? (
    <p className="px-5 py-6 text-[13px] text-stone-400">Loading…</p>
   ) : !connected ? (
    <p className="px-5 py-6 text-[13px] text-stone-400">Connect payments first — registrations live on your Stripe account.</p>
   ) : (
    <>
     {regs.length > 0 && (
      <div className="divide-y divide-stone-100">
       {regs.map((r) => (
        <div key={r.id} className="flex items-center gap-3 px-5 py-3">
         <span className="font-mono text-[13px] text-stone-800">{r.country}{r.state ? ` · ${r.state}` : ""}</span>
         <span className="text-[11.5px] text-stone-400">{r.status}{r.activeFrom ? ` since ${r.activeFrom}` : ""}</span>
         {r.status !== "expired" && (
          <button onClick={() => end(r.id)} disabled={busy} className="ml-auto text-[12px] text-stone-400 hover:text-rose-600">End</button>
         )}
        </div>
       ))}
      </div>
     )}

     {!hasAddress ? (
      <div className="border-t border-stone-100 px-5 py-4">
       <p className="text-[13px] leading-relaxed text-stone-600">
        Add your ship-from address under <b>Shipping &amp; duties</b> first. Tax registrations are tied to
        where your store is based, and VYA sets that up with Stripe for you once it knows the address.
       </p>
      </div>
     ) : (
     <>
     <div className="flex flex-wrap items-end gap-2 border-t border-stone-100 px-5 py-4">
      <label className="text-[11px] text-stone-500">
       <span className="mb-1 block">Country</span>
       <input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))} placeholder="GB" className="w-16 rounded border border-stone-300 px-2 py-1 text-[13px] uppercase outline-none focus:border-stone-500" />
      </label>
      {country === "US" && (
       <label className="text-[11px] text-stone-500">
        <span className="mb-1 block">State</span>
        <input value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} placeholder="NY" className="w-16 rounded border border-stone-300 px-2 py-1 text-[13px] uppercase outline-none focus:border-stone-500" />
       </label>
      )}
      <TechButton onClick={add} disabled={busy || country.length !== 2}>Add registration</TechButton>
      {err && <span className="text-[12px] text-rose-700">{err}</span>}
     </div>
     {/* The step sellers actually get stuck on isn't this form — it's getting the number in the first
         place. Name the authority and link straight at it, as soon as we know which place she means. */}
     {(() => {
      const a = authorityFor(country, state);
      if (!a) return null;
      if (a.kind === "none") return <p className="px-5 pb-4 text-[12px] text-stone-500">{a.message} Nothing to register.</p>;
      return (
       <p className="px-5 pb-4 text-[12px] leading-relaxed text-stone-500">
        Don’t have one yet? {a.authority.what} comes from {a.authority.authority} —{" "}
        <a href={a.authority.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-stone-800">register here</a>.
        {a.authority.note ? ` ${a.authority.note}` : ""}
       </p>
      );
     })()}
     </>
     )}
     <p className="border-t border-stone-100 px-5 py-3 text-[11.5px] leading-relaxed text-stone-400">
      US registrations are per state. Everywhere else is country-wide. These are written straight to your
      Stripe account — VYA keeps no copy, so what you see here is what actually decides whether tax is charged.
     </p>
    </>
   )}
  </TechCard>
 );
}
