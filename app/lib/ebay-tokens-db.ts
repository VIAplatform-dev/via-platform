import { neon } from "@neondatabase/serverless";

// Per-seller eBay OAuth tokens (authorization-code grant). Access tokens are short-lived
// (~2h); the refresh token (~18mo) mints new ones. Stored per store slug.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 await db()`CREATE TABLE IF NOT EXISTS ebay_tokens (
  store_slug TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ebay_user TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 ensured = true;
}

export type EbayTokens = { accessToken: string; refreshToken: string; expiresAt: string; ebayUser: string | null };

export async function saveEbayTokens(storeSlug: string, t: { accessToken: string; refreshToken: string; expiresInSec: number; ebayUser?: string | null }): Promise<void> {
 await ensureTable();
 const expiresAt = new Date(Date.now() + Math.max(60, t.expiresInSec - 120) * 1000).toISOString();
 await db()`
  INSERT INTO ebay_tokens (store_slug, access_token, refresh_token, expires_at, ebay_user)
  VALUES (${storeSlug}, ${t.accessToken}, ${t.refreshToken}, ${expiresAt}, ${t.ebayUser ?? null})
  ON CONFLICT (store_slug) DO UPDATE SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token,
   expires_at = EXCLUDED.expires_at, ebay_user = COALESCE(EXCLUDED.ebay_user, ebay_tokens.ebay_user)
 `.catch(() => {});
}

// Only the access token gets refreshed. Keep the existing refresh token.
export async function updateEbayAccessToken(storeSlug: string, accessToken: string, expiresInSec: number): Promise<void> {
 await ensureTable();
 const expiresAt = new Date(Date.now() + Math.max(60, expiresInSec - 120) * 1000).toISOString();
 await db()`UPDATE ebay_tokens SET access_token = ${accessToken}, expires_at = ${expiresAt} WHERE store_slug = ${storeSlug}`.catch(() => {});
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function getEbayTokens(storeSlug: string): Promise<EbayTokens | null> {
 await ensureTable();
 const rows = (await db()`SELECT access_token, refresh_token, expires_at, ebay_user FROM ebay_tokens WHERE store_slug = ${storeSlug} LIMIT 1`.catch(() => [])) as any[];
 if (!rows.length) return null;
 const r = rows[0];
 return { accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: new Date(r.expires_at).toISOString(), ebayUser: r.ebay_user ?? null };
}

export async function clearEbayTokens(storeSlug: string): Promise<void> {
 await ensureTable();
 await db()`DELETE FROM ebay_tokens WHERE store_slug = ${storeSlug}`.catch(() => {});
}

// eBay account-deletion compliance: drop any tokens tied to a deleted eBay user.
export async function clearEbayTokensByUser(ebayUser: string): Promise<void> {
 if (!ebayUser) return;
 await ensureTable();
 await db()`DELETE FROM ebay_tokens WHERE lower(ebay_user) = ${ebayUser.toLowerCase()}`.catch(() => {});
}

// Every store with a connected eBay account. Drives the sale-sync cron.
export async function listEbayConnectedStores(): Promise<string[]> {
 await ensureTable();
 const rows = (await db()`SELECT store_slug FROM ebay_tokens`.catch(() => [])) as any[];
 return rows.map((r) => String(r.store_slug));
}
