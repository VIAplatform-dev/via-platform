import { and, desc, eq, inArray, isNull, isNotNull, lt, lte, ne, notLike, sql, getTableColumns } from "drizzle-orm";
import { getDb, items, reservations, orders, payouts } from "./index";
import type { Item, NewItem, Reservation } from "./index";
import { DEFAULT_RESERVATION_TTL_SECONDS, reservationExpiry } from "./inventory-core";
import { logError } from "@/app/lib/error-log";
import { cleanDescription } from "@/app/lib/clean-description";
import { reasonForVanished } from "../unavailable-label";

// ───────────────────────────────────────────────────────────────────────────
// One-of-one inventory engine. Every mutation that changes availability is a
// single atomic UPDATE guarded by the current status, so concurrent buyers can
// never reserve or sell the same item twice. Pure rules live in inventory-core.
// ───────────────────────────────────────────────────────────────────────────

/** Create an item (defaults to draft). */
export async function createItem(item: NewItem): Promise<Item> {
 const db = getDb();
 // Clean HTML out of imported descriptions at the single write path, so EVERY item — from any
 // importer (Shopify/Squarespace/connected adapters), bulk upload, or a future source — is stored
 // as tidy plain text. Plain text passes through untouched (see cleanDescription).
 const values = item.description ? { ...item, description: cleanDescription(item.description) } : item;
 const [row] = await db.insert(items).values(values).returning();
 return row;
}

// Self-heal newer item columns so a deploy works even before `db:push` runs. Idempotent + memoized,
// so it's a no-op after the first call (or once the migration has been applied).
let publishAtEnsured = false;
export async function ensurePublishAtColumn(): Promise<void> {
 if (publishAtEnsured) return;
 try {
 await getDb().execute(sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS publish_at timestamptz`);
 await getDb().execute(sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS measurements text`);
 // Source identity for the import engine (see schema.ts). Additive + nullable, so existing rows
 // and any code that doesn't know about them keep working untouched.
 await getDb().execute(sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS source_platform text`);
 await getDb().execute(sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS source_id text`);
 // Why a piece is unbuyable, recorded rather than inferred. See app/lib/unavailable-label.ts.
 await getDb().execute(sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS unavailable_reason text`);
 await getDb().execute(sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS compare_at_cents integer`);
 await getDb().execute(sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS source_url text`);
 await getDb().execute(sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS content_hash text`);
 await getDb().execute(sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS variants jsonb DEFAULT '[]'::jsonb`);
 await getDb().execute(sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'source'`);
 // Identity lookup for re-sync: "does this store already have the source's product X?"
 await getDb().execute(sql`CREATE INDEX IF NOT EXISTS items_source_idx ON items (seller_id, source_platform, source_id)`);
 // The seller's per-listing cross-listing choice, kept so a SCHEDULED piece still fans
 // out to the channels they picked when the cron publishes it hours later. NULL means
 // "no explicit choice" — fall back to each channel's auto-list default.
 await getDb().execute(sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS cross_list_channels text[]`);
 publishAtEnsured = true;
 } catch { /* db:push covers it; ignore if we lack DDL rights */ }
}

/** Publish every scheduled draft whose time has arrived (status 'draft' + publish_at <= now). The
 *  status guard makes it atomic, so overlapping cron runs can't double-publish. Returns the items
 *  that flipped live, so the caller can fan out to other channels + send the new-arrivals digest. */
export async function publishDueScheduledItems(now: Date): Promise<Item[]> {
 await ensurePublishAtColumn();
 const db = getDb();
 return db.update(items)
 .set({ status: "active", publishAt: null, updatedAt: new Date() })
 .where(and(eq(items.status, "draft"), isNotNull(items.publishAt), lte(items.publishAt, now)))
 .returning();
}

/** Patch an item's display/sale fields (title, price, images, etc.). Does not
 * touch availability locks (use reserve/markSold for those). */
export async function updateItem(
 itemId: string,
 patch: Partial<Pick<NewItem, "title" | "priceCents" | "costCents" | "currency" | "images" | "brand" | "era" | "material" | "condition" | "size" | "measurements" | "description" | "category" | "status" | "weightOz" | "lengthIn" | "widthIn" | "heightIn" | "publishAt" | "source">>,
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

// ── Source-identity helpers (import engine) ─────────────────────────────────────────────────
// These let an import MATCH what it previously created instead of wiping and re-adding it, which
// is what makes a re-import safe to run repeatedly (and keeps seller edits intact).

/** Every item this store imported from a given source, with the identity columns needed to match. */
export async function listItemsBySource(sellerId: string, source: string): Promise<Item[]> {
 await ensurePublishAtColumn();
 const db = getDb();
 return db.select().from(items).where(and(eq(items.sellerId, sellerId), eq(items.source, source)));
}

/** Refresh a source-owned item from the source. Never call this for `origin = 'user'` rows —
 *  the caller checks that, because a seller's own edit must outlive any re-sync. */
export async function updateItemFromSource(
 id: string,
 patch: Partial<Pick<Item, "title" | "priceCents" | "currency" | "images" | "description" | "size" | "status" | "variants" | "contentHash" | "sourcePlatform" | "sourceId" | "sourceUrl" | "unavailableReason" | "compareAtCents" | "imagesRehosted">>,
): Promise<void> {
 await ensurePublishAtColumn();
 const db = getDb();
 // `origin` guard in SQL too, so a race can't clobber an edit made mid-import.
 await db.update(items)
  .set({ ...patch, updatedAt: new Date() })
  .where(and(eq(items.id, id), eq(items.origin, "source")));
}

/** Items the source stopped listing: mark sold (real history, and the captured product page still
 *  links to them) rather than deleting. Already-sold and seller-edited rows are left untouched. */
export async function markItemsMissingFromSource(ids: string[]): Promise<number> {
 if (!ids.length) return 0;
 await ensurePublishAtColumn();
 const db = getDb();
 const rows = await db.update(items)
  // An inference, labelled as one: the feed stopped listing it and we do not know why.
  .set({ status: "sold", soldAt: new Date(), unavailableReason: reasonForVanished(), updatedAt: new Date() })
  .where(and(inArray(items.id, ids), eq(items.origin, "source"), ne(items.status, "sold")))
  .returning({ id: items.id });
 return rows.length;
}

/** Mark an item as seller-owned so future imports leave it alone. Called from the portal's edit
 *  paths — once a human touches an imported item, the importer stops managing it. */
export async function markItemUserEdited(id: string): Promise<void> {
 await ensurePublishAtColumn();
 await getDb().update(items).set({ origin: "user", updatedAt: new Date() }).where(eq(items.id, id));
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

/**
 * Reserve an item for an IN-PERSON (Market Mode) checkout. Same atomic flip as reserveItem, but a
 * quick-listed `draft` is also sellable — the piece is physically on the table. Contends on the same
 * row as online buyers, so exactly one of any concurrent online/in-person attempts wins.
 */
export async function reserveItemForMarket(itemId: string, buyerRef: string, ttlSeconds: number): Promise<Reservation | null> {
 const db = getDb();
 const [locked] = await db
 .update(items)
 .set({ status: "reserved", updatedAt: new Date() })
 .where(and(eq(items.id, itemId), inArray(items.status, ["active", "draft"])))
 .returning({ id: items.id });
 if (!locked) return null;
 try {
 const [res] = await db.insert(reservations).values({ itemId, buyerRef, expiresAt: reservationExpiry(ttlSeconds) }).returning();
 return res ?? null;
 } catch (e) {
 await db.update(items).set({ status: "active", updatedAt: new Date() }).where(and(eq(items.id, itemId), eq(items.status, "reserved"))).catch(() => {});
 logError("reserve-item-market-revert", e, { context: { itemId } });
 return null;
 }
}

/** Release a Market Mode hold, restoring the status the item had before (active or draft). A
 *  quick-listed draft that doesn't sell must stay a draft — releasing it to `active` would publish
 *  it online without the ship-from address a live listing requires. Guarded on 'reserved'. */
export async function releaseMarketReservation(itemId: string, restoreTo: "active" | "draft"): Promise<void> {
 const db = getDb();
 const now = new Date();
 await db.update(reservations).set({ releasedAt: now }).where(and(eq(reservations.itemId, itemId), isNull(reservations.releasedAt)));
 await db.update(items).set({ status: restoreTo, updatedAt: now }).where(and(eq(items.id, itemId), eq(items.status, "reserved")));
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
 * Sweep: return to sale any item stuck 'reserved' past its checkout hold. The 10-min TTL is stamped on
 * the reservation at reserve time, but only Stripe events (success/fail/refund) and cart reclaims release
 * it — an abandoned checkout that never fires a Stripe cancel would otherwise strand the piece as
 * 'reserved' forever. This enforces the expiry. Only touches items still 'reserved' whose live reservation
 * has expired (never a sold piece, and never a reservation that's still within its window). Returns count.
 */
export async function releaseExpiredReservations(now: Date = new Date()): Promise<number> {
 const db = getDb();
 // Market Mode holds (buyer_ref 'market-…') are expired by the market reconciler, which knows the
 // status to restore (a draft must stay a draft); this sweeper would wrongly flip them to active.
 const stale = await db
 .select({ itemId: reservations.itemId })
 .from(reservations)
 .innerJoin(items, eq(items.id, reservations.itemId))
 .where(and(isNull(reservations.releasedAt), lt(reservations.expiresAt, now), eq(items.status, "reserved"), notLike(reservations.buyerRef, "market-%")));
 const ids = [...new Set(stale.map((r) => r.itemId))];
 if (!ids.length) return 0;
 await db.update(reservations).set({ releasedAt: now }).where(and(inArray(reservations.itemId, ids), isNull(reservations.releasedAt)));
 await db.update(items).set({ status: "active", updatedAt: now }).where(and(inArray(items.id, ids), eq(items.status, "reserved")));
 return ids.length;
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
/**
 * What a hosted STOREFRONT should show: everything a shopper can see, not only what they can buy.
 *
 * A vintage store's sold archive is part of the browsing experience — the source site keeps sold
 * pieces on the shelf with a "Sold out" badge, and hiding them made a 52-product store look like a
 * 15-product one. Drafts and removed rows stay hidden; those are the seller's private state.
 *
 * Buyable pieces lead, then the archive, newest first within each.
 */
export async function listStorefrontItems(sellerId: string): Promise<Item[]> {
 const db = getDb();
 return db.select().from(items)
  .where(and(eq(items.sellerId, sellerId), inArray(items.status, ["active", "sold"])))
  .orderBy(sql`CASE WHEN ${items.status} = 'active' THEN 0 ELSE 1 END`, desc(items.createdAt));
}

/**
 * The subset of a seller's storefront items whose `sourceId` (the imported handle) is in the given
 * list — live data, but scoped to a SPECIFIC set of products rather than the whole catalogue.
 *
 * Built for a captured collection page VYA has no curation data for (no assigned VYA collection,
 * no category/brand match on the handle): rather than falling back to the seller's entire
 * inventory, the caller reads the handles the CAPTURED page actually listed and asks for just
 * those, live. Ordered to match `sourceIds`, since that's the seller's own curated order on a
 * manually-built Shopify collection with no category logic behind it at all.
 */
export async function listStorefrontItemsBySourceIds(sellerId: string, sourceIds: string[]): Promise<Item[]> {
 if (!sourceIds.length) return [];
 const db = getDb();
 const rows = await db.select().from(items)
  .where(and(eq(items.sellerId, sellerId), inArray(items.status, ["active", "sold"]), inArray(items.sourceId, sourceIds)));
 const order = new Map(sourceIds.map((id, i) => [id, i]));
 return rows.sort((a, b) => (order.get(a.sourceId || "") ?? 0) - (order.get(b.sourceId || "") ?? 0));
}

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

/**
 * Remember which marketplaces a listing should fan out to. Written at publish time
 * (including when scheduled), read back by the scheduled-publish cron so a choice
 * made in the form isn't silently replaced by the account defaults later.
 */
export async function setCrossListChannels(itemId: string, channels: string[] | null): Promise<void> {
 await ensurePublishAtColumn();
 await getDb()
  .update(items)
  .set({ crossListChannels: channels && channels.length ? channels : null })
  .where(eq(items.id, itemId));
}

/** The stored choice, or null when the seller never made one. */
export async function getCrossListChannels(itemId: string): Promise<string[] | null> {
 await ensurePublishAtColumn();
 const [row] = await getDb()
  .select({ channels: items.crossListChannels })
  .from(items)
  .where(eq(items.id, itemId))
  .limit(1);
 return row?.channels?.length ? row.channels : null;
}
