import { neon } from "@neondatabase/serverless";

// ─────────────────────────────────────────────────────────────────────────────
// Real API-cost tracker. Every paid call logs its ACTUAL cost — computed from the
// provider's own usage numbers (Anthropic + Voyage return token counts; SerpAPI is
// per-search) — so "what does a listing cost" is measured, not estimated. Best-effort:
// a logging failure must never break the request that made the call.
// ─────────────────────────────────────────────────────────────────────────────

// The ONE place cost rates live. Update when a plan or model price changes.
export const RATES = {
 anthropic: {
  // $/million tokens, by model (input / output). Sonnet-class default.
  "claude-sonnet-4-6": { inPerM: 3.0, outPerM: 15.0 },
  _default: { inPerM: 3.0, outPerM: 15.0 },
 } as Record<string, { inPerM: number; outPerM: number }>,
 voyagePerM: 0.12,            // voyage-multimodal-3, $/million tokens
 voyageFallbackTokens: 1000,  // if the API omits usage, assume ~1 image ≈ this many tokens
 serpPerSearchCents: 1.5,     // $75/mo ÷ 5,000 searches = $0.015/search (plan-amortized)
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function db() { const url = process.env.DATABASE_URL || process.env.POSTGRES_URL; if (!url) throw new Error("no db"); return neon(url); }

let ensured = false;
async function ensure(): Promise<void> {
 if (ensured) return;
 const sql = db();
 await sql`
  CREATE TABLE IF NOT EXISTS api_costs (
   id BIGSERIAL PRIMARY KEY,
   provider TEXT NOT NULL,          -- anthropic | serpapi | voyage | linq | easypost | stripe
   operation TEXT,                  -- draft | runway | celebrity | polish_seo | google_lens | ebay | embed | ...
   model TEXT,
   item_id TEXT,
   store_slug TEXT,
   input_tokens INT,
   output_tokens INT,
   units INT NOT NULL DEFAULT 1,
   cost_cents NUMERIC(12,5) NOT NULL,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_api_costs_time ON api_costs(created_at DESC)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_api_costs_prov_op ON api_costs(provider, operation)`;
 ensured = true;
}

export function anthropicCents(model: string, usage: any): number {
 const r = RATES.anthropic[model] || RATES.anthropic._default;
 const inTok = Number(usage?.input_tokens || 0), outTok = Number(usage?.output_tokens || 0);
 return (inTok / 1e6) * r.inPerM * 100 + (outTok / 1e6) * r.outPerM * 100;
}

type Entry = {
 provider: string; operation?: string; model?: string; itemId?: string | null; storeSlug?: string | null;
 inputTokens?: number | null; outputTokens?: number | null; units?: number; costCents: number;
};
export async function recordCost(e: Entry): Promise<void> {
 try {
  await ensure();
  const sql = db();
  await sql`INSERT INTO api_costs (provider, operation, model, item_id, store_slug, input_tokens, output_tokens, units, cost_cents)
   VALUES (${e.provider}, ${e.operation ?? null}, ${e.model ?? null}, ${e.itemId ?? null}, ${e.storeSlug ?? null}, ${e.inputTokens ?? null}, ${e.outputTokens ?? null}, ${e.units ?? 1}, ${e.costCents})`;
 } catch { /* best-effort — never break a request over cost logging */ }
}

// ── Convenience wrappers used at each call site (one line each) ──
export async function recordAnthropic(model: string, operation: string, data: any, ctx?: { itemId?: string | null; storeSlug?: string | null }): Promise<void> {
 const u = data?.usage;
 await recordCost({ provider: "anthropic", operation, model, inputTokens: u?.input_tokens ?? null, outputTokens: u?.output_tokens ?? null, costCents: anthropicCents(model, u), itemId: ctx?.itemId, storeSlug: ctx?.storeSlug });
}
export async function recordSerp(engine: string, ctx?: { itemId?: string | null; storeSlug?: string | null }): Promise<void> {
 await recordCost({ provider: "serpapi", operation: engine, units: 1, costCents: RATES.serpPerSearchCents, itemId: ctx?.itemId, storeSlug: ctx?.storeSlug });
}
export async function recordVoyage(data: any, ctx?: { itemId?: string | null; storeSlug?: string | null }): Promise<void> {
 const tokens = Number(data?.usage?.total_tokens || RATES.voyageFallbackTokens);
 await recordCost({ provider: "voyage", operation: "embed", model: "voyage-multimodal-3", inputTokens: tokens, units: 1, costCents: (tokens / 1e6) * RATES.voyagePerM * 100, itemId: ctx?.itemId, storeSlug: ctx?.storeSlug });
}

// ── SerpApi monthly quota tracking ──
const SERPAPI_MONTHLY_LIMIT = 5000;

export async function getSerpApiUsage(): Promise<{ used: number; limit: number; remaining: number; pct: number; projectedMonthEnd: number; warning: boolean }> {
 await ensure();
 const sql = db();
 // Count calls since the 1st of the current month (UTC)
 const monthStart = new Date();
 monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
 const since = monthStart.toISOString();
 const dayOfMonth = new Date().getUTCDate();
 const daysInMonth = new Date(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0).getUTCDate();

 const rows = await sql`SELECT COUNT(*)::int AS n FROM api_costs WHERE provider = 'serpapi' AND created_at >= ${since}`;
 const used = (rows[0] as any)?.n ?? 0;
 const remaining = Math.max(0, SERPAPI_MONTHLY_LIMIT - used);
 const pct = Math.round((used / SERPAPI_MONTHLY_LIMIT) * 100);
 // Linear projection: if we used X in D days, we'll use X * (daysInMonth / D) by month end
 const projectedMonthEnd = dayOfMonth > 0 ? Math.round(used * (daysInMonth / dayOfMonth)) : used;
 return { used, limit: SERPAPI_MONTHLY_LIMIT, remaining, pct, projectedMonthEnd, warning: projectedMonthEnd > SERPAPI_MONTHLY_LIMIT * 0.85 };
}

// ── Aggregation for the admin costs view ──
export async function getCostSummary(days = 30): Promise<any> {
 await ensure();
 const sql = db();
 const since = new Date(Date.now() - days * 86_400_000).toISOString();
 const [byProvider, byOperation, drafts, total] = await Promise.all([
  sql`SELECT provider, COUNT(*)::int AS calls, ROUND(SUM(cost_cents)/100.0, 2)::float AS usd FROM api_costs WHERE created_at >= ${since} GROUP BY provider ORDER BY usd DESC NULLS LAST`,
  sql`SELECT provider, operation, COUNT(*)::int AS calls, ROUND(SUM(cost_cents)/100.0, 2)::float AS usd, ROUND(AVG(cost_cents)/100.0, 4)::float AS avg_usd FROM api_costs WHERE created_at >= ${since} GROUP BY provider, operation ORDER BY usd DESC NULLS LAST`,
  sql`SELECT COUNT(*)::int AS n FROM api_costs WHERE created_at >= ${since} AND operation = 'draft'`,
  sql`SELECT ROUND(SUM(cost_cents)/100.0, 2)::float AS usd FROM api_costs WHERE created_at >= ${since}`,
 ]);
 const listings = (drafts[0] as any)?.n || 0;
 const totalUsd = (total[0] as any)?.usd || 0;
 return {
  windowDays: days,
  totalUsd,
  monthlyRunRateUsd: Math.round(totalUsd * (30 / days) * 100) / 100,
  listingsMeasured: listings,
  costPerListingUsd: listings ? Math.round((totalUsd / listings) * 10000) / 10000 : null,
  byProvider,
  byOperation,
 };
}
