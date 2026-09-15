import { neon } from "@neondatabase/serverless";

// Per-seller Etsy OAuth2 (PKCE) tokens. Access tokens are short-lived (~1h); the refresh token
// mints new ones. We also cache the connected shop (id + name), needed for every listing call.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return neon(url);
}

let ready = false;
async function ensureTable() {
 if (ready) return;
 await db()`CREATE TABLE IF NOT EXISTS etsy_tokens (
  store_slug TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  shop_id TEXT,
  shop_name TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 ready = true;
}

export type EtsyTokens = { accessToken: string; refreshToken: string; expiresAt: string; shopId: string | null; shopName: string | null };

export async function saveEtsyTokens(storeSlug: string, t: { accessToken: string; refreshToken: string; expiresInSec: number; shopId?: string | null; shopName?: string | null }): Promise<void> {
 await ensureTable();
 const expiresAt = new Date(Date.now() + (t.expiresInSec - 120) * 1000).toISOString();
 await db()`
  INSERT INTO etsy_tokens (store_slug, access_token, refresh_token, expires_at, shop_id, shop_name)
  VALUES (${storeSlug}, ${t.accessToken}, ${t.refreshToken}, ${expiresAt}, ${t.shopId ?? null}, ${t.shopName ?? null})
  ON CONFLICT (store_slug) DO UPDATE SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token,
   expires_at = EXCLUDED.expires_at, shop_id = COALESCE(EXCLUDED.shop_id, etsy_tokens.shop_id), shop_name = COALESCE(EXCLUDED.shop_name, etsy_tokens.shop_name)
 `.catch(() => {});
}

// Refresh rotates BOTH tokens on Etsy. Save the new refresh token too.
export async function updateEtsyTokens(storeSlug: string, accessToken: string, refreshToken: string, expiresInSec: number): Promise<void> {
 await ensureTable();
 const expiresAt = new Date(Date.now() + (expiresInSec - 120) * 1000).toISOString();
 await db()`UPDATE etsy_tokens SET access_token = ${accessToken}, refresh_token = ${refreshToken}, expires_at = ${expiresAt} WHERE store_slug = ${storeSlug}`.catch(() => {});
}

export async function saveEtsyShop(storeSlug: string, shopId: string, shopName: string | null): Promise<void> {
 await ensureTable();
 await db()`UPDATE etsy_tokens SET shop_id = ${shopId}, shop_name = ${shopName} WHERE store_slug = ${storeSlug}`.catch(() => {});
}

export async function getEtsyTokens(storeSlug: string): Promise<EtsyTokens | null> {
 await ensureTable();
 const rows = (await db()`SELECT access_token, refresh_token, expires_at, shop_id, shop_name FROM etsy_tokens WHERE store_slug = ${storeSlug} LIMIT 1`.catch(() => [])) as Record<string, unknown>[];
 const r = rows[0];
 if (!r) return null;
 return { accessToken: r.access_token as string, refreshToken: r.refresh_token as string, expiresAt: new Date(r.expires_at as string).toISOString(), shopId: (r.shop_id as string) ?? null, shopName: (r.shop_name as string) ?? null };
}

export async function clearEtsyTokens(storeSlug: string): Promise<void> {
 await ensureTable();
 await db()`DELETE FROM etsy_tokens WHERE store_slug = ${storeSlug}`.catch(() => {});
}

export async function listEtsyConnectedStores(): Promise<string[]> {
 await ensureTable();
 const rows = (await db()`SELECT store_slug FROM etsy_tokens`.catch(() => [])) as Record<string, unknown>[];
 return rows.map((r) => r.store_slug as string);
}
