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
};

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
  return out;
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
