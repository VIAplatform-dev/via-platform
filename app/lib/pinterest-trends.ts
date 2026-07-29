import { neon } from "@neondatabase/serverless";

// Pinterest Trends — a CLEAN, official signal for what's rising in fashion CULTURE, from outside
// VYA's own walls. Pinterest is where resale/vintage taste forms weeks before it shows up in resale
// demand, so this is a LEADING discovery signal to complement VYA's own (what buyers already do here).
//   • a daily cron CAPTURES the top growing fashion keywords → snapshots
//   • the seller route READS the latest snapshot (no live API call per page view; history = momentum)
// Fully dormant (no calls, no cost) until a token is set. Needs a Pinterest business account + an app
// with trends:read access and PINTEREST_ACCESS_TOKEN (optionally PINTEREST_REGION, default "US").

const PINTEREST_API = "https://api.pinterest.com/v5";
const REGION = process.env.PINTEREST_REGION || "US";
// Fashion facets in Pinterest's taxonomy, so we get style trends — not recipes or home decor.
const INTERESTS = "womens_fashion,mens_fashion";

export function isPinterestConfigured(): boolean {
 return Boolean(process.env.PINTEREST_ACCESS_TOKEN);
}

function tdb() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return neon(url);
}
const numOrNull = (v: unknown): number | null => {
 const n = Math.round(Number(v));
 return Number.isFinite(n) ? n : null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
async function pin(path: string, params: Record<string, string>): Promise<any | null> {
 const token = process.env.PINTEREST_ACCESS_TOKEN;
 if (!token) return null;
 const url = new URL(`${PINTEREST_API}/${path}`);
 for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
 try {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) return null;
  return await res.json();
 } catch {
  return null;
 }
}

export type PinterestTrend = { keyword: string; rank: number; growthWow: number | null; growthYoy: number | null };

let _ready = false;
async function ensureTable(sql: ReturnType<typeof tdb>) {
 if (_ready) return;
 await sql`CREATE TABLE IF NOT EXISTS pinterest_trend_snapshots (
  id BIGSERIAL PRIMARY KEY, keyword TEXT NOT NULL, rank INT, growth_wow INT, growth_yoy INT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`.catch(() => {});
 await sql`CREATE INDEX IF NOT EXISTS idx_pin_trend_ts ON pinterest_trend_snapshots (captured_at DESC)`.catch(() => {});
 _ready = true;
}

// CAPTURE (daily cron): the top GROWING fashion keywords on Pinterest right now, saved as a snapshot.
export async function capturePinterestTrends(): Promise<number> {
 if (!isPinterestConfigured()) return 0;
 const sql = tdb();
 await ensureTable(sql);
 // trend_type "growing" = fastest-rising searches; the discovery signal (vs. established "monthly").
 const j = await pin(`trends/keywords/${encodeURIComponent(REGION)}/top/growing`, { interests: INTERESTS, limit: "50" });
 const trends: any[] = j?.trends ?? j?.data ?? [];
 let saved = 0;
 for (let i = 0; i < trends.length; i++) {
  const kw = String(trends[i]?.keyword ?? "").trim();
  if (!kw) continue;
  await sql`INSERT INTO pinterest_trend_snapshots (keyword, rank, growth_wow, growth_yoy)
   VALUES (${kw}, ${i + 1}, ${numOrNull(trends[i]?.pct_growth_wow)}, ${numOrNull(trends[i]?.pct_growth_yoy)})`.catch(() => {});
  saved++;
 }
 return saved;
}

// READ (seller route): the most recent snapshot's top keywords, ranked as Pinterest ranked them.
export async function getPinterestTrends(limit = 15): Promise<PinterestTrend[]> {
 const sql = tdb();
 const rows = (await sql`
  SELECT DISTINCT ON (lower(keyword)) keyword, rank, growth_wow, growth_yoy
  FROM pinterest_trend_snapshots WHERE captured_at >= now() - interval '10 days'
  ORDER BY lower(keyword), captured_at DESC
 `.catch(() => [])) as { keyword: string; rank: number | null; growth_wow: number | null; growth_yoy: number | null }[];
 return rows
  .map((r) => ({ keyword: r.keyword, rank: r.rank ?? 999, growthWow: r.growth_wow, growthYoy: r.growth_yoy }))
  .sort((a, b) => a.rank - b.rank)
  .slice(0, limit);
}
