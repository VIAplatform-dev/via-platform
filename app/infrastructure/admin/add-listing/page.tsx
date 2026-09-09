"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Sparkles, Tag } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, Toggle, SectionLabel, cn } from "../ui";
import { CategoryBreadcrumb } from "../CategoryPicker";
import PhotoCropper from "../PhotoCropper";
import { toCategorySlug } from "@/app/lib/item-tags";
import { PriceScale } from "../PriceScale";
import { MAX_ITEM_IMAGES } from "@/app/lib/item-limits";
import { ConditionChips, MeasurementFields, measurementsFromForm, useStoreUnits } from "../ListingStructure";
import { PACKAGING, packagingById, packedWeightOz, suggestPackaging } from "@/app/lib/packaging";
import { toOz, fromOz } from "@/app/lib/weight-units";
import { assignTier } from "@/app/lib/shipping-tiers";
import { normalizeCondition } from "@/app/lib/condition-core";
import { parcelEstimateFrom, type ParcelEstimate } from "@/app/lib/parcel-core";
import type { MeasurementKey } from "@/app/lib/measurements-core";

/**
 * Which store this listing is being created for.
 *
 * Without a ?store= the API resolves to whatever store the SESSION belongs to. Opening this page to
 * add stock for a seller you're previewing therefore published it into YOUR store instead, and it
 * never appeared on the storefront you were looking at.
 */
import RentalPanel, { type TermsDraft } from "../rentals/RentalPanel";

function withStore(path: string): string {
 if (typeof window === "undefined") return path;
 const s = new URLSearchParams(window.location.search).get("store");
 return s ? `${path}${path.includes("?") ? "&" : "?"}store=${encodeURIComponent(s)}` : path;
}


type Field = { value: string | null; confidence: number };
type Draft = {
 title: string;
 description: string;
 brand: Field;
 era: Field;
 material: Field;
 colour: Field;
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
type Form = { title: string; brand: string; era: string; material: string; colour: string; condition: string; size: string; measurements: string; category: string; price: string; cost: string; description: string; weightOz: string; lengthIn: string; widthIn: string; heightIn: string };
type Collection = { id: string; title: string; itemCount: number };
const BLANK: Form = { title: "", brand: "", era: "", material: "", colour: "", condition: "", size: "", measurements: "", category: "", price: "", cost: "", description: "", weightOz: "", lengthIn: "", widthIn: "", heightIn: "" };

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

// A field only has something worth confirming if it's non-empty AND not an AI
// placeholder like "N/A"/"Unknown". Those mean the AI couldn't determine it — there's
// nothing for the seller to confirm, so such fields shouldn't be filled or gate publishing.
const NO_VALUE_RE = /^(n\/?a|none|unknown|unsure|not sure|not applicable|n\.a\.)$/i;
function hasRealValue(v: string | null | undefined): boolean {
 const s = (v ?? "").trim();
 return s.length > 0 && !NO_VALUE_RE.test(s);
}
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
 const [newFlaw, setNewFlaw] = useState(""); // the flaw being typed; whatever is left in the box is saved too
 // Structure (owner audit #27/#31): the note beyond the grade, the category's measurement template,
 // and the parcel the AI judged this piece to be — kept so a typed weight can be checked against it.
 const [conditionNote, setConditionNote] = useState("");
 const [measurements, setMeasurements] = useState<Partial<Record<MeasurementKey, string>>>({});
 const [aiParcel, setAiParcel] = useState<ParcelEstimate | null>(null);
 const units = useStoreUnits(withStore);
 // Provenance (owner audit #18): where it came from and when — hers, never shown to shoppers. The
 // same two fields the inventory editor has; the datalist is her own previous source names.
 const [sourceName, setSourceName] = useState("");
 const [acquiredAt, setAcquiredAt] = useState("");
 const [sourceNames, setSourceNames] = useState<string[]>([]);
 const [promptVersion, setPromptVersion] = useState<string | null>(null);
 const [seoBusy, setSeoBusy] = useState(false);
 const [schedule, setSchedule] = useState(""); // datetime-local value for scheduled publish
 const [scheduledAt, setScheduledAt] = useState<string | null>(null); // set on the done screen
 // Cross-listing: which connected marketplaces this piece goes to, and where it landed.
 const [channelMeta, setChannelMeta] = useState<{ key: string; name: string; mode: string; autoList: boolean }[]>([]);
 const [channels, setChannels] = useState<Record<string, boolean>>({});
 const [crossResult, setCrossResult] = useState<{ platform: string; name: string; status: string; url: string | null }[]>([]);
 const [cols, setCols] = useState<Collection[]>([]);
 const [selectedCols, setSelectedCols] = useState<string[]>([]);
 const [newCol, setNewCol] = useState("");
 const [addingCol, setAddingCol] = useState(false);
 // Which photo the positioner is open on, if any.
 const [cropping, setCropping] = useState<string | null>(null);
 // Which photo the big frame is showing. The cover by default; clicking a thumbnail opens that one
 // instead, because the strip is far too small to judge a crop in.
 const [selPhoto, setSelPhoto] = useState(0);
 // Which packaging she's using. Preselected from the AI's weight — the honest signal, since it
 // came from looking at the actual garment.
 const [packing, setPacking] = useState<string>("small-box");
 const fileRef = useRef<HTMLInputElement>(null);
 const dragIdx = useRef<number | null>(null);
 const [markupPct, setMarkupPct] = useState<number | null>(null);
 const [aiDraft, setAiDraft] = useState<Record<string, string | null>>({});
 // The cover photo these details were written from. Swap the photo and the words stay — describing
 // a garment that is no longer on the screen, which is worse than an empty form: it looks filled in.
 const [aiPhoto, setAiPhoto] = useState<string | null>(null);
 const [embedding, setEmbedding] = useState<number[] | null>(null);
 const [marketPrice, setMarketPrice] = useState<number | null>(null);
 const [rawMarketCents, setRawMarketCents] = useState<number | null>(null);
 // The AI's pricing confidence — logged with the item so we can calibrate confidence vs. how far
 // the seller re-prices ("does 0.7 actually mean ~right?").
 const [aiConfidence, setAiConfidence] = useState<number | null>(null);
 const [priceNote, setPriceNote] = useState<string>("");
 const [priceLow, setPriceLow] = useState<number | null>(null);
 const [priceHigh, setPriceHigh] = useState<number | null>(null);
 const [priceFlag, setPriceFlag] = useState<Flag | null>(null);
 const [lowConf, setLowConf] = useState(false); // too few comps to flag over/under — show a rough range, not a verdict
 const [consigned, setConsigned] = useState(false);
 // Rental terms decided while the piece is being written. There's no item to attach them to yet,
 // so they're held here and written the moment publish hands back an id.
 const [rentalDraft, setRentalDraft] = useState<TermsDraft | null>(null);
 const [consignors, setConsignors] = useState<{ id: number; name: string; defaultSplitPct: number | null }[]>([]);
 const [consignCfg, setConsignCfg] = useState<{ storeDefaultSplitPct: number } | null>(null);
 const [consign, setConsign] = useState({ consignorId: "", split: "", expiresAt: "", newName: "" });

 // Load the store's markup-over-cost setting so entering cost auto-fills price; and
 // the store's collections for tagging.
 useEffect(() => {
 fetch(withStore("/api/store/pricing")).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && typeof d.minMarkupPct === "number") setMarkupPct(d.minMarkupPct); }).catch(() => {});
 fetch(withStore("/api/store/collections")).then((r) => (r.ok ? r.json() : null)).then((c) => c && setCols(c.collections || [])).catch(() => {});
 // Her previous source names, for the "Where it came from" datalist — derived from her pieces
 // exactly as the inventory editor derives them.
 fetch(withStore("/api/store/items")).then((r) => (r.ok ? r.json() : null)).then((d) => {
 const names = Array.from(new Set(((d?.items || []) as { sourceName?: string | null }[]).map((i) => (i.sourceName || "").trim()).filter(Boolean))).sort();
 setSourceNames(names);
 }).catch(() => {});
 }, []);

 // ── Auto-save the in-progress listing as a DRAFT, so leaving before publish/schedule never loses it.
 const draftIdRef = useRef<string | null>(null);
 const [autoSavedAt, setAutoSavedAt] = useState<number | null>(null);
 const draftPayload = () => ({
 draftId: draftIdRef.current,
 title: form.title,
 price: Number(form.price) || 0,
 // Cost and measurements were missing here while publish sent them, so an autosaved
 // draft quietly lost both — cost is what the profit reporting runs on.
 cost: form.cost === "" ? null : Number(form.cost) || 0,
 measurements: form.measurements || null,
 images: [ghost, ...photos].filter(Boolean),
 brand: form.brand || null,
 era: form.era || null,
 material: form.material || null,
 condition: form.condition || null,
 size: form.size || null,
 description: form.description || null,
 category: form.category || null,
 collections: selectedCols,
 status: "draft" as const,
 // AI guess + context so DRAFTS (not only publishes) build the accuracy signal — a seller's edit to
 // the AI draft is the label, and most test drafts never get published. Recorded per draft id.
 aiDraft,
 marketCents: rawMarketCents,
 reverseImage,
 promptVersion,
 });
 // Kept current every render so the tab-close / unmount beacon always sends the latest state.
 const beaconRef = useRef<{ canSave: boolean; payload: unknown }>({ canSave: false, payload: null });
 beaconRef.current = { canSave: phase === "form" && photos.length > 0 && !busy, payload: draftPayload() };
 // Debounced autosave: 2s after any edit to photos/fields, while still editing.
 useEffect(() => {
 if (phase !== "form" || busy || !photos.length) return;
 const t = setTimeout(async () => {
  try {
  const r = await fetch(withStore("/api/store/intake/autosave"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draftPayload()) });
  const d = await r.json().catch(() => null);
  if (d?.id) { draftIdRef.current = d.id; setAutoSavedAt(Date.now()); }
  } catch {}
 }, 2000);
 return () => clearTimeout(t);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [photos, form, selectedCols, ghost, phase, busy]);
 // Final save on tab close (beforeunload) AND in-app navigation away (unmount) — fire-and-forget.
 useEffect(() => {
 const beacon = () => {
  const { canSave, payload } = beaconRef.current;
  if (!canSave) return;
  try { navigator.sendBeacon("/api/store/intake/autosave", new Blob([JSON.stringify(payload)], { type: "application/json" })); } catch {}
 };
 window.addEventListener("beforeunload", beacon);
 return () => { window.removeEventListener("beforeunload", beacon); beacon(); };
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
 const res = await fetch(withStore("/api/store/intake/seo"), {
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
 const list = Array.from(files).filter((f) => !f.type || f.type.startsWith("image/")).slice(0, MAX_ITEM_IMAGES);
 if (!list.length) return;
 setBusy(true);
 setBusyMsg(list.length > 1 ? `Uploading ${list.length} photos…` : "Uploading…");
 setErr(null);
 try {
 const urls = [...photos];
 for (const file of list) {
 const fd = new FormData();
 fd.append("file", file);
 const up = await fetch(withStore("/api/store/listings/upload"), { method: "POST", body: fd });
 const ud = await up.json();
 if (!up.ok) throw new Error(ud.error || "Upload failed");
 urls.push(ud.url);
 }
 setPhotos(urls.slice(0, MAX_ITEM_IMAGES));
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
 const r = await fetch(withStore("/api/store/price-check"), {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ price: priceUsd, brand: form.brand, title: form.title, era: form.era, material: form.material, category: form.category, photoUrl: photos[0] }),
 });
 const d = await r.json().catch(() => null);
 if (!r.ok || !d) return;
 const est = d.estimate;
 if (typeof est?.marketCents === "number") setRawMarketCents(est.marketCents);
 if (est?.suggestedCents) setMarketPrice(Math.round(est.suggestedCents / 100));
 if (typeof est?.confidence === "number") setAiConfidence(est.confidence);
 setPriceLow(typeof est?.lowCents === "number" ? Math.round(est.lowCents / 100) : null);
 setPriceHigh(typeof est?.highCents === "number" ? Math.round(est.highCents / 100) : null);
 setPriceFlag(d.priceFlag ?? null);
 setLowConf(!!d.lowConfidence);
 } catch { /* best-effort nudge; stay silent */ }
 }

 // Fill ONLY the blank fields with AI — whatever the seller typed is kept. Pricing always
 // runs now (cheaply, off our own data), so a typed price still gets an over/under-market flag.
 async function fillWithAI() {
 if (!photos.length) { setErr("Add at least one photo first."); return; }
 // Brand sharpens the comps/price/description, but it's no longer required — the intake's
 // reverse-image search + vision infer it from the photo when the seller leaves it blank.
 setBusy(true);
 setBusyMsg("Filling the blanks…");
 setErr(null);
 try {
 const filled: Record<string, string> = {};
 (Object.keys(form) as (keyof Form)[]).forEach((k) => { const v = String(form[k]).trim(); if (v) filled[k] = v; });
 // Phase 1 — draft the FIELDS only (fast), so they render immediately; price/runway follow.
 const r = await fetch(withStore("/api/store/intake"), {
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
 if (dr?.parcel) { const est = parcelEstimateFrom(dr.parcel); setAiParcel(est); setPacking(suggestPackaging(est?.weightOz)); }
 setPromptVersion(d.promptVersion || null);
 if (dr?.careTag) setCareTag(dr.careTag);
 if (d.runway || dr?.runway) setRunway(d.runway ?? dr?.runway);
 if (d.celebrity) setCelebrity(d.celebrity);

 // Flag risky fields the AI filled (were blank) with low confidence — before merge.
 if (dr) {
 const flags = RISKY.filter((k) => {
 if (String(form[k]).trim()) return false; // seller already filled it → trusted
 const fld = dr[k];
 // Only flag when the AI actually produced a real value it's unsure about. If the AI
 // left it blank or returned "N/A", there's nothing to confirm — don't gate on it.
 return !!fld && hasRealValue(fld.value) && fld.confidence < THRESHOLD;
 });
 setFlagged(flags);
 setConfirmed({});
 // Record the AI's proposal ONLY for fields the seller left blank (a genuine prediction).
 // Pre-typed fields aren't the AI's guess → excluded, keeping the accuracy metric honest.
 { const predicted: Record<string, string | null> = {};
 ([["title", dr.title], ["brand", dr.brand?.value], ["era", dr.era?.value], ["material", dr.material?.value], ["colour", dr.colour?.value], ["condition", dr.condition?.value], ["category", dr.category], ["description", dr.description]] as [keyof Form, string | null | undefined][])
 .forEach(([k, aiVal]) => { if (!String(form[k]).trim() && aiVal) predicted[k] = aiVal; });
 setAiDraft(predicted); setAiPhoto(photos[0] ?? null); }
 }

 // Merge — only ever fill EMPTY fields; never overwrite what the seller typed.
 setForm((f) => {
 const next = { ...f };
 // Fill only EMPTY fields, and only with a real value — never write "N/A"/"Unknown"
 // placeholders (leave the field genuinely blank so it doesn't look filled-but-unknown).
 const fill = (k: keyof Form, v: string | null | undefined) => { if (!String(next[k]).trim() && hasRealValue(v)) next[k] = String(v); };
 if (dr) {
 fill("title", dr.title);
 fill("brand", dr.brand?.value);
 fill("era", dr.era?.value);
 fill("material", dr.material?.value);
 fill("colour", dr.colour?.value);
 // The grade goes on the scale; the model's sentence about the wear becomes the note.
 fill("condition", normalizeCondition(dr.conditionGrade) ?? normalizeCondition(dr.condition?.value) ?? dr.condition?.value);
 if (!conditionNote.trim() && dr.condition?.value && normalizeCondition(dr.condition.value) !== dr.condition.value) setConditionNote(dr.condition.value);
 fill("category", toCategorySlug(dr.category) ?? dr.category);
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
 const r2 = await fetch(withStore("/api/store/intake/pricing"), {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ imageUrls: photos, fields: resolved, searchQuery: d.searchQuery ?? dr?.searchQuery ?? null, reverseComps: d.reverseComps ?? [], reverseTitles: d.reverseTitles ?? [], editorialTitles: d.editorialTitles ?? [], knowledgeHintCents: dr?.priceHint ? dr.priceHint * 100 : null, draftRanFull: d.needDraft === true }),
 });
 const d2 = await r2.json().catch(() => null);
 if (r2.ok && d2) {
 const est = d2.estimate;
 if (est?.suggestedCents) setMarketPrice(Math.round(est.suggestedCents / 100));
 if (typeof est?.confidence === "number") setAiConfidence(est.confidence);
 if (typeof est?.marketCents === "number") setRawMarketCents(est.marketCents);
 if (typeof est?.rationale === "string") setPriceNote(est.rationale);
 setPriceLow(typeof est?.lowCents === "number" ? Math.round(est.lowCents / 100) : null);
 setPriceHigh(typeof est?.highCents === "number" ? Math.round(est.highCents / 100) : null);
 setPriceFlag(d2.priceFlag ?? null);
 setLowConf(!!d2.lowConfidence); // full AI pricing is usually confident; honor it if not
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
 // Most pieces need flat measurements (fit is everything secondhand) — except small accessories
 // where they don't apply. Drives a soft nudge, never a hard block.
 const needsMeasurements = !/jewel|ring|earring|necklace|bracelet|brooch|\bhat\b|belt|scarf|sunglass|watch|gift ?card|\bhair\b/i.test(`${form.category} ${form.title}`);

 function toggleConsigned() {
 const next = !consigned;
 setConsigned(next);
 if (next && !consignCfg) {
 fetch(withStore("/api/store/consignment/consignors")).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setConsignors(d.consignors || []); }).catch(() => {});
 fetch(withStore("/api/store/consignment/config")).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setConsignCfg({ storeDefaultSplitPct: d.settings?.storeDefaultSplitPct ?? 50 }); }).catch(() => {});
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
 const r = await fetch(withStore("/api/store/consignment/consignors"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
 const d = await r.json().catch(() => null);
 if (r.ok && d?.consignor) {
 setConsignors((cs) => [...cs, { id: d.consignor.id, name: d.consignor.name, defaultSplitPct: d.consignor.defaultSplitPct }]);
 setConsign((s) => ({ ...s, consignorId: String(d.consignor.id), newName: "", split: s.split || String(consignCfg?.storeDefaultSplitPct ?? "") }));
 }
 }

 // publishAt (ISO) = schedule it: the server saves it as a draft now and the cron publishes it then.
 // Connected marketplaces → the "List on" checklist. Each starts at its own auto-list
 // setting: eBay/Etsy list through an API so they default on once connected; Depop and
 // Vestiaire follow the per-channel autoList flag the seller set in cross-listing settings.
 useEffect(() => {
 fetch("/api/store/cross-listing").then((r) => (r.ok ? r.json() : null)).then((d) => {
  if (!d) return;
  const acct = (k: string) => (d.accounts || []).find((a: { platform: string }) => a.platform === k);
  const connected = (d.platforms || []).filter((pl: { key: string }) =>
   acct(pl.key) || (pl.key === "ebay" && d.ebay?.connected) || (pl.key === "etsy" && d.etsy?.connected));
  const meta = connected.map((pl: { key: string; name: string; mode: string }) => ({
   key: pl.key, name: pl.name, mode: pl.mode,
   autoList: pl.key === "ebay" || pl.key === "etsy" ? true : Boolean(acct(pl.key)?.autoList),
  }));
  setChannelMeta(meta);
  const init: Record<string, boolean> = {};
  meta.forEach((m: { key: string; autoList: boolean }) => { init[m.key] = m.autoList; });
  setChannels(init);
 }).catch(() => {});
 }, []);

 async function publish(status: "active" | "draft" = "active", publishAt?: string) {
 if (!form.title.trim()) { setErr("Add a title first."); return; }
 if (!photos.length) { setErr("Add at least one photo."); return; }
 if ((status === "active" || publishAt) && !allConfirmed) { setErr("Confirm the flagged fields first."); return; }
 if (publishAt && new Date(publishAt).getTime() <= Date.now()) { setErr("Pick a time in the future to schedule."); return; }
 // A name typed into "add a new consignor" that was never Added. Publishing here used to succeed
 // with no consignor attached and say nothing — so the piece sells, the split never happens, and
 // nobody notices until the consignor asks. Refuse instead, and name the button she has to press.
 if (consigned && consign.newName.trim() && !consign.consignorId) {
  setErr(`Press “Add” next to “${consign.newName.trim()}” to save them as a consignor first — or clear the box if this piece isn’t on consignment.`);
  return;
 }
 // A weight is required to go live, because here the weight IS the buyer's postage: it picks the
 // flat tier they're charged. Shopify lets a product publish without one and finds out at checkout,
 // but Shopify rates live at fulfilment — we quote up front, so an unweighed piece silently quotes
 // the middle tier and the store eats the difference on anything heavy.
 //
 // It's cheap to satisfy: the AI weighs the piece from the photos, so the field arrives filled in.
 // This only catches the case where that failed AND nobody typed one. Drafts are exempt — a draft
 // isn't for sale yet.
 if ((status === "active" || publishAt) && !(Number(form.weightOz) > 0) && !(aiParcel?.weightOz)) {
  setErr("Add the weight before publishing — it decides what a buyer is charged for postage, and without it a heavy piece is quoted as a light one.");
  return;
 }
 setBusy(true);
 setBusyMsg(publishAt ? "Scheduling…" : status === "draft" ? "Saving draft…" : "Publishing…");
 setErr(null);
 try {
 const images = [ghost, ...photos].filter(Boolean);
 const r = await fetch(withStore("/api/store/intake/publish"), {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ ...form,
  // What gets stored is what the seller was shown: the weight she typed, or the AI's estimate the
  // tier readout on this page was computed from. Sending an empty string here would publish a
  // piece whose postage tier is decided by a number nobody ever saw.
  weightOz: form.weightOz.trim() || (aiParcel?.weightOz ? String(aiParcel.weightOz) : ""),
  status, publishAt: publishAt || null, draftId: draftIdRef.current, price: Number(form.price) || 0, cost: form.cost === "" ? null : Number(form.cost) || 0, collections: selectedCols, images, aiDraft,
 // Structure: the flaws list (with whatever is still in the box), the note, the template's numbers
 // (empties omitted; a list wins over the old free-text field), and the AI's parcel so publish can
 // keep the estimate and fill a weight she never typed (parcel-core.ts).
 sourceName, acquiredAt: acquiredAt || null,
 flaws: newFlaw.trim() ? [...flaws, newFlaw.trim()] : flaws, conditionNote, measurements: Object.values(measurements).some((v) => v && v.trim()) ? measurementsFromForm(measurements, units.unit) : form.measurements || null, parcel: aiParcel, photo: photos[0] ?? null, embedding, marketCents: rawMarketCents, aiConfidence, runway, celebrity, reverseImage, promptVersion, reviewed: allConfirmed, channels: Object.keys(channels).filter((k) => channels[k]), consignment: consigned && consign.consignorId ? { consignorId: Number(consign.consignorId), splitPct: consign.split ? Number(consign.split) : null, expiresAt: consign.expiresAt || null } : null }),
 });
 const d = await r.json();
 if (!r.ok) throw new Error(d.error || "Publish failed");
 // The piece exists now, so its rental terms have somewhere to live. Deliberately not fatal: a
 // published listing that failed to save its terms is fixable from the editor, whereas throwing
 // here would tell the seller the whole publish failed when it didn't.
 if (rentalDraft && d.itemId) {
 await fetch(withStore(`/api/store/rentals/terms/${d.itemId}`), {
 method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rentalDraft),
 }).catch(() => null);
 }
 setScheduledAt(d.scheduled ? d.publishAt : null);
 setSavedDraft(status === "draft" && !d.scheduled);
 // The autosaved draft is promoted in place by the publish endpoint (via draftId), so there's no
 // separate row to clean up — just forget the id so "List another" starts a fresh draft.
 draftIdRef.current = null;
 setPhase("done");
 } catch (e) {
 setErr(e instanceof Error ? e.message : "Publish failed");
 }
 setBusy(false);
 }

 /** Wipe everything the AI wrote, and anything typed over it, but keep the photos. */
 function clearDetails() {
  setForm(BLANK); setSelectedCols([]); setFlagged([]); setConfirmed({}); setErr(null);
  setRunway(null); setCelebrity(null); setSpecificPiece(null); setFlaws([]); setNewFlaw(""); setConditionNote(""); setMeasurements({}); setAiParcel(null); setCareTag(null);
  setMarketPrice(null); setRawMarketCents(null); setAiConfidence(null); setPriceNote("");
  setPriceLow(null); setPriceHigh(null); setPriceFlag(null); setLowConf(false);
  setAiDraft({}); setAiPhoto(null); setPromptVersion(null); setEmbedding(null); setReverseImage(null);
 }

 function reset() {
 draftIdRef.current = null; setAutoSavedAt(null); // fresh draft for the next item
 setPhase("form"); setPhotos([]); setSelPhoto(0); setRunway(null); setCelebrity(null); setGhost(null); setForm(BLANK);
 setSelectedCols([]); setFlagged([]); setConfirmed({}); setErr(null); setSavedDraft(false); setSourceName(""); setAcquiredAt("");
 setReverseImage(null); setSpecificPiece(null); setFlaws([]); setNewFlaw(""); setConditionNote(""); setMeasurements({}); setAiParcel(null); setPromptVersion(null); setCareTag(null); setMarketPrice(null); setRawMarketCents(null); setAiConfidence(null); setPriceNote(""); setPriceLow(null); setPriceHigh(null); setPriceFlag(null); setLowConf(false); setConsigned(false); setConsign({ consignorId: "", split: "", expiresAt: "", newName: "" }); setAiDraft({}); setAiPhoto(null); setEmbedding(null); setSchedule(""); setScheduledAt(null); setCrossResult([]);
 }

 // ── Done ──
 if (phase === "done") {
 return (
 <div className="flex min-h-screen items-center justify-center px-6 text-center">
 <div>
 <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">✓</div>
 <p className="text-xl font-semibold text-stone-900">{scheduledAt ? "Scheduled" : savedDraft ? "Saved as draft" : "Listed"}</p>
 <p className="mt-1 text-sm text-stone-500">{scheduledAt ? `It’ll go live automatically on ${new Date(scheduledAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.` : savedDraft ? "It’s in your inventory — publish it (or the whole drop) when you’re ready." : "It’s live on your storefront."}</p>
 {/* Where the piece actually landed. eBay/Etsy answer synchronously; Depop and
     Vestiaire come back queued for the extension to finish. */}
 {!scheduledAt && !savedDraft && crossResult.length > 0 && (
  <div className="mx-auto mt-5 max-w-sm space-y-2 text-left">
   {crossResult.map((c) => {
    const listed = c.status === "listed";
    const queued = c.status === "pending";
    return (
     <div key={c.platform} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
       <div className="text-[13px] font-medium text-stone-800">{c.name}</div>
       <div className="text-[11px] text-stone-400">{listed ? "Live now" : queued ? "Open the extension to finish — it’s pre-filled" : "Couldn’t list — check the details"}</div>
      </div>
      {listed && c.url && <a href={c.url} target="_blank" rel="noopener" className="text-[11px] font-semibold text-[var(--accent,#0e9f76)] hover:underline">View</a>}
      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", listed ? "bg-emerald-50 text-emerald-700" : queued ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700")}>
       {listed ? "Listed" : queued ? "Queued" : "Failed"}
      </span>
     </div>
    );
   })}
  </div>
 )}
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
 subtitle="Add photos and fill in what you know. AI fills in the rest, and never overwrites anything you typed."
 actions={<a href="/admin/bulk-upload" className="text-[13px] font-medium text-stone-500 hover:text-stone-800">Bulk upload →</a>}
 />

 {autoSavedAt && phase === "form" && (
 <div className="mb-4 flex items-center gap-1.5 text-[11px] text-stone-400">
 <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Draft auto-saved — it’s safe in your inventory if you leave.
 </div>
 )}

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
 {/* The cover, in the shape a shopper sees it. Clicking opens the positioner — sellers shoot
     vertically and the card crops the middle, so a piece framed low lost its hem and there was
     nothing to do about it. Only a real uploaded photo can be repositioned; the ghost-mannequin
     render is generated to fit already. */}
 <div className="group relative aspect-[3/4] w-full bg-stone-100">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={ghost || photos[selPhoto] || photos[0]} alt="" className="h-full w-full object-cover" />
 {!ghost && (photos[selPhoto] || photos[0]) && (
  <button
   type="button"
   onClick={() => setCropping(photos[selPhoto] || photos[0])}
   className="absolute bottom-2 right-2 rounded-lg bg-black/65 px-2.5 py-1.5 text-[11.5px] font-medium text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
  >Reposition</button>
 )}
 </div>
 </TechCard>
 <p className="mt-2 flex items-baseline justify-between gap-2 text-[11px] uppercase tracking-[0.08em] text-stone-400">
 <span>{ghost ? "Ghost-mannequin cover" : photos.length === 1 ? "Your photo" : "Your photos"}</span>
 {photos.length > 0 && (
  <span className="tabular-nums normal-case tracking-normal">
   {photos.length} of {MAX_ITEM_IMAGES}
   {photos.length >= MAX_ITEM_IMAGES ? " · full" : ""}
  </span>
 )}
</p>
 <div className="mt-2 flex flex-wrap gap-1.5">
 {photos.map((p, i) => (
 <div
 key={p}
 draggable
 onDragStart={() => { dragIdx.current = i; }}
 onDragOver={(e) => e.preventDefault()}
 onDrop={() => { if (dragIdx.current !== null) reorderPhoto(dragIdx.current, i); dragIdx.current = null; }}
 onClick={() => setSelPhoto(i)}
 className={cn(
  "group relative h-16 w-14 cursor-grab rounded transition active:cursor-grabbing",
  i === selPhoto ? "ring-2 ring-[var(--accent,#0e9f76)]" : "hover:ring-2 hover:ring-[var(--accent,#0e9f76)]/40",
 )}
 title="Click to open · drag to reorder"
 >
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={p} alt="" className="h-full w-full rounded object-cover ring-1 ring-stone-200" />
 {i === 0 && !ghost && <span className="absolute -left-1 -top-1 rounded bg-[var(--accent,#0e9f76)] px-1 text-[8px] leading-tight text-white">cover</span>}
 <button type="button" onClick={() => { setPhotos((ps) => ps.filter((_, j) => j !== i)); setSelPhoto((n) => (i < n ? n - 1 : Math.max(0, Math.min(n, photos.length - 2)))); }} className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-black/70 text-[10px] leading-none text-white group-hover:flex" aria-label="Remove">×</button>
 </div>
 ))}
 {photos.length < 8 && (
 <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="flex h-16 w-14 items-center justify-center rounded border border-dashed border-stone-300 text-stone-400 hover:border-stone-400 hover:text-stone-600">+</button>
 )}
 </div>
 {photos.length > 1 && <p className="mt-1 text-[10px] text-stone-400">Tap one to see it big{ghost ? "" : " · drag to reorder, first is the cover"}</p>}
 {aiPhoto && photos[0] && photos[0] !== aiPhoto && (
  <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
   <p><strong>These details were written from a different photo.</strong> Everything below still describes the piece you removed.</p>
   <div className="mt-1.5 flex gap-3">
    <button type="button" onClick={clearDetails} className="font-semibold underline underline-offset-2">Clear them</button>
    <button type="button" onClick={() => setAiPhoto(photos[0])} className="text-amber-800/70 underline underline-offset-2">Keep — they still apply</button>
   </div>
  </div>
 )}
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
 <p className="mt-1 text-[11px] text-stone-400">or drag here · up to {MAX_ITEM_IMAGES} · include the tag</p>
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

 <TechButton className="mt-4 w-full" variant="secondary" onClick={fillWithAI} disabled={busy || !photos.length}>
 <Sparkles size={14} className="mr-1.5 inline" />{busy ? busyMsg : "Fill the rest with AI"}
 </TechButton>
 <p className="mt-1.5 text-[11px] text-stone-400">{!form.brand.trim() ? "Tip: adding the brand sharpens the price & description — but AI will infer it from the photo if you leave it blank." : "Only fills blanks. Your price is always checked against live market comps."}</p>

 <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPick(e.target.files)} />
 </div>

 {/* Fields */}
 <TechCard className="space-y-4 p-5">
 <div>
 <label className={label}>Title</label>
 <input className={input} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. 1990s Prada nylon shoulder bag" />
 </div>
 <div className="grid grid-cols-2 gap-3">{riskyField("brand", "Brand")}{riskyField("era", "Era")}</div>
 <div className="grid grid-cols-2 gap-3">{riskyField("material", "Material")}{riskyField("colour", "Colour")}</div>
 <ConditionChips
 value={form.condition}
 onChange={(g) => set("condition", g)}
 note={conditionNote}
 onNoteChange={setConditionNote}
 flagged={flagged.includes("condition") && !confirmed.condition ? <span className="ml-2 text-[11px] font-normal text-amber-600">● AI unsure — confirm</span> : null}
 />
 {flagged.includes("condition") && (
 <label className="-mt-2 flex items-center gap-1.5 text-[11px] text-stone-500">
 <input type="checkbox" checked={!!confirmed.condition} onChange={(e) => setConfirmed((c) => ({ ...c, condition: e.target.checked }))} className="accent-[var(--accent,#0e9f76)]" />
 Confirmed
 </label>
 )}
 {/* Flaws are set by the AI from the photos and still show under Condition on the storefront.
     The hand-entry list came off the form: eleven fields before a price is too many. */}
 <div className="grid grid-cols-2 gap-3">
 <div><label className={label}>Size <span className="font-normal text-stone-400">— as marked on the tag</span></label><input className={input} value={form.size} onChange={(e) => set("size", e.target.value)} placeholder="IT 40 / UK 12 / M" /></div>
 <div>
 <label className={label}>Category</label>
 <div className="pt-1"><CategoryBreadcrumb value={form.category || null} onChange={(v) => set("category", v || "")} /></div>
 </div>
 </div>
 <div>
 <MeasurementFields category={form.category} values={measurements} onChange={setMeasurements} unit={units.unit} />
 {!Object.values(measurements).some((v) => v && v.trim()) && needsMeasurements && <p className="mt-1 text-[10px] text-amber-600">Buyers can’t try it on — listings with measurements sell faster. Add the key ones.</p>}
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div><label className={label}>Price ($)</label><input className={input} value={form.price} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); set("price", v); if (rawMarketCents && !lowConf) setPriceFlag(flagFor(Number(v) || 0, marketPrice, priceLow, priceHigh)); }} onBlur={checkPriceOnBlur} inputMode="decimal" placeholder="You set it, or AI estimates" />{(priceNote || (markupPct != null && form.cost)) && <p className="mt-1 text-[10px] text-stone-400">{priceNote || `auto · ${markupPct}% over cost`}</p>}</div>
 <div><label className={label}>Cost ($) <span className="font-normal text-stone-400">— what you paid, private</span></label><input className={input} value={form.cost} onChange={(e) => onCostChange(e.target.value)} inputMode="decimal" placeholder="optional" /></div>
 </div>
 {/* Where it came from and Acquired on came off the form — sourcing ROI is worth having, but
     not at the cost of two more boxes between a photo and a price. Both still live in the
     inventory editor, where a seller goes deliberately rather than forty times an afternoon. */}
 {priceLow != null && priceHigh != null && priceHigh > priceLow && (
 <PriceScale low={priceLow} high={priceHigh} market={marketPrice} value={Number(form.price) || 0} />
 )}
 {priceFlag && !lowConf && (
 <div className={`mt-2 rounded-lg px-3 py-2 text-[11px] font-medium ${priceFlag.level === "under" ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : priceFlag.level === "over" ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200" : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"}`}>
 {priceFlag.level === "under" ? "🔽 " : priceFlag.level === "over" ? "🔼 " : "✅ "}{priceFlag.message}
 </div>
 )}
 {lowConf && rawMarketCents != null && (
 <div className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-[11px] text-stone-500 ring-1 ring-stone-200">
 Not enough comparable pieces to price this confidently — treat the range as a rough guide. Add more detail or “Fill with AI” for a firmer read.
 </div>
 )}

 <RentalPanel priceCents={Math.round((Number(form.price) || 0) * 100)} onDraftChange={setRentalDraft} />

 {/* Same shape as Renting above: these are the two "this piece works differently" switches, and
     they were drawn differently — one with a label pill and roomy copy, one with a bold line and
     small grey text — which made them read as unrelated features rather than a pair. */}
 <div className="mt-5 rounded-xl border border-stone-200 p-4">
 <div className="flex items-start justify-between gap-6">
 <div className="min-w-0">
 <SectionLabel className="mb-0">Consignment</SectionLabel>
 <p className="mt-1 max-w-[52ch] text-[12px] leading-relaxed text-stone-500">
 {consigned
  ? "This piece belongs to a consignor. They're credited their split automatically when it sells."
  : "Selling this for someone else? Track their split and pay them when it sells."}
 </p>
 </div>
 <Toggle on={consigned} onClick={toggleConsigned} />
 </div>
 {consigned && (
 <div className="mt-4 space-y-3">
 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className={label}>Consignor</label>
 {/* "Add a new consignor" lives IN the list rather than as a second field below it: one control,
     and the name box only appears when you've said you want one. */}
 <select className={input} value={consign.newName.trim() || consign.consignorId === "__new__" ? "__new__" : consign.consignorId}
  onChange={(e) => { if (e.target.value === "__new__") { setConsign({ ...consign, consignorId: "__new__" }); } else { setConsign({ ...consign, newName: "" }); pickConsignor(e.target.value); } }}>
 <option value="">Select…</option>
 {consignors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
 <option value="__new__">+ Add a new consignor…</option>
 </select>
 </div>
 <div><label className={label}>Consignor split %</label><input className={input} value={consign.split} onChange={(e) => setConsign({ ...consign, split: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder="auto from rules" /></div>
 </div>
 {/* Typing a name and NOT pressing Add used to lose it: the piece published with no consignor,
     and nothing said so. The field turns red and the button reads "Add — don't forget" while a
     name is sitting there uncommitted, and publish refuses (see consignBlocker). */}
 {(consign.consignorId === "__new__" || consign.newName.trim()) && (
 <div className="flex items-end gap-2">
 <div className="flex-1">
  <label className={label}>Their name</label>
  <input
   className={`${input} ${consign.newName.trim() ? "border-red-400 bg-red-50/40" : ""}`}
   value={consign.newName}
   onChange={(e) => setConsign({ ...consign, newName: e.target.value })}
   placeholder="Name"
  />
 </div>
 <button type="button" onClick={addConsignor} disabled={!consign.newName.trim()}
  className={`rounded-lg border px-3 py-2 text-[12.5px] disabled:opacity-40 ${consign.newName.trim() ? "border-red-400 bg-red-50 font-semibold text-red-600" : "border-stone-200 text-stone-600 hover:bg-stone-50"}`}>
  {consign.newName.trim() ? "Add — don’t forget" : "Add"}
 </button>
 </div>
 )}
 {consign.newName.trim() && (
  <p className="text-[11.5px] font-medium text-red-600">Press <strong>Add</strong> to save “{consign.newName.trim()}” as a consignor — otherwise this piece publishes with none.</p>
 )}
 {consign.split && <p className="text-[11px] text-stone-400">Consignor gets {consign.split}% · store keeps {100 - (Number(consign.split) || 0)}%.</p>}
 </div>
 )}
 </div>
 <div>
 {/* One question instead of four numbers — but the weight stays, because the buyer's postage is
     chosen by the LARGER of weight and girth and getting it wrong means the store eats the
     difference on every parcel. The AI weighs the piece from the photos; the packaging adds its
     own; the tier and the buyer's price are shown so nothing is decided out of sight. */}
 <label className={label}>Ships in</label>
 <select
  className={input}
  value={packing}
  onChange={(e) => {
   const box = packagingById(e.target.value);
   setPacking(e.target.value);
   if (box) { set("lengthIn", String(box.lengthIn)); set("widthIn", String(box.widthIn)); set("heightIn", String(box.heightIn)); }
  }}
 >
  {PACKAGING.map((b) => <option key={b.id} value={b.id}>{b.label} — {b.hint}</option>)}
 </select>

 <div className="mt-2.5 flex items-center gap-2">
  <label className="text-[12px] font-medium text-stone-700">Weight</label>
  {/* Shown and typed in the store's own unit; stored in ounces, which is what the tiers, the
      carriers and the label all speak. A London shop weighs a coat in grams — asking her for
      ounces is the same discourtesy as showing her a dollar sign, and a converted-in-her-head
      weight is a mis-quoted parcel. */}
  <input
   className={cn(input, "w-24")}
   inputMode="numeric"
   value={form.weightOz ? String(fromOz(form.weightOz, units.weightUnit)) : ""}
   onChange={(e) => {
    const typed = e.target.value.replace(/[^\d]/g, "");
    set("weightOz", typed ? String(toOz(typed, units.weightUnit)) : "");
   }}
   placeholder={aiParcel?.weightOz ? String(fromOz(aiParcel.weightOz, units.weightUnit)) : units.weightUnit}
   aria-label={`Weight of the piece in ${units.weightUnit === "g" ? "grams" : "ounces"}`}
  />
  <span className="text-[12px] text-stone-500">{units.weightUnit}</span>
  {!form.weightOz.trim() && aiParcel?.weightOz ? (
   <span className="text-[11px] text-stone-400">estimated from the photos</span>
  ) : null}
 </div>

 {(() => {
  const box = packagingById(packing);
  const piece = Number(form.weightOz) || aiParcel?.weightOz || 0;
  const packed = packedWeightOz(piece, box);
  if (!box) return null;
  if (!packed) {
   return <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800 ring-1 ring-amber-200">Add a weight — without one the buyer is quoted the middle tier, and a heavy piece costs you the difference.</p>;
  }
  const tier = assignTier({ weightOz: packed, lengthIn: box.lengthIn, widthIn: box.widthIn, heightIn: box.heightIn });
  return (
   <p className="mt-2 text-[11.5px] text-stone-500">
    {box.lengthIn}×{box.widthIn}×{box.heightIn} in · about {packed} oz packed ·{" "}
    <span className="font-medium text-stone-800">buyer pays {tier.label} — ${(tier.priceCents / 100).toFixed(2)}</span>
   </p>
  );
 })()}
 </div>
 <div>
 <div className="flex items-center justify-between">
 <label className={label}>Description</label>
 <button
 type="button" onClick={polishForSeo} disabled={seoBusy || form.description.trim().length < 10}
 className="text-[11px] font-medium text-[var(--accent,#0e9f76)] transition hover:opacity-70 disabled:opacity-40"
 title="Rewrite the description so it turns up in more searches. Keeps your wording and facts."
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
 {/* A dropdown, not just chips. On a store with no collections yet there were no chips to see,
     so this read as a free-text box and nobody knew the saved ones existed. Same shape as the
     consignor picker: choose an existing one, or add. */}
 <select
  className={cn(input, "mt-2")}
  value=""
  onChange={(e) => {
   const v = e.target.value;
   if (!v) return;
   if (v === "__new__") { setAddingCol(true); return; }
   setSelectedCols((s) => (s.includes(v) ? s : [...s, v]));
  }}
 >
  <option value="">{cols.length ? "Add to a collection…" : "No collections yet"}</option>
  {cols.filter((c) => !selectedCols.includes(c.title)).map((c) => (
   <option key={c.id} value={c.title}>{c.title}{c.itemCount ? ` (${c.itemCount})` : ""}</option>
  ))}
  <option value="__new__">+ New collection…</option>
 </select>
 {addingCol && (
  <input
   autoFocus
   className={cn(input, "mt-2")}
   value={newCol}
   onChange={(e) => setNewCol(e.target.value)}
   onBlur={() => { const t = newCol.trim(); if (t && !selectedCols.includes(t)) setSelectedCols((s) => [...s, t]); setNewCol(""); setAddingCol(false); }}
   onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } if (e.key === "Escape") { setNewCol(""); setAddingCol(false); } }}
   placeholder="Name it — Y2K, Designer bags…"
  />
 )}
 </div>


 {channelMeta.length > 0 && (

  <div className="w-full border-t border-stone-100 pt-4">

   <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">

    <span className="pt-1 text-[11px] uppercase tracking-[0.14em] text-stone-400 sm:w-20 sm:shrink-0">List on</span>

    <div className="flex-1 space-y-3">

     {channelMeta.map((m) => {

      const on = !!channels[m.key];

      return (

       <button

        key={m.key}

        type="button"

        role="checkbox"

        aria-checked={on}

        onClick={() => setChannels((c) => ({ ...c, [m.key]: !c[m.key] }))}

        className="flex w-full items-start gap-3 text-left"

       >

        <span className={cn("mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition",

         on ? "border-[var(--accent,#0e9f76)] bg-[var(--accent,#0e9f76)] text-white" : "border-stone-300 bg-white")}>

         {on && (

          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">

           <path d="M2.5 6.5 5 9l4.5-5" />

          </svg>

         )}

        </span>

        <span className="min-w-0">

         <span className={cn("block text-[14px] font-semibold transition", on ? "text-stone-900" : "text-stone-400")}>{m.name}</span>

         <span className="block text-[12px] text-stone-400">

          {m.mode === "extension" ? "Queues for the extension to post" : "Lists automatically via API"}

         </span>

        </span>

       </button>

      );

     })}

    </div>

   </div>

   <p className="mt-3 text-[11px] text-stone-400 sm:pl-[104px]">Your storefront always goes live — these are the extra marketplaces.</p>

  </div>

 )}


 <div className="flex flex-wrap items-center gap-4 border-t border-stone-100 pt-4">
 <TechButton onClick={() => publish("active")} disabled={busy || !allConfirmed}>{busy ? busyMsg : "Publish listing"}</TechButton>
 <TechButton variant="secondary" onClick={() => publish("draft")} disabled={busy || !form.title.trim()}>Save as draft</TechButton>
 {/* Always available, not only when we happen to notice the photo changed — "start this piece
     again" is a thing a seller wants for plenty of reasons we can't detect. Confirms first,
     because it throws away written work. */}
 {(form.title.trim() || Object.keys(aiDraft).length > 0) && (
  <button
   type="button"
   disabled={busy}
   onClick={() => { if (confirm("Clear everything written about this piece? Your photos stay.")) clearDetails(); }}
   className="text-[12.5px] text-stone-500 underline underline-offset-2 transition hover:text-stone-800 disabled:opacity-40"
  >
   Clear details
  </button>
 )}
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
 {cropping && (
  <PhotoCropper
   url={cropping}
   onCancel={() => setCropping(null)}
   onCropped={(next) => { setPhotos((ps) => ps.map((p) => (p === cropping ? next : p))); setCropping(null); }}
  />
 )}
 </AdminPage>
 );
}
