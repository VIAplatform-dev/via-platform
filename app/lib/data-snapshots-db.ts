import { neon } from "@neondatabase/serverless";
import { getBrandHeatIndex, getCategoryHeat, getStoreHeat } from "./brand-heat-db";
import { getMarketplaceDemand } from "./demand-db";
import {
 getConversionFunnel,
 getPriceVelocity,
 getSearchTrends,
 getSizingDemand,
} from "./data-products-db";

// ---------------------------------------------------------------------------
// Data Layer snapshots. The scalable backbone of VYA's B2B data products.
//
// Every load of /admin/data re-runs a dozen heavy aggregate queries (heat
// indices across views/favorites/searches/sales, demand, GMV). That doesn't
// scale as the catalog + order volume grow, and it throws away history: the
// numbers only ever describe "right now."
//
// This module computes the whole data layer ONCE per day in a cron and stores
// it as a single dated JSONB row. The dashboard then reads the latest row
// instantly, and, crucially: every day we keep one more snapshot, so the
// data layer accumulates a real TIME SERIES. That history is what powers
// trend lines, week-over-week momentum, and the syndicated resale report.
// ---------------------------------------------------------------------------

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

// The full payload we freeze each day. Kept as a loose record so adding a new
// data product later doesn't require a migration, just write more into it.
export type DataSnapshotPayload = {
 brandHeat: Awaited<ReturnType<typeof getBrandHeatIndex>>;
 categoryHeat: Awaited<ReturnType<typeof getCategoryHeat>>;
 storeHeat: Awaited<ReturnType<typeof getStoreHeat>>;
 demand: Awaited<ReturnType<typeof getMarketplaceDemand>>;
 funnel: Awaited<ReturnType<typeof getConversionFunnel>>;
 priceVelocity: Awaited<ReturnType<typeof getPriceVelocity>>;
 searchTrends: Awaited<ReturnType<typeof getSearchTrends>>;
 sizing: Awaited<ReturnType<typeof getSizingDemand>>;
};

export type DataSnapshot = {
 date: string; // YYYY-MM-DD
 generatedAt: string;
 periodDays: number;
 payload: DataSnapshotPayload;
};

async function ensureTable(sql: ReturnType<typeof db>) {
 await sql`
 CREATE TABLE IF NOT EXISTS data_layer_snapshots (
  snapshot_date DATE PRIMARY KEY,
  period_days INT NOT NULL DEFAULT 30,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
 )
 `;
}

// Compute the entire data layer and upsert today's row. Idempotent: running it
// twice in a day just refreshes that day's snapshot.
export async function computeAndStoreSnapshot(periodDays = 30): Promise<DataSnapshot> {
 const sql = db();
 await ensureTable(sql);

 const [brandHeat, categoryHeat, storeHeat, demand, funnel, priceVelocity, searchTrends, sizing] = await Promise.all([
 getBrandHeatIndex(periodDays, 50),
 getCategoryHeat(periodDays, 20),
 getStoreHeat(periodDays, 25),
 getMarketplaceDemand({ windowDays: periodDays }),
 getConversionFunnel(periodDays),
 getPriceVelocity(periodDays),
 getSearchTrends(periodDays),
 getSizingDemand(periodDays),
 ]);

 const payload: DataSnapshotPayload = { brandHeat, categoryHeat, storeHeat, demand, funnel, priceVelocity, searchTrends, sizing };
 const generatedAt = new Date().toISOString();

 const rows = (await sql`
 INSERT INTO data_layer_snapshots (snapshot_date, period_days, generated_at, payload)
 VALUES (CURRENT_DATE, ${periodDays}, ${generatedAt}, ${JSON.stringify(payload)}::jsonb)
 ON CONFLICT (snapshot_date) DO UPDATE
  SET period_days = EXCLUDED.period_days,
   generated_at = EXCLUDED.generated_at,
   payload = EXCLUDED.payload
 RETURNING to_char(snapshot_date, 'YYYY-MM-DD') AS date, period_days, generated_at
 `) as Array<{ date: string; period_days: number; generated_at: string }>;

 return { date: rows[0].date, generatedAt, periodDays, payload };
}

// Read the most recent stored snapshot (fast: single indexed row). Returns
// null if no snapshot has been generated yet.
export async function getLatestSnapshot(): Promise<DataSnapshot | null> {
 const sql = db();
 try {
 const rows = (await sql`
  SELECT to_char(snapshot_date, 'YYYY-MM-DD') AS date, period_days,
   to_char(generated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS generated_at, payload
  FROM data_layer_snapshots
  ORDER BY snapshot_date DESC
  LIMIT 1
 `) as Array<{ date: string; period_days: number; generated_at: string; payload: DataSnapshotPayload }>;
 if (!rows.length) return null;
 return {
  date: rows[0].date,
  generatedAt: rows[0].generated_at,
  periodDays: rows[0].period_days,
  payload: rows[0].payload,
 };
 } catch {
 return null;
 }
}

// A lightweight time series for trend lines: one point per stored day, each
// carrying just the headline metrics rather than the full payload.
export type SnapshotTrendPoint = {
 date: string;
 gmv: number;
 orders: number;
 topBrand: string | null;
 topBrandHeat: number | null;
 brandCount: number;
};

export async function getSnapshotTrend(days = 30): Promise<SnapshotTrendPoint[]> {
 const sql = db();
 try {
 const rows = (await sql`
  SELECT to_char(snapshot_date, 'YYYY-MM-DD') AS date, payload
  FROM data_layer_snapshots
  WHERE snapshot_date >= CURRENT_DATE - (${days} || ' days')::interval
  ORDER BY snapshot_date ASC
 `) as Array<{ date: string; payload: DataSnapshotPayload }>;
 return rows.map((r) => {
  const top = r.payload?.brandHeat?.brands?.[0] ?? null;
  return {
  date: r.date,
  gmv: r.payload?.demand?.summary?.gmv ?? 0,
  orders: r.payload?.demand?.summary?.orders ?? 0,
  topBrand: top?.brand ?? null,
  topBrandHeat: top?.heat ?? null,
  brandCount: r.payload?.brandHeat?.brands?.length ?? 0,
  };
 });
 } catch {
 return [];
 }
}
