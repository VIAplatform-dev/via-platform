import { neon } from "@neondatabase/serverless";

// Per-store marketing settings. For now: a seller-set promo code that auto-applies
// when a buyer clicks through to the seller's store (routed to /discount/{code} in
// /api/track). Seller-editable in the portal, no hardcoding per store.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 await db()`CREATE TABLE IF NOT EXISTS store_marketing (
 store_slug TEXT PRIMARY KEY,
 promo_code TEXT,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 ensured = true;
}

/** The store's seller-set promo code (auto-applied on click-through), or null. */
export async function getPromoCode(storeSlug: string): Promise<string | null> {
 await ensureTable();
 const rows = await db()`SELECT promo_code FROM store_marketing WHERE store_slug = ${storeSlug}`;
 const v = rows[0] ? (rows[0] as { promo_code: string | null }).promo_code : null;
 return v && v.trim() ? v.trim() : null;
}

export async function setPromoCode(storeSlug: string, code: string | null): Promise<void> {
 await ensureTable();
 const v = (code || "").trim().slice(0, 64) || null;
 await db()`INSERT INTO store_marketing (store_slug, promo_code, updated_at)
 VALUES (${storeSlug}, ${v}, now())
 ON CONFLICT (store_slug) DO UPDATE SET promo_code = ${v}, updated_at = now()`;
}
