import { neon } from "@neondatabase/serverless";
import { stores } from "./stores";
import { uniqueSubsetForTotal } from "./subset-match";

// ───────────────────────────────────────────────────────────────────────────
// Shopify order line-item cache.
//
// Collabs is the SOLE source of truth for which orders count and what we get
// paid (commission/revenue). But the Collabs feed often returns no itemized
// line items, so a conversion ends up labeled with just the product the buyer
// clicked, which may not be what they actually bought.
//
// The Shopify order webhook receives every paid order with its REAL line items.
// We cache those here (keyed by store + Shopify order name). The Collabs sync
// then reads this cache to replace the guessed product with the true cart,
// WITHOUT the webhook ever recording a conversion or touching a dollar figure.
// ───────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

export type CachedLineItem = { productName: string; quantity: number; price: number };

export type CachedOrder = {
 storeSlug: string;
 orderName: string; // Shopify order name, e.g. "#1234"
 orderId: string; // numeric Shopify order id
 email: string | null;
 totalUsd: number;
 currency: string;
 items: CachedLineItem[];
 viaClickId: string | null;
 orderedAt: string; // ISO
};

let _initialized = false;

export async function initOrderCache(): Promise<void> {
 if (_initialized) return;
 const sql = db();
 await sql`
 CREATE TABLE IF NOT EXISTS shopify_order_cache (
 id SERIAL PRIMARY KEY,
 store_slug TEXT NOT NULL,
 order_name TEXT NOT NULL,
 order_id TEXT,
 email TEXT,
 total_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
 currency TEXT NOT NULL DEFAULT 'USD',
 items JSONB NOT NULL DEFAULT '[]',
 via_click_id TEXT,
 ordered_at TIMESTAMPTZ,
 received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )
 `;
 await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_order_cache_store_name ON shopify_order_cache(store_slug, order_name)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_order_cache_store_total ON shopify_order_cache(store_slug, total_usd)`;
 _initialized = true;
}

/** UPSERT a paid order's line items. Idempotent on (store_slug, order_name). */
export async function cacheShopifyOrder(o: CachedOrder): Promise<void> {
 const sql = db();
 await initOrderCache();
 await sql`
 INSERT INTO shopify_order_cache (
 store_slug, order_name, order_id, email, total_usd, currency, items, via_click_id, ordered_at
 ) VALUES (
 ${o.storeSlug}, ${o.orderName}, ${o.orderId}, ${o.email},
 ${o.totalUsd}, ${o.currency}, ${JSON.stringify(o.items)}, ${o.viaClickId}, ${o.orderedAt}
 )
 ON CONFLICT (store_slug, order_name) DO UPDATE SET
 order_id = EXCLUDED.order_id,
 email = COALESCE(EXCLUDED.email, shopify_order_cache.email),
 total_usd = EXCLUDED.total_usd,
 currency = EXCLUDED.currency,
 items = EXCLUDED.items,
 via_click_id = COALESCE(EXCLUDED.via_click_id, shopify_order_cache.via_click_id),
 ordered_at = COALESCE(EXCLUDED.ordered_at, shopify_order_cache.ordered_at)
 `;
}

export type CacheMatch = { orderName: string; totalUsd: number; items: CachedLineItem[]; email: string | null };

/**
 * Find a cached order's real line items for a Collabs conversion.
 * Primary join: exact Shopify order name. Fallback: same store + total within
 * $0.50 + ordered within ±`windowDays` of the commission timestamp (closest in
 * time wins). Returns null when nothing confidently matches. Caller then keeps
 * whatever items it already had. Never invents data.
 */
export async function findCachedOrder(args: {
 storeSlug: string;
 orderName?: string | null;
 totalUsd?: number | null;
 aroundIso?: string | null;
 windowDays?: number;
}): Promise<CacheMatch | null> {
 const sql = db();
 await initOrderCache();
 const { storeSlug, orderName, totalUsd, aroundIso, windowDays = 7 } = args;

 if (orderName) {
 const rows = (await sql`
 SELECT order_name, total_usd, items, email FROM shopify_order_cache
 WHERE store_slug = ${storeSlug} AND order_name = ${orderName}
 LIMIT 1
 `) as Array<{ order_name: string; total_usd: string; items: CachedLineItem[]; email: string | null }>;
 // Exact order-name match is confident. Return it even if items are empty so the
 // buyer email is still recovered (caller guards line-item use on items.length).
 if (rows.length > 0) {
 return { orderName: rows[0].order_name, totalUsd: Number(rows[0].total_usd), items: Array.isArray(rows[0].items) ? rows[0].items : [], email: rows[0].email ?? null };
 }
 }

 if (totalUsd != null && totalUsd > 0) {
 const around = aroundIso ?? new Date().toISOString();
 const rows = (await sql`
 SELECT order_name, total_usd, items, email,
 ABS(EXTRACT(EPOCH FROM (COALESCE(ordered_at, received_at) - ${around}::timestamptz))) AS dist
 FROM shopify_order_cache
 WHERE store_slug = ${storeSlug}
 AND ABS(total_usd - ${totalUsd}) <= 0.5
 AND COALESCE(ordered_at, received_at) BETWEEN ${around}::timestamptz - (${windowDays} || ' days')::interval
 AND ${around}::timestamptz + (${windowDays} || ' days')::interval
 ORDER BY dist ASC
 LIMIT 1
 `) as Array<{ order_name: string; total_usd: string; items: CachedLineItem[]; email: string | null }>;
 if (rows.length > 0) {
 return { orderName: rows[0].order_name, totalUsd: Number(rows[0].total_usd), items: Array.isArray(rows[0].items) ? rows[0].items : [], email: rows[0].email ?? null };
 }
 }

 return null;
}

// ── Sold-out-diff: a SECOND way to recover an order's items without the webhook.
// When an order's items are unknown, the items the buyer took have since sold out
// at the store. We diff our last-synced feed against the store's LIVE products.json
// to find what's no longer purchasable, then look for ONE combination of those
// whose prices sum to the order total. Only used when the match is unambiguous,
// never guesses. (Shopify stores only; silently skipped otherwise.)

type SoldOutItem = { title: string; price: number };

async function fetchSoldOutItems(storeSlug: string): Promise<SoldOutItem[]> {
 const store = stores.find((s) => s.slug === storeSlug);
 if (!store?.website) return [];
 const sql = db();
 const ours = (await sql`SELECT title, price FROM products WHERE store_slug = ${storeSlug}`) as Array<{ title: string; price: string }>;
 if (ours.length === 0) return [];

 type LiveProduct = { title: string; variants?: Array<{ available?: boolean }> };
 let live: LiveProduct[] = [];
 try {
 for (let page = 1; page <= 4; page++) {
 const url = new URL(`/products.json?limit=250&page=${page}`, store.website).toString();
 const res = await fetch(url, { headers: { "user-agent": "VYA-reconcile" } });
 if (!res.ok) break;
 const json = (await res.json()) as { products?: LiveProduct[] };
 const batch = json.products ?? [];
 if (batch.length === 0) break;
 live = live.concat(batch);
 if (batch.length < 250) break;
 }
 } catch {
 return [];
 }
 if (live.length === 0) return [];

 const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
 const liveByTitle = new Map(live.map((p) => [norm(p.title), p]));
 const isAvailable = (p: LiveProduct) => (p.variants ?? []).some((v) => v.available);

 const sold: SoldOutItem[] = [];
 for (const o of ours) {
 const lp = liveByTitle.get(norm(o.title));
 if (!lp || !isAvailable(lp)) sold.push({ title: o.title, price: Number(o.price) });
 }
 return sold;
}

/**
 * Backfill: re-enrich EXISTING Collabs conversions with real line items. Tries the
 * webhook cache first, then the sold-out-diff fallback. Collabs stays the recorder,
 * we only replace the `items` JSON (never totals or commission). Conservative:
 * sold-out-diff only writes when exactly one item combination matches the total.
 */
export async function reconcileConversionsFromCache(limit = 500): Promise<{ scanned: number; enrichedFromCache: number; enrichedFromSoldOut: number }> {
 const sql = db();
 await initOrderCache();
 const rows = (await sql`
 SELECT id, order_id, store_slug, order_total, timestamp,
 matched_click_data->>'shopifyOrderName' AS order_name
 FROM conversions
 WHERE matched_click_data->>'source' = 'shopify-collabs'
 AND COALESCE(matched_click_data->>'itemsSource', '') NOT IN ('webhook-cache', 'sold-out-diff')
 AND order_total > 0
 ORDER BY timestamp DESC
 LIMIT ${limit}
 `) as Array<{ id: number; order_id: string; store_slug: string; order_total: string; timestamp: string; order_name: string | null }>;

 let enrichedFromCache = 0;
 let enrichedFromSoldOut = 0;
 const soldOutByStore = new Map<string, SoldOutItem[]>();

 for (const r of rows) {
 const totalUsd = Number(r.order_total);

 // 1. Webhook cache (most reliable).
 const match = await findCachedOrder({
 storeSlug: r.store_slug,
 orderName: r.order_name,
 totalUsd,
 aroundIso: new Date(r.timestamp).toISOString(),
 }).catch(() => null);
 if (match && match.items.length > 0) {
 await sql`
 UPDATE conversions
 SET items = ${JSON.stringify(match.items)},
 matched_click_data = COALESCE(matched_click_data, '{}'::jsonb) || ${JSON.stringify({ itemsSource: "webhook-cache" })}::jsonb
 WHERE id = ${r.id}
 `;
 enrichedFromCache++;
 continue;
 }

 // 2. Sold-out-diff fallback (unambiguous matches only).
 if (!soldOutByStore.has(r.store_slug)) {
 soldOutByStore.set(r.store_slug, await fetchSoldOutItems(r.store_slug).catch(() => []));
 }
 const soldOut = soldOutByStore.get(r.store_slug) ?? [];
 const subset = soldOut.length > 0 ? uniqueSubsetForTotal(soldOut, totalUsd) : null;
 if (subset) {
 await sql`
 UPDATE conversions
 SET items = ${JSON.stringify(subset)},
 matched_click_data = COALESCE(matched_click_data, '{}'::jsonb) || ${JSON.stringify({ itemsSource: "sold-out-diff" })}::jsonb
 WHERE id = ${r.id}
 `;
 enrichedFromSoldOut++;
 }
 }
 return { scanned: rows.length, enrichedFromCache, enrichedFromSoldOut };
}
