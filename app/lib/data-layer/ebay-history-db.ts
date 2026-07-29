import { neon } from "@neondatabase/serverless";
import { searchComps, type EbayComps } from "./ebay";

// ── eBay price history ─────────────────────────────────────────────────────────────────────────
// eBay Browse is free, so we always fetch fresh — but we also LOG each result (once per term per day)
// so VYA accrues its own price history. That history is what turns a snapshot ("asks ~$210") into a
// trend ("asks ~$210, up 22% in 3 weeks") — a proprietary dataset that compounds with every search
// and scan. Every lookup a store does makes the dataset richer.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

let _ready = false;
async function ensure() {
 if (_ready) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS ebay_comp_snapshots (
  id BIGSERIAL PRIMARY KEY, query TEXT NOT NULL, median NUMERIC, p25 NUMERIC, p75 NUMERIC,
  active_count INT, sold_per_30d INT, captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`.catch(() => {});
 await sql`CREATE INDEX IF NOT EXISTS idx_ebay_comp_query_ts ON ebay_comp_snapshots (lower(query), captured_at DESC)`.catch(() => {});
 _ready = true;
}

export type EbayCompsHist = EbayComps & { priceMomentumPct: number | null };

// Fetch fresh eBay comps and bank a snapshot (deduped to once/day per term), then attach price
// momentum vs ~a week ago from the accumulated history. Returns null when eBay returns nothing.
export async function getOrFetchEbayComps(query: string): Promise<EbayCompsHist | null> {
 const q = query.trim();
 if (q.length < 2) return null;
 const comps = await searchComps(q).catch(() => null);
 if (!comps) return null;

 const sql = db();
 await ensure();
 // Bank at most one snapshot per term per day — enough for momentum without bloating the table.
 const already = (await sql`SELECT 1 FROM ebay_comp_snapshots
  WHERE lower(query) = lower(${q}) AND captured_at >= date_trunc('day', now()) LIMIT 1`.catch(() => [])) as unknown[];
 if (!already.length) {
  await sql`INSERT INTO ebay_comp_snapshots (query, median, p25, p75, active_count, sold_per_30d)
   VALUES (${q}, ${comps.medianPrice}, ${comps.p25}, ${comps.p75}, ${comps.activeCount}, ${comps.soldPer30d ?? null})`.catch(() => {});
 }
 // Momentum: today's median vs the most recent snapshot from ≥7 days ago.
 const prior = (await sql`SELECT median FROM ebay_comp_snapshots
  WHERE lower(query) = lower(${q}) AND captured_at <= now() - interval '7 days'
  ORDER BY captured_at DESC LIMIT 1`.catch(() => [])) as { median: number | null }[];
 const p = prior[0]?.median != null ? Number(prior[0].median) : null;
 const priceMomentumPct = p && p > 0 && comps.medianPrice != null ? Math.round(((comps.medianPrice - p) / p) * 100) : null;

 return { ...comps, priceMomentumPct };
}
