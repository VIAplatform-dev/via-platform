// Turning what /api/store/intake actually returns into what a screen can render.
//
// WRITTEN AFTER RUNNING THE REAL ENDPOINT, not after reading its request handler. Two things are
// not what the request side suggests, and both broke the flow silently:
//
//   1. The drafted fields arrive under `draft`, not `fields`.
//   2. Several of them are {value, confidence} OBJECTS, not strings — brand, era, material and
//      condition — while title, description, category and conditionGrade are plain strings.
//      Putting one of those objects into a <Text> throws in React Native, so the flow died on the
//      Review screen, after the AI call had already been paid for.
//
// The confidence numbers are dropped on purpose. They are real and could be shown, but a seller
// reading "Fendi (0.85)" learns nothing she can act on — she either recognises the brand or she
// corrects it, and every row already has a Change button.

export type DraftFields = {
  title?: string;
  brand?: string;
  era?: string;
  material?: string;
  condition?: string;
  conditionGrade?: string;
  category?: string;
  description?: string;
  size?: string;
  price?: string;
  /** What she paid, as typed (major units). Optional; sent to publish as `cost` like `price`. */
  cost?: string;
  /** Specific visible flaws, one per entry. Edited as a comma-separated line on Review. */
  flaws?: string[];
  /** Beyond the grade — the model's sentence about the wear, hers to edit. */
  conditionNote?: string;
  /** The parcel the model judged this piece to ship as (packed). Review shows the tier from it. */
  parcel?: { weightOz: number; lengthIn?: number; widthIn?: number; heightIn?: number };
  /** What she typed on Review, in ounces; sent as weightOz at publish. */
  weightOz?: string;
  /** The category's template, filled in on Review; sent as a list at publish. */
  measurements?: { key: string; value: number; unit: "cm" | "in" }[];
};

// The condition scale — mirror of app/lib/condition-core.ts, best first.
export const CONDITION_GRADES = ["Mint", "Excellent", "Very good", "Good", "Fair"] as const;
export type ConditionGrade = (typeof CONDITION_GRADES)[number];

/** Free text or the pricer's own grade → a grade on the scale, or null. Mirrors normalizeCondition. */
export function normalizeCondition(text: string | null | undefined): ConditionGrade | null {
  const s = String(text ?? "").trim().toLowerCase();
  if (!s) return null;
  const exact = CONDITION_GRADES.find((g) => g.toLowerCase() === s);
  if (exact) return exact;
  if (/^mint\b|\b(nwt|bnwt|nib|new with tags|dead ?stock|unworn|never worn)\b/.test(s)) return "Mint";
  if (/\b(excellent|pristine|like ?new|mint|flawless)\b/.test(s)) return "Excellent";
  if (/\bvery good\b/.test(s)) return "Very good";
  if (/\b(good|gently worn|minor wear)\b/.test(s)) return "Good";
  if (/\b(fair|poor|worn|distressed|as[- ]is|heavily used|damaged)\b/.test(s)) return "Fair";
  return null;
}

/** A field that may be a bare string, or the model's {value, confidence} wrapper, or absent. */
function flat(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (v && typeof v === "object" && "value" in v) {
    const inner = (v as { value: unknown }).value;
    return typeof inner === "string" ? inner.trim() || undefined : undefined;
  }
  return undefined;
}

/** The API's `draft` → flat strings a screen can render. Never throws on a missing draft. */
export function normalizeDraft(draft: unknown): DraftFields {
  if (!draft || typeof draft !== "object") return {};
  const d = draft as Record<string, unknown>;
  const out: DraftFields = {};
  for (const k of ["title", "brand", "era", "material", "condition", "conditionGrade", "category", "description", "size"] as const) {
    const v = flat(d[k]);
    if (v !== undefined) out[k] = v;
  }
  if (Array.isArray(d.flaws)) {
    const flaws = d.flaws.filter((f): f is string => typeof f === "string" && !!f.trim()).map((f) => f.trim());
    if (flaws.length) out.flaws = flaws;
  }
  // Condition as structure: the grade (from conditionGrade, else read out of the sentence) is what
  // the chips show; the sentence itself, when it says more than the grade, is the note.
  const sentence = out.condition;
  const grade = normalizeCondition(out.conditionGrade) ?? normalizeCondition(sentence);
  if (grade) {
    out.condition = grade;
    if (sentence && sentence.toLowerCase() !== grade.toLowerCase()) out.conditionNote = sentence;
  }
  const p = d.parcel as Record<string, unknown> | undefined;
  const n = (v: unknown) => { const x = Math.ceil(Number(v)); return Number.isFinite(x) && x > 0 ? x : undefined; };
  if (p && typeof p === "object" && n(p.weightOz) != null) {
    out.parcel = { weightOz: n(p.weightOz)!, ...(n(p.lengthIn) != null ? { lengthIn: n(p.lengthIn) } : {}), ...(n(p.widthIn) != null ? { widthIn: n(p.widthIn) } : {}), ...(n(p.heightIn) != null ? { heightIn: n(p.heightIn) } : {}) };
  }
  return out;
}

/**
 * "140" → 140, "£33.50" → 33.5, "" → undefined. A cost is optional, and a blank must NOT become 0:
 * the margin report treats zero as "free stock" and would print a 100% margin on it.
 */
export function costFromText(v: string | number | null | undefined): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : undefined;
  const t = String(v ?? "").replace(/[^0-9.]/g, "");
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** "scuffed toe, light pilling" ⇄ ["scuffed toe", "light pilling"] — the Review row's shape. */
export function flawsFromLine(line: string): string[] {
  return line.split(",").map((f) => f.trim()).filter(Boolean);
}
export function flawsToLine(flaws: string[] | undefined): string {
  return (flaws ?? []).join(", ");
}

export type Estimate = {
  suggestedCents?: number | null;
  marketCents?: number | null;
  comps?: unknown[] | null;
};

/**
 * The price, and how many comparable sales stand behind it.
 *
 * `priceCents` is null rather than 0 when there is no estimate — pricing can legitimately come
 * back empty, and a zero here would be published as the asking price.
 */
export function readEstimate(estimate: Estimate | null | undefined): { priceCents: number | null; compsCount: number } {
  const cents = estimate?.suggestedCents ?? estimate?.marketCents ?? null;
  return {
    priceCents: typeof cents === "number" && cents > 0 ? cents : null,
    compsCount: Array.isArray(estimate?.comps) ? estimate.comps.length : 0,
  };
}
