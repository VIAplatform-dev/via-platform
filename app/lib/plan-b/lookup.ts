// Variant id → VYA item. The bridge that lets a Shopify theme's own Add-to-cart button work.
//
// The theme posts the id it was captured with (a Shopify variant id). Every imported item carries
// its source identity — `sourceId` (the product handle/id) and `variants[].sourceVariantId` — so the
// mapping already exists in the data; this is just the query for it.
//
// Matching is on SOURCE IDENTITY, never title, for the same reason the importer is: on one-of-one
// vintage two pieces share a name often enough that a title match would put the wrong garment in a
// shopper's bag.
import { and, eq, sql } from "drizzle-orm";
import { getDb, items } from "@/app/lib/db/index";
import type { Item } from "@/app/lib/db/index";

/** Statuses a shopper may add to a cart. A sold one-of-one is gone, not backorderable. */
const SELLABLE = ["active", "draft"] as const;

/**
 * The item a theme's variant id refers to, scoped to one seller.
 *
 * Checks, in order: the item's own source id (the common case — a one-of-one product whose single
 * variant we keyed by handle), then the variants array (size runs, e.g. Unique Vintage's 227
 * multi-size products), then the VYA item id itself so our own markup keeps working.
 */
export async function findItemByVariantId(sellerId: string, variantId: string): Promise<Item | null> {
 const v = (variantId || "").trim();
 if (!v) return null;
 const db = getDb();

 const bySourceId = await db.select().from(items)
  .where(and(eq(items.sellerId, sellerId), eq(items.sourceId, v)))
  .limit(1);
 if (bySourceId[0]) return bySourceId[0];

 // A size run stores each variant's own id inside the JSONB array.
 const byVariant = await db.select().from(items)
  .where(and(
   eq(items.sellerId, sellerId),
   sql`${items.variants} @> ${JSON.stringify([{ sourceVariantId: v }])}::jsonb`,
  ))
  .limit(1);
 if (byVariant[0]) return byVariant[0];

 // Our own injected markup uses the VYA item id. Only a UUID can match, so a stray Shopify id
 // can't accidentally address an item here.
 if (/^[0-9a-f-]{36}$/i.test(v)) {
  const byId = await db.select().from(items)
   .where(and(eq(items.sellerId, sellerId), eq(items.id, v)))
   .limit(1);
  if (byId[0]) return byId[0];
 }
 return null;
}

export function isSellable(item: Item | null): boolean {
 return !!item && (SELLABLE as readonly string[]).includes(item.status);
}
