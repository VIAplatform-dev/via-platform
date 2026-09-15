import { neon } from "@neondatabase/serverless";

// ───────────────────────────────────────────────────────────────────────────
// Free-layer store features. Built from a store's OWN data only (activity on
// its own items). No cross-store market intelligence. (Listing quality lives in
// listing-quality-db.ts and is shared with the admin tool.)
// ───────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

// ── Activity feed ──
// Recent things happening to the store's own items. Favorites, cart-adds, and
// sales. Anonymized: the piece and the moment, never the shopper.
export type ActivityItem = { type: "favorite" | "cart" | "sale"; title: string; at: string };

export async function getStoreActivity(storeSlug: string, limit = 20): Promise<ActivityItem[]> {
 const sql = db();
 const [favs, carts, sales] = await Promise.all([
 sql`SELECT pf.created_at AS at, p.title FROM product_favorites pf JOIN products p ON p.id = pf.product_id WHERE p.store_slug = ${storeSlug} ORDER BY pf.created_at DESC LIMIT 15`.catch(() => []),
 sql`SELECT added_at AS at, product_title AS title FROM user_cart_items WHERE REGEXP_REPLACE(store_slug, '[^a-z0-9-]', '', 'g') = ${storeSlug} ORDER BY added_at DESC LIMIT 15`.catch(() => []),
 sql`SELECT timestamp AS at, items FROM conversions WHERE REGEXP_REPLACE(store_slug, '[^a-z0-9-]', '', 'g') = ${storeSlug} AND order_total > 0 ORDER BY timestamp DESC LIMIT 10`.catch(() => []),
 ]) as [Array<{ at: unknown; title: string }>, Array<{ at: unknown; title: string | null }>, Array<{ at: unknown; items: unknown }>];

 const events: ActivityItem[] = [];
 for (const f of favs) events.push({ type: "favorite", title: f.title, at: iso(f.at) });
 for (const c of carts) events.push({ type: "cart", title: c.title ?? "An item", at: iso(c.at) });
 for (const s of sales) {
 const items = Array.isArray(s.items) ? (s.items as Array<{ productName?: string }>) : [];
 for (const it of items) events.push({ type: "sale", title: it.productName ?? "An item", at: iso(s.at) });
 }
 events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
 return events.slice(0, limit);
}
