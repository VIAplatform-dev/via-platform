// Bridges a captured store's products into VYA's checkout. When a seller brings
// their site over, their products are imported as real db/items (the inventory the
// Stripe checkout reads), and each captured product page is matched to its item so
// "Buy now" runs through VYA's existing Stripe flow.
import { getSellerBySlug } from "./db/sellers";
import { createItem, listAvailableItems, deleteItemsBySource } from "./db/inventory";
import type { ImportedProduct } from "./store-import";
import { rehostImages } from "./rehost-images";

const parseCents = (price?: string) => Math.round((parseFloat((price || "").replace(/[^0-9.]/g, "")) || 0) * 100);
const detectCur = (price?: string) => (/£/.test(price || "") ? "GBP" : /€/.test(price || "") ? "EUR" : "USD");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Create db/items (checkout-able inventory) for a captured store's products. */
export async function importProductsAsItems(slug: string, products: ImportedProduct[]): Promise<number> {
 const seller = await getSellerBySlug(slug);
 if (!seller) return 0;
 // Bringing a site over REPLACES its products — clear the previous capture's
 // items (keeping any that already sold) so re-syncing / switching sites doesn't
 // pile every store's inventory on top of each other.
 await deleteItemsBySource(seller.id, "captured").catch(() => 0);
 const existing = await listAvailableItems(seller.id);
 const have = new Set(existing.map((i) => i.title.toLowerCase().trim()));
 let n = 0;
 for (const p of products) {
 const title = (p.name || "").trim();
 const cents = parseCents(p.price);
 if (!title || !cents || have.has(title.toLowerCase())) continue;
 // Copy the images onto OUR storage so the listing survives the seller leaving their
 // old platform (their CDN images 404 otherwise). Soft-fails to the source URL.
 const rawImages = p.images?.length ? p.images : p.image ? [p.image] : [];
 const images = await rehostImages(rawImages, slug);
 await createItem({
 sellerId: seller.id,
 title,
 priceCents: cents,
 currency: detectCur(p.price),
 images,
 description: p.description ?? null,
 size: p.size ?? null,
 status: p.available === false ? "sold" : "active",
 source: "captured",
 });
 have.add(title.toLowerCase());
 n++;
 }
 return n;
}

/**
 * Convert a store's SYNCED marketplace catalog (the read-only `products` rows from a
 * Shopify/Squarespace/etc. connection) into managed, sellable OS `items` — the self-serve
 * fix for the two-table trap, so a connected store can actually edit/reprice/manage its
 * inventory instead of only browsing it. Re-hosts images (survives leaving the old platform),
 * carries over everything we captured (brand/era/material/condition/measurements/size), and
 * is idempotent by title so re-running only adds what's new.
 */
export async function convertCatalogToItems(slug: string): Promise<{ added: number; total: number }> {
 const { getProductsByStore } = await import("./db");
 const seller = await getSellerBySlug(slug);
 if (!seller) return { added: 0, total: 0 };
 const products = await getProductsByStore(slug).catch(() => []);
 const existing = await listAvailableItems(seller.id);
 const have = new Set(existing.map((i) => i.title.toLowerCase().trim()));
 let added = 0;
 for (const p of products) {
 const title = (p.title || "").trim();
 const cents = Math.round(Number(p.price) * 100);
 if (!title || !cents || have.has(title.toLowerCase())) continue;
 let raw: string[] = [];
 if (p.images) { try { const a = JSON.parse(p.images); if (Array.isArray(a)) raw = a; } catch {} }
 if (!raw.length && p.image) raw = [p.image];
 const images = await rehostImages(raw, slug);
 await createItem({
 sellerId: seller.id,
 title,
 priceCents: cents,
 currency: p.currency || "USD",
 images,
 description: p.description ?? null,
 brand: p.brand ?? null,
 era: p.era ?? null,
 material: p.materials ?? null,
 condition: p.condition ?? null,
 size: p.size ?? null,
 category: p.product_type ?? null,
 status: "active",
 source: "imported",
 });
 have.add(title.toLowerCase());
 added++;
 }
 return { added, total: products.length };
}

/** Find the db/item id for a captured product (by title) — for its Buy button. */
export async function matchItemId(slug: string, title: string): Promise<string | null> {
 const seller = await getSellerBySlug(slug);
 if (!seller || !title) return null;
 const items = await listAvailableItems(seller.id);
 const nt = norm(title);
 const m = items.find((i) => norm(i.title) === nt) || items.find((i) => nt.includes(norm(i.title)) || norm(i.title).includes(nt));
 return m?.id ?? null;
}
