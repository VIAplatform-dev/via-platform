import { and, desc, eq, inArray, isNull, lt, ne, sql, getTableColumns } from "drizzle-orm";
import { getDb, items, reservations, orders, payouts } from "./index";
import type { Item, NewItem, Reservation } from "./index";
import { DEFAULT_RESERVATION_TTL_SECONDS, reservationExpiry } from "./inventory-core";
import { logError } from "@/app/lib/error-log";

// ───────────────────────────────────────────────────────────────────────────
// One-of-one inventory engine. Every mutation that changes availability is a
// single atomic UPDATE guarded by the current status, so concurrent buyers can
// never reserve or sell the same item twice. Pure rules live in inventory-core.
// ───────────────────────────────────────────────────────────────────────────

/** Create an item (defaults to draft). */
export async function createItem(item: NewItem): Promise<Item> {
 const db = getDb();
 const [row] = await db.insert(items).values(item).returning();
 return row;
}

/** Patch an item's display/sale fields (title, price, images, etc.). Does not
 * touch availability locks (use reserve/markSold for those). */
export async function updateItem(
 itemId: string,
 patch: Partial<Pick<NewItem, "title" | "priceCents" | "costCents" | "currency" | "images" | "brand" | "era" | "material" | "condition" | "size" | "description" | "category" | "status" | "weightOz" | "lengthIn" | "widthIn" | "heightIn">>,
): Promise<Item | null> {
 const db = getDb();
 const [row] = await db.update(items).set({ ...patch, updatedAt: new Date() }).where(eq(items.id, itemId)).returning();
 return row ?? null;
}

/** draft → active (publish). Safe to call when already active. */
export async function publishItem(itemId: string): Promise<Item | null> {
 const db = getDb();
 const [row] = await db
 .update(items)
 .set({ status: "active", updatedAt: new Date() })
 .where(and(eq(items.id, itemId), inArray(items.status, ["draft", "active"])))
 .returning();
 return row ?? null;
}

/** Delete a seller's items by source (e.g. "captured"). Keeps sold items by default
 * so paid orders never dangle. Used when re-bringing a site over: products are
 * REPLACED, not piled on top of the previous capture. */
export async function deleteItemsBySource(sellerId: string, source: string, includeSold = false): Promise<number> {
 const db = getDb();
 const where = includeSold
 ? and(eq(items.sellerId, sellerId), eq(items.source, source))
 : and(eq(items.sellerId, sellerId), eq(items.source, source), ne(items.status, "sold"));
 const rows = await db.delete(items).where(where).returning({ id: items.id });
 return rows.length;
}

/** Full owner reset: wipe ALL of a seller's inventory, SOLD included. The payouts
 *  and orders that reference sold items are cleared first (those FKs don't cascade);
 *  reservations + collection memberships cascade on their own. Owner-only — used to
 *  start a store's catalog (and its order history) over from scratch. */
export async function deleteAllItems(sellerId: string): Promise<number> {
 const db = getDb();
 await db.delete(payouts).where(eq(payouts.sellerId, sellerId));
 await db.delete(orders).where(eq(orders.sellerId, sellerId));
 const rows = await db.delete(items).where(eq(items.sellerId, sellerId)).returning({ id: items.id });
 return rows.length;
}

/** Bulk publish (draft → active) a set of the seller's items in one query — for
 *  staging a drop as drafts and pushing the whole thing live at once. Ownership-
 *  scoped; already-active items are untouched, sold/removed are never flipped. */
export async function publishItems(sellerId: string, ids: string[]): Promise<number> {
 if (!ids.length) return 0;
 const db = getDb();
 const rows = await db
 .update(items)
 .set({ status: "active", updatedAt: new Date() })
 .where(and(eq(items.sellerId, sellerId), inArray(items.id, ids), inArray(items.status, ["draft", "active"])))
 .returning({ id: items.id });
 return rows.length;
}

/** Bulk remove a set of the seller's items (keeps sold for order history). */
export async function removeItems(sellerId: string, ids: string[]): Promise<number> {
 if (!ids.length) return 0;
 const db = getDb();
 const rows = await db
 .update(items)
 .set({ status: "removed", updatedAt: new Date() })
 .where(and(eq(items.sellerId, sellerId), inArray(items.id, ids), ne(items.status, "sold")))
 .returning({ id: items.id });
 return rows.length;
}

/** Remove an item from sale (terminal). */
export async function removeItem(itemId: string): Promise<Item | null> {
 const db = getDb();
 const [row] = await db.update(items).set({ status: "removed", updatedAt: new Date() }).where(eq(items.id, itemId)).returning();
 return row ?? null;
}

/**
 * Reserve an item for checkout. The active→reserved flip is one atomic UPDATE
 * guarded by status='active', so of N concurrent buyers exactly one wins — the
 * item can never be reserved (or sold) twice. Returns the reservation, or null
 * if the item wasn't available.
 */
export async function reserveItem(
 itemId: string,
 buyerRef: string | null = null,
 ttlSeconds: number = DEFAULT_RESERVATION_TTL_SECONDS,
): Promise<Reservation | null> {
 const db = getDb();
 const [locked] = await db
 .update(items)
 .set({ status: "reserved", updatedAt: new Date() })
 .where(and(eq(items.id, itemId), eq(items.status, "active")))
 .returning({ id: items.id });
 if (!locked) return null; // not available — already reserved or sold

 try {
 const [res] = await db
 .insert(reservations)
 .values({ itemId, buyerRef, expiresAt: reservationExpiry(ttlSeconds) })
 .returning();
 return res ?? null;
 } catch (e) {
 // The status flip succeeded but the reservation row didn't — revert so the item isn't stranded
 // as permanently 'reserved' with no reservation the sweeper can ever expire. Guarded on 'reserved'
 // so a concurrent sale isn't clobbered.
 await db.update(items).set({ status: "active", updatedAt: new Date() }).where(and(eq(items.id, itemId), eq(items.status, "reserved"))).catch(() => {});
 logError("reserve-item-revert", e, { context: { itemId } });
 return null;
 }
}

/** The owner tag (`buyerRef`) of the item's current live reservation, or null if none is held.
 * Lets a caller tell WHO holds a 'reserved' piece — e.g. whether it's the buyer's own accepted
 * binding offer (`offer-<token>`) vs. someone else mid-checkout. */
export async function currentReservationRef(itemId: string): Promise<string | null> {
 const db = getDb();
 const [r] = await db
 .select({ buyerRef: reservations.buyerRef })
 .from(reservations)
 .where(and(eq(reservations.itemId, itemId), isNull(reservations.releasedAt)))
 .orderBy(desc(reservations.expiresAt))
 .limit(1);
 return r?.buyerRef ?? null;
}

/** Release any live reservation on an item and return it to active. */
export async function releaseReservation(itemId: string): Promise<void> {
 const db = getDb();
 const now = new Date();
 await db.update(reservations).set({ releasedAt: now }).where(and(eq(reservations.itemId, itemId), isNull(reservations.releasedAt)));
 await db.update(items).set({ status: "active", updatedAt: now }).where(and(eq(items.id, itemId), eq(items.status, "reserved")));
}

/**
 * Mark an item sold (on payment success). Atomic: reserved/active → sold only if
 * still sellable. Closes any live reservation. Returns the item, or null if it
 * was no longer sellable (already sold/removed).
 */
export async function markSold(itemId: string): Promise<Item | null> {
 const db = getDb();
 const now = new Date();
 const [sold] = await db
 .update(items)
 .set({ status: "sold", soldAt: now, updatedAt: now })
 .where(and(eq(items.id, itemId), inArray(items.status, ["reserved", "active"])))
 .returning();
 if (!sold) return null;
 await db.update(reservations).set({ releasedAt: now }).where(and(eq(reservations.itemId, itemId), isNull(reservations.releasedAt)));
 return sold;
}

/** Put a sold/reserved item back up for sale (e.g. after a refund). One-of-one, so
 * it becomes available again. */
export async function relistItem(itemId: string): Promise<Item | null> {
 const db = getDb();
 const [row] = await db.update(items).set({ status: "active", soldAt: null, updatedAt: new Date() }).where(eq(items.id, itemId)).returning();
 return row ?? null;
}

/**
 * Release every expired-but-still-live reservation, returning those items to
 * active. Run lazily before listing/checkout and/or on a cron. Returns the count.
 */
export async function sweepExpiredReservations(): Promise<number> {
 const db = getDb();
 const now = new Date();
 const expired = await db
 .select({ itemId: reservations.itemId })
 .from(reservations)
 .where(and(isNull(reservations.releasedAt), lt(reservations.expiresAt, now)));
 if (!expired.length) return 0;
 const ids = Array.from(new Set(expired.map((e) => e.itemId)));
 await db.update(reservations).set({ releasedAt: now }).where(and(isNull(reservations.releasedAt), lt(reservations.expiresAt, now)));
 await db.update(items).set({ status: "active", updatedAt: now }).where(and(inArray(items.id, ids), eq(items.status, "reserved")));
 return ids.length;
}

/** Active (buyable) items for a seller — the storefront's source of truth. */
export async function listAvailableItems(sellerId: string): Promise<Item[]> {
 const db = getDb();
 return db.select().from(items).where(and(eq(items.sellerId, sellerId), eq(items.status, "active")));
}

/** All of a seller's items, any status — for the manage view. `sku` is a per-store sequence by
 *  creation order (1 = the store's first item), so every piece has a stable, meaningful ID. */
export async function listSellerItems(sellerId: string): Promise<(Item & { sku: number })[]> {
 const db = getDb();
 return db
 .select({
 ...getTableColumns(items),
 sku: sql<number>`row_number() over (order by ${items.createdAt} asc, ${items.id} asc)`.mapWith(Number),
 })
 .from(items)
 .where(eq(items.sellerId, sellerId))
 .orderBy(desc(items.createdAt));
}

/** Fetch one item (e.g. to verify ownership before a mutation). */
export async function getItem(itemId: string): Promise<Item | null> {
 const db = getDb();
 const [row] = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
 return row ?? null;
}
