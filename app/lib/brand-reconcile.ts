// One brand answer, from several independent guesses — and an honest "I don't know" when they
// disagree.
//
// The failure this exists to stop: one dress, in one intake run, labelled three different ways at
// once — "Dior" in the brand field, "Sue Wong" in the title, "Prada" in the visual-match banner.
// Nothing was broken. Three code paths each produce a brand and none of them ever compared notes,
// so the weakest guess was presented with exactly the confidence of the strongest.
//
// The pieces to fix it were already here. ai-intake returns a confidence per field. The route
// already computes a Lens consensus and already detects disagreement (intake/route.ts). And
// `needsReview()` — the function that decides whether a guess is too shaky to state — was defined
// and, across the whole app, never called once.
//
// So this is a reconciliation step, not a new brain: gather what each source says, prefer physical
// evidence over inference, and when the evidence conflicts or is thin, return null and ASK rather
// than picking a winner and sounding certain. A blank field a seller fills in beats a confident
// wrong label — which is what the intake system prompt already tells the model to do, and what the
// code downstream then undid.

import { CONFIDENCE_THRESHOLD } from "./ai-intake.ts";
import { normalizeCategory } from "./market-data-db.ts";

/** Where a brand guess came from, strongest evidence first. */
export type BrandSource =
 | "seller" // the seller typed it — authoritative, never overridden, never questioned
 | "label" // brand name read off the physical care/brand tag
 | "rn" // RN number on the care tag, resolved to a company
 | "lens" // consensus across reverse-image matches
 | "vision"; // the model's read of the photos alone

export type BrandCandidate = { source: BrandSource; value: string | null; confidence: number; hits?: number };

export type BrandDecision = {
 value: string | null;
 confidence: number;
 source: BrandSource | null;
 /** Every candidate that named a brand, for the UI and for logging a wrong call afterwards. */
 considered: BrandCandidate[];
 /** True when two sources named DIFFERENT brands — the signal that was being thrown away. */
 conflict: boolean;
 /** Ask the seller rather than stating this. */
 needsQuestion: boolean;
 /** Why, in one line, for the log and the admin view. */
 reason: string;
};

const key = (v: string | null | undefined) => (v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const same = (a: string | null, b: string | null) => !!key(a) && key(a) === key(b);

/** Physical evidence outranks inference; among inferences, corroboration outranks a lone guess. */
const RANK: Record<BrandSource, number> = { seller: 5, label: 4, rn: 3, lens: 2, vision: 1 };

/**
 * Decide the brand.
 *
 * Order of operations matters and encodes what we actually trust:
 *   1. The seller typed it        → done. Never argue with the person holding the garment.
 *   2. Something was READ off the physical tag (a brand name, or an RN we resolved) → use it.
 *      A photograph of a label is evidence; a model's impression of a silhouette is not.
 *   3. Otherwise weigh the inferences. If Lens and vision AGREE, that is corroboration and the
 *      answer gets a lift. If they DISAGREE, that is the single most useful signal available and it
 *      was previously discarded — the higher-ranked source is still returned as a suggestion, but
 *      the decision is marked low-confidence and a question fires.
 *   4. Nothing named a brand → null, and ask.
 */
export function reconcileBrand(candidates: BrandCandidate[]): BrandDecision {
 const named = candidates.filter((c) => !!key(c.value));

 const seller = named.find((c) => c.source === "seller");
 if (seller) {
  return {
   value: seller.value, confidence: 1, source: "seller", considered: named,
   conflict: false, needsQuestion: false, reason: "the seller entered it",
  };
 }

 if (!named.length) {
  return {
   value: null, confidence: 0, source: null, considered: [],
   conflict: false, needsQuestion: true, reason: "nothing identified a brand",
  };
 }

 const sorted = [...named].sort((a, b) => RANK[b.source] - RANK[a.source] || b.confidence - a.confidence);
 const best = sorted[0];
 // Conflict means two sources named DIFFERENT brands. Sources that simply stayed silent are not a
 // conflict — a Lens search that found nothing is an absence of evidence, not a contradiction.
 const conflict = sorted.some((c) => !same(c.value, best.value));

 // Physical evidence: a label or a resolved RN settles it, even if a model guessed otherwise. That
 // disagreement is worth logging, but it is not worth interrupting the seller over.
 if (best.source === "label" || best.source === "rn") {
  return {
   value: best.value, confidence: best.confidence, source: best.source, considered: named, conflict,
   needsQuestion: false,
   reason: conflict
    ? `read off the ${best.source === "rn" ? "care tag RN" : "label"}; the photo suggested something else`
    : `read off the ${best.source === "rn" ? "care tag RN" : "label"}`,
  };
 }

 // Only inferences left.
 if (conflict) {
  // Two guesses, two answers. Halve the confidence of the stronger one — the disagreement is
  // evidence AGAINST it, not neutral — and ask. This is the case that produced "Dior".
  const names = sorted.map((c) => c.value).filter(Boolean);
  return {
   value: best.value, confidence: Math.min(best.confidence, 0.5) / 2, source: best.source, considered: named, conflict: true,
   needsQuestion: true,
   reason: `sources disagree (${names.join(" vs ")})`,
  };
 }

 // Everything that spoke, agreed. Corroboration earns a lift, capped — two guesses agreeing is
 // better evidence than one, and still not a photograph of a label.
 const agreeing = sorted.filter((c) => same(c.value, best.value)).length;
 const confidence = Math.min(0.9, best.confidence + (agreeing > 1 ? 0.1 : 0));
 return {
  value: best.value, confidence, source: best.source, considered: named, conflict: false,
  needsQuestion: confidence < CONFIDENCE_THRESHOLD,
  reason: agreeing > 1 ? `${agreeing} sources agree` : `only ${best.source} identified it`,
 };
}

// ── The question ────────────────────────────────────────────────────────────────────────────────

export type SellerQuestion = { field: "brand"; prompt: string; hint: string; why: string };

/**
 * The question to put to the seller, or null.
 *
 * Deliberately ONE question, about the brand, and only when we are genuinely stuck. Two constraints
 * shape it:
 *
 *   • It must be answerable by looking at the garment in hand — never something we should be telling
 *     THEM (a runway season, an archival collection). Reading a label is not research.
 *   • Brand is the only field with a measured payoff: items whose brand resolves are priced at +1%
 *     bias, items whose brand doesn't at -59%. Material and condition are unmeasured, so they are
 *     not asked yet — adding friction on a hunch is how a helpful prompt becomes an annoying form.
 */
export function brandQuestion(decision: BrandDecision): SellerQuestion | null {
 if (!decision.needsQuestion) return null;
 return {
  field: "brand",
  prompt: "What brand is this?",
  hint: "Check the neck or side-seam label. If there's no label, leave it blank — we'll price it from what your store usually sells.",
  why: decision.conflict
   ? "The photos and the web matches point to different labels, so we'd rather ask than guess."
   : "We couldn't read a label or find a confident match.",
 };
}


// ── Garment type ────────────────────────────────────────────────────────────────────────────────
//
// Every comp search is built from this one word, so a wrong one is not a mislabel — it prices a
// different product. A Roberto Cavalli TOP photographed flat was read as a "strapless mini dress",
// which put "dress" into all four searches, returned forty dresses, and produced $689 for a top.
// Tops measured 44% off in the accuracy eval, the worst of any category, and this is a plausible
// share of why.
//
// Same shape as the brand reconciliation, and for the same reason: a second independent opinion
// already exists and was never consulted. The reverse-image matches carry titles, and those titles
// bucket to a garment type through the platform's canonical normalizeCategory.

export type GarmentDecision = {
 value: string | null;
 confidence: number;
 visionSaid: string | null;
 lensSaid: string | null;
 conflict: boolean;
 needsQuestion: boolean;
 reason: string;
};

/** The garment type the reverse-image matches agree on, if they agree on one. */
export function garmentFromMatches(titles: string[]): { category: string | null; hits: number; total: number } {
 const tally = new Map<string, number>();
 for (const t of titles) {
  const c = normalizeCategory(t || "");
  if (c) tally.set(c, (tally.get(c) || 0) + 1);
 }
 let category: string | null = null, hits = 0;
 for (const [c, n] of tally) if (n > hits) { category = c; hits = n; }
 return { category, hits, total: titles.length };
}

export function reconcileGarment(opts: {
 seller?: string | null;
 vision?: string | null;
 visionConfidence?: number;
 lens?: { category: string | null; hits: number; total: number };
}): GarmentDecision {
 const bucket = (v?: string | null) => (v ? normalizeCategory(v) : null);
 const seller = bucket(opts.seller);
 const vision = bucket(opts.vision);
 const lens = opts.lens?.category ?? null;
 const lensHits = opts.lens?.hits ?? 0;

 if (seller) {
  return { value: seller, confidence: 1, visionSaid: vision, lensSaid: lens, conflict: false, needsQuestion: false, reason: "the seller chose it" };
 }
 if (!vision && !lens) {
  return { value: null, confidence: 0, visionSaid: null, lensSaid: null, conflict: false, needsQuestion: true, reason: "garment type unclear" };
 }

 // Lens only counts as a second opinion when several matches agree — one stray title is noise, and
 // treating it as a contradiction would interrupt the seller constantly.
 const lensSpeaks = !!lens && lensHits >= 3;
 const visionConf = opts.visionConfidence ?? 0.5;

 if (vision && lensSpeaks && vision !== lens) {
  return {
   value: vision, confidence: Math.min(visionConf, 0.45), visionSaid: vision, lensSaid: lens,
   conflict: true, needsQuestion: true,
   reason: `the photos read as ${vision.toLowerCase()}, the web matches as ${lens.toLowerCase()}`,
  };
 }
 if (vision && lensSpeaks && vision === lens) {
  return { value: vision, confidence: Math.min(0.95, visionConf + 0.15), visionSaid: vision, lensSaid: lens, conflict: false, needsQuestion: false, reason: "photos and web matches agree" };
 }
 const only = vision || lens;
 const conf = vision ? visionConf : 0.6;
 return {
  value: only, confidence: conf, visionSaid: vision, lensSaid: lens, conflict: false,
  needsQuestion: conf < CONFIDENCE_THRESHOLD,
  reason: vision ? "only the photos identified it" : "only the web matches identified it",
 };
}

export type GarmentQuestion = { field: "category"; prompt: string; hint: string; why: string; options: string[] };

/**
 * Ask which garment it is, offering the two candidates rather than an open field — the seller
 * answers in one tap, and a closed choice keeps the answer inside the platform's own taxonomy so it
 * can drive the comp search directly.
 */
export function garmentQuestion(d: GarmentDecision): GarmentQuestion | null {
 if (!d.needsQuestion) return null;
 const options = Array.from(new Set([d.visionSaid, d.lensSaid].filter(Boolean) as string[]));
 // The taxonomy is plural ("Tops", "Dresses") but the question is about one garment, so read it
 // back singular: "Is this a top or a dress?", not "Is this a tops or dresses?".
 // Branch, don't chain: chaining turned "dresses" into "dress" and then the trailing-s rule ate
 // the final s, producing "dres".
 const one = (c: string) => {
  const l = c.toLowerCase();
  if (/ies$/.test(l)) return l.replace(/ies$/, "y"); // accessories -> accessory
  if (/sses$/.test(l)) return l.replace(/es$/, ""); // dresses -> dress
  return l.replace(/s$/, ""); // tops -> top
 };
 const art = (w: string) => (/^[aeiou]/.test(w) ? "an" : "a");
 const pair = options.length >= 2
  ? `${one(options[0])} or ${art(one(options[1]))} ${one(options[1])}`
  : null;
 return {
  field: "category",
  prompt: pair ? `Is this a ${pair}?` : "What kind of piece is this?",
  hint: "This one matters most — every price comparison we run is built from it.",
  why: d.conflict ? d.reason : "We couldn't tell the garment type from the photos with confidence.",
  options,
 };
}
