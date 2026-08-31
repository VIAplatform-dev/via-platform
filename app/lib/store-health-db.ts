// Where a store's latest gate verdict lives, plus the seller's own answers to "does this look right?".
// Raw neon + CREATE TABLE IF NOT EXISTS, same self-healing pattern as import-engine/jobs-db.ts.
import { neon } from "@neondatabase/serverless";
import type { Finding, Verdict } from "./store-health.ts";
import type { ReviewState } from "./capture-review-gate.ts";

export type HealthScreen = { page: string; ours: string; source: string };
export type StoreHealth = { slug: string; verdict: Verdict; findings: Finding[]; screens: HealthScreen[]; checkedAt: string };
export type ReviewAnswer = "looks_right" | "something_off" | "skip";
export type StoreReview = { id: string; page: string; answer: ReviewAnswer; note: string | null; createdAt: string };

function sql() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL configured");
 return neon(url);
}
let ready = false;
async function ensure() {
 if (ready) return;
 const q = sql();
 await q`CREATE TABLE IF NOT EXISTS store_health (
  store_slug TEXT PRIMARY KEY,
  verdict TEXT NOT NULL,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  screens JSONB NOT NULL DEFAULT '[]'::jsonb,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await q`CREATE TABLE IF NOT EXISTS store_health_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_slug TEXT NOT NULL,
  page TEXT NOT NULL,
  answer TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await q`CREATE INDEX IF NOT EXISTS store_health_reviews_slug_idx ON store_health_reviews (store_slug, created_at DESC)`;
 ready = true;
}

export async function upsertStoreHealth(h: Omit<StoreHealth, "checkedAt">): Promise<void> {
 await ensure();
 await sql()`INSERT INTO store_health (store_slug, verdict, findings, screens, checked_at)
  VALUES (${h.slug}, ${h.verdict}, ${JSON.stringify(h.findings)}::jsonb, ${JSON.stringify(h.screens)}::jsonb, now())
  ON CONFLICT (store_slug) DO UPDATE SET verdict = EXCLUDED.verdict, findings = EXCLUDED.findings, screens = EXCLUDED.screens, checked_at = now()`;
}

export async function getStoreHealth(slug: string): Promise<StoreHealth | null> {
 await ensure();
 const rows = (await sql()`SELECT * FROM store_health WHERE store_slug = ${slug} LIMIT 1`) as Array<{ store_slug: string; verdict: Verdict; findings: Finding[]; screens: HealthScreen[]; checked_at: string }>;
 const r = rows[0];
 return r ? { slug: r.store_slug, verdict: r.verdict, findings: r.findings, screens: r.screens, checkedAt: new Date(r.checked_at).toISOString() } : null;
}

export async function addStoreReview(slug: string, page: string, answer: ReviewAnswer, note: string | null): Promise<void> {
 await ensure();
 await sql()`INSERT INTO store_health_reviews (store_slug, page, answer, note) VALUES (${slug}, ${page}, ${answer}, ${note})`;
}

export async function listStoreReviews(slug: string, limit = 50): Promise<StoreReview[]> {
 await ensure();
 const rows = (await sql()`SELECT id, page, answer, note, created_at FROM store_health_reviews WHERE store_slug = ${slug} ORDER BY created_at DESC LIMIT ${limit}`) as Array<{ id: string; page: string; answer: ReviewAnswer; note: string | null; created_at: string }>;
 return rows.map((r) => ({ id: r.id, page: r.page, answer: r.answer, note: r.note, createdAt: new Date(r.created_at).toISOString() }));
}

/** The two facts the edit gate needs, in one read: which pages the latest check put a side-by-side
 *  in front of her, and which of those she has answered (any answer, `skip` included).
 *  `screens: null` means no check has ever run for this store — which is NOT the same as "she
 *  hasn't reviewed"; see app/lib/capture-review-gate.ts. */
export async function getReviewState(slug: string): Promise<ReviewState> {
 const [health, reviews] = await Promise.all([getStoreHealth(slug), listStoreReviews(slug, 500)]);
 return {
  screens: health ? health.screens.map((s) => s.page) : null,
  answered: reviews.map((r) => r.page),
 };
}
