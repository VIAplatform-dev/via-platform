import { neon } from "@neondatabase/serverless";
import { priceToCents } from "./comps";

// External market signal for the Trends tab, PERSISTED in Postgres:
//   • a daily cron CAPTURES from SerpApi (Google Search interest + eBay sold listings) → snapshots
//   • the Trends route READS the latest snapshots (no live API call on page view, full history)
// Gated behind the same key + enable flag as comps (SERPAPI_ENABLED) — fully dormant, no spend,
// until on. Momentum comes from comparing snapshots over time, so it's all in the database.

const SERPAPI_URL = "https://serpapi.com/search.json";

export function isMarketTrendsConfigured(): boolean {
 return Boolean(process.env.SERPAPI_API_KEY) && process.env.SERPAPI_ENABLED === "true";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function serp(params: Record<string, string>): Promise<any | null> {
 const apiKey = process.env.SERPAPI_API_KEY;
 if (!apiKey) return null;
 const url = new URL(SERPAPI_URL);
 url.searchParams.set("api_key", apiKey);
 for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
 try {
 const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
 if (!res.ok) return null;
 return await res.json();
 } catch { return null; }
}

function tdb() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return neon(url);
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export type BrandSearchTrend = { brand: string; momentumPct: number | null; avgInterest: number; breakout: boolean };
export type ResaleMarket = { brand: string; soldCount: number; medianPriceCents: number | null; webMedianCents: number | null; volMomentumPct: number | null; priceMomentumPct: number | null };

let _ready = false;
async function ensureTables(sql: ReturnType<typeof tdb>) {
 if (_ready) return;
 await sql`CREATE TABLE IF NOT EXISTS google_search_snapshots (id BIGSERIAL PRIMARY KEY, brand TEXT NOT NULL, momentum_pct INT, avg_interest INT, breakout BOOLEAN, captured_at TIMESTAMPTZ NOT NULL DEFAULT now())`.catch(() => {});
 await sql`CREATE INDEX IF NOT EXISTS idx_gss_brand_ts ON google_search_snapshots (lower(brand), captured_at DESC)`.catch(() => {});
 await sql`CREATE TABLE IF NOT EXISTS resale_market_snapshots (id BIGSERIAL PRIMARY KEY, brand TEXT NOT NULL, sold_count INT NOT NULL, median_price_cents INT, captured_at TIMESTAMPTZ NOT NULL DEFAULT now())`.catch(() => {});
 await sql`CREATE INDEX IF NOT EXISTS idx_resale_snap_brand_ts ON resale_market_snapshots (lower(brand), captured_at DESC)`.catch(() => {});
 // web_median_cents = median ASKING price across resale sites Google Shopping indexes (Vestiaire,
 // Grailed, RealReal, etc.) — added later, so ALTER for existing tables.
 await sql`ALTER TABLE resale_market_snapshots ADD COLUMN IF NOT EXISTS web_median_cents INT`.catch(() => {});
 _ready = true;
}

// ── CAPTURE: SerpApi → DB (called by the daily cron) ──

// One Google Trends request PER BRAND — never batched. Google normalizes every query in a request
// against the single highest-volume one, so a rising niche/archival label batched with Louis Vuitton
// reads as ~0 (pure noise). Solo queries give each brand its own 0–100 range, so momentum is real.
// momentum = last ~quarter of the 3-month series vs the prior quarter; breakout = a big recent surge.
async function fetchGoogleTrend(brand: string): Promise<BrandSearchTrend> {
 const j = await serp({ engine: "google_trends", q: brand, data_type: "TIMESERIES", date: "today 3-m", hl: "en", geo: "US" });
 const timeline: any[] = j?.interest_over_time?.timeline_data ?? [];
 const series = timeline.map((t) => Number(t.values?.[0]?.extracted_value ?? t.values?.[0]?.value ?? 0)).filter((n) => Number.isFinite(n));
 if (series.length < 4) return { brand, momentumPct: null, avgInterest: Math.round(avg(series)), breakout: false };
 const w = Math.max(2, Math.floor(series.length / 4));
 const recent = series.slice(-w), prior = series.slice(-2 * w, -w);
 const rAvg = avg(recent), pAvg = avg(prior);
 const momentumPct = pAvg > 0 ? Math.round(((rAvg - pAvg) / pAvg) * 100) : (rAvg > 0 ? 100 : null);
 return { brand, momentumPct, avgInterest: Math.round(avg(series)), breakout: momentumPct != null && momentumPct >= 80 && rAvg >= 20 };
}

function median(cents: number[]): number | null {
 const s = cents.filter((c) => !!c && c > 0).sort((a, b) => a - b);
 return s.length ? s[Math.floor(s.length / 2)] : null;
}

async function ebaySoldStats(brand: string): Promise<{ soldCount: number; medianCents: number | null }> {
 const r = await serp({ engine: "ebay", _nkw: brand, ebay_domain: "ebay.com", LH_Sold: "1", LH_Complete: "1" });
 const rows: any[] = r?.organic_results || [];
 // organic_results is only page 1 (~60), so prefer eBay's real total-sold count when present.
 const total = Number(r?.search_information?.total_results);
 const soldCount = Number.isFinite(total) && total > 0 ? total : rows.length;
 return { soldCount, medianCents: median(rows.map((row) => priceToCents(row.price) ?? 0)) };
}

// Actual resale marketplaces — a bare-brand Google Shopping query otherwise returns cosmetics,
// perfume, new-retail and accessories (e.g. "Dior" → $66 lip balm), which is not a resale signal.
const RESALE_SOURCES = ["vestiaire", "grailed", "realreal", "the real real", "poshmark", "depop", "ebay", "mercari", "rebag", "fashionphile", "thredup", "tradesy", "vinted", "1stdibs", "1st dibs"];

// Median ASKING price for the brand across actual resale sites Google Shopping indexes — a broad
// multi-site read to complement eBay's SOLD price. Filtered to resale sources so retail/beauty
// listings don't poison the median.
async function webAskingMedian(brand: string): Promise<number | null> {
 const r = await serp({ engine: "google_shopping", q: `${brand} preowned`, gl: "us" });
 const rows: any[] = r?.shopping_results || [];
 const resale = rows.filter((row) => {
 const hay = `${row.source ?? ""} ${row.link ?? ""}`.toLowerCase();
 return RESALE_SOURCES.some((s) => hay.includes(s));
 });
 return median(resale.map((row) => priceToCents(row.extracted_price ?? row.price) ?? 0));
}

// Run fn over items with bounded concurrency — SerpApi is the bottleneck, so parallelize the
// calls (sequentially, ~16 calls × 20s each could blow past the function's time limit).
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
 const out: R[] = new Array(items.length);
 let next = 0;
 const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
 while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
 });
 await Promise.all(workers);
 return out;
}

// Fetch fresh Google + eBay signal for the given brands and SAVE snapshots. Returns counts saved.
export async function captureMarketTrends(brands: string[]): Promise<{ google: number; resale: number }> {
 const list = [...new Set(brands.map((b) => b.trim()).filter(Boolean))];
 if (!isMarketTrendsConfigured() || !list.length) return { google: 0, resale: 0 };
 const sql = tdb();
 await ensureTables(sql);

 // One Google call per brand + one eBay call per brand. Fetch both sets concurrently (bounded, so
 // we don't trip SerpApi rate limits), THEN write.
 const [gResults, stats] = await Promise.all([
 mapLimit(list.slice(0, 20), 6, (brand) => fetchGoogleTrend(brand).catch(() => null)),
 mapLimit(list.slice(0, 12), 8, (brand) => Promise.all([ebaySoldStats(brand), webAskingMedian(brand).catch(() => null)]).then(([st, web]) => ({ brand, st, web })).catch(() => null)),
 ]);

 let google = 0;
 for (const b of gResults) {
 if (b && (b.avgInterest > 0 || b.momentumPct !== null)) {
 await sql`INSERT INTO google_search_snapshots (brand, momentum_pct, avg_interest, breakout) VALUES (${b.brand}, ${b.momentumPct}, ${b.avgInterest}, ${b.breakout})`.catch(() => {});
 google++;
 }
 }

 let resale = 0;
 for (const s of stats) {
 if (s && (s.st.soldCount > 0 || s.st.medianCents || s.web)) {
 await sql`INSERT INTO resale_market_snapshots (brand, sold_count, median_price_cents, web_median_cents) VALUES (${s.brand}, ${s.st.soldCount}, ${s.st.medianCents}, ${s.web})`.catch(() => {});
 resale++;
 }
 }
 return { google, resale };
}

// ── READ: DB only (called by the Trends route — no SerpApi call on page view) ──

export async function getGoogleTrends(brands: string[]): Promise<BrandSearchTrend[]> {
 const list = [...new Set(brands.map((b) => b.trim().toLowerCase()).filter(Boolean))];
 if (!list.length) return [];
 const sql = tdb();
 const rows = (await sql`
  SELECT DISTINCT ON (lower(brand)) brand, momentum_pct, avg_interest, breakout
  FROM google_search_snapshots WHERE captured_at >= now() - interval '21 days'
  ORDER BY lower(brand), captured_at DESC
 `.catch(() => [])) as { brand: string; momentum_pct: number | null; avg_interest: number | null; breakout: boolean | null }[];
 const map = new Map(rows.map((r) => [r.brand.toLowerCase(), r]));
 return brands.map((b) => {
 const r = map.get(b.trim().toLowerCase());
 return r ? { brand: b, momentumPct: r.momentum_pct, avgInterest: r.avg_interest ?? 0, breakout: !!r.breakout } : null;
 }).filter((x): x is BrandSearchTrend => !!x);
}

// On-demand Google trend for an ARBITRARY query (e.g. a store searching "Escada"), cache-through:
// read a recent snapshot if we have one (free), else fetch live from SerpApi ONCE and SAVE it — so
// the next lookup of that term is free and the DB accrues a proprietary search-trend history for
// every term stores look up. Returns null when we have nothing cached and SerpApi is off.
export async function getOrFetchGoogleTrend(query: string, maxAgeDays = 14): Promise<BrandSearchTrend | null> {
 const q = query.trim();
 if (q.length < 2) return null;
 const sql = tdb();
 await ensureTables(sql);
 const cached = (await sql`
  SELECT brand, momentum_pct, avg_interest, breakout FROM google_search_snapshots
  WHERE lower(brand) = lower(${q}) AND captured_at >= now() - (${maxAgeDays} || ' days')::interval
  ORDER BY captured_at DESC LIMIT 1
 `.catch(() => [])) as { brand: string; momentum_pct: number | null; avg_interest: number | null; breakout: boolean | null }[];
 if (cached.length) {
  const c = cached[0];
  return { brand: q, momentumPct: c.momentum_pct, avgInterest: c.avg_interest ?? 0, breakout: !!c.breakout };
 }
 if (!isMarketTrendsConfigured()) return null; // no cache + SerpApi off → nothing to show yet
 const fresh = await fetchGoogleTrend(q).catch(() => null);
 if (fresh && (fresh.avgInterest > 0 || fresh.momentumPct !== null)) {
  await sql`INSERT INTO google_search_snapshots (brand, momentum_pct, avg_interest, breakout)
   VALUES (${fresh.brand}, ${fresh.momentumPct}, ${fresh.avgInterest}, ${fresh.breakout})`.catch(() => {});
 }
 return fresh;
}

export async function getResaleMarket(brands: string[]): Promise<ResaleMarket[]> {
 const list = [...new Set(brands.map((b) => b.trim()).filter(Boolean))];
 if (!list.length) return [];
 const sql = tdb();
 const out: ResaleMarket[] = [];
 for (const brand of list) {
 const latest = (await sql`SELECT sold_count, median_price_cents, web_median_cents FROM resale_market_snapshots WHERE lower(brand) = lower(${brand}) ORDER BY captured_at DESC LIMIT 1`.catch(() => [])) as { sold_count: number; median_price_cents: number | null; web_median_cents: number | null }[];
 const l = latest[0];
 if (!l) continue;
 const prior = (await sql`SELECT sold_count, median_price_cents FROM resale_market_snapshots WHERE lower(brand) = lower(${brand}) AND captured_at <= now() - interval '6 days' ORDER BY captured_at DESC LIMIT 1`.catch(() => [])) as { sold_count: number; median_price_cents: number | null }[];
 const p = prior[0];
 const volMomentumPct = p && p.sold_count > 0 ? Math.round(((l.sold_count - p.sold_count) / p.sold_count) * 100) : null;
 const priceMomentumPct = p?.median_price_cents && l.median_price_cents ? Math.round(((l.median_price_cents - p.median_price_cents) / p.median_price_cents) * 100) : null;
 out.push({ brand, soldCount: l.sold_count, medianPriceCents: l.median_price_cents, webMedianCents: l.web_median_cents, volMomentumPct, priceMomentumPct });
 }
 return out;
}
