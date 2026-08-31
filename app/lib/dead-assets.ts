/**
 * Assets that are gone from the seller's own site, and are not coming back.
 *
 * shop-vintage-charm's pages reference 704 files that no longer exist on her store — old theme
 * images and the uploads of a blog app she has since removed. `/images/arrow.jpg` 404s on her live
 * homepage right now. Every fleet run tried all 704 again, spent about 23 minutes doing it, failed
 * all 704 again, and reported the store INCOMPLETE. It converged on nothing, for ever.
 *
 * Remembering a failure is dangerous in the obvious way: remember a temporary one and we quietly
 * stop copying an asset that is fine. So only an answer that means "this file is not here" counts.
 * A throttle, a timeout, a bad gateway or no answer at all is the seller's site having a moment,
 * and the asset is tried again next time.
 */

/** Did the seller's own server tell us, definitively, that this file is not there? */
export function isPermanentlyGone(status: number | null | undefined): boolean {
 if (!status) return false; // no answer is not an answer
 // 404/410 — not found, or knowingly removed. 401/403 — she has locked it, and asking again from
 // the same place will not unlock it. Everything else, including 429 and every 5xx, is temporary.
 return status === 404 || status === 410 || status === 401 || status === 403;
}

/**
 * The store of what is gone, so a run does not rediscover it.
 *
 * A tiny table created on demand, the same self-healing shape the rest of the codebase uses for
 * additive columns: a deploy works before any migration runs, and this is a no-op afterwards.
 */
import { neon } from "@neondatabase/serverless";

let ensured = false;
function sqlOrNull() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 return url ? neon(url) : null;
}

async function ensureTable(): Promise<boolean> {
 if (ensured) return true;
 const sql = sqlOrNull();
 if (!sql) return false;
 try {
  await sql`CREATE TABLE IF NOT EXISTS dead_assets (
   url TEXT PRIMARY KEY,
   store_slug TEXT,
   status INT,
   first_seen TIMESTAMPTZ DEFAULT now(),
   last_seen TIMESTAMPTZ DEFAULT now()
  )`;
  ensured = true;
  return true;
 } catch { return false; }
}

/** Everything already known to be gone for this store, so the run can skip it without asking. */
export async function knownDeadAssets(slug: string): Promise<Set<string>> {
 if (!(await ensureTable())) return new Set();
 const sql = sqlOrNull();
 if (!sql) return new Set();
 try {
  const rows = (await sql`SELECT url FROM dead_assets WHERE store_slug = ${slug}`) as { url: string }[];
  return new Set(rows.map((r) => r.url));
 } catch { return new Set(); }
}

/** Record one. Idempotent; `last_seen` moves so a stale entry can be found and re-tried by hand. */
export async function recordDeadAsset(slug: string, url: string, status: number): Promise<void> {
 if (!isPermanentlyGone(status)) return;
 if (!(await ensureTable())) return;
 const sql = sqlOrNull();
 if (!sql) return;
 try {
  await sql`INSERT INTO dead_assets (url, store_slug, status) VALUES (${url}, ${slug}, ${status})
   ON CONFLICT (url) DO UPDATE SET last_seen = now(), status = ${status}`;
 } catch { /* allow-swallow: a missed note costs one retry next run, never correctness */ }
}
