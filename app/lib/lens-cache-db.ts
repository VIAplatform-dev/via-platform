import { neon } from "@neondatabase/serverless";
import type { VisualMatch } from "./comps.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Google Lens (reverse-image) cache. The image URL is immutable, so the SAME photo
// returns the SAME visual matches — yet without this every re-draft ("Fill with AI"
// again), edit, retry, or QA-cron re-scan pays SerpApi again for an identical result.
// Caching by URL removes that pure-duplicate spend with ZERO accuracy impact (same
// input → same output). A 30-day TTL captures all the short-term repeats (which happen
// within minutes) while letting the web refresh occasionally. Pricing FRESHNESS is
// unaffected — the live comp basket (eBay-sold etc.) still runs on the pricing path;
// this only dedupes the visual-match lookup.
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
 CREATE TABLE IF NOT EXISTS lens_cache (
  image_url TEXT PRIMARY KEY,
  matches JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )
 `;
 ensured = true;
}

/** Cached visual matches for this image URL, or null on a miss/expiry. Best-effort — never throws. */
export async function getCachedLens(imageUrl: string): Promise<VisualMatch[] | null> {
 if (!imageUrl) return null;
 try {
 await ensure();
 const sql = db();
 const cutoff = new Date(Date.now() - TTL_DAYS * 86_400_000).toISOString();
 const rows = (await sql`
  SELECT matches FROM lens_cache WHERE image_url = ${imageUrl} AND fetched_at >= ${cutoff} LIMIT 1
 `) as Array<{ matches: unknown }>;
 if (!rows.length) return null;
 return Array.isArray(rows[0].matches) ? (rows[0].matches as VisualMatch[]) : null;
 } catch {
 return null; // cache miss on any error — the caller falls back to a live SerpApi call
 }
}

/** Persist the visual matches for this image URL (upsert, refreshing recency). Best-effort. */
export async function saveCachedLens(imageUrl: string, matches: VisualMatch[]): Promise<void> {
 if (!imageUrl) return;
 try {
 await ensure();
 const sql = db();
 await sql`
  INSERT INTO lens_cache (image_url, matches, fetched_at)
  VALUES (${imageUrl}, ${JSON.stringify(matches)}::jsonb, NOW())
  ON CONFLICT (image_url) DO UPDATE SET matches = EXCLUDED.matches, fetched_at = NOW()
 `;
 } catch {
 // best-effort — a failed cache write just means the next lookup pays again
 }
}
