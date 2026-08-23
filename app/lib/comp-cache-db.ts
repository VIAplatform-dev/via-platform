import { neon } from "@neondatabase/serverless";
import type { Comp } from "./comps.ts";
import { convertCurrencyToUSD } from "./stores.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Comp cache — every external comp we pay SerpApi to fetch is saved here, so future
// pricing for the same item/segment reuses our OWN history instead of spending again.
// Each paid lookup becomes a reusable asset; repeat brands/items price for ~free, and
// the cache also feeds the internal benchmark so we always have a market number.
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
 CREATE TABLE IF NOT EXISTS comp_cache (
  id BIGSERIAL PRIMARY KEY,
  dedup_key TEXT NOT NULL UNIQUE,
  query_norm TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  price_cents INT NOT NULL,
  sold BOOLEAN NOT NULL DEFAULT false,
  condition TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  link TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )
 `;
 // Added after the auction/BIN split: without this, a cached comp came back with no sale type,
// so every cached eBay sale counted as a genuine realized sale and the auction filter + thin-sold
// guard were bypassed entirely on any cache hit. NULL on pre-existing rows = unknown format.
 await sql`ALTER TABLE comp_cache ADD COLUMN IF NOT EXISTS sale_type TEXT`;
 await sql`CREATE INDEX IF NOT EXISTS idx_comp_cache_query ON comp_cache(query_norm, fetched_at DESC)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_comp_cache_segment ON comp_cache(brand, category, fetched_at DESC)`;
 ensured = true;
}

export function normalizeQuery(q: string): string {
 return q.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function dedupKey(c: Comp): string {
 return `${c.source}|${c.link || `${c.title}|${c.priceCents}`}`.slice(0, 400);
}

const toComp = (r: Record<string, unknown>): Comp => ({
 title: r.title as string,
 priceCents: Number(r.price_cents),
 currency: (r.currency as string) || "USD",
 sold: !!r.sold,
 source: r.source as string,
 link: (r.link as string) ?? undefined,
 condition: (r.condition as string) ?? undefined,
 // Rows cached before the auction/BIN split carry NULL — genuinely unknown, not "confirmed BIN".
 saleType: r.sale_type === "auction" ? "auction" : r.sale_type === "bin" ? "bin" : null,
});

/**
 * Persist fetched comps so future lookups for the same item/segment reuse them (no new
 * SerpApi spend). Upserts by a dedup key and refreshes fetched_at, so a re-fetch of the
 * same listing just bumps its recency rather than duplicating. Best-effort — never throws.
 */
export async function saveComps(
 comps: Comp[],
 meta: { query: string; brand: string | null; category: string | null },
): Promise<void> {
 const real = comps.filter((c) => c.priceCents > 0);
 if (!real.length) return;
 try {
 await ensure();
 const sql = db();
 const qn = normalizeQuery(meta.query);
 const col = <T>(f: (c: Comp) => T) => real.map(f);
 await sql`
 INSERT INTO comp_cache (dedup_key, query_norm, brand, category, source, title, price_cents, sold, condition, currency, link, sale_type)
 SELECT * FROM unnest(
  ${col(dedupKey)}::text[],
  ${real.map(() => qn)}::text[],
  ${real.map(() => meta.brand)}::text[],
  ${real.map(() => meta.category)}::text[],
  ${col((c) => c.source)}::text[],
  ${col((c) => c.title.slice(0, 400))}::text[],
  ${col((c) => c.priceCents)}::int[],
  ${col((c) => c.sold)}::bool[],
  ${col((c) => c.condition ?? null)}::text[],
  ${col((c) => c.currency)}::text[],
  ${col((c) => c.link ?? null)}::text[],
  ${col((c) => c.saleType ?? null)}::text[]
 )
 ON CONFLICT (dedup_key) DO UPDATE SET fetched_at = NOW(), query_norm = EXCLUDED.query_norm, brand = EXCLUDED.brand, category = EXCLUDED.category
 `;
 } catch (e) {
 console.error("[comp-cache] saveComps failed:", e);
 }
}

/**
 * Reuse recently-fetched comps for this item — the exact normalized query first (most
 * relevant), then the brand/category segment. Only rows newer than maxAgeDays. Empty when
 * the cache is cold, which tells the caller to do a live lookup (and cache the results).
 */
export async function getCachedComps(opts: {
 query: string;
 brand: string | null;
 category: string | null;
 maxAgeDays: number;
 limit: number;
}): Promise<Comp[]> {
 await ensure();
 const sql = db();
 const qn = normalizeQuery(opts.query);
 const cutoff = new Date(Date.now() - opts.maxAgeDays * 86_400_000).toISOString();
 // EXACT query only. The old brand+category segment fallback cross-contaminated models — e.g. a
 // "Prada Re-Edition 2005" got priced off a "Prada Raso Luce sequin" bag's cached comps. A thin
 // exact cache now simply triggers a fresh live fetch in the pricer (which returns the right model's
 // comps), instead of borrowing another item's stale ones.
 const exact = (await sql`SELECT source, title, price_cents, sold, condition, currency, link, sale_type FROM comp_cache WHERE query_norm = ${qn} AND fetched_at >= ${cutoff} ORDER BY fetched_at DESC LIMIT ${opts.limit}`) as Array<Record<string, unknown>>;
 return exact.map(toComp);
}

/**
 * Days since the most recent cached comp for this exact query (null if none cached). Lets the
 * pricer refresh a STALE cache — plenty of comps, but all weeks old — not just a cold one.
 */
export async function newestCompAgeDays(query: string): Promise<number | null> {
 await ensure();
 const sql = db();
 const qn = normalizeQuery(query);
 const rows = (await sql`SELECT MAX(fetched_at) AS newest FROM comp_cache WHERE query_norm = ${qn}`.catch(() => [])) as Array<{ newest: string | null }>;
 const newest = rows[0]?.newest;
 if (!newest) return null;
 return Math.floor((Date.now() - new Date(newest).getTime()) / 86_400_000);
}

/**
 * Comps from VYA's OWN data, matched by brand:
 *  - sold_items → items that actually SOLD on the marketplace (real transactions, weighted high)
 *  - products → items currently LISTED (asking prices — a soft reference only; kept as
 *    sold=false so the valuation weights them BELOW real sold prices, avoiding an
 *    AI-pricing-off-its-own-AI-prices echo chamber).
 * Prices are converted to USD. Empty when brand is unknown.
 */
export async function getVyaComps(opts: { brand: string | null; limit?: number }): Promise<Comp[]> {
 const brand = (opts.brand ?? "").trim();
 if (!brand) return [];
 const limit = opts.limit ?? 15;
 try {
 const sql = db();
 const [sold, listed] = (await Promise.all([
  sql`SELECT title, final_price, currency FROM sold_items WHERE designer ILIKE ${brand} AND final_price > 0 ORDER BY sold_at DESC LIMIT ${limit}`,
  sql`SELECT title, price, currency FROM products WHERE brand ILIKE ${brand} AND price > 0 ORDER BY created_at DESC NULLS LAST LIMIT ${limit}`,
 ])) as [Array<Record<string, unknown>>, Array<Record<string, unknown>>];
 const comps: Comp[] = [];
 for (const r of sold) {
  const usd = convertCurrencyToUSD(Number(r.final_price), (r.currency as string) || "USD");
  if (usd > 0) comps.push({ title: r.title as string, priceCents: Math.round(usd * 100), currency: "USD", sold: true, source: "VYA (sold)" });
 }
 for (const r of listed) {
  const usd = convertCurrencyToUSD(Number(r.price), (r.currency as string) || "USD");
  if (usd > 0) comps.push({ title: r.title as string, priceCents: Math.round(usd * 100), currency: "USD", sold: false, source: "VYA (listed)" });
 }
 return comps;
 } catch (e) {
 console.error("[comp-cache] getVyaComps failed:", e);
 return [];
 }
}

// ─────────────────────────────────────────────────────────────────────────────
// piece_facts — derived facts about a SPECIFIC piece (brand + normalized title), currently the
// runway season. Once any listing establishes a piece's runway, future identical pieces reuse it
// instantly, and we accumulate an owned "piece → runway" knowledge base.
// ─────────────────────────────────────────────────────────────────────────────
let pieceFactsEnsured = false;
async function ensurePieceFacts(): Promise<void> {
 if (pieceFactsEnsured) return;
 const sql = db();
 await sql`
 CREATE TABLE IF NOT EXISTS piece_facts (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  brand TEXT,
  title_norm TEXT,
  runway TEXT,
  era TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )
 `;
 pieceFactsEnsured = true;
}

function pieceKey(brand: string, title: string): string {
 return `${brand.toLowerCase().trim()}|${normalizeQuery(title)}`.slice(0, 400);
}

/** Reuse a previously-determined runway for this exact piece (brand + normalized title). */
export async function getPieceRunway(brand: string, title: string): Promise<string | null> {
 if (!brand.trim() || !title.trim()) return null;
 try {
 await ensurePieceFacts();
 const sql = db();
 const rows = (await sql`SELECT runway FROM piece_facts WHERE key = ${pieceKey(brand, title)} AND runway IS NOT NULL LIMIT 1`) as Array<{ runway: string }>;
 return rows[0]?.runway ?? null;
 } catch {
 return null;
 }
}

/** Save a determined runway for this piece so future identical listings reuse it. Best-effort. */
export async function savePieceRunway(brand: string, title: string, runway: string): Promise<void> {
 if (!brand.trim() || !title.trim() || !runway.trim()) return;
 try {
 await ensurePieceFacts();
 const sql = db();
 await sql`INSERT INTO piece_facts (key, brand, title_norm, runway) VALUES (${pieceKey(brand, title)}, ${brand.trim()}, ${normalizeQuery(title)}, ${runway.trim()}) ON CONFLICT (key) DO UPDATE SET runway = EXCLUDED.runway, updated_at = NOW()`;
 } catch (e) {
 console.error("[piece-facts] savePieceRunway failed:", e);
 }
}

/** Delete cache rows older than the given age — call from a nightly cron to bound growth. */
export async function pruneCompCache(maxAgeDays = 90): Promise<number> {
 await ensure();
 const sql = db();
 const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
 const r = (await sql`DELETE FROM comp_cache WHERE fetched_at < ${cutoff} RETURNING id`) as unknown[];
 return r.length;
}
