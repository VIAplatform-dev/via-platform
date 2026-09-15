import { neon } from "@neondatabase/serverless";
import { deriveSize } from "./inventory";
import { inferCategoryFromTitle } from "./loadStoreProducts";
import type { DBProduct } from "./db";

// What each category actually needs to be "complete":
//  • Clothing & shoes → a SIZE (or measurements that stand in for one). Having a
//    size means it does NOT also need measurements.
//  • Bags & accessories → MEASUREMENTS (dimensions); they have no wearer size, so
//    they're never flagged for a missing size.
//  • Jewelry / other accessories / home → neither (just a description + image).
const CLOTHING_CATS = new Set([
 "tops", "sweaters", "coats-jackets", "pants", "jeans", "dresses", "skirts", "shorts",
 "jumpsuits", "lingerie", "swimwear",
]);
const SHOE_CATS = new Set(["shoes", "boots", "heels", "sneakers", "sandals", "flats"]);
const BAG_CATS = new Set(["bags", "totes", "clutches", "crossbody-bags", "handbags"]);
// Bag/accessory signals, if a title or description looks like a bag, treat it as
// a bag even when the category guesser fell back to clothing (so it's checked for
// measurements, never a wearer size).
const BAG_SIGNAL = /\b(bag|handbag|purse|clutch|tote|pouch|backpack|crossbody|cross-body|satchel|hobo|baguette|bucket|wallet on chain|woc|chanel 22|lady dior|birkin|kelly|constance|neverfull|speedy|pochette|peekaboo|marmont|dionysus|hourglass|loulou|capucines)\b|strap\s*drop|handle\s*drop/i;

// ───────────────────────────────────────────────────────────────────────────
// Listing-quality audit (admin). Flags which products are missing the things
// that help vintage pieces sell: a size, body measurements, a description, and
// a real image. Lists the actual products so they can be fixed, plus a per-store
// summary of how many are incomplete.
// ───────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

// Tracks which listings have already triggered a "missing details" email, so each
// one is alerted ONCE. Stores aren't nagged about the same listing repeatedly,
// and only newly-added flagged listings get emailed.
let _alertColReady = false;
async function ensureAlertColumn(sql: ReturnType<typeof db>): Promise<void> {
 if (_alertColReady) return;
 await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS listing_alert_sent_at TIMESTAMP WITH TIME ZONE`;
 _alertColReady = true;
}

// Does the description contain any measurement / dimension info? Covers clothing
// (bust, waist, sleeve…) AND bags/accessories (dimensions, width × height, strap
// drop, inch marks, cm). We err toward NOT flagging: if anything looks like a
// size or measurement, treat the listing as covered.
function hasMeasurements(desc: string | null): boolean {
 if (!desc) return false;
 const t = desc.replace(/<[^>]+>/g, " ");
 // 1. A measurement keyword followed by a number.
 if (/(bust|chest|waist|hip|pit[-\s]to[-\s]pit|shoulder|sleeve|inseam|insole|rise|length|width|height|depth|diameter|circumference|dimensions?|measure(?:s|d|ments?)?|strap\s*drop|handle\s*drop|drop)\b\s*:?\s*~?\s*\d/i.test(t)) return true;
 // 2. A number with a length unit or inch mark: 7.75 in, 30cm, 12", 21”.
 if (/\d+(?:\.\d+)?\s*(?:["”'’]|in\b|inch|inches|cm|mm)/i.test(t)) return true;
 // 3. A dimension expression: 7.75 x 3.25 x 5, 12 × 8, 10 by 6.
 if (/\d+(?:\.\d+)?\s*(?:x|×|by)\s*\d/i.test(t)) return true;
 return false;
}

// Does the title/description mention ANY human-readable size? This is broader and
// more lenient than deriveSize (which only extracts filter-grade sizes), because
// here we just need to know whether a size was communicated at all, including
// spelled-out sizes ("Medium to Large size"), ranges ("S/M"), region numerics
// ("US 6"), and "Size: M". Erring toward "yes" avoids nagging listings that
// clearly state a size.
function mentionsSize(title: string, desc: string | null): boolean {
 const t = `${title} ${(desc ?? "").replace(/<[^>]+>/g, " ")}`;
 // "Size: M", "Size 8", "sized large", "fits XL", "size US 6"
 if (/\b(?:size|sz|sized|sizing|fits)\b\s*[:#=-]?\s*(?:xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|\d|us|uk|eu|it|fr|jp|x-?small|x-?large|small|medium|large|petite|one|free|os)\b/i.test(t)) return true;
 // A spelled-out size next to the word "size": "Medium to Large size", "Large size"
 if (/\b(?:x-?small|x-?large|xx-?large|small|medium|large|petite|xxs|xs|s|m|l|xl|xxl)\b(?:\s+(?:to|and|&|\/|-|–)\s+\b(?:x-?small|x-?large|xx-?large|small|medium|large|xxs|xs|s|m|l|xl|xxl)\b)?\s+size\b/i.test(t)) return true;
 // A size range: "Medium to Large", "S/M", "M-L", "small-medium", "XS to S"
 if (/\b(?:xxs|xs|x-?small|x-?large|small|medium|large|s|m|l|xl|xxl)\s*(?:to|\/|-|–)\s*(?:xxs|xs|x-?small|x-?large|small|medium|large|s|m|l|xl|xxl)\b/i.test(t)) return true;
 // Standalone multi-letter sizes (safe, not common words): XS, XL, XXL, 2XL
 if (/\b(?:xxs|xs|xl|xxl|xxxl|2xl|3xl|osfm|oversized|one[\s-]?size|free[\s-]?size|true to size|plus[\s-]?size)\b/i.test(t)) return true;
 // Region numerics: US 6, EU 38, UK 10, IT 42
 if (/\b(?:us|uk|eu|it|fr|jp)\s*\d{1,2}(?:\.\d)?\b/i.test(t)) return true;
 return false;
}

export type QualityProduct = {
 id: number;
 storeSlug: string;
 storeName: string;
 title: string;
 url: string;
 // Sizing = a wearer size OR measurements (treated as one and the same).
 noSizing: boolean;
 noDescription: boolean;
 noImage: boolean;
};

export type StoreSummary = {
 storeSlug: string;
 storeName: string;
 total: number;
 flagged: number;
 noSizing: number;
 noDescription: number;
 noImage: number;
};

export type ListingQuality = { stores: StoreSummary[]; products: QualityProduct[] };

type ProductRow = {
 id: number; store_slug: string; store_name: string; title: string; description: string | null; size: string | null; image: string | null;
};

// Single source of truth for how a product is judged. Returns the flags plus the
// signals behind them (for QA / debugging).
export function evaluateListing(r: ProductRow) {
 const category = inferCategoryFromTitle(r.title);
 const noImage = !r.image || /placeholder/i.test(r.image);
 const noDescription = !r.description || r.description.replace(/<[^>]+>/g, "").trim().length < 20;

 const hasSize = !!deriveSize({ title: r.title, description: r.description, size: r.size } as DBProduct)
 || mentionsSize(r.title, r.description);
 const hasMeas = hasMeasurements(r.description);
 const looksLikeBag = BAG_SIGNAL.test(`${r.title} ${r.description ?? ""}`);
 // Resolve what kind of item this is. A bag-looking item in the "other-clothing"
 // catch-all is treated as a bag, not clothing.
 const isBag = BAG_CATS.has(category) || (category === "other-clothing" && looksLikeBag);
 const isClothing = CLOTHING_CATS.has(category) || (category === "other-clothing" && !looksLikeBag);
 const isShoe = SHOE_CATS.has(category);

 // Size and measurements are one and the same: an item is fine with EITHER (and
 // great with both). Flag only when a sized item (clothing, shoes, bags) has
 // neither. Jewelry / accessories / home need no sizing at all.
 const needsSizing = isClothing || isShoe || isBag;
 const noSizing = needsSizing && !hasSize && !hasMeas;

 return { category, noImage, noDescription, noSizing, hasSize, hasMeas, needsSizing };
}

export async function getListingQuality(storeSlug?: string): Promise<ListingQuality> {
 const sql = db();
 const rows = (storeSlug
 ? await sql`SELECT id, store_slug, store_name, title, description, size, image FROM products WHERE store_slug = ${storeSlug} ORDER BY id DESC`
 : await sql`SELECT id, store_slug, store_name, title, description, size, image FROM products ORDER BY store_slug, id DESC`) as ProductRow[];

 const byStore = new Map<string, StoreSummary>();
 const products: QualityProduct[] = [];

 for (const r of rows) {
 const { noImage, noDescription, noSizing } = evaluateListing(r);

 let s = byStore.get(r.store_slug);
 if (!s) {
  s = { storeSlug: r.store_slug, storeName: r.store_name, total: 0, flagged: 0, noSizing: 0, noDescription: 0, noImage: 0 };
  byStore.set(r.store_slug, s);
 }
 s.total++;

 if (noSizing || noDescription || noImage) {
  s.flagged++;
  if (noSizing) s.noSizing++;
  if (noDescription) s.noDescription++;
  if (noImage) s.noImage++;
  products.push({
  id: r.id,
  storeSlug: r.store_slug,
  storeName: r.store_name,
  title: r.title,
  url: `/products/${r.store_slug}-${r.id}`,
  noSizing, noDescription, noImage,
  });
 }
 }

 return {
 stores: [...byStore.values()].sort((a, b) => b.flagged - a.flagged),
 products: products.slice(0, 1500),
 };
}

export type QARow = {
 id: number; storeSlug: string; storeName: string; title: string; url: string;
 category: string; issues: string[]; descExcerpt: string;
};

// QA helper: every flagged listing WITH a description excerpt + inferred category,
// so false flags can be spotted and the detection patterns tuned. Read-only.
export async function getListingQualityQA(storeSlug?: string, limit = 2000): Promise<QARow[]> {
 const sql = db();
 const rows = (storeSlug
 ? await sql`SELECT id, store_slug, store_name, title, description, size, image FROM products WHERE store_slug = ${storeSlug} ORDER BY id DESC`
 : await sql`SELECT id, store_slug, store_name, title, description, size, image FROM products ORDER BY store_slug, id DESC`) as ProductRow[];

 const out: QARow[] = [];
 for (const r of rows) {
 const e = evaluateListing(r);
 if (!(e.noSizing || e.noDescription || e.noImage)) continue;
 const issues = [
 e.noSizing ? "size/measurements" : null,
 e.noDescription ? "description" : null,
 e.noImage ? "image" : null,
 ].filter(Boolean) as string[];
 const descExcerpt = (r.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 280);
 out.push({
 id: r.id, storeSlug: r.store_slug, storeName: r.store_name, title: r.title,
 url: `/products/${r.store_slug}-${r.id}`, category: e.category, issues, descExcerpt,
 });
 if (out.length >= limit) break;
 }
 return out;
}

export type FlaggedListing = {
 id: number; title: string; url: string;
 noSizing: boolean; noDescription: boolean; noImage: boolean;
};

// Flagged listings for a store that have NOT been alerted yet (newly added or
// never emailed). Used by the weekly digest so each listing is emailed once.
export async function getUnalertedFlaggedByStore(storeSlug: string): Promise<{ storeName: string; products: FlaggedListing[] }> {
 const sql = db();
 await ensureAlertColumn(sql);
 const rows = (await sql`
 SELECT id, store_slug, store_name, title, description, size, image
 FROM products
 WHERE store_slug = ${storeSlug} AND listing_alert_sent_at IS NULL
 ORDER BY id DESC
 `) as ProductRow[];

 let storeName = storeSlug;
 const products: FlaggedListing[] = [];
 for (const r of rows) {
 if (r.store_name) storeName = r.store_name;
 const e = evaluateListing(r);
 if (!(e.noSizing || e.noDescription || e.noImage)) continue;
 products.push({
 id: r.id,
 title: r.title,
 url: `/products/${r.store_slug}-${r.id}`,
 noSizing: e.noSizing, noDescription: e.noDescription, noImage: e.noImage,
 });
 }
 return { storeName, products };
}

// Mark listings as alerted so they're never emailed about again.
export async function markListingsAlerted(ids: number[]): Promise<void> {
 if (ids.length === 0) return;
 const sql = db();
 await ensureAlertColumn(sql);
 await sql`UPDATE products SET listing_alert_sent_at = NOW() WHERE id = ANY(${ids})`;
}

// Baseline: mark every current product as already-alerted WITHOUT emailing. Use
// before enabling the digest if you only want emails for listings added later
// (not the existing backlog). Returns how many rows were baselined.
export async function baselineExistingAsAlerted(): Promise<number> {
 const sql = db();
 await ensureAlertColumn(sql);
 const res = (await sql`
 UPDATE products SET listing_alert_sent_at = NOW() WHERE listing_alert_sent_at IS NULL
 `) as unknown as { count?: number };
 // neon returns rowCount on the result; fall back to a count query if absent.
 if (typeof res?.count === "number") return res.count;
 const rows = (await sql`SELECT COUNT(*)::int AS n FROM products WHERE listing_alert_sent_at IS NOT NULL`) as Array<{ n: number }>;
 return rows[0]?.n ?? 0;
}
