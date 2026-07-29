import { neon } from "@neondatabase/serverless";

// ── Sourcing-alert dedup ───────────────────────────────────────────────────────────────────────
// A store is told about a given opportunity (a brand / category / era) at most once per window, so a
// segment that stays hot for weeks doesn't nag on every send. Keyed per-store, so a newly-subscribed
// store still gets the current opportunities.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

export type AlertKeyable = { segmentType: string; segmentValue: string };
const segKey = (p: AlertKeyable) => `${p.segmentType}:${p.segmentValue}`.toLowerCase();

let _ready = false;
async function ensure() {
 if (_ready) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS sourcing_alerts_sent (
  id BIGSERIAL PRIMARY KEY, store_slug TEXT NOT NULL, segment_key TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`.catch(() => {});
 await sql`CREATE INDEX IF NOT EXISTS idx_sourcing_alerts ON sourcing_alerts_sent (store_slug, segment_key, sent_at DESC)`.catch(() => {});
 _ready = true;
}

// The subset of `picks` this store HASN'T been alerted about within `windowDays`. Read-only — the
// caller records them (via recordSent) only after the email actually goes out, so a send failure
// doesn't silently swallow the opportunity.
export async function unsentPicks<T extends AlertKeyable>(storeSlug: string, picks: T[], windowDays = 14): Promise<T[]> {
 if (!picks.length) return [];
 await ensure();
 const sql = db();
 const rows = (await sql`
  SELECT segment_key FROM sourcing_alerts_sent
  WHERE store_slug = ${storeSlug} AND sent_at >= now() - (${windowDays} || ' days')::interval
 `.catch(() => [])) as { segment_key: string }[];
 const seen = new Set(rows.map((r) => r.segment_key));
 return picks.filter((p) => !seen.has(segKey(p)));
}

// Mark these opportunities as alerted for this store (called after a successful send).
export async function recordSent(storeSlug: string, picks: AlertKeyable[]): Promise<void> {
 if (!picks.length) return;
 await ensure();
 const sql = db();
 for (const p of picks) {
  await sql`INSERT INTO sourcing_alerts_sent (store_slug, segment_key) VALUES (${storeSlug}, ${segKey(p)})`.catch(() => {});
 }
}
