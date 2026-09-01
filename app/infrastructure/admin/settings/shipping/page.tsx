"use client";

import { useEffect, useState } from "react";
import { Truck, Globe, Check, Plug } from "lucide-react";
import { AdminHeader, TechCard, TechButton, StatusPill, cn } from "../../ui";

// Shipping: who pays for postage, and who pays customs duty.
//
// They read like the same question and behave completely differently. Postage is known the second
// the label is bought, so VYA buys it and settles up immediately. Duty is invoiced by the courier
// weeks later, in an amount nobody knew at purchase — so VYA won't carry it for a store, and
// "duties covered" is only offered once the store's own courier account is connected and the
// courier is billing THEM. That rule is enforced server-side (resolveDutyMode); this page's job is
// to make it legible rather than mysterious.

type DutyMode = "absorbed" | "collected" | "buyer_pays";
type ShipMode = "buyer_pays" | "store_pays" | "free_over";

type State = {
 mode: ShipMode;
 freeThresholdUsd: number | null;
 dutyMode: DutyMode;
 effectiveDutyMode: DutyMode;
 dutyDowngraded: boolean;
 carrierConnected: boolean;
 zones: ZoneConfig;
};

type ZoneId = "domestic" | "europe" | "north_america" | "rest_of_world";
type ZoneRate = { enabled: boolean; rates?: Record<string, number> };
type ZoneConfig = Partial<Record<ZoneId, ZoneRate>>;
type Tier = { id: string; label: string; priceCents: number; examples: string };

const ZONES: { id: ZoneId; label: string; blurb: string }[] = [
 { id: "domestic", label: "Your own country", blurb: "Always on — a store has to ship somewhere." },
 { id: "europe", label: "Europe", blurb: "The EEA and its near neighbours." },
 { id: "north_america", label: "North America", blurb: "United States, Canada, Mexico." },
 { id: "rest_of_world", label: "Rest of world", blurb: "Everywhere else — Australia, Japan, the Gulf." },
];

type CarrierDef = { type: string; label: string; ddp: boolean; fields: { key: string; label: string; hint?: string }[] };

const SHIP_MODES: { key: ShipMode; label: string; blurb: string }[] = [
 { key: "buyer_pays", label: "Buyer pays", blurb: "Shipping is added at checkout. The buyer's payment covers the label." },
 { key: "store_pays", label: "Free shipping — you absorb it", blurb: "Nothing charged at checkout. The label is billed to your card when you print it." },
 { key: "free_over", label: "Free over a threshold", blurb: "Buyer pays below your threshold, free at or above it." },
];

const DUTY_MODES: { key: DutyMode; label: string; blurb: string; needsCarrier: boolean }[] = [
 { key: "buyer_pays", label: "Buyer pays on delivery", blurb: "The courier bills your buyer before they hand the parcel over. Nothing to set up — but say so on your storefront, or it arrives as a surprise.", needsCarrier: false },
 { key: "absorbed", label: "You cover it, built into your prices", blurb: "Your buyer sees one number and is never billed again. You've marked duty into your prices and the courier bills you.", needsCarrier: true },
 { key: "collected", label: "You cover it, charged at checkout", blurb: "Duty is quoted as its own line at checkout. Same result for the buyer, itemised rather than hidden.", needsCarrier: true },
];

export default function ShippingSettingsPage() {
 const [s, setS] = useState<State | null>(null);
 const [carriers, setCarriers] = useState<CarrierDef[]>([]);
 const [tiers, setTiers] = useState<Tier[]>([]);
 const [shipConfigured, setShipConfigured] = useState(true);
 const [threshold, setThreshold] = useState("");
 const [busy, setBusy] = useState(false);
 const [msg, setMsg] = useState<string | null>(null);
 const [err, setErr] = useState<string | null>(null);

 const [connecting, setConnecting] = useState(false);
 const [carrierType, setCarrierType] = useState("");
 const [creds, setCreds] = useState<Record<string, string>>({});

 useEffect(() => {
  let active = true;
  (async () => {
   const [ship, carrier] = await Promise.all([
    fetch("/api/store/shipping").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("/api/store/shipping/carrier").then((r) => (r.ok ? r.json() : null)).catch(() => null),
   ]);
   if (!active) return;
   if (ship) {
    setS({
     mode: ship.mode, freeThresholdUsd: ship.freeThresholdUsd,
     dutyMode: ship.dutyMode, effectiveDutyMode: ship.effectiveDutyMode,
     dutyDowngraded: Boolean(ship.dutyDowngraded), carrierConnected: Boolean(ship.carrierConnected),
     zones: (ship.zones || {}) as ZoneConfig,
    });
    setTiers(ship.tiers || []);
    setThreshold(ship.freeThresholdUsd != null ? String(ship.freeThresholdUsd) : "");
   }
   if (carrier) { setCarriers(carrier.carriers || []); setShipConfigured(Boolean(carrier.configured)); }
  })();
  return () => { active = false; };
 }, []);

 async function save(next: Partial<State>) {
  if (!s) return;
  const merged = { ...s, ...next };
  setS(merged); setBusy(true); setErr(null); setMsg(null);
  const r = await fetch("/api/store/shipping", {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({
    mode: merged.mode,
    freeThresholdUsd: threshold === "" ? null : Number(threshold),
    dutyMode: merged.dutyMode,
    zones: merged.zones,
   }),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(false);
  if (!r || !r.ok) { setErr(r?.d?.error || "Couldn’t save that."); return; }
  setS({ ...merged, effectiveDutyMode: r.d.effectiveDutyMode ?? merged.dutyMode, dutyDowngraded: Boolean(r.d.dutyDowngraded) });
  setMsg("Saved.");
 }

 async function connect() {
  setBusy(true); setErr(null); setMsg(null);
  const r = await fetch("/api/store/shipping/carrier", {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ type: carrierType, credentials: creds }),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(false);
  if (!r || !r.ok) { setErr(r?.d?.error || "Couldn’t connect that account."); return; }
  setConnecting(false); setCreds({}); setCarrierType("");
  if (s) setS({ ...s, carrierConnected: true, effectiveDutyMode: s.dutyMode, dutyDowngraded: false });
  setMsg("Courier account connected.");
 }

 async function disconnect() {
  setBusy(true); setErr(null);
  await fetch("/api/store/shipping/carrier", { method: "DELETE" }).catch(() => null);
  setBusy(false);
  if (s) setS({ ...s, carrierConnected: false, effectiveDutyMode: "buyer_pays", dutyDowngraded: s.dutyMode !== "buyer_pays" });
  setMsg("Disconnected — you're back on VYA's rates.");
 }

 const chosen = carriers.find((c) => c.type === carrierType);

 return (
  <>
   <AdminHeader eyebrow="Settings" title="Shipping & duties" subtitle="Who pays to get the piece there, and who pays customs when it crosses a border." />

   {err && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700" role="alert">{err}</div>}
   {msg && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">{msg}</div>}

   {!s ? (
    <TechCard className="px-5 py-8 text-center text-[13px] text-stone-400">Loading…</TechCard>
   ) : (
    <>
     {/* ── postage ────────────────────────────────────────────────── */}
     <TechCard className="mb-5 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
       <Truck size={15} className="text-stone-400" />
       <h2 className="text-[13px] font-semibold text-stone-800">Who pays for shipping</h2>
      </div>
      <div className="divide-y divide-stone-100">
       {SHIP_MODES.map((m) => (
        <label key={m.key} className="flex cursor-pointer items-start gap-3 px-5 py-3.5 hover:bg-stone-50/60">
         <input type="radio" name="shipmode" checked={s.mode === m.key} onChange={() => save({ mode: m.key })} disabled={busy} className="mt-1" />
         <span className="min-w-0">
          <span className="block text-[13.5px] font-medium text-stone-800">{m.label}</span>
          <span className="block text-[12px] leading-relaxed text-stone-500">{m.blurb}</span>
          {m.key === "free_over" && s.mode === "free_over" && (
           <span className="mt-2 flex items-center gap-2">
            <span className="text-[12px] text-stone-500">Free at $</span>
            <input
             value={threshold}
             onChange={(e) => setThreshold(e.target.value.replace(/[^\d.]/g, ""))}
             onBlur={() => save({})}
             inputMode="decimal"
             className="w-24 rounded-md border border-stone-300 px-2 py-1 text-[13px] outline-none focus:border-stone-500"
            />
            <span className="text-[12px] text-stone-500">and above</span>
           </span>
          )}
         </span>
        </label>
       ))}
      </div>
      <p className="border-t border-stone-100 px-5 py-3 text-[11.5px] leading-relaxed text-stone-400">
       When you absorb shipping, the label is charged to your card on file the moment you print it — VYA
       doesn’t hold it against your payout. Add a card under Billing if you haven’t.
      </p>
     </TechCard>

     {/* ── where she ships ────────────────────────────────────────── */}
     <TechCard className="mb-5 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
       <Globe size={15} className="text-stone-400" />
       <h2 className="text-[13px] font-semibold text-stone-800">Where you ship</h2>
      </div>
      <div className="divide-y divide-stone-100">
       {ZONES.map((z) => {
        const cfg = s.zones[z.id] || { enabled: z.id === "domestic" };
        const locked = z.id === "domestic";
        return (
         <div key={z.id} className="px-5 py-3.5">
          <label className={cn("flex items-start gap-3", locked ? "cursor-default" : "cursor-pointer")}>
           <input
            type="checkbox"
            checked={Boolean(cfg.enabled) || locked}
            disabled={busy || locked}
            onChange={(e) => save({ zones: { ...s.zones, [z.id]: { ...cfg, enabled: e.target.checked } } })}
            className="mt-1"
           />
           <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium text-stone-800">{z.label}</span>
            <span className="block text-[12px] leading-relaxed text-stone-500">{z.blurb}</span>
           </span>
          </label>

          {(cfg.enabled || locked) && tiers.length > 0 && (
           <div className="mt-3 flex flex-wrap gap-3 pl-7">
            {tiers.map((t) => (
             <label key={t.id} className="text-[11px] text-stone-500">
              <span className="mb-1 block">{t.label}</span>
              <span className="flex items-center gap-1">
               <span className="text-stone-400">$</span>
               <input
                value={cfg.rates?.[t.id] != null ? String((cfg.rates[t.id] as number) / 100) : ""}
                placeholder={String(t.priceCents / 100)}
                onChange={(e) => {
                 const v = e.target.value.replace(/[^\d.]/g, "");
                 const next = { ...(cfg.rates || {}) };
                 if (v === "") delete next[t.id]; else next[t.id] = Math.round(Number(v) * 100);
                 setS({ ...s, zones: { ...s.zones, [z.id]: { ...cfg, enabled: true, rates: next } } });
                }}
                onBlur={() => save({})}
                inputMode="decimal"
                className="w-16 rounded border border-stone-300 px-1.5 py-1 text-[12px] tabular-nums outline-none focus:border-stone-500"
               />
              </span>
             </label>
            ))}
           </div>
          )}
         </div>
        );
       })}
      </div>
      <p className="border-t border-stone-100 px-5 py-3 text-[11.5px] leading-relaxed text-stone-400">
       Blank uses the standard price for that parcel size. A region you leave off isn’t priced at zero —
       shoppers there are told you don’t ship to them, rather than being sold something you can’t post.
      </p>
     </TechCard>

     {/* ── duty ───────────────────────────────────────────────────── */}
     <TechCard className="mb-5 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
       <Globe size={15} className="text-stone-400" />
       <h2 className="text-[13px] font-semibold text-stone-800">Customs duty on international orders</h2>
       {s.carrierConnected && <StatusPill tone="live">Own courier</StatusPill>}
      </div>

      {s.dutyDowngraded && (
       <div className="border-b border-amber-200 bg-amber-50 px-5 py-3">
        <p className="text-[12.5px] leading-relaxed text-amber-900">
         <b>Your buyers are still being billed for duty.</b> Covering it yourself needs your own courier
         account — until then VYA ships duty-unpaid, whatever is selected here. Don’t promise “duties
         covered” on your storefront yet.
        </p>
       </div>
      )}

      <div className="divide-y divide-stone-100">
       {DUTY_MODES.map((m) => {
        const locked = m.needsCarrier && !s.carrierConnected;
        return (
         <label key={m.key} className={cn("flex items-start gap-3 px-5 py-3.5", locked ? "cursor-not-allowed opacity-55" : "cursor-pointer hover:bg-stone-50/60")}>
          <input type="radio" name="dutymode" checked={s.dutyMode === m.key} onChange={() => !locked && save({ dutyMode: m.key })} disabled={busy || locked} className="mt-1" />
          <span className="min-w-0">
           <span className="block text-[13.5px] font-medium text-stone-800">
            {m.label}
            {locked && <span className="ml-2 text-[11px] font-normal text-stone-400">needs your own courier account</span>}
           </span>
           <span className="block text-[12px] leading-relaxed text-stone-500">{m.blurb}</span>
          </span>
         </label>
        );
       })}
      </div>

      <p className="border-t border-stone-100 px-5 py-3 text-[11.5px] leading-relaxed text-stone-400">
       Duty isn’t like postage. The courier invoices it weeks after the parcel goes, once customs has
       worked out what it owes — on a $760 dress it can be $190. VYA won’t carry that for you, so covering
       duty is only available once the courier is billing you directly.
      </p>
     </TechCard>

     {/* ── carrier account ────────────────────────────────────────── */}
     <TechCard className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
       <Plug size={15} className="text-stone-400" />
       <h2 className="text-[13px] font-semibold text-stone-800">Your courier account</h2>
      </div>

      {!shipConfigured ? (
       <p className="px-5 py-6 text-[13px] text-stone-400">Shipping isn’t switched on for VYA yet.</p>
      ) : s.carrierConnected ? (
       <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <Check size={15} className="text-emerald-600" />
        <p className="min-w-0 flex-1 text-[13px] text-stone-700">
         Connected. You ship on your own rates, and you can cover duty for your buyers.
        </p>
        <button onClick={disconnect} disabled={busy} className="text-[12px] text-stone-400 hover:text-rose-600">Disconnect</button>
       </div>
      ) : !connecting ? (
       <div className="px-5 py-4">
        <p className="mb-3 text-[13px] leading-relaxed text-stone-600">
         Connect a DHL, FedEx or UPS account and you ship on your own negotiated rates — and you can cover
         customs duty for your buyers instead of leaving them a bill at the door.
        </p>
        <TechButton onClick={() => setConnecting(true)}>Connect an account</TechButton>
       </div>
      ) : (
       <div className="px-5 py-4">
        <label className="mb-3 block">
         <span className="mb-1 block text-[12px] text-stone-500">Courier</span>
         <select
          value={carrierType}
          onChange={(e) => { setCarrierType(e.target.value); setCreds({}); }}
          className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-stone-500"
         >
          <option value="">Choose…</option>
          {carriers.map((c) => <option key={c.type} value={c.type}>{c.label}</option>)}
         </select>
        </label>

        {chosen?.fields.map((f) => (
         <label key={f.key} className="mb-3 block">
          <span className="mb-1 block text-[12px] text-stone-500">{f.label}</span>
          <input
           value={creds[f.key] ?? ""}
           onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))}
           placeholder={f.hint}
           className="w-full rounded-md border border-stone-300 px-2.5 py-2 text-[13px] outline-none focus:border-stone-500"
          />
         </label>
        ))}

        <div className="mt-4 flex flex-wrap items-center gap-2">
         <TechButton onClick={connect} disabled={busy || !carrierType}>{busy ? "Connecting…" : "Connect"}</TechButton>
         <button onClick={() => { setConnecting(false); setCreds({}); setCarrierType(""); }} className="text-[12px] text-stone-400 hover:text-stone-700">Cancel</button>
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-stone-400">
         These go straight to our shipping provider and are never stored by VYA. Postage and duty are
         billed by the courier to you, not through us.
        </p>
       </div>
      )}
     </TechCard>
    </>
   )}
  </>
 );
}
