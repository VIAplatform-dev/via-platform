import { getSellerBySlug } from "./db/sellers";
import { createItem, updateItem, removeItem, getItem, listAvailableItems, listSellerItems } from "./db/inventory";
import { getOrCreateCollection, setItemCollections } from "./db/collections";
import type { Item } from "./db/index";
import { MAX_ITEM_IMAGES } from "./item-limits";

// Resolve collection titles → ids (creating any new ones) and set an item's membership.
// `titles === undefined` means "leave collections untouched" (so a plain title/price edit
// never wipes them); an empty array clears them.
async function applyCollections(sellerId: string, itemId: string, titles?: string[]): Promise<void> {
 if (!titles) return;
 const ids: string[] = [];
 for (const t of titles) { const name = String(t).trim(); if (name) ids.push((await getOrCreateCollection(sellerId, name)).id); }
 await setItemCollections(itemId, ids);
}

// ───────────────────────────────────────────────────────────────────────────
// "Listings" are now a thin VIEW over the canonical product table (db/items).
// Historically a store's storefront products lived in a separate
// `storefront_listings` table; that's been unified so there is ONE source of
// truth — `db/items` — which is also what checkout/orders/fulfillment use. This
// module keeps the old Listing shape so existing readers/writers keep working,
// but every call reads or writes items. (One-time data migration lives in
// migrateListingsToItems below.)
// ───────────────────────────────────────────────────────────────────────────

export type ListingStatus = "active" | "sold" | "draft";

export type Listing = {
 id: string; // now the item's uuid (was a serial int)
 storeSlug: string;
 title: string;
 price: number; // dollars (item.priceCents / 100)
 currency: string;
 images: string[];
 size: string | null;
 measurements: string | null;
 description: string | null;
 category: string | null;
 tags: string[];
 status: ListingStatus;
 createdAt?: string;
};

export type ListingInput = {
 title: string;
 price: number;
 currency?: string;
 images: string[];
 size: string | null;
 measurements: string | null;
 description: string | null;
 category: string | null;
 tags?: string[];
 status: ListingStatus;
 // Collection titles this item belongs to. `undefined` = don't change membership.
 collections?: string[];
};

// Map a canonical item → the Listing shape consumers expect.
function itemToListing(it: Item, storeSlug: string): Listing {
 const status: ListingStatus = it.status === "sold" ? "sold" : it.status === "draft" ? "draft" : "active";
 return {
 id: it.id,
 storeSlug,
 title: it.title,
 price: (it.priceCents ?? 0) / 100,
 currency: it.currency || "USD",
 images: Array.isArray(it.images) ? it.images : [],
 size: it.size ?? null,
 measurements: it.measurements ?? null,
 description: it.description ?? null,
 category: it.category ?? null,
 tags: [],
 status,
 createdAt: it.createdAt ? new Date(it.createdAt).toISOString() : undefined,
 };
}

/** All listings for a store. `activeOnly` for the public storefront. Returns []
 * for a store that isn't a transacting seller yet (no db/seller row). */
export async function getListingsByStore(storeSlug: string, activeOnly = false): Promise<Listing[]> {
 const seller = await getSellerBySlug(storeSlug);
 if (!seller) return [];
 const items = activeOnly ? await listAvailableItems(seller.id) : await listSellerItems(seller.id);
 return items.filter((it) => it.status !== "removed").map((it) => itemToListing(it, storeSlug));
}

export async function createListing(storeSlug: string, l: ListingInput): Promise<Listing | null> {
 const seller = await getSellerBySlug(storeSlug);
 if (!seller) return null;
 const item = await createItem({
 sellerId: seller.id,
 title: l.title,
 priceCents: Math.round((l.price || 0) * 100),
 currency: l.currency || "USD",
 images: l.images || [],
 size: l.size,
 measurements: l.measurements ?? null,
 description: l.description,
 category: l.category,
 status: l.status,
 source: "manual",
 });
 await applyCollections(seller.id, item.id, l.collections);
 return itemToListing(item, storeSlug);
}

/** Update a listing — scoped to the store so a store can only edit its own. */
export async function updateListing(id: string, storeSlug: string, l: ListingInput): Promise<Listing | null> {
 const seller = await getSellerBySlug(storeSlug);
 if (!seller) return null;
 const existing = await getItem(id);
 if (!existing || existing.sellerId !== seller.id) return null;
 const item = await updateItem(id, {
 title: l.title,
 priceCents: Math.round((l.price || 0) * 100),
 currency: l.currency || "USD",
 images: l.images || [],
 size: l.size,
 measurements: l.measurements ?? null,
 description: l.description,
 category: l.category,
 status: l.status,
 });
 if (item) await applyCollections(seller.id, item.id, l.collections);
 return item ? itemToListing(item, storeSlug) : null;
}

/** Coerce + clamp untrusted request body into a safe ListingInput. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function sanitizeListingInput(body: any, defaultCurrency = "USD"): ListingInput {
 const s = (v: any, max: number) => {
 const t = (typeof v === "string" ? v : "").trim();
 return t ? t.slice(0, max) : null;
 };
 const status: ListingStatus = ["active", "sold", "draft"].includes(body?.status) ? body.status : "active";
 return {
 title: (typeof body?.title === "string" ? body.title : "").trim().slice(0, 200),
 price: Math.max(0, Math.min(1_000_000, Number(body?.price) || 0)),
 currency: defaultCurrency,
 images: Array.isArray(body?.images) ? body.images.filter((x: any) => typeof x === "string" && x).slice(0, MAX_ITEM_IMAGES) : [],
 size: s(body?.size, 40),
 measurements: s(body?.measurements, 300),
 description: s(body?.description, 2000),
 category: s(body?.category, 60),
 status,
 // Only touch collections when the caller actually sent the field (so a plain edit
 // that omits it leaves membership alone). Values are collection TITLES.
 collections: Array.isArray(body?.collections)
  ? body.collections.filter((x: any) => typeof x === "string" && x.trim()).map((x: string) => x.trim().slice(0, 80)).slice(0, 20)
  : undefined,
 };
}

export async function deleteListing(id: string, storeSlug: string): Promise<boolean> {
 const seller = await getSellerBySlug(storeSlug);
 if (!seller) return false;
 const existing = await getItem(id);
 if (!existing || existing.sellerId !== seller.id) return false;
 await removeItem(id);
 return true;
}

/** Remove every listing for a store (e.g. before a fresh re-import). */
export async function deleteListingsByStore(storeSlug: string): Promise<number> {
 const seller = await getSellerBySlug(storeSlug);
 if (!seller) return 0;
 const items = await listSellerItems(seller.id);
 let n = 0;
 for (const it of items) { if (it.status !== "removed") { await removeItem(it.id); n++; } }
 return n;
}
