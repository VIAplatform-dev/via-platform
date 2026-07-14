"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, PageHeader, Button, Input, Field, cn } from "../ui";

type ShipFrom = { name?: string; street1?: string; street2?: string; city?: string; state?: string; zip?: string; country?: string; phone?: string };
type ShipMode = "buyer_pays" | "store_pays" | "free_over";

type Brief = {
 pricing: { stance: string; targetPct: string; goal: string; notes: string };
 voice: { tone: string; rules: string[]; notes: string };
 about: string;
};
const EMPTY_BRIEF: Brief = { pricing: { stance: "", targetPct: "", goal: "", notes: "" }, voice: { tone: "", rules: [], notes: "" }, about: "" };

const STANCES: [string, string, string][] = [
 ["value", "Value — below market", "Priced to move; undercut comparable listings."],
 ["market", "At market", "Match the going rate from comps."],
 ["slight_premium", "Slight premium", "About 10% above market for your curation."],
 ["premium", "Premium", "About 25% above — a destination store."],
 ["custom", "Custom", "Set your own target vs. market."],
];
const GOALS: [string, string][] = [["margin", "Maximize margin"], ["balanced", "Balanced"], ["velocity", "Move fast"]];
const TONES = ["Polished & editorial", "Warm & personal", "Minimal & factual", "Playful & fun"];
const RULES = ["No emojis", "Lead with the era or year", "Keep it short (≤3 sentences)", "Always note flaws & condition", "Include measurements"];

const ACCENT = "#5D0F17";
const ta = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-[13px] text-stone-900 placeholder:text-stone-400 outline-none transition focus:border-stone-400 focus:ring-2 focus:ring-stone-900/[0.06]";

export default function SettingsPage() {
 const [tab, setTab] = useState<"brief" | "pricing" | "shipping">("brief");

 // Pricing floor
 const [pct, setPct] = useState("");
 const [pBusy, setPBusy] = useState(false);
 const [pSaved, setPSaved] = useState(false);

 // Store brief
 const [b, setB] = useState<Brief>(EMPTY_BRIEF);
 const [bBusy, setBBusy] = useState(false);
 const [bSaved, setBSaved] = useState(false);

 // Shipping
 const [mode, setMode] = useState<ShipMode>("buyer_pays");
 const [threshold, setThreshold] = useState("");
 const [from, setFrom] = useState<ShipFrom>({ country: "US" });
 const [sBusy, setSBusy] = useState(false);
 const [sSaved, setSSaved] = useState(false);
 const [sErr, setSErr] = useState<string | null>(null);

 useEffect(() => {
 fetch("/api/store/pricing").then((r) => (r.ok ? r.json() : null)).then((d) => d && setPct(String(d.minMarkupPct))).catch(() => {});
 fetch("/api/store/brief").then((r) => (r.ok ? r.json() : null)).then((d) => {
  const x = d?.brief;
  if (!x) return;
  setB({
  pricing: { stance: x.pricing?.stance || "", targetPct: x.pricing?.targetPct != null ? String(x.pricing.targetPct) : "", goal: x.pricing?.goal || "", notes: x.pricing?.notes || "" },
  voice: { tone: x.voice?.tone || "", rules: Array.isArray(x.voice?.rules) ? x.voice.rules : [], notes: x.voice?.notes || "" },
  about: x.about || "",
  });
 }).catch(() => {});
 fetch("/api/store/shipping").then((r) => (r.ok ? r.json() : null)).then((d) => {
  if (!d) return;
  setMode(d.mode || "buyer_pays");
  setThreshold(d.freeThresholdUsd != null ? String(d.freeThresholdUsd) : "");
  setFrom(d.shipFrom || { country: "US" });
 }).catch(() => {});
 }, []);

 async function savePricing() {
 setPBusy(true); setPSaved(false);
 await fetch("/api/store/pricing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minMarkupPct: Number(pct) || 0 }) }).catch(() => {});
 setPBusy(false); setPSaved(true);
 }

 async function saveBrief() {
 setBBusy(true); setBSaved(false);
 const payload = {
  pricing: {
  stance: b.pricing.stance,
  targetPct: b.pricing.stance === "custom" && b.pricing.targetPct !== "" ? Number(b.pricing.targetPct) : null,
  goal: b.pricing.goal,
  notes: b.pricing.notes,
  },
  voice: { tone: b.voice.tone, rules: b.voice.rules, notes: b.voice.notes },
  about: b.about,
 };
 await fetch("/api/store/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief: payload }) }).catch(() => {});
 setBBusy(false); setBSaved(true);
 }

 // brief state helpers
 const setP = (k: keyof Brief["pricing"], v: string) => { setB((s) => ({ ...s, pricing: { ...s.pricing, [k]: v } })); setBSaved(false); };
 const setV = (k: "tone" | "notes", v: string) => { setB((s) => ({ ...s, voice: { ...s.voice, [k]: v } })); setBSaved(false); };
 const toggleRule = (r: string) => { setB((s) => ({ ...s, voice: { ...s.voice, rules: s.voice.rules.includes(r) ? s.voice.rules.filter((x) => x !== r) : [...s.voice.rules, r] } })); setBSaved(false); };

 async function saveShipping() {
 setSBusy(true); setSSaved(false); setSErr(null);
 const need = ["street1", "city", "state", "zip"] as const;
 if (need.some((k) => !(from[k] || "").trim())) { setSErr("Add a full ship-from address (street, city, state, zip)."); setSBusy(false); return; }
 const r = await fetch("/api/store/shipping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, freeThresholdUsd: threshold === "" ? null : Number(threshold), shipFrom: from }) }).catch(() => null);
 if (r && r.ok) setSSaved(true); else setSErr("Couldn’t save.");
 setSBusy(false);
 }

 const setF = (k: keyof ShipFrom, v: string) => { setFrom((f) => ({ ...f, [k]: v })); setSSaved(false); };

 return (
 <div className="mx-auto max-w-2xl px-6 py-10 sm:px-8">
  <PageHeader title="Settings" subtitle="How VYA prices and writes for you, plus your pricing floor and shipping." />

  {/* Tabs */}
  <div className="mb-6 flex gap-5 border-b border-stone-200">
  {([["brief", "How VYA works"], ["pricing", "Pricing floor"], ["shipping", "Shipping"]] as const).map(([k, lbl]) => (
   <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 pb-2.5 text-[13px] font-medium transition ${tab === k ? "border-[#5D0F17] text-[#5D0F17]" : "border-transparent text-stone-400 hover:text-stone-600"}`}>{lbl}</button>
  ))}
  </div>

  {/* Store brief — what the owner tells VYA */}
  {tab === "brief" && (
  <Card className="mb-5">
  <CardHeader title="How VYA should work for you" subtitle="VYA already learns your pricing and voice from your catalog. This is where you steer it — what you say here takes priority." />
  <div className="space-y-6 px-5 py-4">

   {/* Pricing stance */}
   <div>
   <p className="mb-2 text-[13px] font-medium text-stone-700">How you price</p>
   <div className="space-y-2">
    {STANCES.map(([val, title, desc]) => (
    <label key={val} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3 transition", b.pricing.stance === val ? "border-[#5D0F17] bg-[#5D0F17]/[0.03]" : "border-stone-200 hover:border-stone-300")}>
     <input type="radio" name="stance" checked={b.pricing.stance === val} onChange={() => setP("stance", val)} className="mt-0.5 accent-[#5D0F17]" style={{ accentColor: ACCENT }} />
     <span><span className="text-[13px] font-medium text-stone-900">{title}</span><br /><span className="text-xs text-stone-500">{desc}</span></span>
    </label>
    ))}
   </div>
   {b.pricing.stance === "custom" && (
    <div className="mt-2 flex items-center gap-2">
    <span className="text-[13px] text-stone-500">Target</span>
    <div className="w-20"><Input value={b.pricing.targetPct} onChange={(e) => setP("targetPct", e.target.value.replace(/[^0-9.-]/g, ""))} inputMode="decimal" placeholder="15" /></div>
    <span className="text-[13px] text-stone-500">% vs. market (use a minus for below)</span>
    </div>
   )}
   </div>

   {/* Goal */}
   <div>
   <p className="mb-2 text-[13px] font-medium text-stone-700">Your goal</p>
   <div className="flex flex-wrap gap-2">
    {GOALS.map(([val, label]) => (
    <button key={val} type="button" onClick={() => setP("goal", b.pricing.goal === val ? "" : val)}
     className={cn("rounded-full border px-3 py-1.5 text-[13px] transition", b.pricing.goal === val ? "border-[#5D0F17] bg-[#5D0F17] text-white" : "border-stone-300 text-stone-600 hover:border-stone-400")}>
     {label}
    </button>
    ))}
   </div>
   </div>

   <Field label="Anything else about how you price (optional)">
   <textarea className={cn(ta, "min-h-[64px] resize-y")} value={b.pricing.notes} onChange={(e) => setP("notes", e.target.value)} maxLength={1000} placeholder="e.g. I go higher on archival designer pieces, and round to the nearest $5." />
   </Field>

   <div className="border-t border-stone-100 pt-5">
   <p className="mb-2 text-[13px] font-medium text-stone-700">How your listings should read</p>
   <div className="flex flex-wrap gap-2">
    {TONES.map((t) => (
    <button key={t} type="button" onClick={() => { setV("tone", b.voice.tone === t ? "" : t); }}
     className={cn("rounded-full border px-3 py-1.5 text-[13px] transition", b.voice.tone === t ? "border-[#5D0F17] bg-[#5D0F17] text-white" : "border-stone-300 text-stone-600 hover:border-stone-400")}>
     {t}
    </button>
    ))}
   </div>
   </div>

   <div>
   <p className="mb-2 text-[13px] font-medium text-stone-700">Rules to always follow</p>
   <div className="flex flex-wrap gap-2">
    {RULES.map((r) => (
    <button key={r} type="button" onClick={() => toggleRule(r)}
     className={cn("rounded-full border px-3 py-1.5 text-[13px] transition", b.voice.rules.includes(r) ? "border-[#5D0F17] bg-[#5D0F17]/[0.06] text-[#5D0F17]" : "border-stone-300 text-stone-600 hover:border-stone-400")}>
     {b.voice.rules.includes(r) ? "✓ " : ""}{r}
    </button>
    ))}
   </div>
   </div>

   <Field label="Voice notes (optional)">
   <textarea className={cn(ta, "min-h-[64px] resize-y")} value={b.voice.notes} onChange={(e) => setV("notes", e.target.value)} maxLength={1000} placeholder="e.g. Speak to the collector. Name the designer and the era, then the fit. Never oversell." />
   </Field>

   <Field label="About your store" hint="Who you are, what you carry, your goals — anything that helps VYA get it right.">
   <textarea className={cn(ta, "min-h-[80px] resize-y")} value={b.about} onChange={(e) => { setB((s) => ({ ...s, about: e.target.value })); setBSaved(false); }} maxLength={2000} placeholder="A line or two about your store, your buyers, and how you want to come across." />
   </Field>

   <div className="flex items-center gap-3">
   <Button onClick={saveBrief} disabled={bBusy}>{bBusy ? "Saving…" : "Save brief"}</Button>
   {bSaved && <span className="text-xs text-emerald-600">Saved ✓</span>}
   </div>
  </div>
  </Card>
  )}

  {/* Pricing floor */}
  {tab === "pricing" && (
  <Card className="mb-5">
  <CardHeader title="Pricing floor" subtitle="VYA never suggests below cost plus this markup. The market estimate can always go higher." />
  <div className="px-5 py-4">
   <Field label="Minimum markup over cost">
   <div className="flex items-center gap-2">
    <div className="w-24"><Input value={pct} onChange={(e) => { setPct(e.target.value.replace(/[^0-9.]/g, "")); setPSaved(false); }} inputMode="decimal" placeholder="30" /></div>
    <span className="text-[13px] text-stone-500">% minimum</span>
    <Button className="ml-auto" onClick={savePricing} disabled={pBusy}>{pBusy ? "Saving…" : "Save"}</Button>
    {pSaved && <span className="text-xs text-emerald-600">✓</span>}
   </div>
   </Field>
  </div>
  </Card>
  )}

  {/* Shipping */}
  {tab === "shipping" && (
  <Card>
  <CardHeader title="Shipping" />
  <div className="space-y-5 px-5 py-4">
   <Field label="Ship-from address">
   <div className="grid grid-cols-2 gap-2">
    <Input className="col-span-2" value={from.name || ""} onChange={(e) => setF("name", e.target.value)} placeholder="Name / store" />
    <Input className="col-span-2" value={from.street1 || ""} onChange={(e) => setF("street1", e.target.value)} placeholder="Street address" />
    <Input className="col-span-2" value={from.street2 || ""} onChange={(e) => setF("street2", e.target.value)} placeholder="Apt, suite (optional)" />
    <Input value={from.city || ""} onChange={(e) => setF("city", e.target.value)} placeholder="City" />
    <Input value={from.state || ""} onChange={(e) => setF("state", e.target.value)} placeholder="State" />
    <Input value={from.zip || ""} onChange={(e) => setF("zip", e.target.value)} placeholder="ZIP" />
    <Input value={from.country || "US"} onChange={(e) => setF("country", e.target.value)} placeholder="Country (US)" />
    <Input className="col-span-2" value={from.phone || ""} onChange={(e) => setF("phone", e.target.value)} placeholder="Phone (required by carriers)" inputMode="tel" />
   </div>
   </Field>

   <div>
   <p className="mb-2 text-[13px] font-medium text-stone-700">Who pays for shipping</p>
   <div className="space-y-2">
    {([
    ["buyer_pays", "Buyer pays", "Live rate shown at checkout, added to the buyer’s total."],
    ["store_pays", "Free shipping (you absorb it)", "No shipping at checkout; you cover the label cost."],
    ["free_over", "Free over a threshold", "Buyer pays below the amount, free at/above it."],
    ] as const).map(([m, title, desc]) => (
    <label key={m} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3 transition", mode === m ? "border-[#5D0F17] bg-[#5D0F17]/[0.03]" : "border-stone-200 hover:border-stone-300")}>
     <input type="radio" name="shipmode" checked={mode === m} onChange={() => { setMode(m); setSSaved(false); }} className="mt-0.5 accent-[#5D0F17]" style={{ accentColor: ACCENT }} />
     <span><span className="text-[13px] font-medium text-stone-900">{title}</span><br /><span className="text-xs text-stone-500">{desc}</span></span>
    </label>
    ))}
   </div>

   {mode === "free_over" && (
    <div className="mt-3 flex items-center gap-2">
    <span className="text-[13px] text-stone-500">Free shipping at $</span>
    <div className="w-24"><Input value={threshold} onChange={(e) => { setThreshold(e.target.value.replace(/[^0-9.]/g, "")); setSSaved(false); }} inputMode="decimal" placeholder="150" /></div>
    <span className="text-[13px] text-stone-500">and up</span>
    </div>
   )}
   </div>

   <div className="flex items-center gap-3">
   <Button onClick={saveShipping} disabled={sBusy}>{sBusy ? "Saving…" : "Save shipping"}</Button>
   {sSaved && <span className="text-xs text-emerald-600">Saved ✓</span>}
   {sErr && <span className="text-xs text-red-600">{sErr}</span>}
   </div>
  </div>
  </Card>
  )}

  <p className="mt-4 text-xs text-stone-400">You can also just tell the VYA agent — e.g. “price my archival pieces higher” or “free shipping over $150” — and it’ll set these for you.</p>
 </div>
 );
}
