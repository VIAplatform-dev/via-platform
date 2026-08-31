import { neon } from "@neondatabase/serverless";

// Market Mode on/off is PER STORE and server-persisted, so every device the seller is signed in on
// sees the same nav. Self-healing table (CREATE IF NOT EXISTS), matching the other store_* tables.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

let ensured = false;
async function ensure(): Promise<void> {
 if (ensured) return;
 await db()`CREATE TABLE IF NOT EXISTS store_market_mode (
  store_slug TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 ensured = true;
}

export async function getMarketMode(storeSlug: string): Promise<boolean> {
 try {
 await ensure();
 const rows = (await db()`SELECT enabled FROM store_market_mode WHERE store_slug = ${storeSlug}`) as Array<{ enabled: boolean }>;
 return Boolean(rows[0]?.enabled);
 } catch { return false; }
}

export async function setMarketMode(storeSlug: string, enabled: boolean): Promise<void> {
 await ensure();
 await db()`INSERT INTO store_market_mode (store_slug, enabled, updated_at) VALUES (${storeSlug}, ${enabled}, now())
  ON CONFLICT (store_slug) DO UPDATE SET enabled = ${enabled}, updated_at = now()`;
}
