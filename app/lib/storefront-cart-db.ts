import { neon } from "@neondatabase/serverless";

// Anonymous buyer cart for hosted storefronts. Keyed by a cart token (cookie) so
// the seller's customers never need a VYA login. Items are one-of-one (qty always
// 1), so a cart is just a set of item ids per token. Item details + availability
// are read live from the inventory engine at view/checkout time.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS storefront_cart_items (
 cart_token TEXT NOT NULL,
 item_id UUID NOT NULL,
 added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY (cart_token, item_id)
 )`;
 // Which store the bag belongs to. Carried on the row rather than looked up through the items each
 // time, so "whose bag is this" is one cheap read on the add path — and stays answerable for a
 // piece that has since been removed from inventory. Self-healing: added and backfilled in place,
 // no migration step (the backfill is a no-op once every row has it).
 await sql`ALTER TABLE storefront_cart_items ADD COLUMN IF NOT EXISTS seller_id UUID`;
 await sql`UPDATE storefront_cart_items c SET seller_id = i.seller_id FROM items i
 WHERE i.id = c.item_id AND c.seller_id IS NULL`;
 ensured = true;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Put a piece in the bag — this store's bag.
 *
 * A SHOPPER HAS ONE BAG PER STORE. On a hosted storefront that falls out of the browser: the cart
 * cookie belongs to the seller's own domain, so two stores can't see each other's bag. On VYA's own
 * domain, where every store is served under one address, they share a cookie — so the store is
 * recorded per piece and every read filters by it (see getCartItemIds). Same shopper, one bag each
 * at as many stores as they like, and checkout still pays exactly one seller.
 */
export async function addToCart(cartToken: string, itemId: string, sellerId: string): Promise<void> {
 await ensureTable();
 await db()`INSERT INTO storefront_cart_items (cart_token, item_id, seller_id) VALUES (${cartToken}, ${itemId}, ${sellerId})
 ON CONFLICT (cart_token, item_id) DO UPDATE SET seller_id = EXCLUDED.seller_id`;
}

/** The store this bag belongs to, or null when it's empty. */
export async function cartSellerId(cartToken: string): Promise<string | null> {
 await ensureTable();
 const rows = await db()`SELECT seller_id FROM storefront_cart_items WHERE cart_token = ${cartToken} AND seller_id IS NOT NULL LIMIT 1`;
 return ((rows as any[])[0]?.seller_id as string) ?? null;
}

export async function removeFromCart(cartToken: string, itemId: string): Promise<void> {
 await ensureTable();
 await db()`DELETE FROM storefront_cart_items WHERE cart_token = ${cartToken} AND item_id = ${itemId}`;
}

/**
 * The pieces in this shopper's bag AT ONE STORE.
 *
 * With no seller, every piece the token holds — which is what every caller did before bags were
 * per-store, and what a caller that genuinely cannot know its store still gets. That fallback is
 * deliberate: a page we forget to tell behaves exactly as it always did rather than showing an
 * empty bag.
 */
export async function getCartItemIds(cartToken: string, sellerId?: string | null): Promise<string[]> {
 await ensureTable();
 const rows = sellerId
  ? await db()`SELECT item_id FROM storefront_cart_items WHERE cart_token = ${cartToken} AND seller_id = ${sellerId} ORDER BY added_at`
  : await db()`SELECT item_id FROM storefront_cart_items WHERE cart_token = ${cartToken} ORDER BY added_at`;
 return (rows as any[]).map((r) => r.item_id as string);
}

/** Empty this shopper's bag at one store — or, with no seller, everything the token holds. */
export async function clearCart(cartToken: string, sellerId?: string | null): Promise<void> {
 await ensureTable();
 if (sellerId) await db()`DELETE FROM storefront_cart_items WHERE cart_token = ${cartToken} AND seller_id = ${sellerId}`;
 else await db()`DELETE FROM storefront_cart_items WHERE cart_token = ${cartToken}`;
}
