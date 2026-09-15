"use client";

import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import { AdminHeader, TechCard, TechButton, TechButtonLink, StatusPill, Toggle, cn } from "../../ui";
import { Scale } from "lucide-react";
import { thresholdFor, unconfirmedNote, internationalNote } from "@/app/lib/tax-thresholds";
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
 /** Where the store is established, from its ship-from. Decides which threshold applies. */
 homeCountry?: string | null;
 /** Whether it posts outside its own country at all. */
 shipsAbroad?: boolean;
};

/** The rule for her country, stated rather than implied, with a way to check it. */
function WhetherYouNeedIt({ homeCountry, shipsAbroad }: { homeCountry?: string | null; shipsAbroad: boolean }) {
 const t = thresholdFor(homeCountry);
 return (
  <TechCard className="mb-4 p-5">
   <div className="flex items-center gap-2">
    <Scale size={15} className="text-stone-400" />
    <h2 className="text-[13px] font-semibold text-stone-800">Do you need to register?</h2>
   </div>

   {t ? (
    <>
     <p className="mt-2.5 text-[13px] leading-relaxed text-stone-700">
      Not until you pass <span className="font-semibold text-stone-900">{t.amount}</span> in sales
      over {t.period}. That is {t.authority}&rsquo;s {t.tax} threshold, not ours.
     </p>
     <p className="mt-1.5 text-[12.5px] leading-relaxed text-stone-500">{t.note}</p>
     <p className="mt-2.5 text-[12px] text-stone-400">
      <a href={t.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-stone-700">
       Check it with {t.authority}
      </a>
      {" · "}we last confirmed this figure on {new Date(t.asOf).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
     </p>
    </>
   ) : (
    <p className="mt-2.5 max-w-[64ch] text-[13px] leading-relaxed text-stone-600">
     {unconfirmedNote(homeCountry)}
     {!homeCountry && " Add your ship-from address under Shipping and duties and we can be more specific."}
    </p>
   )}

   {/* Only for a store that actually posts abroad. For one that doesn't, it is a paragraph about
       a situation she is not in. */}
   {shipsAbroad && (
    <p className="mt-3 rounded-lg bg-stone-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-stone-600">
     {internationalNote()}
    </p>
   )}

   {/* WHOSE IT IS. Not a disclaimer at the bottom of a page: the seller is merchant of record on
       VYA, the charge goes to her own Stripe account and the order is in her name, so every
       registration is hers. Left unsaid, a seller reasonably assumes the platform handles it. */}
   <p className="mt-3 text-[12px] leading-relaxed text-stone-500">
    <span className="font-medium text-stone-700">These registrations are yours, not VYA&rsquo;s.</span>{" "}
    You are the seller on every order: the payment goes to your own account and your name is on the
    receipt. VYA calculates and collects what your registrations say to, and never holds it.
   </p>
   <p className="mt-2 text-[11.5px] leading-relaxed text-stone-400">
    This is where the rule is written down, not advice about your business. If you are near the
    line, ask an accountant.
   </p>
  </TechCard>
 );
}

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
    subtitle="Sales tax is added at checkout and paid to you with the order. You file it yourself. VYA never holds it."
   />

   {/* DO YOU EVEN NEED TO REGISTER?
       
       The page offered a registration form and never said whether she needed one. A seller had no
       way to learn from us that a threshold exists, what it is, or that crossing it is her job. The
       honest answer is not advice: it is the number, whose number it is, and the page that governs
       it. Every figure here was checked against the authority itself and carries the date, so a
       stale one is visible rather than quietly trusted (tax-thresholds.ts). */}
   <WhetherYouNeedIt homeCountry={s.homeCountry} shipsAbroad={Boolean(s.shipsAbroad)} />

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
     // A SENTENCE THAT NAMED A TASK AND OFFERED NO WAY TO DO IT. Twice on this page, in fact, and in
     // both places the next step was a screen the seller then had to go and find. Say it, then open it.
     <div className="text-[12.5px] leading-relaxed text-stone-600">
      <p>Set up payments first. Tax is worked out on your own Stripe account, so there has to be one.</p>
      <TechButtonLink href="/admin/settings/payments" className="mt-3 inline-flex">Set up payments</TechButtonLink>
     </div>
    ) : collecting ? (
     <p className="text-[12.5px] leading-relaxed text-stone-600">
      You&apos;re registered in {s.registrations} {s.registrations === 1 ? "jurisdiction" : "jurisdictions"}, and buyers there are charged
      the right rate automatically. Add or remove registrations in your Stripe dashboard, under Tax.
     </p>
    ) : (
     <div className="space-y-2 text-[12.5px] leading-relaxed text-stone-600">
      <p>
       Nothing is being charged yet. Sales tax starts with registering for a permit in the states where you owe it,
       usually your home state, plus anywhere you&apos;ve passed that state&apos;s sales threshold.
      </p>
      <p>
       Once you&apos;ve registered, add each one in Stripe under <span className="font-medium text-stone-800">Tax → Registrations</span>.
       Checkout picks them up straight away. Nothing to change here.
      </p>
     </div>
    )}
   </TechCard>

   {/* TAXED BY CATEGORY, in one line.
       
       This was a paragraph about New York's $110 clothing threshold, Pennsylvania and New Jersey,
       then a six-row table of categories and how each is treated. All true, none of it a decision
       the seller makes here. She chooses a category when she lists a piece, and everything else
       follows from Stripe's own rules. Reference material shown as if it needed reading. */}
   <TechCard className="mt-4 p-5">
    <p className="text-[13px] font-medium text-stone-700">Taxed by category</p>
    <p className="mt-1 text-[12.5px] leading-relaxed text-stone-500">
     Each piece is taxed as what it is. Clothing is exempt in some states, bags and jewellery are taxable
     everywhere. Categorise a piece correctly when you list it and the rest follows.
    </p>
   </TechCard>

   <Registrations />

   <p className={cn("mt-4 text-[11.5px] leading-relaxed text-stone-400")}>
    Tax collected is shown separately in Profit &amp; loss and in your orders export. It isn&apos;t revenue, it&apos;s held
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
      going out with no tax charged. Whether you owe any depends on how much you sell into each country,
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
    <div className="px-5 py-6">
     <p className="text-[13px] text-stone-500">Set up payments first, where you&apos;re registered lives on your own Stripe account.</p>
     <TechButtonLink href="/admin/settings/payments" className="mt-3 inline-flex">Set up payments</TechButtonLink>
    </div>
   ) : (
    <>
     {regs.length > 0 && (
      <div className="divide-y divide-stone-100">
       {regs.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
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
     {/* The step sellers actually get stuck on isn't this form. It's getting the number in the first
         place. Name the authority and link straight at it, as soon as we know which place she means. */}
     {(() => {
      const a = authorityFor(country, state);
      if (!a) return null;
      if (a.kind === "none") return <p className="px-5 pb-4 text-[12px] text-stone-500">{a.message} Nothing to register.</p>;
      return (
       <p className="px-5 pb-4 text-[12px] leading-relaxed text-stone-500">
        Don’t have one yet? {a.authority.what} comes from {a.authority.authority}: {" "}
        <a href={a.authority.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-stone-800">register here</a>.
        {a.authority.note ? ` ${a.authority.note}` : ""}
       </p>
      );
     })()}
     </>
     )}
     <p className="border-t border-stone-100 px-5 py-3 text-[11.5px] leading-relaxed text-stone-400">
      US registrations are per state. Everywhere else is country-wide. These are written straight to your
      Stripe account: VYA keeps no copy, so what you see here is what actually decides whether tax is charged.
     </p>
    </>
   )}
  </TechCard>
 );
}
