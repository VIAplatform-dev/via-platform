// Shaping for the listing flow — the one thing in the app that makes her money, and the thing
// she'll do forty times in an afternoon.
//
// THE RULE THIS ENCODES: tell us what you know, then we fill the rest — not photograph it and
// hope. /api/store/intake takes a `filled` object and only generates the fields NOT in it, so
// anything she types is authoritative and costs nothing to compute. The pricer has accepted
// brand, era, material and condition as inputs the whole time; no interface ever asked her for
// them, so it guessed at things she could simply have said.
//
// It matters beyond preference. The moment there is a monthly allowance on AI listings, a seller
// who has used hers still needs to list forty pieces — so the manual path has to be a real path,
// not a fallback nobody tested.

export type BulkRow = {
  id: string;
  photos: string[];
  brand: string;
  cost: string;
};

/** Per-row state in "Add many": what she still owes this piece before it can be priced well. */
export type Readiness = "ready" | "partial" | "needs-you";

const typed = (v: string | undefined | null): boolean => Boolean(v && v.trim());

export function rowReadiness(row: BulkRow): Readiness {
  // No photo is not a state she can type her way out of.
  if (row.photos.length === 0) return "needs-you";
  const n = (typed(row.brand) ? 1 : 0) + (typed(row.cost) ? 1 : 0);
  if (n === 2) return "ready";
  if (n === 1) return "partial";
  return "needs-you";
}

/** The line under "Add many". */
export function batchSummary(photos: number, pieces: number): string {
  if (photos === 0) return "No photos yet";
  return `${photos} ${photos === 1 ? "photo" : "photos"} · grouped into ${pieces} ${pieces === 1 ? "piece" : "pieces"}`;
}

/** "Price all 5" needs something to price. */
export function canPriceBatch(rows: BulkRow[]): boolean {
  return rows.some((r) => r.photos.length > 0);
}

/**
 * The `filled` object for /api/store/intake.
 *
 * Empty strings are STRIPPED, not sent. The route treats any present, non-blank key as "she
 * answered this, don't generate it" — so posting `{ era: "" }` would both fail that test and
 * leave the era blank in the finished draft.
 */
export function filledFields(input: Record<string, string | undefined | null>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) if (typed(v)) out[k] = (v as string).trim();
  return out;
}
