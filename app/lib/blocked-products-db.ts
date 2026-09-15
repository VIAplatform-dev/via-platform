import { neon } from "@neondatabase/serverless";

// Admin-managed "permanently removed" products. Deleting a product from the products
// table isn't enough: the next sync re-imports it. A row here is a tombstone:
// syncProducts() deletes matching titles and never re-inserts them (see app/lib/db.ts).
// Keyed by (store_slug, title) to match the products table's UNIQUE(store_slug, title).

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

export type BlockedProduct = {
 storeSlug: string;
 title: string;
 reason: string | null;
 blockedAt: string;
};

export async function ensureBlockedProductsTable(): Promise<void> {
 const sql = db();
 await sql`
 CREATE TABLE IF NOT EXISTS blocked_products (
 store_slug TEXT NOT NULL,
 title TEXT NOT NULL,
 reason TEXT,
 blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY (store_slug, title)
 )
 `;
}

export async function listBlockedProducts(): Promise<BlockedProduct[]> {
 await ensureBlockedProductsTable();
 const sql = db();
 const rows = await sql`SELECT store_slug, title, reason, blocked_at FROM blocked_products ORDER BY blocked_at DESC`;
 return rows.map((r) => ({
 storeSlug: r.store_slug as string,
 title: r.title as string,
 reason: (r.reason as string | null) ?? null,
 blockedAt: (r.blocked_at as Date)?.toISOString?.() ?? String(r.blocked_at),
 }));
}

/** Permanently remove a product: delete it now AND block any future re-import. */
export async function blockProduct(storeSlug: string, title: string, reason: string | null): Promise<{ deleted: number }> {
 await ensureBlockedProductsTable();
 const sql = db();
 await sql`
 INSERT INTO blocked_products (store_slug, title, reason)
 VALUES (${storeSlug}, ${title}, ${reason})
 ON CONFLICT (store_slug, title) DO UPDATE SET reason = EXCLUDED.reason
 `;
 const del = await sql`DELETE FROM products WHERE store_slug = ${storeSlug} AND lower(title) = lower(${title}) RETURNING id`;
 return { deleted: del.length };
}

/** Restore: stop blocking. The item reappears on the next sync if the store still lists it. */
export async function unblockProduct(storeSlug: string, title: string): Promise<void> {
 await ensureBlockedProductsTable();
 const sql = db();
 await sql`DELETE FROM blocked_products WHERE store_slug = ${storeSlug} AND lower(title) = lower(${title})`;
}
