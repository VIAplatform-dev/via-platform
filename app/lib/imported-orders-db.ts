import { neon } from "@neondatabase/serverless";

// ─────────────────────────────────────────────────────────────────────────────
// Historical order import — a store's PAST orders from Shopify/Square/etc., brought
// over for accounting, LTV, and repeat-customer signal. Kept in its OWN table, apart
// from the live transactional `orders` (which requires a live `item_id` and drives
// checkout/payouts). A historical order references a product that already sold and no
// longer exists as a VYA item, so it's stored as free text — never touching the money
// engine. Self-healing table (CREATE IF NOT EXISTS), so no migration step is needed.
// ─────────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

let ensured = false;
async function ensure(): Promise<void> {
 if (ensured) return;
 const sql = db();
 await sql`
 CREATE TABLE IF NOT EXISTS imported_orders (
  id BIGSERIAL PRIMARY KEY,
  store_slug TEXT NOT NULL,
  external_id TEXT,
  order_date TIMESTAMPTZ,
  buyer_name TEXT,
  buyer_email TEXT,
  item_title TEXT,
  quantity INT,
  amount_cents INT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_slug, external_id)
 )
 `;
 await sql`CREATE INDEX IF NOT EXISTS idx_imported_orders_store ON imported_orders(store_slug, order_date DESC NULLS LAST)`;
 ensured = true;
}

export type ImportedOrderInput = {
 externalId: string | null;
 orderDate: string | null; // ISO or parseable date string
 buyerName: string | null;
 buyerEmail: string | null;
 itemTitle: string | null;
 quantity: number | null;
 amountCents: number;
 currency: string;
 status: string | null;
};

export type ImportedOrderRow = {
 id: number;
 externalId: string | null;
 orderDate: string | null;
 buyerName: string | null;
 buyerEmail: string | null;
 itemTitle: string | null;
 quantity: number | null;
 amountCents: number;
 currency: string;
 status: string | null;
};

/** Insert historical orders. Idempotent by (store_slug, external_id) when an id is present. */
export async function importOrders(storeSlug: string, rows: ImportedOrderInput[], source: string): Promise<{ added: number; total: number }> {
 await ensure();
 const sql = db();
 let added = 0;
 for (const r of rows) {
 // A parseable date is nice-to-have; store null if it doesn't parse.
 let iso: string | null = null;
 if (r.orderDate) { const d = new Date(r.orderDate); if (!isNaN(d.getTime())) iso = d.toISOString(); }
 try {
 // With an external_id, ON CONFLICT dedupes re-imports. Without one, every row inserts
 // (we can't safely dedup a source that gave us no order number).
 const res = r.externalId
 ? ((await sql`
   INSERT INTO imported_orders (store_slug, external_id, order_date, buyer_name, buyer_email, item_title, quantity, amount_cents, currency, status, source)
   VALUES (${storeSlug}, ${r.externalId}, ${iso}, ${r.buyerName}, ${r.buyerEmail}, ${r.itemTitle}, ${r.quantity}, ${r.amountCents}, ${r.currency}, ${r.status}, ${source})
   ON CONFLICT (store_slug, external_id) DO NOTHING RETURNING id
  `) as { id: number }[])
 : ((await sql`
   INSERT INTO imported_orders (store_slug, external_id, order_date, buyer_name, buyer_email, item_title, quantity, amount_cents, currency, status, source)
   VALUES (${storeSlug}, NULL, ${iso}, ${r.buyerName}, ${r.buyerEmail}, ${r.itemTitle}, ${r.quantity}, ${r.amountCents}, ${r.currency}, ${r.status}, ${source})
   RETURNING id
  `) as { id: number }[]);
 added += res.length;
 } catch { /* skip a bad row */ }
 }
 return { added, total: rows.length };
}

const normTitle = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Normalized set of item titles in a store's imported order history. Lets the catalog
 *  import skip scraped sold-out products the order list already covers (no double-count). */
export async function getImportedOrderTitleSet(storeSlug: string): Promise<Set<string>> {
 await ensure();
 const sql = db();
 const rows = (await sql`
  SELECT DISTINCT item_title FROM imported_orders
  WHERE store_slug = ${storeSlug} AND item_title IS NOT NULL AND item_title <> ''
 `) as { item_title: string }[];
 return new Set(rows.map((r) => normTitle(r.item_title)));
}

/** Reconcile scraped sold-out items against the uploaded order history: a store that keeps
 *  sold pieces on its page (then removes them ~30 days later) imports them as phantom `sold`
 *  items — but the SAME sale also arrives, authoritatively (real date/buyer/amount), in the
 *  order-list upload. Keeping both double-counts the sale, so we drop the redundant scraped
 *  copies (matched by store + normalized title). The order rows are the source of truth.
 *  Returns how many sold items were reconciled away. Idempotent. */
export async function reconcileSoldItemsWithOrders(storeSlug: string): Promise<number> {
 const set = await getImportedOrderTitleSet(storeSlug);
 if (!set.size) return 0;
 const sql = db();
 const sold = (await sql`
  SELECT i.id::text AS id, i.title AS title FROM items i JOIN sellers s ON s.id = i.seller_id
  WHERE s.slug = ${storeSlug} AND i.status = 'sold' AND i.source IN ('captured', 'imported')
 `) as { id: string; title: string }[];
 const dupIds = sold.filter((r) => set.has(normTitle(r.title))).map((r) => r.id);
 if (!dupIds.length) return 0;
 await sql`DELETE FROM items WHERE id::text = ANY(${dupIds})`;
 return dupIds.length;
}

/** List a store's imported historical orders (most recent first). */
export async function getImportedOrders(storeSlug: string, limit = 500): Promise<ImportedOrderRow[]> {
 await ensure();
 const sql = db();
 const rows = (await sql`
  SELECT id, external_id, order_date, buyer_name, buyer_email, item_title, quantity, amount_cents, currency, status
  FROM imported_orders WHERE store_slug = ${storeSlug}
  ORDER BY order_date DESC NULLS LAST, id DESC LIMIT ${limit}
 `) as Record<string, unknown>[];
 return rows.map((r) => ({
 id: Number(r.id),
 externalId: (r.external_id as string) ?? null,
 orderDate: r.order_date ? new Date(r.order_date as string).toISOString() : null,
 buyerName: (r.buyer_name as string) ?? null,
 buyerEmail: (r.buyer_email as string) ?? null,
 itemTitle: (r.item_title as string) ?? null,
 quantity: r.quantity != null ? Number(r.quantity) : null,
 amountCents: Number(r.amount_cents) || 0,
 currency: (r.currency as string) || "USD",
 status: (r.status as string) ?? null,
 }));
}
