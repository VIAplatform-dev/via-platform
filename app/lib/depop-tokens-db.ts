import { neon } from "@neondatabase/serverless";

// Per-seller Depop credentials.
//
// Originally built for the partner Selling API (partner-gated via partner@depop.com), which would
// give us a Bearer token. That route is closed to us for now — Cloudflare blocks a server-side
// login — so the credential this table actually holds is a SESSION captured on the seller's phone,
// where the login looks genuine to Depop. `access_token` stores whichever we have; depop.ts decides
// how to present it. Mirrors the eBay token store so the cross-lister treats them the same way.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 await db()`CREATE TABLE IF NOT EXISTS depop_tokens (
  store_slug TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  depop_user TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 ensured = true;
}

export type DepopTokens = { accessToken: string; refreshToken: string | null; expiresAt: string | null; depopUser: string | null };

export async function saveDepopTokens(storeSlug: string, t: { accessToken: string; refreshToken?: string | null; expiresInSec?: number | null; depopUser?: string | null }): Promise<void> {
 await ensureTable();
 const expiresAt = t.expiresInSec ? new Date(Date.now() + Math.max(60, t.expiresInSec - 120) * 1000).toISOString() : null;
 await db()`
  INSERT INTO depop_tokens (store_slug, access_token, refresh_token, expires_at, depop_user)
  VALUES (${storeSlug}, ${t.accessToken}, ${t.refreshToken ?? null}, ${expiresAt}, ${t.depopUser ?? null})
  ON CONFLICT (store_slug) DO UPDATE SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token,
   expires_at = EXCLUDED.expires_at, depop_user = COALESCE(EXCLUDED.depop_user, depop_tokens.depop_user)
 `.catch(() => {});
}

export async function updateDepopAccessToken(storeSlug: string, accessToken: string, expiresInSec: number): Promise<void> {
 await ensureTable();
 const expiresAt = new Date(Date.now() + Math.max(60, expiresInSec - 120) * 1000).toISOString();
 await db()`UPDATE depop_tokens SET access_token = ${accessToken}, expires_at = ${expiresAt} WHERE store_slug = ${storeSlug}`.catch(() => {});
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function getDepopTokens(storeSlug: string): Promise<DepopTokens | null> {
 await ensureTable();
 const rows = (await db()`SELECT access_token, refresh_token, expires_at, depop_user FROM depop_tokens WHERE store_slug = ${storeSlug} LIMIT 1`.catch(() => [])) as any[];
 if (!rows.length) return null;
 const r = rows[0];
 return { accessToken: r.access_token, refreshToken: r.refresh_token ?? null, expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null, depopUser: r.depop_user ?? null };
}

/**
 * Every store with a Depop credential on file — what the sold-sync cron iterates.
 *
 * Mirrors listEbayConnectedStores. Expired sessions are NOT filtered out here: a session whose
 * recorded expiry has passed may still work (Depop's real lifetime is one of the things we're trying
 * to measure), and a sync that skips a store because of a guessed expiry would hide the very signal
 * we want. The caller finds out by making the request.
 */
export async function listDepopConnectedStores(): Promise<string[]> {
 await ensureTable();
 const rows = (await db()`SELECT store_slug FROM depop_tokens`.catch(() => [])) as any[];
 return rows.map((r) => String(r.store_slug)).filter(Boolean);
}

export async function clearDepopTokens(storeSlug: string): Promise<void> {
 await ensureTable();
 await db()`DELETE FROM depop_tokens WHERE store_slug = ${storeSlug}`.catch(() => {});
}
