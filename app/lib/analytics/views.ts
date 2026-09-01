import { db } from "./core";
import { ensureStoreEngagementTables } from "../store-favorites-db";
import { ensureAnalyticsEventsTable } from "../analytics-events-db";

// ───────────────────────────────────────────────────────────────────────────
// Analytics — the canonical read model.
//
// The platform captures the same facts in more than one place for historical
// reasons, and a metric that reads only one of them is simply wrong:
//
//   • SALES. Most of the sold history on VYA lives on `items.status = 'sold'`
//     (bulk imports, and a seller marking a piece sold in the admin). Only a
//     small slice has a matching `orders` row. An orders-only GMV reads ~zero
//     for nearly every store. `vya_store_sales` unions the two, preferring the
//     order (it carries the real amount and the buyer) and falling back to the
//     item at its list price when no order exists.
//
//   • ENGAGEMENT. Product views land in `store_product_views` (written by both
//     the captured-site route and the storefront beacon) AND in the newer
//     `analytics_events` stream, so a naive union double-counts storefront
//     views. This view takes storefront views from the capture table and takes
//     only what is unique to the event stream — marketplace views, favourites,
//     clicks, checkout starts — from `analytics_events`.
//
//     Favourites come from `analytics_events` alone, deliberately. There are two
//     different `store_favorites` table definitions in the codebase —
//     favorites-db.ts owns the live one (a user FOLLOWING a store: user_id +
//     store_slug) and store-favorites-db.ts tries to create a different table of
//     the same name (a shopper SAVING an item: item_id + shopper_id). The second
//     CREATE TABLE IF NOT EXISTS is therefore a permanent no-op and its writes
//     fail silently, so that table holds nothing to read. Renaming it is a
//     migration, not an analytics change — until then the event stream is the
//     only honest source of item favourites.
//
// Both are plain views, so they cost nothing to keep current and every metric
// module reads one definition instead of re-deriving these joins six times.
// ───────────────────────────────────────────────────────────────────────────

export const SALES_VIEW = "vya_store_sales";
export const ENGAGEMENT_VIEW = "vya_store_engagement";

// Single-flight: the suite fans six sections out in parallel and every one of
// them calls this. Without sharing the in-flight promise, six concurrent
// CREATE OR REPLACE VIEW statements race in Postgres and most of them lose with
// a duplicate-key error on pg_type.
let ensuring: Promise<void> | null = null;

/**
 * Create (or refresh) the two views. Runs at most once per lambda instance,
 * matching the lazy-DDL pattern the capture tables already use.
 */
export function ensureAnalyticsViews(): Promise<void> {
 ensuring ??= createViews().catch((err) => {
  // Let the next request retry rather than caching a failure forever.
  ensuring = null;
  throw err;
 });
 return ensuring;
}

async function createViews(): Promise<void> {
 const sql = db();

 // The views depend on tables that are themselves created lazily by their writers.
 await Promise.all([
  ensureStoreEngagementTables().catch(() => {}),
  ensureAnalyticsEventsTable().catch(() => {}),
 ]);

 // The view below reads orders.tax_cents, but that column is added lazily the first time a tax is
 // recorded (db/orders.ts). On a database where no taxed order has landed yet the column wouldn't
 // exist and the view would fail to create, taking every analytics section down with it.
 await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_cents integer`.catch(() => {});

 await sql`
  CREATE OR REPLACE VIEW vya_store_sales AS
  SELECT
   'order:' || o.id::text AS sale_id,
   o.seller_id,
   o.item_id,
   o.amount_cents,
   o.paid_at AS sold_at,
   lower(NULLIF(o.buyer_email, '')) AS buyer_email,
   'order'::text AS origin,
   -- Tax collected on this sale, so a tax-inclusive store's P&L doesn't count the government's
   -- share as its own revenue. NULL means UNKNOWN, not zero: an item-status sale never went
   -- through checkout, so nobody recorded tax on it, and the margin module has to say so rather
   -- than quietly present a gross figure as profit. See tax-inclusive.ts.
   o.tax_cents
  FROM orders o
  WHERE o.status IN ('paid', 'shipped', 'delivered', 'fulfilled') AND o.paid_at IS NOT NULL
  UNION ALL
  SELECT
   'item:' || i.id::text,
   i.seller_id,
   i.id,
   i.price_cents,
   i.sold_at,
   NULL::text,
   'item'::text,
   NULL::integer
  FROM items i
  WHERE i.status = 'sold'
   AND NOT EXISTS (
    SELECT 1 FROM orders o2
    WHERE o2.item_id = i.id AND o2.status IN ('paid', 'shipped', 'delivered', 'fulfilled')
   )
 `;

 await sql`
  CREATE OR REPLACE VIEW vya_store_engagement AS
  SELECT store_slug, item_id, 'view'::text AS event_type, created_at AS ts,
   shopper_id AS actor_id, 'storefront'::text AS surface, NULL::text AS session_id
  FROM store_product_views
  UNION ALL
  SELECT store_slug, item_id, event_type, ts, actor_id, surface, session_id
  FROM analytics_events
  WHERE event_type <> 'view' OR surface = 'marketplace'
 `;
}
