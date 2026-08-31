import { neon } from "@neondatabase/serverless";

// The clean, go-forward analytics stream (World A). One row per behavioral event, keyed on the
// CANONICAL product id (items.id) stamped at capture time — never re-derived from a name or a
// composite string. One vocabulary of event types, one table, so every seller funnel is a single
// clean query. Written ALONGSIDE the legacy capture tables (additive, non-breaking): new data is
// clean from launch, existing analytics keep working. See the "VYA Event Model" spec.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensure() {
 if (ensured) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS analytics_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL,
  item_id TEXT,
  store_slug TEXT NOT NULL,
  actor_id TEXT,
  surface TEXT NOT NULL DEFAULT 'storefront',
  session_id TEXT,
  price_cents INTEGER,
  source TEXT,
  referrer TEXT,
  meta JSONB
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_ae_store_ts ON analytics_events (store_slug, ts DESC)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_ae_item ON analytics_events (item_id)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_ae_store_type ON analytics_events (store_slug, event_type)`;
 ensured = true;
}

export type EventType = "view" | "favorite" | "click" | "checkout_start" | "purchase";
export type Surface = "marketplace" | "storefront" | "market"; // market = in-person (Market Mode) sale

/**
 * The single writer for the clean event stream. Fire-safe: any DB hiccup is swallowed so analytics
 * can never break the page or a webhook. Callers pass the canonical items.id as `itemId`.
 */
export async function recordEvent(e: {
 type: EventType;
 storeSlug: string;
 itemId?: string | null;
 actorId?: string | null;
 surface?: Surface;
 sessionId?: string | null;
 priceCents?: number | null;
 source?: string | null;
 referrer?: string | null;
 meta?: Record<string, unknown> | null;
}): Promise<void> {
 if (!e.storeSlug) return;
 try {
  await ensure();
  await db()`INSERT INTO analytics_events (event_type, item_id, store_slug, actor_id, surface, session_id, price_cents, source, referrer, meta)
   VALUES (${e.type}, ${e.itemId ?? null}, ${e.storeSlug}, ${e.actorId ?? null}, ${e.surface ?? "storefront"}, ${e.sessionId ?? null}, ${e.priceCents ?? null}, ${e.source ?? null}, ${e.referrer ? String(e.referrer).slice(0, 300) : null}, ${e.meta ? JSON.stringify(e.meta) : null})`;
 } catch { /* analytics must never break the caller */ }
}

/** The funnel, over a window: how many views → favorites → checkout-starts → purchases. This is the
 *  whole payoff of the clean model — one query, one key, no fuzzy joins. */
export async function getStoreFunnel(storeSlug: string, sinceISO: string): Promise<Record<EventType, number>> {
 const out: Record<EventType, number> = { view: 0, favorite: 0, click: 0, checkout_start: 0, purchase: 0 };
 try {
  await ensure();
  const rows = await db()`SELECT event_type, COUNT(*)::int AS n FROM analytics_events
   WHERE store_slug = ${storeSlug} AND ts >= ${sinceISO} GROUP BY event_type` as Array<{ event_type: string; n: number }>;
  for (const r of rows) if (r.event_type in out) out[r.event_type as EventType] = Number(r.n);
 } catch { /* return zeros */ }
 return out;
}

/** Per-item funnel — top pieces by views, with favorites, checkout-starts + purchases. Joins on item_id.
 * `checkouts` = times a shopper began checkout; abandonments = checkouts a buyer never completed. */
export async function getItemFunnel(storeSlug: string, sinceISO: string, limit = 20): Promise<Array<{ itemId: string; views: number; favorites: number; checkouts: number; purchases: number }>> {
 try {
  await ensure();
  const rows = await db()`
   SELECT item_id,
    COUNT(*) FILTER (WHERE event_type = 'view')::int AS views,
    COUNT(*) FILTER (WHERE event_type = 'favorite')::int AS favorites,
    COUNT(*) FILTER (WHERE event_type = 'checkout_start')::int AS checkouts,
    COUNT(*) FILTER (WHERE event_type = 'purchase')::int AS purchases
   FROM analytics_events
   WHERE store_slug = ${storeSlug} AND item_id IS NOT NULL AND ts >= ${sinceISO}
   GROUP BY item_id ORDER BY views DESC, checkouts DESC LIMIT ${limit}` as Array<Record<string, unknown>>;
  return rows.map((r) => ({ itemId: String(r.item_id), views: Number(r.views), favorites: Number(r.favorites), checkouts: Number(r.checkouts), purchases: Number(r.purchases) }));
 } catch {
  return [];
 }
}
