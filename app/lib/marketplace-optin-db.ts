// Storing a store's marketplace choice. The meaning of it lives in marketplace-optin.ts.

import { neon } from "@neondatabase/serverless";
import { DEFAULT_OPT_IN, type MarketplaceOptIn } from "./marketplace-optin";

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensure() {
 if (ensured) return;
 // Its own table rather than a column on storefront_settings: this is not a fact about her
 // storefront, it is a fact about where else her stock is sold. A store can have no storefront at
 // all and still want the marketplace.
 await db()`CREATE TABLE IF NOT EXISTS store_marketplace (
  store_slug TEXT PRIMARY KEY,
  listed BOOLEAN NOT NULL DEFAULT FALSE,
  decided_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 ensured = true;
}

/** A store that never chose is not listed. No row means no, and that is the safe direction. */
export async function getMarketplaceOptIn(storeSlug: string): Promise<MarketplaceOptIn> {
 try {
  await ensure();
  const rows = (await db()`SELECT listed, decided_at FROM store_marketplace WHERE store_slug = ${storeSlug} LIMIT 1`) as Array<Record<string, unknown>>;
  const r = rows[0];
  if (!r) return DEFAULT_OPT_IN;
  return { listed: r.listed === true, decidedAt: r.decided_at ? new Date(r.decided_at as string).toISOString() : null };
 } catch {
  return DEFAULT_OPT_IN;
 }
}

export async function setMarketplaceOptIn(storeSlug: string, listed: boolean): Promise<MarketplaceOptIn> {
 await ensure();
 const decidedAt = new Date().toISOString();
 await db()`
  INSERT INTO store_marketplace (store_slug, listed, decided_at, updated_at)
  VALUES (${storeSlug}, ${listed}, ${decidedAt}, now())
  ON CONFLICT (store_slug) DO UPDATE SET listed = ${listed}, decided_at = ${decidedAt}, updated_at = now()
 `;
 return { listed, decidedAt };
}

/** Every store that has said yes. What a marketplace query filters on. */
export async function listedStoreSlugs(): Promise<string[]> {
 try {
  await ensure();
  const rows = (await db()`SELECT store_slug FROM store_marketplace WHERE listed = TRUE`) as Array<{ store_slug: string }>;
  return rows.map((r) => r.store_slug);
 } catch {
  return [];
 }
}
