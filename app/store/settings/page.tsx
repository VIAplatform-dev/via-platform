"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Card, CardHeader, PageHeader, Button, Input, Field, cn } from "../ui";
import { SHIPPING_TIERS } from "@/app/lib/shipping-tiers";

type ShipFrom = { name?: string; street1?: string; street2?: string; city?: string; state?: string; zip?: string; country?: string; phone?: string };
type ShipMode = "buyer_pays" | "store_pays" | "free_over";
type DnsRecord = { name?: string; type?: string; value?: string };
type SenderSettings = { fromName: string | null; replyTo: string | null; domain: string | null; sendingEmail: string | null; verified: boolean; dnsRecords: DnsRecord[] | null };
type SenderInfo = { fromName: string; fromAddress: string; replyTo?: string | null; verified?: boolean } | null;

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
 const [tab, setTab] = useState<"brief" | "pricing" | "shipping" | "sender">("brief");

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

 // Sender — email identity + (optional) own-domain authentication
 const [snd, setSnd] = useState<SenderSettings | null>(null);
 const [sender, setSender] = useState<SenderInfo>(null);
 const [fromName, setFromName] = useState("");
 const [replyTo, setReplyTo] = useState("");
 const [domain, setDomain] = useState("");
 const [eBusy, setEBusy] = useState<string | null>(null);
 const [eMsg, setEMsg] = useState<string | null>(null);
 const [copied, setCopied] = useState<string | null>(null);

 function applySender(d: { settings: SenderSettings; sender: SenderInfo; accountEmail?: string | null; storefrontDomain?: string | null }) {
 setSnd(d.settings); setSender(d.sender);
 setFromName(d.settings?.fromName || d.sender?.fromName || "");
 // Reply-to defaults to what they signed into VYA with, unless they've saved a different one.
 setReplyTo(d.settings?.replyTo || d.accountEmail || d.sender?.replyTo || "");
 // Pre-fill the domain field with the store's storefront domain (until they authenticate one).
 if (!d.settings?.domain && d.storefrontDomain) setDomain(d.storefrontDomain);
 }

 useEffect(() => {
 const t = new URLSearchParams(window.location.search).get("tab");
 if (t === "brief" || t === "pricing" || t === "shipping" || t === "sender") { const id = setTimeout(() => setTab(t), 0); void id; }
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
 fetch("/api/store/email-domain").then((r) => (r.ok ? r.json() : null)).then((d) => d && applySender(d)).catch(() => {});
 }, []);

 async function saveIdentity() {
 setEBusy("identity"); setEMsg(null);
 try {
  const r = await fetch("/api/store/email-domain", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromName, replyTo }) });
  const d = await r.json();
  if (r.ok) { applySender(d); setEMsg("Saved."); } else setEMsg(d.error || "Couldn’t save.");
 } catch { setEMsg("Couldn’t save."); }
 setEBusy(null);
 }
 async function addDomain() {
 setEBusy("domain"); setEMsg(null);
 try {
  const r = await fetch("/api/store/email-domain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain }) });
  const d = await r.json();
  if (r.ok) { setSnd(d.settings); setDomain(""); } else setEMsg(d.error || "Couldn’t add domain.");
 } catch { setEMsg("Couldn’t add domain."); }
 setEBusy(null);
 }
 async function verifyDomain() {
 setEBusy("verify"); setEMsg(null);
 try {
  const r = await fetch("/api/store/email-domain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify" }) });
  const d = await r.json();
  if (r.ok) { setSnd(d.settings); setSender(d.sender); setEMsg(d.verified ? "Verified — emails now send from your domain." : "Not verified yet — DNS can take a bit to propagate."); }
  else setEMsg(d.error || "Couldn’t verify.");
 } catch { setEMsg("Couldn’t verify."); }
 setEBusy(null);
 }
 async function copyDns(key: string, v: string) {
 try { await navigator.clipboard.writeText(v); setCopied(key); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500); } catch { /* ignore */ }
 }

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
  {([["brief", "How VYA works"], ["pricing", "Pricing floor"], ["shipping", "Shipping"], ["sender", "Email sender"]] as const).map(([k, lbl]) => (
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
  <CardHeader title="Shipping" subtitle="Buyers pay one clean flat rate by size — VYA buys the real carrier label and handles the rest." />
  <div className="space-y-5 px-5 py-4">
   <div>
   <p className="mb-1 text-[13px] font-medium text-stone-700">Flat rates</p>
   <p className="mb-3 text-xs text-stone-500">Each piece is auto-sized from its weight and dimensions — the buyer just sees one price. No live-rate math, no odd numbers.</p>
   <div className="grid grid-cols-3 gap-2">
    {SHIPPING_TIERS.map((t) => (
    <div key={t.id} className="rounded-lg border border-stone-200 bg-stone-50/60 p-3">
     <div className="flex items-baseline justify-between gap-1">
     <span className="text-[13px] font-semibold text-stone-900">{t.label}</span>
     <span className="text-[15px] font-semibold text-[#5D0F17]">${(t.priceCents / 100).toFixed(0)}</span>
     </div>
     <p className="mt-1 text-[11px] leading-snug text-stone-500">{t.examples}</p>
    </div>
    ))}
   </div>
   </div>

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
    ["buyer_pays", "Buyer pays", "The flat rate is added to the buyer’s total at checkout."],
    ["store_pays", "Free shipping (you absorb it)", "No shipping charged; you cover the label at fulfillment."],
    ["free_over", "Free over a threshold", "Buyer pays the flat rate below the amount, free at/above it."],
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

  {/* Email sender — the identity marketing emails send from (moved here from Marketing) */}
  {tab === "sender" && (
  <div className="space-y-5">
   <Card>
   <CardHeader title="Sender identity" subtitle="How your marketing emails send — the name customers see and where replies go. Used on every campaign & automation." />
   <div className="space-y-4 px-5 py-4">
    <Field label="From name"><Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your store name" /></Field>
    <Field label="Reply-to email" hint="Where customer replies land."><Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="you@yourstore.com" /></Field>
    <div className="flex flex-wrap items-center gap-3">
    <Button onClick={saveIdentity} disabled={eBusy === "identity"}>{eBusy === "identity" ? "Saving…" : "Save"}</Button>
    {sender && <span className="text-xs text-stone-500">Currently sends as <b className="text-stone-700">{sender.fromName}</b> &lt;{sender.fromAddress}&gt;</span>}
    </div>
   </div>
   </Card>

   <Card>
   <CardHeader title="Send from your own domain" subtitle="Authenticate your domain so emails send FROM your address — better trust & deliverability. Optional." />
   <div className="px-5 py-4">
    {snd?.verified ? (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
     <p className="text-[13px] font-medium text-emerald-800">✓ {snd.domain} is verified</p>
     <p className="mt-0.5 text-xs text-emerald-700">Emails now send from <b>{snd.sendingEmail}</b>.</p>
    </div>
    ) : snd?.domain ? (
    <>
     <p className="mb-3 text-[13px] text-stone-600">Add these records to <b>{snd.domain}</b>’s DNS (at your registrar), then verify.</p>
     <div className="overflow-x-auto rounded-lg border border-stone-200">
     <table className="w-full text-[12px]">
      <thead><tr className="border-b border-stone-200 bg-stone-50/60 text-left text-stone-500"><th className="px-3 py-1.5 font-medium">Type</th><th className="px-3 py-1.5 font-medium">Name</th><th className="px-3 py-1.5 font-medium">Value</th></tr></thead>
      <tbody>
      {(snd.dnsRecords || []).map((rec, i) => (
       <tr key={i} className="border-b border-stone-100 last:border-0">
       <td className="whitespace-nowrap px-3 py-1.5 font-mono text-stone-700">{rec.type}</td>
       <td className="px-3 py-1.5 font-mono text-stone-600"><span className="flex items-center gap-1"><span className="max-w-[130px] truncate">{rec.name}</span><button onClick={() => copyDns(`n${i}`, rec.name || "")} className="text-stone-300 hover:text-stone-600">{copied === `n${i}` ? <Check size={12} /> : <Copy size={12} />}</button></span></td>
       <td className="px-3 py-1.5 font-mono text-stone-600"><span className="flex items-center gap-1"><span className="max-w-[190px] truncate">{rec.value}</span><button onClick={() => copyDns(`v${i}`, rec.value || "")} className="text-stone-300 hover:text-stone-600">{copied === `v${i}` ? <Check size={12} /> : <Copy size={12} />}</button></span></td>
       </tr>
      ))}
      </tbody>
     </table>
     </div>
     <div className="mt-3 flex items-center gap-3">
     <Button onClick={verifyDomain} disabled={eBusy === "verify"}>{eBusy === "verify" ? "Checking…" : "Verify domain"}</Button>
     <span className="text-[11px] text-stone-400">DNS changes can take minutes to a few hours.</span>
     </div>
    </>
    ) : (
    <div className="flex flex-wrap items-end gap-2">
     <div className="flex-1"><Field label="Your domain"><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="yourstore.com" /></Field></div>
     <Button onClick={addDomain} disabled={eBusy === "domain" || !domain.trim()}>{eBusy === "domain" ? "Adding…" : "Authenticate"}</Button>
    </div>
    )}
    {eMsg && <p className="mt-3 text-xs text-stone-600">{eMsg}</p>}
    <p className="mt-3 text-[11px] text-stone-400">Until you authenticate a domain, emails send from your name via VYA’s shared sending domain — replies still route to you.</p>
   </div>
   </Card>
  </div>
  )}

  <p className="mt-4 text-xs text-stone-400">You can also just tell the VYA agent — e.g. “price my archival pieces higher” or “free shipping over $150” — and it’ll set these for you.</p>
 </div>
 );
}
