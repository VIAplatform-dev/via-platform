import { neon } from "@neondatabase/serverless";

// Per-store pricing rules. For now: the minimum markup over cost the price engine
// must respect (a floor: the market comp can always go higher). Default 30%.

export const DEFAULT_MIN_MARKUP_BPS = 3000; // 30%

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 // DEFAULT must be a literal here (DDL can't take a bind param); keep it in sync
 // with DEFAULT_MIN_MARKUP_BPS. The code default in getMinMarkupBps is the real source.
 await db()`CREATE TABLE IF NOT EXISTS store_pricing (
 store_slug TEXT PRIMARY KEY,
 min_markup_bps INTEGER NOT NULL DEFAULT 3000,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 ensured = true;
}

/** The store's minimum markup over cost, in basis points (3000 = 30%). */
export async function getMinMarkupBps(storeSlug: string): Promise<number> {
 await ensureTable();
 const rows = await db()`SELECT min_markup_bps FROM store_pricing WHERE store_slug = ${storeSlug}`;
 const v = rows[0] ? Number((rows[0] as { min_markup_bps: number }).min_markup_bps) : NaN;
 return Number.isFinite(v) && v >= 0 ? v : DEFAULT_MIN_MARKUP_BPS;
}

export async function setMinMarkupBps(storeSlug: string, bps: number): Promise<void> {
 await ensureTable();
 const v = Math.max(0, Math.min(100000, Math.round(bps)));
 await db()`INSERT INTO store_pricing (store_slug, min_markup_bps, updated_at)
 VALUES (${storeSlug}, ${v}, now())
 ON CONFLICT (store_slug) DO UPDATE SET min_markup_bps = ${v}, updated_at = now()`;
}
