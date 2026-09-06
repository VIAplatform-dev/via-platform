// ───────────────────────────────────────────────────────────────────────────
// AI intake — the wedge. A photo in, a drafted listing out: title, era, material
// (read off the care tag), condition, brand, a price hint — each with a
// confidence so the review screen can gate the risky fields (material, era,
// authenticity) for the seller to confirm before publishing.
// Uses Claude vision (raw REST, matching app/lib/data-layer/vision.ts).
// ───────────────────────────────────────────────────────────────────────────

import { AI_MODELS } from "./ai-models";
import { recordAnthropic } from "./cost-tracker";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const INTAKE_MODEL = AI_MODELS.intake;

export function isIntakeConfigured(): boolean {
 return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type DraftField = { value: string | null; confidence: number };
export type ListingDraft = {
 title: string;
 description: string; // SEO-optimized resale description
 brand: DraftField;
 era: DraftField;
 material: DraftField;
 colour: DraftField;   // the dominant colour, as a plain word — Vestiaire requires one and refuses a guess
 condition: DraftField;
 conditionGrade: string | null; // canonical resale grade (Deadstock/NWT…Fair) from VISIBLE wear
 flaws: string[]; // specific visible flaws (pilling, scuffs, tarnish…) — [] if none seen
 category: string | null;
 searchQuery: string | null; // tightest brand+model+era phrase to find THIS piece's comps
 careTag: string | null; // verbatim care/composition label text, if legible
 tag: { brandText: string | null; rn: string | null; madeIn: string | null; styleCode: string | null } | null; // OCR of the brand/RN label — transcribed, not inferred
 runway: string | null; // runway collection/season if identifiable, e.g. "Blumarine F/W 2002"
 priceHint: number | null; // suggested USD price
 parcel: { weightOz: number; lengthIn: number; widthIn: number; heightIn: number }; // estimated shipping parcel
};

// Fields where a wrong guess is costly — gated for confirmation when low-confidence.
export const RISKY_FIELDS = ["brand", "era", "material"] as const;
export const CONFIDENCE_THRESHOLD = 0.75;
export function needsReview(field: DraftField): boolean {
 return !field.value || field.confidence < CONFIDENCE_THRESHOLD;
}

// Bump when the intake prompts/logic change materially — stamped on every training
// example so we never blend guesses from different "brain eras" when training.
export const PROMPT_VERSION = "2026-08-10";

const SYSTEM =
 "You are a vintage & secondhand fashion expert drafting a resale listing from product photos. Identify the piece precisely and read any visible care/composition tag for fabric content. You also write the SEO-optimized description and benchmark price the way the best resale sellers do — drawing on how comparable pieces are titled, described, and sold on Grailed, eBay (sold listings), Vestiaire Collective, and Depop. Authentication, era, and material are high-stakes — only give high confidence when the visual evidence is genuinely clear; otherwise lower the confidence or return null. Never invent facts (measurements, flaws, provenance) you can't see. RUNWAY PROVENANCE (rare — default to null): naming a runway collection is a strong, falsifiable claim shown to buyers that raises the price, so the bar is HIGH. Only name one for a specific archival garment/look you can genuinely tie to ONE documented show (e.g. an unmistakable Cavalli S/S 2003 poppy-print gown, or a Tom Ford for Gucci S/S 2004 look). A piece merely being a known brand from a known era is NOT runway provenance. Production and commercial items — mass-produced handbag lines (the Fendi Baguette, Dior Saddle, standard monogram/logo bags), production ready-to-wear, and everyday accessories, jeans and tees — are NOT runway pieces, even when the brand and era are famous and even if that style once appeared on a runway; return runway = null for them. Assert a season ONLY when the EXACT archival look is documented and unmistakable, or the provided comps consistently cite the same specific season. Never infer a season from brand + era alone, and never fabricate one.\n\nCRITICAL — BRANDING: Do NOT name a specific brand or designer from silhouette, fabric, color, or overall 'vibe' alone. A designer-LOOKING dress is not evidence of any particular house. Assign a brand ONLY when there is (a) a visible label/logo/hardware/monogram in the photo, (b) reverse-image-search matches provided to you that point to it, or (c) an unmistakable, documented archival design. Absent that, return brand = null with low confidence — an honest 'unbranded' beats a confident wrong label. Never default to a 'house style' guess (e.g. assuming every slinky Y2K piece is one particular Italian house).\n\nCRITICAL — ERA: you CANNOT reliably date a garment from a photo. A silhouette that reads vintage is not a date — houses revive their own archives, and a 2008 runway piece can look like 1995. Give an era ONLY when it is genuinely corroborated: a legible datable label (union label, RN/WPL, a discontinued logo treatment), a documented archival look you recognise exactly, or comps that agree. Otherwise return era = null. A guessed decade is not harmless: it goes into the comp search, so guessing '1990s' on a recent runway piece pulls the price toward old department-store stock. When unsure, leave it blank and lower confidence.\n\nCRITICAL — BRAND LINE: name the LINE, not just the house. 'Ralph Lauren' spans Collection and Purple Label (runway, thousands) down to Lauren Ralph Lauren and Chaps (department store, tens) — and the same is true of Armani, Versace, Valentino, McQueen, Marc Jacobs, Moschino, Burberry, Chloé and many others. Read the LABEL in the photo and report exactly what it says. If the tag isn't legible, do NOT assume the top line — say the house alone and lower confidence. The line drives which comps are searched, so getting it wrong is the single most expensive mistake available here.\n\nCRITICAL — MATERIAL: fabrics that look alike in a photo (neoprene, satin, microfiber, nylon, jersey, wool, canvas) CANNOT be told apart by sight. Only name a SPECIFIC fiber when the care/composition tag is legible, or the material is truly unmistakable (obvious leather, denim, shearling, sequins). Otherwise LEAVE THE MATERIAL BLANK — return the material value as null. Do NOT fill a vague descriptor ('black fabric', 'smooth textile') and do NOT guess a specific fiber ('neoprene'): a blank field the seller fills in is cleaner and more honest than a wrong or wishy-washy material. Only fill material when you can genuinely verify it — a legible composition tag, or an unmistakable material (leather, denim, shearling, sequins, knit).\n\nPINPOINT THE PIECE: you are usually GIVEN the brand — use it, and go past 'a Prada bag' to the SPECIFIC model / line / collection and era (e.g. 'Prada Re-Nylon shoulder bag', 'the Cavalli S/S 2003 poppy-print gown', 'Levi's 501 big E'). Pricing accuracy depends on comps for the EXACT piece, not the brand in general — so put that specificity into both the title AND the searchQuery.";

const INSTRUCTION = `Return ONLY a JSON object (no prose, no markdown) with exactly this shape:
{
 "title": string,                                  // clean, search-friendly title, e.g. "1990s Prada nylon shoulder bag"
 "description": string,                            // Polished, ready-to-publish boutique copy — 2-3 sentences, ~40-80 words. Lead with the terms buyers search (brand, item, era, standout detail), then silhouette, fabric/color, and the one or two most distinctive details. Only if the runway field is set (a documented collection) weave that provenance in as a selling point naming the specific season+year (e.g. "from the Tom Ford for Gucci S/S 2004 runway"); otherwise do not mention runways or shows at all. End with a brief, honest condition note. See the STRICT DESCRIPTION RULES below.
 "brand": {"value": string|null, "confidence": number},
 "era": {"value": string|null, "confidence": number},      // e.g. "1990s","Y2K","2000s"
 "material": {"value": string|null, "confidence": number}, // prefer the care tag if legible
 "colour": {"value": string|null, "confidence": number},   // the ONE dominant colour of the piece as a plain word: Black, White, Beige, Brown, Camel, Grey, Navy, Blue, Green, Red, Burgundy, Pink, Purple, Orange, Yellow, Gold, Silver, Ecru, Khaki, Turquoise, Anthracite, or Multicolour for a print or several colours with no dominant one. Unlike fibre, colour IS readable from a photo, so fill it — but judge the GARMENT, not the backdrop or the lighting, and use Multicolour rather than picking one colour out of a print.
 "condition": {"value": string|null, "confidence": number},   // a short, honest customer-facing condition note (e.g. "Excellent — light wear to the sole")
 "conditionGrade": string|null,                    // EXACTLY one of: "Deadstock/NWT","Excellent","Very Good","Good","Fair". Grade STRICTLY from VISIBLE wear only. Inspect closely for: pilling, stains, fading, sole/heel wear, scuffs, tarnished or missing hardware, holes, loose threads, pulls, stretched/misshapen areas, yellowing. A clean piece with NO visible flaws is "Excellent" (or "Deadstock/NWT" only if tags/deadstock are visible) — do NOT default to "Good". Only grade down for wear you can actually see.
 "flaws": string[],                                // the specific visible flaws behind the grade, e.g. ["light pilling at cuffs","scuffed toe","tarnished zipper pull"]. [] if none are visible. NEVER invent a flaw you cannot clearly see in the photos.
 "category": string|null,                          // e.g. "bags","dresses","shoes","tops"
 "searchQuery": string|null,                       // The TIGHTEST phrase to find THIS EXACT piece's resale comps: the KNOWN brand + the specific model/line/collection + one key attribute (material or silhouette) + era ONLY if it narrows it. No adjectives, no condition, no fluff. e.g. "Prada Re-Nylon shoulder bag", "Levi's 501 big E", "Cavalli S/S 2003 poppy print gown", "Coach Willis crossbody". Getting to the SPECIFIC model — not just the brand — is what makes the price accurate. null only if you genuinely can't get more specific than the brand.
 "careTag": string|null,                           // verbatim text legible on the care/composition label, else null
 "tag": {"brandText": string|null, "rn": string|null, "madeIn": string|null, "styleCode": string|null}, // READ THE LABEL — transcribe EXACTLY as printed, never inferred: the brand/maker name on the brand label; the RN number (US "RN 12345" → digits only); "Made in ___"; any style/article/model number printed. null anything not clearly legible. The printed brand name and RN are the STRONGEST brand evidence there is — much stronger than silhouette or vibe.
 "runway": string|null,                            // RARE — default null. The one documented runway collection this EXACT archival piece is from, formatted "Brand S/S YYYY" or "Brand F/W YYYY" (e.g. "Tom Ford for Gucci S/S 2004"). Only fill it when the look is an unmistakable, documented runway piece OR the provided comps consistently cite the same specific season. A known brand + era is NOT enough. Production/commercial items — mass-produced handbag lines (Fendi Baguette, Dior Saddle, monogram bags), production RTW, everyday accessories/jeans/tees — are NOT runway pieces; return null. Never infer a season from brand/era; never fabricate.
 "priceHint": number|null,                         // suggested resale price in USD (integer), benchmarked to how comparable pieces sell on Grailed / eBay sold / Vestiaire / Depop given brand, era, rarity, and condition
 "parcel": {"weightOz": int, "lengthIn": int, "widthIn": int, "heightIn": int}   // estimated SHIPPING parcel (packed, incl. packaging). Judge weight from the ACTUAL item shown — its size, material, and heft — NOT a blanket category default. A strappy sandal weighs a fraction of a boot. Guide ranges (oz): strappy sandals / kitten heels / thin flats ≈ 12-18; pumps / heels / loafers / ballet flats ≈ 16-26; sneakers ≈ 28-40; ankle boots ≈ 36-52; tall/heavy boots ≈ 52-72; tee / thin top ≈ 6-10; blouse / light dress ≈ 10-18; knit sweater ≈ 16-28; jeans ≈ 20-28; coat ≈ 40-64; handbag ≈ 16-40 (small clutch ≈ 12). Box dims (in): sandals/heels/accessories ≈ 12x8x4; sneakers ≈ 13x8x5; boots/coats ≈ 16x12x6; folded garments ≈ 12x10x2. Do NOT over-weight lightweight items.
}
confidence is a number 0..1.

STRICT DESCRIPTION RULES (the "description" field is customer-facing storefront copy):
- NEVER reveal how you identified anything. No "reverse image search", "web matches", "the photos provided/shown", "I can see", "based on the image", "AI", or any mention of confidence/uncertainty. The shopper must never see your detection process.
- NEVER hedge. Write with the assured voice of an expert seller. If you're unsure of a fact, OMIT it — do not write "appears to be", "likely", "seems", or "no care tag is legible".
- Keep it TIGHT: 2-3 sentences. No purple prose, no cataloguing every panel/seam/strap, no hype, no invented facts (measurements, flaws, provenance you aren't sure of).
- Material/care uncertainty belongs ONLY in the structured fields, never in the description.
- SEO, the natural way: work in the plain-language item type a shopper actually types — "shoulder bag", "slip dress", "leather moto jacket", "pleated midi skirt" — plus the brand and era, each mentioned ONCE, woven into real sentences. Do NOT stuff, repeat, or list keywords; a description that reads like a keyword pile ranks worse AND reads robotic. One natural mention of each search term beats five forced ones.
- It must read as finished retail copy a boutique would publish as-is.`;

/* eslint-disable @typescript-eslint/no-explicit-any */
function toField(f: any): DraftField {
 const confidence = typeof f?.confidence === "number" ? Math.max(0, Math.min(1, f.confidence)) : 0;
 const value = typeof f?.value === "string" && f.value.trim() ? f.value.trim() : null;
 return { value, confidence };
}

function parseDraft(text: string): ListingDraft {
 const m = text.match(/\{[\s\S]*\}/);
 let raw: any = {};
 try {
 raw = m ? JSON.parse(m[0]) : {};
 } catch {
 raw = {};
 }
 return {
 title: typeof raw.title === "string" ? raw.title.trim().slice(0, 200) : "",
 description: typeof raw.description === "string" ? raw.description.trim().slice(0, 2000) : "",
 brand: toField(raw.brand),
 era: toField(raw.era),
 material: toField(raw.material),
 colour: toField(raw.colour),
 condition: toField(raw.condition),
 conditionGrade: typeof raw.conditionGrade === "string" && raw.conditionGrade.trim() ? raw.conditionGrade.trim().slice(0, 40) : null,
 flaws: Array.isArray(raw.flaws) ? raw.flaws.filter((f: any) => typeof f === "string" && f.trim()).map((f: string) => f.trim().slice(0, 120)).slice(0, 8) : [],
 category: typeof raw.category === "string" ? raw.category.trim() : null,
 searchQuery: typeof raw.searchQuery === "string" && raw.searchQuery.trim() ? raw.searchQuery.trim().slice(0, 160) : null,
 careTag: typeof raw.careTag === "string" && raw.careTag.trim() ? raw.careTag.trim() : null,
 tag: parseTag(raw.tag),
 runway: typeof raw.runway === "string" && raw.runway.trim() ? raw.runway.trim().slice(0, 120) : null,
 priceHint: typeof raw.priceHint === "number" && raw.priceHint > 0 ? Math.round(raw.priceHint) : null,
 parcel: parseParcel(raw.parcel),
 };
}

// Structured OCR of the garment's brand/RN label. Kept verbatim (the model is told to transcribe,
// not infer). null when nothing on the label was legible. RN is normalized to digits (US RN numbers
// are 5-6 digits; keep up to 8 to be safe).
function parseTag(t: any): ListingDraft["tag"] {
 const s = (v: any) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);
 const rnRaw = t?.rn != null ? String(t.rn).replace(/[^0-9]/g, "") : "";
 const rn = rnRaw.length >= 4 && rnRaw.length <= 8 ? rnRaw : null;
 const brandText = s(t?.brandText), madeIn = s(t?.madeIn), styleCode = s(t?.styleCode);
 if (!brandText && !rn && !madeIn && !styleCode) return null;
 return { brandText, rn, madeIn, styleCode };
}

// Estimated shipping parcel with safe defaults (a medium poly mailer) when the
// model omits a dimension — a label always needs a complete parcel. Always round
// UP (never down): a declared parcel that's slightly bigger/heavier than reality
// only over-quotes a touch; one that's too small risks a carrier re-weigh charge.
function parseParcel(p: any): { weightOz: number; lengthIn: number; widthIn: number; heightIn: number } {
 const n = (v: any, d: number) => (typeof v === "number" && v > 0 ? Math.ceil(v) : d);
 return { weightOz: n(p?.weightOz, 16), lengthIn: n(p?.lengthIn, 12), widthIn: n(p?.widthIn, 9), heightIn: n(p?.heightIn, 3) };
}

/**
 * Draft a listing from one or more product photo URLs. If `voice` is supplied
 * (the store's learned writing voice + real examples), the description is written
 * in that voice so it reads like the store — not like generic AI.
 */
export async function draftListing(
 imageUrls: string[],
 voice?: { guide: string; examples: string[] },
 hints?: string,
 known?: Record<string, string>,
): Promise<ListingDraft> {
 const apiKey = process.env.ANTHROPIC_API_KEY;
 if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

 const images = imageUrls.filter(Boolean).slice(0, 6).map((url) => ({ type: "image", source: { type: "url", url } }));
 if (!images.length) throw new Error("No images provided");

 // Anything the seller typed by hand is GROUND TRUTH — the copy must honor it and
 // never contradict it (esp. condition: don't upgrade "good" to "excellent").
 const knownEntries = known ? Object.entries(known).filter(([, v]) => v && v.trim()) : [];
 const knownBlock = knownEntries.length
 ? `\n\nSELLER-PROVIDED FACTS (authoritative — the seller entered these by hand):\n${knownEntries.map(([k, v]) => `- ${k}: ${v}`).join("\n")}\nTreat these as GROUND TRUTH. Write the title and description fully consistent with them and NEVER contradict them. In particular, honor the seller's stated CONDITION exactly — never upgrade or embellish it (if they said "good", do not write "excellent", "pristine", or "like new"). For the matching JSON fields, return the seller's value unchanged. Fill only the fields they did NOT provide from the photos.`
 : "";

 const voiceBlock = voice?.guide
 ? `\n\nIMPORTANT — write the "description" in THIS store's own voice so it reads like they wrote it, NOT like generic AI.\nTheir voice: ${voice.guide}` +
 (voice.examples?.length
 ? `\nReal examples of how they write their listings:\n${voice.examples.map((e, i) => `${i + 1}. "${e.slice(0, 400)}"`).join("\n")}`
 : "") +
 `\nMatch their FORMAT/STRUCTURE (section order, labels, line breaks, template) AND their tone, sentence length, vocabulary, punctuation, and what they lead with — while staying accurate to the photo. If they follow a strict template, follow it exactly; if their listings vary, vary the same way. Do not copy the example wording verbatim.`
 : "";

 const res = await fetch(ANTHROPIC_URL, {
 method: "POST",
 headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
 body: JSON.stringify({
 model: INTAKE_MODEL,
 max_tokens: 1200,
 system: SYSTEM,
 messages: [{ role: "user", content: [...images, { type: "text", text: INSTRUCTION + knownBlock + voiceBlock + (hints || "") }] }],
 }),
 });
 if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
 const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
 await recordAnthropic(INTAKE_MODEL, "draft", data);
 const text = data.content?.find((c) => c.type === "text")?.text ?? "";
 return parseDraft(text);
}

/**
 * Polish a description the SELLER typed so it's optimized for search — without changing their facts,
 * inventing details, or losing their voice. Text-only (no photo). Returns the rewritten description.
 * Used by the "Improve for search" button so store-written copy gets the same SEO-natural treatment
 * the AI-drafted copy already gets. Never adds a fact the seller didn't give.
 */
export async function polishDescriptionForSeo(
 input: { description: string; title?: string; brand?: string; era?: string; material?: string; condition?: string; size?: string; category?: string },
 voice?: { guide: string; examples: string[] } | null,
): Promise<string> {
 const apiKey = process.env.ANTHROPIC_API_KEY;
 if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

 const facts = Object.entries({ title: input.title, brand: input.brand, era: input.era, material: input.material, condition: input.condition, size: input.size, category: input.category })
  .filter(([, v]) => v && String(v).trim())
  .map(([k, v]) => `- ${k}: ${v}`).join("\n");
 const voiceBlock = voice?.guide
  ? `\n\nKeep it in THIS store's voice (don't make it sound like generic AI): ${voice.guide}` +
    (voice.examples?.length ? `\nExamples of how they write:\n${voice.examples.slice(0, 3).map((e, i) => `${i + 1}. "${e.slice(0, 300)}"`).join("\n")}` : "")
  : "";

 const prompt = `Rewrite this resale listing description so it's optimized for search while still reading like a person wrote it.

CURRENT DESCRIPTION:
"${input.description.slice(0, 2000)}"
${facts ? `\nTHE PIECE (ground truth — never contradict these, and NEVER add a fact beyond them):\n${facts}\n` : ""}${voiceBlock}

RULES:
- Work in the plain-language item type a shopper actually types (e.g. "shoulder bag", "slip dress", "leather moto jacket") plus the brand and era, each ONCE, woven into real sentences. Never stuff, repeat, or list keywords.
- Keep EVERY fact the seller stated. Do NOT invent measurements, flaws, materials, or provenance not given above. If something isn't provided, don't add it.
- Keep the seller's voice and any structure/template they used. Tight: 2–3 sentences.
- No hedging ("appears to be"), no mention of SEO/AI/keywords, no hype.
Return ONLY the rewritten description text — no quotes, no preamble, no JSON.`;

 const res = await fetch(ANTHROPIC_URL, {
  method: "POST",
  headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
  body: JSON.stringify({
   model: INTAKE_MODEL,
   max_tokens: 400,
   system: "You are an expert resale copywriter. You optimize listing descriptions for search while keeping them natural, accurate, and in the seller's own voice. You never invent facts the seller didn't provide.",
   messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
  }),
 });
 if (!res.ok) throw new Error(`Anthropic error ${res.status}`);
 const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
 await recordAnthropic(INTAKE_MODEL, "polish_seo", data);
 const text = (data.content?.find((c) => c.type === "text")?.text ?? "").trim();
 return text.replace(/^["']+|["']+$/g, "").trim().slice(0, 2000);
}

// Proactive runway-provenance check. Runs whenever a listing has no runway yet (even when the
// seller filled the main fields and the full draft was skipped) — so archival/runway pieces are
// caught automatically, not only when the seller says so. Looks at the photo + brand + the
// comparable listing titles as evidence, and stays conservative: it NAMES a documented season
// when it genuinely recognizes the piece, and returns null for generic pieces (no fabrication).
// Which LINE of a multi-tier house a piece belongs to, judged from the GARMENT.
//
// A seller types what the tag says — "Ralph Lauren" — and that is genuinely all
// they know. But that one name covers a runway Collection gown worth thousands
// and a department-store dress worth forty, and taking it at face value prices
// the gown as the dress. The garment itself is the evidence: fabric, cut,
// finishing and formality separate a Collection piece from a Lauren RL one long
// before any label is legible.
//
// Conservative by construction: it returns null unless genuinely confident, and
// the caller keeps the unqualified house line in that case — so an uncertain
// answer changes nothing rather than guessing a piece upmarket.
export async function identifyBrandTier(
 imageUrls: string[],
 house: string,
 item: string,
 lines: { label: string; tier: string }[],
): Promise<{ label: string; confidence: number } | null> {
 const apiKey = process.env.ANTHROPIC_API_KEY;
 if (!apiKey || !house.trim() || lines.length < 2) return null;
 const images = imageUrls.filter(Boolean).slice(0, 2).map((url) => ({ type: "image", source: { type: "url", url } }));
 if (!images.length) return null;

 const options = lines.map((l) => `- ${l.label} (${l.tier})`).join("\n");
 const prompt = `You are authenticating which LINE of ${house} this garment is, from the photographs. The seller has only told us "${house}", which spans lines at very different price levels.${item ? ` They describe it as: ${item}.` : ""}

The lines, most prestigious first:
${options}

Judge from the GARMENT, not from any label — assume no label is visible. Weigh:
- FABRIC: silk, taffeta, duchesse satin, hand-beading, real leather → an upper line. Poly crepe, jersey, printed synthetics → a diffusion line.
- CUT AND CONSTRUCTION: bias cut, draping, boning, couture finishing, unusual seaming, a designed silhouette → upper. Simple sheath/wrap/A-line block patterns → diffusion.
- FORMALITY AND INTENT: a designed evening or runway-adjacent piece → upper. Everyday office, casual and basics → diffusion.
- Diffusion lines make FAR more garments than the top line, so the base rate favours them. Only choose an upper line when the piece genuinely looks like one.

Return the single best-matching line label EXACTLY as written above. If the garment is ordinary, or you cannot tell, return null — a wrong upward guess prices a $40 dress at $2,000 and is far worse than no answer.
Return ONLY JSON: {"label": string|null, "confidence": 0..1}.`;

 try {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
   method: "POST",
   headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
   body: JSON.stringify({
    model: INTAKE_MODEL,
    max_tokens: 200,
    messages: [{ role: "user", content: [...images, { type: "text", text: prompt }] }],
   }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  await recordAnthropic(INTAKE_MODEL, "brand-tier", data);
  const text = (data?.content?.[0]?.text ?? "") as string;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  const parsed = JSON.parse(m[0]) as { label?: unknown; confidence?: unknown };
  const label = typeof parsed.label === "string" ? parsed.label.trim() : "";
  const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
  // Must name one of the offered lines — never a line it invented.
  const match = lines.find((l) => l.label.toLowerCase() === label.toLowerCase());
  // 0.7 because this moves a price by an order of magnitude in either direction.
  return match && confidence >= 0.7 ? { label: match.label, confidence } : null;
 } catch {
  return null;
 }
}

export async function identifyRunway(
 imageUrls: string[],
 brand: string,
 item: string,
 compTitles: string[],
): Promise<string | null> {
 const apiKey = process.env.ANTHROPIC_API_KEY;
 if (!apiKey || !brand.trim()) return null;
 const images = imageUrls.filter(Boolean).slice(0, 2).map((url) => ({ type: "image", source: { type: "url", url } }));
 if (!images.length) return null;
 const comps = compTitles.filter(Boolean).slice(0, 20).map((t) => `- ${t}`).join("\n");
 const prompt = `You are a fashion archivist authenticating runway provenance — a strong, falsifiable claim shown to buyers that raises the price, so stay STRICT and default to null. The pictured piece is: ${brand}${item ? ` — ${item}` : ""}.\n${comps ? `Comparable resale listings (evidence — resellers sometimes cite the season):\n${comps}\n` : ""}\nIs this a DOCUMENTED RUNWAY piece — a specific archival garment/look you can tie to ONE documented show? Name a season ONLY when (a) the exact archival look is unmistakable and documented, or (b) the comps above consistently cite the same specific season. A piece merely being a known brand from a known era is NOT runway provenance. Production and commercial items — mass-produced handbag lines (the Fendi Baguette, Dior Saddle, standard monogram/logo bags), production ready-to-wear, everyday accessories, jeans and tees — are NOT runway pieces, even if the brand is famous or that style once walked a runway; return null for them. When you do name it, format "Brand S/S YYYY" or "Brand F/W YYYY". Return null for anything generic, production, or uncertain; NEVER fabricate a season.\nReturn ONLY JSON: {"runway": string|null, "confidence": 0..1}.`;
 try {
 const res = await fetch(ANTHROPIC_URL, {
 method: "POST",
 headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
 body: JSON.stringify({
 model: INTAKE_MODEL,
 max_tokens: 200,
 messages: [{ role: "user", content: [...images, { type: "text", text: prompt }] }],
 }),
 });
 if (!res.ok) return null;
 const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
 await recordAnthropic(INTAKE_MODEL, "runway", data);
 const text = data.content?.find((c) => c.type === "text")?.text ?? "";
 const m = text.match(/\{[\s\S]*\}/);
 if (!m) return null;
 const parsed = JSON.parse(m[0]) as { runway?: unknown; confidence?: unknown };
 const runway = typeof parsed.runway === "string" && parsed.runway.trim() ? parsed.runway.trim().slice(0, 120) : null;
 const conf = typeof parsed.confidence === "number" ? parsed.confidence : 0;
 // Require HIGH confidence to assert a runway — it's shown to buyers and lifts the price, so a
 // wrong one is worse than none. Production/commercial pieces should come back null well below this.
 return runway && conf >= 0.8 ? runway : null;
 } catch {
 return null;
 }
}

// Is this EXACT piece documented on a named public figure? Reverse-image search often surfaces
// Getty / red-carpet photos of the same garment; those captions (passed in) name the wearer + event.
// This confirms it against the actual photo so we only assert a same-garment match — a "worn by"
// claim lifts price and is shown to buyers, so the bar is HIGH: it must be the same piece, not a
// look-alike or merely the same brand, and we NEVER fabricate a name. Returns null for anything less.
export async function identifyCelebrity(
 imageUrls: string[],
 brand: string,
 item: string,
 editorialCaptions: string[],
): Promise<{ name: string; context: string | null } | null> {
 const apiKey = process.env.ANTHROPIC_API_KEY;
 if (!apiKey) return null;
 const images = imageUrls.filter(Boolean).slice(0, 2).map((url) => ({ type: "image", source: { type: "url", url } }));
 if (!images.length) return null;
 const caps = editorialCaptions.filter(Boolean).slice(0, 20).map((t) => `- ${t}`).join("\n");
 // Without editorial captions there's no documented-wear evidence to confirm against — don't guess.
 if (!caps) return null;
 const prompt = `You are a fashion archivist verifying celebrity provenance for a resale listing. The pictured piece is${brand ? ` ${brand}` : ""}${item ? ` — ${item}` : ""}.\n\nReverse-image search returned these editorial/Getty photo captions of visually-matching images (evidence — they often name who is wearing the piece and the event):\n${caps}\n\nWas THIS EXACT piece (the same garment/accessory in the photo — same design, not merely the same brand or a similar style) worn by a specific, named public figure in these documented photos? Only answer with a name if the captions clearly attribute this same piece to a real named person AND the photographed garment genuinely matches. Give the person's real full name and, briefly, the occasion if stated (e.g. "at the 2003 Met Gala"). Return null for an unnamed model, a generic runway/stock caption, a different garment, or any uncertainty. NEVER invent or guess a name.\nReturn ONLY JSON: {"name": string|null, "context": string|null, "confidence": 0..1}.`;
 try {
 const res = await fetch(ANTHROPIC_URL, {
 method: "POST",
 headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
 body: JSON.stringify({
 model: INTAKE_MODEL,
 max_tokens: 200,
 messages: [{ role: "user", content: [...images, { type: "text", text: prompt }] }],
 }),
 });
 if (!res.ok) return null;
 const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
 await recordAnthropic(INTAKE_MODEL, "celebrity", data);
 const text = data.content?.find((c) => c.type === "text")?.text ?? "";
 const m = text.match(/\{[\s\S]*\}/);
 if (!m) return null;
 const parsed = JSON.parse(m[0]) as { name?: unknown; context?: unknown; confidence?: unknown };
 const name = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim().slice(0, 80) : null;
 const context = typeof parsed.context === "string" && parsed.context.trim() ? parsed.context.trim().slice(0, 120) : null;
 const conf = typeof parsed.confidence === "number" ? parsed.confidence : 0;
 // Higher bar than runway: naming a person is a stronger, more falsifiable public claim.
 return name && conf >= 0.6 ? { name, context } : null;
 } catch {
 return null;
 }
}
