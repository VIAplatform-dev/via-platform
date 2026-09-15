import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

// One-shot, idempotent index creation for the hot query paths the scale audit flagged as
// missing (full seq-scans on clicks/products/events that OOM or crawl as data grows).
// Lives under /api/cron so it's Bearer-gated (CRON_SECRET) and not behind the admin-cookie
// middleware. Trigger once:
//   curl -H "authorization: Bearer $CRON_SECRET" https://vyaplatform.com/api/cron/db-indexes
// CREATE INDEX IF NOT EXISTS is safe to re-run. Each index runs independently so one failure
// (e.g. a column that doesn't exist on this DB) is reported without blocking the rest.
// Run it while the tables are still small. Plain CREATE INDEX briefly locks writes on big tables.
export const maxDuration = 300;

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return neon(url);
}

export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const sql = db();
 const results: Array<{ index: string; ok: boolean; error?: string }> = [];
 const add = async (label: string, run: () => Promise<unknown>) => {
 try {
 await run();
 results.push({ index: label, ok: true });
 } catch (e) {
 results.push({ index: label, ok: false, error: String(e).slice(0, 180) });
 }
 };

 // clicks. The hottest append table; product_id/store_slug are filtered on every browse
 // and dashboard load, and getNewArrivals GROUPs the whole table by (store_slug, product_name).
 await add("clicks_product_id", () => sql`CREATE INDEX IF NOT EXISTS idx_clicks_product_id ON clicks(product_id)`);
 await add("clicks_store_slug", () => sql`CREATE INDEX IF NOT EXISTS idx_clicks_store_slug ON clicks(store_slug)`);
 await add("clicks_store_product_name", () => sql`CREATE INDEX IF NOT EXISTS idx_clicks_store_product_name ON clicks(store_slug, product_name)`);

 // products. Brand GROUP BY (brand pages) and product_type LIKE (search) seq-scan today.
 await add("products_brand", () => sql`CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand)`);
 await add("products_product_type_lower", () => sql`CREATE INDEX IF NOT EXISTS idx_products_product_type_lower ON products(LOWER(product_type))`);

 // events. The ETL aggregate() and per-seller market-insights scan by these composites.
 await add("events_store_ts", () => sql`CREATE INDEX IF NOT EXISTS idx_events_store_ts ON events(store_slug, ts)`);
 await add("events_type_ts", () => sql`CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(event_type, ts)`);

 // capture-table product joins in the events ETL + popularity scoring.
 await add("product_views_product_id", () => sql`CREATE INDEX IF NOT EXISTS idx_product_views_product_id ON product_views(product_id)`);
 await add("product_favorites_product_id", () => sql`CREATE INDEX IF NOT EXISTS idx_product_favorites_product_id ON product_favorites(product_id)`);

 // conversions.items JSONB is unnested in ~8 aggregations with no GIN index.
 await add("conversions_items_gin", () => sql`CREATE INDEX IF NOT EXISTS idx_conversions_items_gin ON conversions USING GIN (items)`);

 // item_collections. "items in a collection" filters collection_id alone (PK is (item_id, collection_id)).
 await add("item_collections_collection", () => sql`CREATE INDEX IF NOT EXISTS idx_item_collections_collection ON item_collections(collection_id)`);

 const created = results.filter((r) => r.ok).length;
 return NextResponse.json({ ok: results.every((r) => r.ok), created, total: results.length, results });
}
