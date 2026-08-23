import { neon } from "@neondatabase/serverless";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — closing the loop on pricing.
//
// The pricer suggests a number and then never finds out whether it was right. This records
// every suggestion at the moment it is made — what we suggested, how much same-piece evidence
// backed it, which prompt version produced it, and what the seller actually published — so the
// marketplace's own outcomes can grade it later.
//
// Two signals come out of this, neither available today:
//   OVERRIDE DRIFT — sellers consistently bumping a category +30% means we price that category low.
//   TIME-TO-SALE   — priced at $180 and gone in 2 days = too low; sat 60 days = too high.
//
// Rows missed now are eval data lost forever, so the write is best-effort and never blocks a
// listing: a failure here must not cost the seller their draft.
// ─────────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

let ensured = false;
async function ensure(): Promise<void> {
 if (ensured) return;
 const sql = db();
 await sql`
 CREATE TABLE IF NOT EXISTS price_suggestions (
  id BIGSERIAL PRIMARY KEY,
  store_slug TEXT NOT NULL,
  item_id TEXT,
  title TEXT,
  brand TEXT,
  category TEXT,
  suggested_cents INT,
  market_cents INT,
  low_cents INT,
  high_cents INT,
  confidence REAL,
  source TEXT,                  -- comps | benchmark | knowledge | floor | none
  prompt_version TEXT,
  comp_count INT,
  exact_piece_count INT,        -- how many comps were visually confirmed as THIS garment
  seller_price_cents INT,       -- what they actually published (null until known)
  rationale TEXT,               -- the sentence shown under the price field in the editor
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )
 `;
 await sql`ALTER TABLE price_suggestions ADD COLUMN IF NOT EXISTS rationale TEXT`;
 await sql`CREATE INDEX IF NOT EXISTS idx_price_sugg_store ON price_suggestions(store_slug, created_at DESC)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_price_sugg_item ON price_suggestions(item_id)`;
 ensured = true;
}

export type SuggestionRecord = {
 storeSlug: string;
 itemId?: string | null;
 title?: string | null;
 brand?: string | null;
 category?: string | null;
 suggestedCents?: number | null;
 marketCents?: number | null;
 lowCents?: number | null;
 highCents?: number | null;
 confidence?: number | null;
 source?: string | null;
 promptVersion?: string | null;
 compCount?: number | null;
 exactPieceCount?: number | null;
 sellerPriceCents?: number | null;
 rationale?: string | null;
};

/** Record one suggestion. Best-effort — never throws, never blocks the listing. */
export async function recordSuggestion(r: SuggestionRecord): Promise<void> {
 if (!r.storeSlug) return;
 try {
  await ensure();
  const sql = db();
  await sql`
  INSERT INTO price_suggestions
   (store_slug, item_id, title, brand, category, suggested_cents, market_cents, low_cents, high_cents,
    confidence, source, prompt_version, comp_count, exact_piece_count, seller_price_cents, rationale)
  VALUES
   (${r.storeSlug}, ${r.itemId ?? null}, ${r.title ?? null}, ${r.brand ?? null}, ${r.category ?? null},
    ${r.suggestedCents ?? null}, ${r.marketCents ?? null}, ${r.lowCents ?? null}, ${r.highCents ?? null},
    ${r.confidence ?? null}, ${r.source ?? null}, ${r.promptVersion ?? null}, ${r.compCount ?? null},
    ${r.exactPieceCount ?? null}, ${r.sellerPriceCents ?? null}, ${r.rationale ?? null})
  `;
 } catch {
  // best-effort: a lost row costs eval data, never the seller's listing
 }
}

/** Fill in what the seller actually published, once it's known. */
export async function recordSellerPrice(itemId: string, sellerPriceCents: number): Promise<void> {
 if (!itemId || !(sellerPriceCents > 0)) return;
 try {
  await ensure();
  const sql = db();
  await sql`
  UPDATE price_suggestions SET seller_price_cents = ${sellerPriceCents}
  WHERE item_id = ${itemId} AND seller_price_cents IS NULL
  `;
 } catch { /* best-effort */ }
}

/** Percent difference between the seller's published price and our suggestion. Pure + exported
 *  for testing: positive = the seller priced ABOVE us (we suggested low). */
export function overridePct(suggestedCents: number, sellerCents: number): number | null {
 if (!(suggestedCents > 0) || !(sellerCents > 0)) return null;
 return Math.round(((sellerCents - suggestedCents) / suggestedCents) * 100);
}

export type AccuracyReport = {
 windowDays: number;
 total: number;
 withSellerPrice: number;
 medianOverridePct: number | null;
 byCategory: Array<{ category: string; n: number; medianOverridePct: number | null }>;
 byPromptVersion: Array<{ promptVersion: string; n: number; medianOverridePct: number | null }>;
 byEvidence: Array<{ bucket: string; n: number; medianOverridePct: number | null }>;
 note: string;
};

function medianOf(nums: number[]): number | null {
 if (!nums.length) return null;
 const s = [...nums].sort((a, b) => a - b);
 const m = Math.floor(s.length / 2);
 return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * How far sellers move our number, sliced by category, prompt version, and how much same-piece
 * evidence backed the suggestion. Consistent positive drift in a slice = we price that slice low.
 *
 * Deliberately NOT joined to sales yet: `sold_items` has no stable key back to the drafted item
 * (it carries title/designer, not our item_id), so a time-to-sale join would be guesswork today.
 * Recording `item_id` here is what makes that join possible once the sale path carries it.
 */
export async function getAccuracyReport(windowDays = 90): Promise<AccuracyReport> {
 await ensure();
 const sql = db();
 const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
 const rows = (await sql`
 SELECT category, prompt_version, suggested_cents, seller_price_cents, exact_piece_count
 FROM price_suggestions WHERE created_at >= ${since}
 `) as Array<Record<string, unknown>>;

 const priced = rows.filter((r) => Number(r.suggested_cents) > 0 && Number(r.seller_price_cents) > 0);
 const pct = (r: Record<string, unknown>) => overridePct(Number(r.suggested_cents), Number(r.seller_price_cents)) as number;

 const group = <T extends string>(keyOf: (r: Record<string, unknown>) => T) => {
  const m = new Map<T, number[]>();
  for (const r of priced) {
   const k = keyOf(r);
   m.set(k, [...(m.get(k) ?? []), pct(r)]);
  }
  return [...m.entries()].map(([k, v]) => ({ key: k, n: v.length, medianOverridePct: medianOf(v) })).sort((a, b) => b.n - a.n);
 };

 return {
  windowDays,
  total: rows.length,
  withSellerPrice: priced.length,
  medianOverridePct: medianOf(priced.map(pct)),
  byCategory: group((r) => String(r.category ?? "unknown")).map(({ key, ...rest }) => ({ category: key, ...rest })),
  byPromptVersion: group((r) => String(r.prompt_version ?? "unknown")).map(({ key, ...rest }) => ({ promptVersion: key, ...rest })),
  byEvidence: group((r) => (Number(r.exact_piece_count) > 0 ? "same-piece evidence" : "keyword comps only")).map(({ key, ...rest }) => ({ bucket: key, ...rest })),
  note: "Positive median = sellers priced ABOVE our suggestion (we are pricing that slice low). Time-to-sale is not joined yet — sold_items carries no item_id back to the drafted listing.",
 };
}

export type ItemPriceContext = {
 marketCents: number | null;
 lowCents: number | null;
 highCents: number | null;
 confidence: number | null;
 rationale: string | null;
 source: string | null;
};

/** The AI price context for one item, for the listing editor to render. Newest wins — a re-priced
 *  item writes a new row rather than mutating the old one, so the history stays intact. */
export async function getItemPriceContext(itemId: string): Promise<ItemPriceContext | null> {
 if (!itemId) return null;
 try {
  await ensure();
  const sql = db();
  const rows = (await sql`
  SELECT market_cents, low_cents, high_cents, confidence, rationale, source
  FROM price_suggestions WHERE item_id = ${itemId}
  ORDER BY created_at DESC LIMIT 1
  `) as Array<Record<string, unknown>>;
  if (!rows.length) return null;
  const r = rows[0];
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
   marketCents: n(r.market_cents), lowCents: n(r.low_cents), highCents: n(r.high_cents),
   confidence: n(r.confidence), rationale: (r.rationale as string) ?? null, source: (r.source as string) ?? null,
  };
 } catch {
  return null; // best-effort: the editor just renders without the AI context
 }
}
