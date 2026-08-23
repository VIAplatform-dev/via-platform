import { neon } from "@neondatabase/serverless";
import type { ExtractedPrice } from "./comp-price-verify.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Link price-verify cache. A product page's structured price barely moves day to
// day, and the same match URLs recur across drafts/retries of the same listing —
// so cache extraction results by URL (30-day TTL, same shape as lens_cache).
// Only genuine page reads are cached (including honest "no price on page" results);
// fetch failures are NEVER cached, so a transient block can't poison a URL.
// ─────────────────────────────────────────────────────────────────────────────

const TTL_DAYS = 30;

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
 CREATE TABLE IF NOT EXISTS link_price_cache (
  url TEXT PRIMARY KEY,
  extracted JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )
 `;
 ensured = true;
}

/** Cached extraction for this product URL, or null on miss/expiry. Best-effort — never throws. */
export async function getCachedLinkPrice(url: string): Promise<ExtractedPrice | null> {
 if (!url) return null;
 try {
 await ensure();
 const sql = db();
 const cutoff = new Date(Date.now() - TTL_DAYS * 86_400_000).toISOString();
 const rows = (await sql`
  SELECT extracted FROM link_price_cache WHERE url = ${url} AND fetched_at >= ${cutoff} LIMIT 1
 `) as Array<{ extracted: unknown }>;
 if (!rows.length) return null;
 const e = rows[0].extracted as ExtractedPrice;
 return e && typeof e === "object" ? e : null;
 } catch {
 return null; // cache miss on any error — the caller just fetches the page again
 }
}

/** Persist an extraction result for this URL (upsert, refreshing recency). Best-effort. */
export async function saveCachedLinkPrice(url: string, extracted: ExtractedPrice): Promise<void> {
 if (!url) return;
 try {
 await ensure();
 const sql = db();
 await sql`
  INSERT INTO link_price_cache (url, extracted, fetched_at)
  VALUES (${url}, ${JSON.stringify(extracted)}::jsonb, NOW())
  ON CONFLICT (url) DO UPDATE SET extracted = EXCLUDED.extracted, fetched_at = NOW()
 `;
 } catch {
 // best-effort — a failed cache write just means the next lookup fetches again
 }
}
