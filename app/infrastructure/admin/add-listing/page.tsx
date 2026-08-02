"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Sparkles, Tag } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, Toggle, cn } from "../ui";

type Field = { value: string | null; confidence: number };
type Draft = {
 title: string;
 description: string;
 brand: Field;
 era: Field;
 material: Field;
 condition: Field;
 conditionGrade: string | null;
 flaws: string[];
 category: string | null;
 searchQuery: string | null;
 careTag: string | null;
 runway: string | null;
 priceHint: number | null;
 parcel: { weightOz: number; lengthIn: number; widthIn: number; heightIn: number };
};
type Form = { title: string; brand: string; era: string; material: string; condition: string; size: string; category: string; price: string; cost: string; description: string; weightOz: string; lengthIn: string; widthIn: string; heightIn: string };
type Collection = { id: string; title: string; itemCount: number };
const BLANK: Form = { title: "", brand: "", era: "", material: "", condition: "", size: "", category: "", price: "", cost: "", description: "", weightOz: "", lengthIn: "", widthIn: "", heightIn: "" };

type Flag = { level: string; message: string; marketUsd: number; pct?: number };

// Client mirror of the server's computePriceFlag (works in whole dollars) — lets the flag update
// instantly as the seller edits the price, once we know the item's market value. No server call.
function flagFor(priceUsd: number, marketUsd: number | null, lowUsd: number | null, highUsd: number | null): Flag | null {
 if (!marketUsd || priceUsd <= 0) return null;
 const lo = lowUsd ?? Math.round(marketUsd * 0.85);
 const hi = highUsd ?? Math.round(marketUsd * 1.2);
 const pct = Math.round(((priceUsd - marketUsd) / marketUsd) * 100);
 if (priceUsd < lo) return { level: "under", pct, marketUsd, message: `About ${Math.abs(pct)}% below market — comparable pieces sit around $${marketUsd}. You could likely price higher.` };
 if (priceUsd > hi) return { level: "over", pct, marketUsd, message: `About ${pct}% above market (~$${marketUsd}) — expect a slower sale.` };
 return { level: "at", pct, marketUsd, message: `Right at market (~$${marketUsd}).` };
}

const RISKY = ["brand", "era", "material"] as const;
const THRESHOLD = 0.75;

const input = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-[13px] text-stone-900 placeholder:text-stone-400 outline-none transition focus:border-stone-400 focus:ring-2 focus:ring-stone-900/[0.06]";
const label = "mb-1.5 block text-[12px] font-medium text-stone-700";

// Build the Vogue Runway show URL from a runway match like "Roberto Cavalli F/W 2000"
// or "Tom Ford for Gucci S/S 2003". Falls back to a search if it can't parse cleanly.
function runwayShowUrl(runway: string): string {
 const low = runway.toLowerCase();
 const year = runway.match(/\b(19|20)\d{2}\b/)?.[0];
 const season = /(s\/s|\bss\b|spring|summer)/.test(low) ? "spring"
 : /(f\/w|a\/w|\bfw\b|\baw\b|fall|autumn|winter)/.test(low) ? "fall"
 : /(resort|cruise)/.test(low) ? "resort"
 : /pre-?fall/.test(low) ? "pre-fall" : "";
 const type = /couture/.test(low) ? "couture" : "ready-to-wear";
 // Designer = the fashion house: text after "for" (e.g. Tom Ford FOR Gucci), else the
 // whole string with season/year tokens stripped.
 const forIdx = low.indexOf(" for ");
 const designer = (forIdx >= 0 ? runway.slice(forIdx + 5) : runway)
 .replace(/\b(19|20)\d{2}\b/g, " ")
 .replace(/s\/s|f\/w|a\/w|p\/f/gi, " ")
 .replace(/\b(ss|fw|aw|pf|spring|summer|fall|autumn|winter|resort|cruise|couture|pre-?fall|ready-?to-?wear|rtw|menswear|runway|collection|show)\b/gi, " ")
 .replace(/[^a-z0-9]+/gi, " ")
 .trim();
 const slug = designer.toLowerCase().replace(/\s+/g, "-");
 if (year && season && slug) return `https://www.vogue.com/fashion-shows/${season}-${year}-${type}/${slug}`;
 return `https://www.google.com/search?q=${encodeURIComponent(`${runway} vogue runway`)}`;
}

// Google-Flights-style price scale: where the seller's price sits on the low→high
// resale range, with the AI's recommendation marked.
function PriceScale({ low, high, market, value }: { low: number; high: number; market: number | null; value: number }) {
 const span = Math.max(1, high - low);
 const pos = (v: number) => `${Math.max(0, Math.min(1, (v - low) / span)) * 100}%`;
 const mid = market ?? (low + high) / 2;
 const verdict = value <= 0 ? null
 : value < low * 0.98 ? { t: "Below market", c: "text-amber-600" }
 : value > high * 1.02 ? { t: "Above market", c: "text-red-600" }
 : market && Math.abs(value - market) / market < 0.06 ? { t: "Market rate", c: "text-emerald-600" }
 : value < mid ? { t: "Good value", c: "text-emerald-600" }
 : { t: "Premium", c: "text-stone-600" };
 return (
 <div className="mt-2">
 <div className="relative h-2 rounded-full" style={{ background: "linear-gradient(90deg,#10b98155,#f59e0b55,#ef444455)" }}>
 {market != null && <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-stone-900 shadow" style={{ left: pos(market) }} title={`AI rec $${market.toLocaleString()}`} />}
 {value > 0 && <div className="absolute -top-1 h-4 w-[3px] -translate-x-1/2 rounded bg-[var(--accent,#0e9f76)]" style={{ left: pos(value) }} title={`Your price $${value.toLocaleString()}`} />}
 </div>
 <div className="mt-1.5 flex items-center justify-between text-[10px] text-stone-400">
 <span>${low.toLocaleString()} <span className="text-stone-300">quick sale</span></span>
 {verdict && <span className={cn("font-semibold", verdict.c)}>{verdict.t}</span>}
 <span>${high.toLocaleString()} <span className="text-stone-300">top demand</span></span>
 </div>
 </div>
 );
}

export default function IntakePage() {
 const [phase, setPhase] = useState<"form" | "done">("form");
 const [photos, setPhotos] = useState<string[]>([]);
 const [runway, setRunway] = useState<string | null>(null);
 const [celebrity, setCelebrity] = useState<string | null>(null);
 const [ghost, setGhost] = useState<string | null>(null);
 const [busy, setBusy] = useState(false);
 const [busyMsg, setBusyMsg] = useState("");
 const [savedDraft, setSavedDraft] = useState(false);
 const [dragOver, setDragOver] = useState(false);
 const [err, setErr] = useState<string | null>(null);
 const [form, setForm] = useState<Form>(BLANK);
 const [flagged, setFlagged] = useState<string[]>([]);
 const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
 const [careTag, setCareTag] = useState<string | null>(null);
 const [reverseImage, setReverseImage] = useState<{ matches: number; brand: string | null; hits: number; sampleTitles: string[] } | null>(null);
 const [specificPiece, setSpecificPiece] = useState<{ model: string; similarity: number; era: string | null; source: string; refPriceCents: number | null } | null>(null);
 const [flaws, setFlaws] = useState<string[]>([]);
 const [promptVersion, setPromptVersion] = useState<string | null>(null);
 const [seoBusy, setSeoBusy] = useState(false);
 const [schedule, setSchedule] = useState(""); // datetime-local value for scheduled publish
 const [scheduledAt, setScheduledAt] = useState<string | null>(null); // set on the done screen
 const [cols, setCols] = useState<Collection[]>([]);
 const [selectedCols, setSelectedCols] = useState<string[]>([]);
 const [newCol, setNewCol] = useState("");
 const fileRef = useRef<HTMLInputElement>(null);
 const dragIdx = useRef<number | null>(null);
 const [markupPct, setMarkupPct] = useState<number | null>(null);
 const [aiDraft, setAiDraft] = useState<Record<string, string | null>>({});
 const [embedding, setEmbedding] = useState<number[] | null>(null);
 const [marketPrice, setMarketPrice] = useState<number | null>(null);
 const [rawMarketCents, setRawMarketCents] = useState<number | null>(null);
 const [priceNote, setPriceNote] = useState<string>("");
 const [priceLow, setPriceLow] = useState<number | null>(null);
 const [priceHigh, setPriceHigh] = useState<number | null>(null);
 const [priceFlag, setPriceFlag] = useState<Flag | null>(null);
 const [consigned, setConsigned] = useState(false);
 const [consignors, setConsignors] = useState<{ id: number; name: string; defaultSplitPct: number | null }[]>([]);
 const [consignCfg, setConsignCfg] = useState<{ storeDefaultSplitPct: number } | null>(null);
 const [consign, setConsign] = useState({ consignorId: "", split: "", expiresAt: "", newName: "" });

 // Load the store's markup-over-cost setting so entering cost auto-fills price; and
 // the store's collections for tagging.
 useEffect(() => {
 fetch("/api/store/pricing").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && typeof d.minMarkupPct === "number") setMarkupPct(d.minMarkupPct); }).catch(() => {});
 fetch("/api/store/collections").then((r) => (r.ok ? r.json() : null)).then((c) => c && setCols(c.collections || [])).catch(() => {});
 }, []);

 function set<K extends keyof Form>(k: K, v: string) {
 setForm((f) => ({ ...f, [k]: v }));
 if ((RISKY as readonly string[]).includes(k)) setConfirmed((c) => ({ ...c, [k]: true })); // editing = reviewed
 }

 function reorderPhoto(from: number, to: number) {
 if (from === to) return;
 setPhotos((ps) => { const a = [...ps]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a; });
 }

 // "Improve for search": rewrite the seller's own description to be SEO-natural, in their voice,
 // without inventing facts. Sends the current attributes so keywords are woven in truthfully.
 async function polishForSeo() {
 if (seoBusy) return;
 if (form.description.trim().length < 10) { setErr("Write a description first, then I’ll polish it for search."); return; }
 setSeoBusy(true); setErr(null);
 try {
 const res = await fetch("/api/store/intake/seo", {
 method: "POST", headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ description: form.description, title: form.title, brand: form.brand, era: form.era, material: form.material, condition: form.condition, size: form.size, category: form.category }),
 });
 const d = await res.json().catch(() => null);
 if (res.ok && d?.description) set("description", d.description);
 else setErr(d?.error || "Couldn’t polish that — try again.");
 } catch { setErr("Couldn’t polish that — try again."); }
 setSeoBusy(false);
 }

 // Typing cost auto-fills price at the store's markup: price = cost × (1 + markup%).
 function onCostChange(raw: string) {
 const cost = raw.replace(/[^0-9.]/g, "");
 setForm((f) => {
 const next = { ...f, cost };
 const c = parseFloat(cost);
 if (Number.isFinite(c) && c > 0) {
 const floor = markupPct != null ? Math.round(c * (1 + markupPct / 100)) : 0;
 const best = Math.max(marketPrice ?? 0, floor);
 if (best > 0) next.price = String(best);
 }
 return next;
 });
 }

 // Upload photos only — AI is a separate, on-demand step ("Fill the rest with AI").
 async function onPick(files: FileList | File[] | null) {
 if (!files) return;
 const list = Array.from(files).filter((f) => !f.type || f.type.startsWith("image/")).slice(0, 8);
 if (!list.length) return;
 setBusy(true);
 setBusyMsg(list.length > 1 ? `Uploading ${list.length} photos…` : "Uploading…");
 setErr(null);
 try {
 const urls = [...photos];
 for (const file of list) {
 const fd = new FormData();
 fd.append("file", file);
 const up = await fetch("/api/store/listings/upload", { method: "POST", body: fd });
 const ud = await up.json();
 if (!up.ok) throw new Error(ud.error || "Upload failed");
 urls.push(ud.url);
 }
 setPhotos(urls.slice(0, 8));
 } catch (e) {
 setErr(e instanceof Error ? e.message : "Something went wrong");
 }
 setBusy(false);
 }

 // Establish the item's market value from the server ONCE — on price blur, when we don't already
 // have it (e.g. the seller typed a price without running Fill-with-AI). After that the flag
 // recomputes client-side as the price changes, so this stays cheap and instant.
 async function checkPriceOnBlur() {
 const priceUsd = Number(form.price) || 0;
 if (priceUsd <= 0 || rawMarketCents) return; // no price, or market already known (client handles it)
 if ((!form.brand.trim() && !form.title.trim()) || !photos.length) return; // not enough to price yet
 try {
 const r = await fetch("/api/store/price-check", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ price: priceUsd, brand: form.brand, title: form.title, era: form.era, material: form.material, category: form.category, photoUrl: photos[0] }),
 });
 const d = await r.json().catch(() => null);
 if (!r.ok || !d) return;
 const est = d.estimate;
 if (typeof est?.marketCents === "number") setRawMarketCents(est.marketCents);
 if (est?.suggestedCents) setMarketPrice(Math.round(est.suggestedCents / 100));
 setPriceLow(typeof est?.lowCents === "number" ? Math.round(est.lowCents / 100) : null);
 setPriceHigh(typeof est?.highCents === "number" ? Math.round(est.highCents / 100) : null);
 setPriceFlag(d.priceFlag ?? null);
 } catch { /* best-effort nudge; stay silent */ }
 }

 // Fill ONLY the blank fields with AI — whatever the seller typed is kept. Pricing always
 // runs now (cheaply, off our own data), so a typed price still gets an over/under-market flag.
 async function fillWithAI() {
 if (!photos.length) { setErr("Add at least one photo first."); return; }
 // Brand-first: the seller knows the brand better than a photo does, and it anchors the comps,
 // price, and description. Require it before the AI fills the rest (most sellers type it anyway).
 if (!form.brand.trim()) { setErr("Add the brand first — it anchors the price and description. (Type “Unbranded” if it has no label.)"); return; }
 setBusy(true);
 setBusyMsg("Filling the blanks…");
 setErr(null);
 try {
 const filled: Record<string, string> = {};
 (Object.keys(form) as (keyof Form)[]).forEach((k) => { const v = String(form[k]).trim(); if (v) filled[k] = v; });
 // Phase 1 — draft the FIELDS only (fast), so they render immediately; price/runway follow.
 const r = await fetch("/api/store/intake", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ imageUrls: photos, filled, draftOnly: true }),
 });
 const d = await r.json();
 if (!r.ok) { setErr(d.error || "Couldn’t fill the listing."); setBusy(false); return; }

 const dr: Draft | null = d.draft || null;
 if (d.ghostUrl) setGhost(d.ghostUrl);
 if (Array.isArray(d.embedding)) setEmbedding(d.embedding);
 setReverseImage(d.reverseImage || null);
 setSpecificPiece(d.specificPiece || null);
 if (dr && Array.isArray(dr.flaws)) setFlaws(dr.flaws);
 setPromptVersion(d.promptVersion || null);
 if (dr?.careTag) setCareTag(dr.careTag);
 if (d.runway || dr?.runway) setRunway(d.runway ?? dr?.runway);
 if (d.celebrity) setCelebrity(d.celebrity);

 // Flag risky fields the AI filled (were blank) with low confidence — before merge.
 if (dr) {
 const flags = RISKY.filter((k) => {
 if (String(form[k]).trim()) return false; // seller already filled it → trusted
 const fld = dr[k];
 return !!fld && (!fld.value || fld.confidence < THRESHOLD);
 });
 setFlagged(flags);
 setConfirmed({});
 // Record the AI's proposal ONLY for fields the seller left blank (a genuine prediction).
 // Pre-typed fields aren't the AI's guess → excluded, keeping the accuracy metric honest.
 { const predicted: Record<string, string | null> = {};
 ([["title", dr.title], ["brand", dr.brand?.value], ["era", dr.era?.value], ["material", dr.material?.value], ["condition", dr.condition?.value], ["category", dr.category], ["description", dr.description]] as [keyof Form, string | null | undefined][])
 .forEach(([k, aiVal]) => { if (!String(form[k]).trim() && aiVal) predicted[k] = aiVal; });
 setAiDraft(predicted); }
 }

 // Merge — only ever fill EMPTY fields; never overwrite what the seller typed.
 setForm((f) => {
 const next = { ...f };
 const fill = (k: keyof Form, v: string | null | undefined) => { if (!String(next[k]).trim() && v) next[k] = String(v); };
 if (dr) {
 fill("title", dr.title);
 fill("brand", dr.brand?.value);
 fill("era", dr.era?.value);
 fill("material", dr.material?.value);
 fill("condition", dr.condition?.value);
 fill("category", dr.category);
 fill("description", dr.description);
 if (dr.parcel) { fill("weightOz", String(dr.parcel.weightOz)); fill("lengthIn", String(dr.parcel.lengthIn)); fill("widthIn", String(dr.parcel.widthIn)); fill("heightIn", String(dr.parcel.heightIn)); }
 }
 return next;
 });

 // Phase 2 — price + over/under-market flag + runway (the fields are already on screen).
 setBusyMsg("Pricing…");
 const resolved = {
 brand: filled.brand || dr?.brand?.value || "",
 title: filled.title || dr?.title || "",
 era: filled.era || dr?.era?.value || "",
 material: filled.material || dr?.material?.value || "",
 category: filled.category || dr?.category || "",
 condition: filled.condition || dr?.condition?.value || "",
 conditionGrade: filled.condition || dr?.conditionGrade || dr?.condition?.value || "",
 price: filled.price || "",
 runway: (d.runway ?? dr?.runway) || "",
 celebrity: d.celebrity || "",
 };
 const r2 = await fetch("/api/store/intake/pricing", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ imageUrls: photos, fields: resolved, searchQuery: d.searchQuery ?? dr?.searchQuery ?? null, reverseComps: d.reverseComps ?? [], reverseTitles: d.reverseTitles ?? [], editorialTitles: d.editorialTitles ?? [], knowledgeHintCents: dr?.priceHint ? dr.priceHint * 100 : null, draftRanFull: d.needDraft === true }),
 });
 const d2 = await r2.json().catch(() => null);
 if (r2.ok && d2) {
 const est = d2.estimate;
 if (est?.suggestedCents) setMarketPrice(Math.round(est.suggestedCents / 100));
 if (typeof est?.marketCents === "number") setRawMarketCents(est.marketCents);
 if (typeof est?.rationale === "string") setPriceNote(est.rationale);
 setPriceLow(typeof est?.lowCents === "number" ? Math.round(est.lowCents / 100) : null);
 setPriceHigh(typeof est?.highCents === "number" ? Math.round(est.highCents / 100) : null);
 setPriceFlag(d2.priceFlag ?? null);
 if (d2.runway) setRunway(d2.runway);
 if (d2.celebrity) setCelebrity(d2.celebrity);
 setForm((f) => {
 if (String(f.price).trim()) return f; // seller's own price stands
 if (est?.suggestedCents) return { ...f, price: String(Math.round(est.suggestedCents / 100)) };
 if (dr?.priceHint) return { ...f, price: String(dr.priceHint) };
 return f;
 });
 }
 } catch (e) {
 setErr(e instanceof Error ? e.message : "Something went wrong");
 }
 setBusy(false);
 }

 const allConfirmed = flagged.every((k) => confirmed[k]);

 function toggleConsigned() {
 const next = !consigned;
 setConsigned(next);
 if (next && !consignCfg) {
 fetch("/api/store/consignment/consignors").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setConsignors(d.consignors || []); }).catch(() => {});
 fetch("/api/store/consignment/config").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setConsignCfg({ storeDefaultSplitPct: d.settings?.storeDefaultSplitPct ?? 50 }); }).catch(() => {});
 }
 }
 function pickConsignor(id: string) {
 const c = consignors.find((x) => String(x.id) === id);
 const prefill = c?.defaultSplitPct ?? consignCfg?.storeDefaultSplitPct ?? "";
 setConsign((s) => ({ ...s, consignorId: id, split: String(prefill) }));
 }
 async function addConsignor() {
 const name = consign.newName.trim();
 if (!name) return;
 const r = await fetch("/api/store/consignment/consignors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
 const d = await r.json().catch(() => null);
 if (r.ok && d?.consignor) {
 setConsignors((cs) => [...cs, { id: d.consignor.id, name: d.consignor.name, defaultSplitPct: d.consignor.defaultSplitPct }]);
 setConsign((s) => ({ ...s, consignorId: String(d.consignor.id), newName: "", split: s.split || String(consignCfg?.storeDefaultSplitPct ?? "") }));
 }
 }

 // publishAt (ISO) = schedule it: the server saves it as a draft now and the cron publishes it then.
 async function publish(status: "active" | "draft" = "active", publishAt?: string) {
 if (!form.title.trim()) { setErr("Add a title first."); return; }
 if (!photos.length) { setErr("Add at least one photo."); return; }
 if ((status === "active" || publishAt) && !allConfirmed) { setErr("Confirm the flagged fields first."); return; }
 if (publishAt && new Date(publishAt).getTime() <= Date.now()) { setErr("Pick a time in the future to schedule."); return; }
 setBusy(true);
 setBusyMsg(publishAt ? "Scheduling…" : status === "draft" ? "Saving draft…" : "Publishing…");
 setErr(null);
 try {
 const images = [ghost, ...photos].filter(Boolean);
 const r = await fetch("/api/store/intake/publish", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ ...form, status, publishAt: publishAt || null, price: Number(form.price) || 0, cost: form.cost === "" ? null : Number(form.cost) || 0, collections: selectedCols, images, aiDraft, photo: photos[0] ?? null, embedding, marketCents: rawMarketCents, runway, celebrity, reverseImage, promptVersion, reviewed: allConfirmed, consignment: consigned && consign.consignorId ? { consignorId: Number(consign.consignorId), splitPct: consign.split ? Number(consign.split) : null, expiresAt: consign.expiresAt || null } : null }),
 });
 const d = await r.json();
 if (!r.ok) throw new Error(d.error || "Publish failed");
 setScheduledAt(d.scheduled ? d.publishAt : null);
 setSavedDraft(status === "draft" && !d.scheduled);
 setPhase("done");
 } catch (e) {
 setErr(e instanceof Error ? e.message : "Publish failed");
 }
 setBusy(false);
 }

 function reset() {
 setPhase("form"); setPhotos([]); setRunway(null); setCelebrity(null); setGhost(null); setForm(BLANK);
 setSelectedCols([]); setFlagged([]); setConfirmed({}); setErr(null); setSavedDraft(false);
 setReverseImage(null); setSpecificPiece(null); setFlaws([]); setPromptVersion(null); setCareTag(null); setMarketPrice(null); setRawMarketCents(null); setPriceNote(""); setPriceLow(null); setPriceHigh(null); setPriceFlag(null); setConsigned(false); setConsign({ consignorId: "", split: "", expiresAt: "", newName: "" }); setAiDraft({}); setEmbedding(null); setSchedule(""); setScheduledAt(null);
 }

 // ── Done ──
 if (phase === "done") {
 return (
 <div className="flex min-h-screen items-center justify-center px-6 text-center">
 <div>
 <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">✓</div>
 <p className="text-xl font-semibold text-stone-900">{scheduledAt ? "Scheduled" : savedDraft ? "Saved as draft" : "Listed"}</p>
 <p className="mt-1 text-sm text-stone-500">{scheduledAt ? `It’ll go live automatically on ${new Date(scheduledAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.` : savedDraft ? "It’s in your inventory — publish it (or the whole drop) when you’re ready." : "It’s live on your storefront."}</p>
 <div className="mt-6 flex items-center justify-center gap-3">
 <TechButton onClick={reset}>List another</TechButton>
 <TechButton variant="secondary" onClick={() => { window.location.href = "/admin/inventory"; }}>View inventory</TechButton>
 </div>
 </div>
 </div>
 );
 }

 const riskyField = (k: keyof Form, name: string) => {
 const isFlagged = flagged.includes(k as string);
 return (
 <div>
 <label className={label}>
 {name}
 {isFlagged && <span className="ml-2 text-[11px] font-normal text-amber-600">● AI unsure — confirm</span>}
 </label>
 <input className={cn(input, isFlagged && !confirmed[k] && "border-amber-400 bg-amber-50/50")} value={form[k]} onChange={(e) => set(k, e.target.value)} />
 {isFlagged && (
 <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-stone-500">
 <input type="checkbox" checked={!!confirmed[k]} onChange={(e) => setConfirmed((c) => ({ ...c, [k]: e.target.checked }))} className="accent-[var(--accent,#0e9f76)]" />
 Confirmed
 </label>
 )}
 </div>
 );
 };

 // ── Manual-first form ──
 return (
 <AdminPage className="max-w-3xl">
 <AdminHeader
 eyebrow="Sell · Add listing"
 title="Add a listing"
 subtitle="Add photos and fill in what you know — then let AI complete the rest. Anything you type, it keeps."
 />

 {reverseImage && (
 reverseImage.brand
 ? <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[12px] text-emerald-800">🔍 Reverse image search identified <span className="font-semibold">{reverseImage.brand}</span> from {reverseImage.hits} of {reverseImage.matches} web matches{reverseImage.sampleTitles[0] ? <span className="text-emerald-700/80"> — e.g. “{reverseImage.sampleTitles[0].slice(0, 70)}”</span> : null}.</div>
 : <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12px] text-amber-800">🔍 Reverse image search found {reverseImage.matches} web {reverseImage.matches === 1 ? "match" : "matches"} but no confident brand{reverseImage.sampleTitles[0] ? <span className="text-amber-700/80"> — e.g. “{reverseImage.sampleTitles[0].slice(0, 70)}”</span> : null}. Confirm the brand below.</div>
 )}

 <div className="grid gap-6 sm:grid-cols-[240px_1fr]">
 {/* Photos + AI */}
 <div>
 {photos.length ? (
 <>
 <TechCard className="overflow-hidden">
 <div className="aspect-[3/4] w-full bg-stone-100">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={ghost || photos[0]} alt="" className="h-full w-full object-cover" />
 </div>
 </TechCard>
 <p className="mt-2 text-[11px] uppercase tracking-[0.08em] text-stone-400">{ghost ? "Ghost-mannequin cover" : "Your photo"}</p>
 <div className="mt-2 flex flex-wrap gap-1.5">
 {photos.map((p, i) => (
 <div
 key={p}
 draggable
 onDragStart={() => { dragIdx.current = i; }}
 onDragOver={(e) => e.preventDefault()}
 onDrop={() => { if (dragIdx.current !== null) reorderPhoto(dragIdx.current, i); dragIdx.current = null; }}
 className="group relative h-12 w-10 cursor-grab active:cursor-grabbing"
 title="Drag to reorder"
 >
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={p} alt="" className="h-full w-full rounded object-cover ring-1 ring-stone-200" />
 {i === 0 && !ghost && <span className="absolute -left-1 -top-1 rounded bg-[var(--accent,#0e9f76)] px-1 text-[8px] leading-tight text-white">cover</span>}
 <button type="button" onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))} className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-black/70 text-[10px] leading-none text-white group-hover:flex" aria-label="Remove">×</button>
 </div>
 ))}
 {photos.length < 8 && (
 <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="flex h-12 w-10 items-center justify-center rounded border border-dashed border-stone-300 text-stone-400 hover:border-stone-400 hover:text-stone-600">+</button>
 )}
 </div>
 {photos.length > 1 && <p className="mt-1 text-[10px] text-stone-400">Drag to reorder{ghost ? "" : " · first is the cover"}</p>}
 </>
 ) : (
 <div
 onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
 onDragEnter={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
 onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
 onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!busy) onPick(e.dataTransfer.files); }}
 onClick={() => !busy && fileRef.current?.click()}
 className={cn("flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 text-center transition-colors", dragOver ? "border-[var(--accent,#0e9f76)] bg-[var(--accent-soft,#eafaf3)]" : "border-stone-300 hover:border-stone-400")}
 >
 <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft,#eafaf3)] text-[var(--accent,#0e9f76)]"><Camera size={20} /></span>
 <p className="text-[13px] font-medium text-stone-700">{busy ? busyMsg : "Add photos"}</p>
 <p className="mt-1 text-[11px] text-stone-400">or drag here · up to 8 · include the tag</p>
 </div>
 )}

 {runway && <p className="mt-3 text-[12px] text-stone-600">🎬 Runway match: <a href={runwayShowUrl(runway)} target="_blank" rel="noopener noreferrer" className="font-medium underline decoration-stone-300 underline-offset-2 hover:decoration-stone-600">{runway}</a> <span className="text-stone-400">↗ view show</span></p>}
 {celebrity && <p className="mt-1.5 text-[12px] text-stone-600">⭐ As seen on: <span className="font-medium text-stone-800">{celebrity}</span> <span className="text-stone-400">— confirm before publishing</span></p>}
 {careTag && <p className="mt-3 text-[12px] text-stone-500">Read from care tag: <span className="italic">{careTag}</span></p>}
 {/* Nudge for a tag shot — a legible brand/care label is the single strongest signal for
   getting the brand + era right, and the reverse-image search now scans every frame. */}
 {!reverseImage?.brand && (
 <p className="mt-3 flex items-start gap-1.5 text-[11px] text-stone-400"><Tag size={12} className="mt-px shrink-0 text-stone-400" />Add a clear shot of the brand/care tag — it’s the surest way for AI to nail the brand &amp; era.</p>
 )}
 {/* Specific-piece match (Phase 2): the exact model we recognized from the reference index,
   used to sharpen the title/era and tighten the price comps. Only shown when confident. */}
 {specificPiece && (
 <p className="mt-3 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[11px] text-stone-600">🎯 Looks like <span className="font-medium text-stone-800">{specificPiece.model}</span> <span className="text-stone-400">· {Math.round(specificPiece.similarity * 100)}% match{specificPiece.refPriceCents ? ` · refs ~$${Math.round(specificPiece.refPriceCents / 100)}` : ""}</span></p>
 )}

 <TechButton className="mt-4 w-full" variant="secondary" onClick={fillWithAI} disabled={busy || !photos.length || !form.brand.trim()}>
 <Sparkles size={14} className="mr-1.5 inline" />{busy ? busyMsg : "Fill the rest with AI"}
 </TechButton>
 <p className="mt-1.5 text-[11px] text-stone-400">{!form.brand.trim() ? "Enter the brand first — it anchors the price & description. (“Unbranded” is fine.)" : "Only fills blanks. Your price is always checked against live market comps."}</p>

 <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPick(e.target.files)} />
 </div>

 {/* Fields */}
 <TechCard className="space-y-4 p-5">
 <div>
 <label className={label}>Title</label>
 <input className={input} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. 1990s Prada nylon shoulder bag" />
 </div>
 <div className="grid grid-cols-2 gap-3">{riskyField("brand", "Brand")}{riskyField("era", "Era")}</div>
 <div className="grid grid-cols-2 gap-3">{riskyField("material", "Material")}
 <div>
 <label className={label}>Condition</label>
 <input className={input} value={form.condition} onChange={(e) => set("condition", e.target.value)} />
 {flaws.length > 0 && (
 <p className="mt-1 text-[10.5px] text-amber-700/90">AI noted: {flaws.join(" · ")} <span className="text-stone-400">— factored into the price</span></p>
 )}
 </div>
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div><label className={label}>Size</label><input className={input} value={form.size} onChange={(e) => set("size", e.target.value)} placeholder="M / US 8" /></div>
 <div><label className={label}>Category</label><input className={input} value={form.category} onChange={(e) => set("category", e.target.value)} /></div>
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div><label className={label}>Price ($)</label><input className={input} value={form.price} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); set("price", v); if (rawMarketCents) setPriceFlag(flagFor(Number(v) || 0, marketPrice, priceLow, priceHigh)); }} onBlur={checkPriceOnBlur} inputMode="decimal" placeholder="You set it, or AI estimates" />{(priceNote || (markupPct != null && form.cost)) && <p className="mt-1 text-[10px] text-stone-400">{priceNote || `auto · ${markupPct}% over cost`}</p>}</div>
 <div><label className={label}>Cost ($) <span className="font-normal text-stone-400">— private</span></label><input className={input} value={form.cost} onChange={(e) => onCostChange(e.target.value)} inputMode="decimal" placeholder="What you paid" /></div>
 </div>
 {priceLow != null && priceHigh != null && priceHigh > priceLow && (
 <PriceScale low={priceLow} high={priceHigh} market={marketPrice} value={Number(form.price) || 0} />
 )}
 {priceFlag && (
 <div className={`mt-2 rounded-lg px-3 py-2 text-[11px] font-medium ${priceFlag.level === "under" ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : priceFlag.level === "over" ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200" : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"}`}>
 {priceFlag.level === "under" ? "🔽 " : priceFlag.level === "over" ? "🔼 " : "✅ "}{priceFlag.message}
 </div>
 )}

 <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4">
 <div className="flex items-center justify-between">
 <div><p className="text-[13px] font-medium text-stone-800">Consignment</p><p className="text-[11px] text-stone-400">Track this for a consignor &mdash; they&rsquo;re auto-credited their split when it sells.</p></div>
 <Toggle on={consigned} onClick={toggleConsigned} />
 </div>
 {consigned && (
 <div className="mt-4 space-y-3">
 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className={label}>Consignor</label>
 <select className={input} value={consign.consignorId} onChange={(e) => pickConsignor(e.target.value)}>
 <option value="">Select…</option>
 {consignors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
 </select>
 </div>
 <div><label className={label}>Consignor split %</label><input className={input} value={consign.split} onChange={(e) => setConsign({ ...consign, split: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder="auto from rules" /></div>
 </div>
 <div className="flex items-end gap-2">
 <div className="flex-1"><label className={label}>…or add a new consignor</label><input className={input} value={consign.newName} onChange={(e) => setConsign({ ...consign, newName: e.target.value })} placeholder="Name" /></div>
 <button type="button" onClick={addConsignor} disabled={!consign.newName.trim()} className="rounded-lg border border-stone-200 px-3 py-2 text-[12.5px] text-stone-600 hover:bg-stone-50 disabled:opacity-40">Add</button>
 </div>
 <div><label className={label}>Consignment ends <span className="font-normal text-stone-400">— optional</span></label><input type="date" className={input} value={consign.expiresAt} onChange={(e) => setConsign({ ...consign, expiresAt: e.target.value })} /></div>
 {consign.split && <p className="text-[11px] text-stone-400">Consignor gets {consign.split}% · store keeps {100 - (Number(consign.split) || 0)}%.</p>}
 </div>
 )}
 </div>
 <div>
 <label className={label}>Shipping parcel <span className="font-normal text-stone-400">— AI-estimated, edit if needed</span></label>
 <div className="grid grid-cols-4 gap-2">
 <div><input className={input} value={form.weightOz} onChange={(e) => set("weightOz", e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="oz" /><p className="mt-1 text-center text-[10px] text-stone-400">weight oz</p></div>
 <div><input className={input} value={form.lengthIn} onChange={(e) => set("lengthIn", e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="L" /><p className="mt-1 text-center text-[10px] text-stone-400">length in</p></div>
 <div><input className={input} value={form.widthIn} onChange={(e) => set("widthIn", e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="W" /><p className="mt-1 text-center text-[10px] text-stone-400">width in</p></div>
 <div><input className={input} value={form.heightIn} onChange={(e) => set("heightIn", e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="H" /><p className="mt-1 text-center text-[10px] text-stone-400">height in</p></div>
 </div>
 </div>
 <div>
 <div className="flex items-center justify-between">
 <label className={label}>Description</label>
 <button
 type="button" onClick={polishForSeo} disabled={seoBusy || form.description.trim().length < 10}
 className="text-[11px] font-medium text-[var(--accent,#0e9f76)] transition hover:opacity-70 disabled:opacity-40"
 title="Rewrite your description for search — keeps your words and facts, just makes it more findable"
 >
 {seoBusy ? "Polishing…" : "✨ Improve for search"}
 </button>
 </div>
 <textarea className={cn(input, "min-h-[80px] resize-y")} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Write it yourself, or leave blank and AI drafts it" />
 </div>

 <div>
 <label className={label}>Collections <span className="font-normal text-stone-400">— group it so it sells</span></label>
 <div className="flex flex-wrap gap-2">
 {cols.map((c) => {
 const on = selectedCols.includes(c.title);
 return (
 <button key={c.id} type="button" onClick={() => setSelectedCols((s) => (on ? s.filter((t) => t !== c.title) : [...s, c.title]))}
 className={cn("rounded-full border px-3 py-1.5 text-xs transition", on ? "border-[var(--accent,#0e9f76)] bg-[var(--accent,#0e9f76)] text-white" : "border-stone-300 bg-white text-stone-600 hover:border-stone-400")}>
 {c.title}{c.itemCount ? ` ${c.itemCount}` : ""}
 </button>
 );
 })}
 {selectedCols.filter((t) => !cols.some((c) => c.title === t)).map((t) => (
 <button key={t} type="button" onClick={() => setSelectedCols((s) => s.filter((x) => x !== t))}
 className="rounded-full border border-[var(--accent,#0e9f76)] bg-[var(--accent,#0e9f76)] px-3 py-1.5 text-xs text-white">{t} ✕</button>
 ))}
 </div>
 <input className={cn(input, "mt-2")} value={newCol} onChange={(e) => setNewCol(e.target.value)}
 onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const t = newCol.trim(); if (t && !selectedCols.includes(t)) setSelectedCols((s) => [...s, t]); setNewCol(""); } }}
 placeholder="New collection — type &amp; Enter (Y2K, Designer bags…)" />
 </div>

 <div className="flex flex-wrap items-center gap-4 border-t border-stone-100 pt-4">
 <TechButton onClick={() => publish("active")} disabled={busy || !allConfirmed}>{busy ? busyMsg : "Publish listing"}</TechButton>
 <TechButton variant="secondary" onClick={() => publish("draft")} disabled={busy || !form.title.trim()}>Save as draft</TechButton>
 {!allConfirmed && <span className="text-[11px] text-amber-600">Confirm the flagged fields to publish — or save as a draft for now</span>}
 {err && <span className="text-xs text-red-600">{err}</span>}
 {/* Schedule publish: pick a future time → saved as a draft now, auto-published then. */}
 <div className="flex w-full items-center gap-2 sm:w-auto sm:ml-auto">
 <span className="text-[11px] uppercase tracking-[0.14em] text-stone-400">Schedule</span>
 <input
 type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)}
 className={cn(input, "w-auto py-1.5 text-[13px]")}
 />
 <TechButton
 variant="secondary"
 onClick={() => publish("active", schedule ? new Date(schedule).toISOString() : undefined)}
 disabled={busy || !schedule || !allConfirmed}
 >
 Schedule
 </TechButton>
 </div>
 </div>
 </TechCard>
 </div>
 </AdminPage>
 );
}
