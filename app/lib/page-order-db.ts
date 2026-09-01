import { neon } from "@neondatabase/serverless";

// Where a seller's own arrangement of the pages strip lives.
//
// Its own table rather than a column on storefront_settings, for one blunt reason: that row has a
// NOT NULL UNIQUE `handle`, so writing to it means inventing a public address for a store that may
// not have one. Tess doesn't — her site is served from the capture, and she has no settings row at
// all. Making "drag a thumbnail" depend on creating a public handle would be a strange trade.
//
// Self-healing DDL, like the rest of the schema — no migration step.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ready = false;
async function ensure() {
 if (ready) return;
 await db()`CREATE TABLE IF NOT EXISTS store_page_order (
  store_slug TEXT PRIMARY KEY,
  paths JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 ready = true;
}

/** Her saved order, or null if she has never arranged them. */
export async function getPageOrder(slug: string): Promise<string[] | null> {
 await ensure();
 const rows = (await db()`SELECT paths FROM store_page_order WHERE store_slug = ${slug} LIMIT 1`) as { paths: unknown }[];
 const p = rows[0]?.paths;
 return Array.isArray(p) ? (p as unknown[]).filter((x): x is string => typeof x === "string") : null;
}

/** Replace her order. An empty array clears it, putting the strip back to its default. */
export async function setPageOrder(slug: string, paths: string[]): Promise<void> {
 await ensure();
 if (!paths.length) {
  await db()`DELETE FROM store_page_order WHERE store_slug = ${slug}`;
  return;
 }
 await db()`INSERT INTO store_page_order (store_slug, paths, updated_at)
            VALUES (${slug}, ${JSON.stringify(paths)}::jsonb, now())
            ON CONFLICT (store_slug) DO UPDATE SET paths = EXCLUDED.paths, updated_at = now()`;
}
