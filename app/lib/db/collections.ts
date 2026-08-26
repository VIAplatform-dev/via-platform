import { and, eq, inArray, sql as dsql } from "drizzle-orm";
import { getDb } from "./index";
import { collections, itemCollections, items } from "./schema";
import type { Collection, Item } from "./schema";

// The `position` column is added lazily and idempotently rather than through a migration step, the
// same way the other additive columns in this codebase are — so a deploy never lands code that reads
// a column the database doesn't have yet. One statement, once per process.
let orderReady: Promise<void> | null = null;
function ensureOrderColumn(): Promise<void> {
 orderReady ??= getDb()
  .execute(dsql`ALTER TABLE item_collections ADD COLUMN IF NOT EXISTS position INTEGER`)
  .then(() => undefined)
  .catch(() => undefined); // a read-only replica or a race: ordering degrades, nothing breaks
 return orderReady;
}

function slugify(s: string): string {
 return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "collection";
}

/** Create a collection keyed on an EXACT slug (e.g. a captured Shopify collection handle),
 * so the VYA collection lines up 1:1 with the imported /collections/{handle} page. */
export async function ensureCollection(sellerId: string, slug: string, title: string): Promise<Collection> {
 const db = getDb();
 const s = slugify(slug);
 const existing = await db.select().from(collections).where(and(eq(collections.sellerId, sellerId), eq(collections.slug, s))).limit(1);
 if (existing[0]) return existing[0];
 const [row] = await db.insert(collections).values({ sellerId, title: (title.trim() || s).slice(0, 80), slug: s }).returning();
 return row;
}

/** Collection titles per item (batched), for prefilling the editor's collections picker. */
export async function getCollectionTitlesForItems(itemIds: string[]): Promise<Record<string, string[]>> {
 const out: Record<string, string[]> = {};
 if (!itemIds.length) return out;
 const db = getDb();
 const rows = await db
  .select({ itemId: itemCollections.itemId, title: collections.title })
  .from(itemCollections)
  .innerJoin(collections, eq(collections.id, itemCollections.collectionId))
  .where(inArray(itemCollections.itemId, itemIds));
 for (const r of rows) { (out[r.itemId] ||= []).push(r.title); }
 return out;
}

/** Get a seller's collection by title, creating it if it doesn't exist (slug-keyed). */
export async function getOrCreateCollection(sellerId: string, title: string): Promise<Collection> {
 const db = getDb();
 const slug = slugify(title);
 const existing = await db.select().from(collections).where(and(eq(collections.sellerId, sellerId), eq(collections.slug, slug))).limit(1);
 if (existing[0]) return existing[0];
 const [row] = await db.insert(collections).values({ sellerId, title: title.trim().slice(0, 80), slug }).returning();
 return row;
}

/** A seller's collections with a live count of active items in each. By default only collections that
 * actually hold items are returned — so imported-but-empty collections and ones whose inventory was
 * removed don't clutter the picker or the storefront nav (pass includeEmpty for management views). */
export async function listCollections(sellerId: string, includeEmpty = false): Promise<(Collection & { itemCount: number })[]> {
 const db = getDb();
 const rows = await db
 .select({
 id: collections.id,
 sellerId: collections.sellerId,
 title: collections.title,
 slug: collections.slug,
 createdAt: collections.createdAt,
 itemCount: dsql<number>`count(${itemCollections.itemId})::int`,
 })
 .from(collections)
 .leftJoin(itemCollections, eq(itemCollections.collectionId, collections.id))
 .where(eq(collections.sellerId, sellerId))
 .groupBy(collections.id)
 .orderBy(collections.title);
 const all = rows as (Collection & { itemCount: number })[];
 return includeEmpty ? all : all.filter((r) => r.itemCount > 0);
}

/** Replace an item's collection membership with exactly the given collection ids. */
export async function setItemCollections(itemId: string, collectionIds: string[]): Promise<void> {
 const db = getDb();
 await db.delete(itemCollections).where(eq(itemCollections.itemId, itemId));
 const ids = [...new Set(collectionIds.filter(Boolean))];
 if (ids.length) {
 await db.insert(itemCollections).values(ids.map((collectionId) => ({ itemId, collectionId }))).onConflictDoNothing();
 }
}

/** Add many of the seller's items to a collection (creating it by title if new) WITHOUT touching their
 * other collection memberships — the bulk "add selected items to a collection" action from inventory.
 * Only the seller's own items are linked (guards against cross-store leakage). */
export async function addItemsToCollection(sellerId: string, title: string, itemIds: string[]): Promise<Collection> {
 const col = await getOrCreateCollection(sellerId, title);
 const ids = [...new Set(itemIds.filter(Boolean))];
 if (!ids.length) return col;
 const db = getDb();
 const owned = await db.select({ id: items.id }).from(items).where(and(eq(items.sellerId, sellerId), inArray(items.id, ids)));
 const ownedIds = owned.map((r) => r.id);
 if (ownedIds.length) {
 await ensureOrderColumn();
 // Newly added pieces go to the END of the collection. Appending is the predictable behaviour —
 // adding an item should never silently reshuffle what a storefront section is already showing.
 const [{ next } = { next: 0 }] = (await db.execute(dsql`SELECT COALESCE(MAX(position) + 1, 0) AS next FROM item_collections WHERE collection_id = ${col.id}::uuid`)).rows as { next: number }[];
 await db.insert(itemCollections)
  .values(ownedIds.map((id, i) => ({ itemId: id, collectionId: col.id, position: Number(next) + i })))
  .onConflictDoNothing();
 }
 return col;
}

/** One of the seller's collections by id (ownership-scoped). */
export async function getCollection(sellerId: string, id: string): Promise<Collection | null> {
 const db = getDb();
 const rows = await db.select().from(collections).where(and(eq(collections.id, id), eq(collections.sellerId, sellerId))).limit(1);
 return rows[0] ?? null;
}

/** Rename a collection (ownership-scoped). Keeps the slug in sync. */
export async function renameCollection(sellerId: string, id: string, title: string): Promise<Collection | null> {
 const db = getDb();
 const t = title.trim().slice(0, 80);
 if (!t) return getCollection(sellerId, id);
 const [row] = await db.update(collections).set({ title: t, slug: slugify(t) }).where(and(eq(collections.id, id), eq(collections.sellerId, sellerId))).returning();
 return row ?? null;
}

/** Delete ALL of a seller's collections (memberships cascade). Used when the owner clears the store's
 * whole inventory — the empty collections shouldn't linger behind. Returns how many were removed. */
export async function deleteAllCollections(sellerId: string): Promise<number> {
 const db = getDb();
 const res = await db.delete(collections).where(eq(collections.sellerId, sellerId)).returning({ id: collections.id });
 return res.length;
}

/** Delete a collection (ownership-scoped). Memberships cascade away via the FK; items are untouched. */
export async function deleteCollection(sellerId: string, id: string): Promise<boolean> {
 const db = getDb();
 const res = await db.delete(collections).where(and(eq(collections.id, id), eq(collections.sellerId, sellerId))).returning({ id: collections.id });
 return res.length > 0;
}

/** Remove items from ONE of the seller's collections (leaves the items + their other collections intact). */
export async function removeItemsFromCollection(sellerId: string, collectionId: string, itemIds: string[]): Promise<void> {
 const col = await getCollection(sellerId, collectionId);
 if (!col) return;
 const ids = [...new Set(itemIds.filter(Boolean))];
 if (!ids.length) return;
 const db = getDb();
 await db.delete(itemCollections).where(and(eq(itemCollections.collectionId, collectionId), inArray(itemCollections.itemId, ids)));
}

/** A seller's collection by slug (used to map a captured /collections/{handle} page). */
export async function getCollectionBySlug(sellerId: string, slug: string): Promise<Collection | null> {
 const db = getDb();
 const rows = await db.select().from(collections).where(and(eq(collections.sellerId, sellerId), eq(collections.slug, slug))).limit(1);
 return rows[0] ?? null;
}

export async function getItemCollectionIds(itemId: string): Promise<string[]> {
 const db = getDb();
 const rows = await db.select({ collectionId: itemCollections.collectionId }).from(itemCollections).where(eq(itemCollections.itemId, itemId));
 return rows.map((r) => r.collectionId);
}

/** Active items in a collection (sold/removed drop out automatically). */
/**
 * What a captured collection page should actually show: items explicitly assigned to the
 * collection, PLUS any of the seller's live items whose category or brand matches the collection's
 * handle.
 *
 * The assignment-only view left new listings invisible. Imported products get assigned from the
 * source's own collection endpoints, but anything the seller adds in the portal afterwards —
 * which is most of a vintage store's week-to-week inventory — belongs to no collection, so a
 * "Bags" page would silently omit a bag they'd just listed. Matching on category/brand mirrors
 * what a shopper expects that page to mean, and explicit assignments still take precedence in
 * ordering. Handles are compared loosely ("alexander-mcqueen" → "alexander mcqueen").
 */
export async function listCollectionItemsForStorefront(
 sellerId: string,
 collectionId: string | null,
 handle: string,
): Promise<Item[]> {
 await ensureOrderColumn();
 const db = getDb();
 const assigned = collectionId ? await listCollectionItems(collectionId, { storefront: true }) : [];
 const term = handle.replace(/[-_]+/g, " ").trim().toLowerCase();
 if (!term) return assigned;
 const matches = await db
  .select()
  .from(items)
  .where(and(
   eq(items.sellerId, sellerId),
   dsql`${items.status} IN ('active','sold')`,
   dsql`(lower(coalesce(${items.category}, '')) = ${term} OR lower(coalesce(${items.brand}, '')) = ${term})`,
  ));
 const seen = new Set(assigned.map((i) => i.id));
 return [...assigned, ...matches.filter((m) => !seen.has(m.id))];
}

export async function listCollectionItems(collectionId: string, opts?: { manage?: boolean; storefront?: boolean }): Promise<Item[]> {
 await ensureOrderColumn();
 const db = getDb();
 // Three views of the same collection:
 //   manage     — everything except removed (the seller's own list)
 //   storefront — active AND sold, because a vintage store's archive is part of browsing; hiding
 //                sold pieces turned a 37-piece archive collection into a single card
 //   default    — active only (internal callers that mean "buyable right now")
 const visible = opts?.manage
  ? dsql`${items.status} <> 'removed'`
  : opts?.storefront
   ? dsql`${items.status} IN ('active','sold')`
   : eq(items.status, "active");
 const rows = await db
 .select()
 .from(items)
 .innerJoin(itemCollections, eq(itemCollections.itemId, items.id))
 .where(and(eq(itemCollections.collectionId, collectionId), visible))
 // The seller's chosen order first; anything never ordered falls in behind it, newest first. `id`
 // last so the sequence is fully deterministic — a section showing "the first 5" must show the SAME
 // five on every render, which is exactly what was not true before.
 // Deliberately NOT sorted available-first: a curated collection has an order the seller chose, and
 // hoisting the one in-stock piece to the front reordered their archive against their wishes. The
 // "buyable first" default belongs on the uncurated shop-all page, not here.
 .orderBy(
  dsql`${itemCollections.position} ASC NULLS LAST`,
  dsql`${items.createdAt} DESC NULLS LAST`,
  items.id,
 );
 return rows.map((r) => r.items);
}

/**
 * Set the order of items within a collection. Takes the ids in the order the seller arranged them;
 * anything in the collection but absent from the list keeps its place behind them. Ownership is
 * checked by the caller (the collection is already scoped to the seller).
 */
export async function reorderCollectionItems(collectionId: string, orderedItemIds: string[]): Promise<void> {
 await ensureOrderColumn();
 const ids = [...new Set(orderedItemIds.filter(Boolean))];
 if (!ids.length) return;
 const db = getDb();
 // One statement rather than a write per row: a 60-item collection shouldn't be 60 round trips.
 // ::int on the index — a bare parameter arrives as text and Postgres won't coerce it into an
 // integer column ("column position is of type integer but expression is of type text").
 const cases = dsql.join(ids.map((id, i) => dsql`WHEN ${id}::uuid THEN ${i}::int`), dsql` `);
 await db.execute(dsql`
  UPDATE item_collections SET position = CASE item_id ${cases} END
  WHERE collection_id = ${collectionId}::uuid AND item_id IN (${dsql.join(ids.map((id) => dsql`${id}::uuid`), dsql`, `)})
 `);
}
