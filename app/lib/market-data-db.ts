import { neon } from "@neondatabase/serverless";
import { brands, WHOLE_WORD_ALIASES } from "./brandData.ts";
import { aliasMatches } from "./data-layer/brands.ts";

export function inferBrandFromTitle(title: string): string | null {
 const lower = title.toLowerCase();
 for (const brand of brands) {
 for (const kw of brand.keywords) {
 // Whole-word for substrings-of-common-words (etro→retro, boss→embossed) and
 // short aliases; substring otherwise. Shared logic keeps this matcher in sync
 // with resolveBrand / designerPatterns / detectBrand.
 if (aliasMatches(lower, kw, WHOLE_WORD_ALIASES.has(kw))) return brand.label;
 }
 }
 return null;
}

function getDatabaseUrl() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return url;
}

export type MarketSummary = {
 totalSold: number;
 totalGmv: number;
 avgDaysToSell: number | null;
 avgPriceRealization: number | null; // final / original price ratio
 periodDays: number;
};

export type DesignerStat = {
 designer: string;
 itemsSold: number;
 avgPrice: number;
 avgDaysToSell: number | null;
 totalGmv: number;
 minPrice: number;
 maxPrice: number;
};

export type BrandStat = {
 brand: string;
 items: number;
 avgPrice: number;
 minPrice: number;
 maxPrice: number;
 totalValue: number;
 clicks: number;
 hearts: number;
 purchases: number;
};

export type CategoryStat = {
 category: string;
 items: number;
 avgPrice: number;
 minPrice: number;
 maxPrice: number;
 totalValue: number;
 clicks: number;
 hearts: number;
 purchases: number;
};

export type PriceTierStat = {
 tier: string;
 count: number;
 avgDaysToSell: number | null;
 totalGmv: number;
 avgPrice: number;
};

export type StoreVelocityStat = {
 storeSlug: string;
 storeName: string;
 itemsSold: number;
 avgDaysToSell: number | null;
 totalGmv: number;
};

export type WeeklyTrendPoint = {
 week: string;
 itemsSold: number;
 gmv: number;
};

export type RecentSale = {
 id: number;
 storeSlug: string;
 storeName: string;
 title: string;
 designer: string | null;
 finalPrice: number;
 originalPrice: number | null;
 currency: string;
 image: string | null;
 size: string | null;
 clickCount: number;
 favoriteCount: number;
 daysListed: number | null;
 soldAt: string;
};

export type PriceChangeEntry = {
 id: number;
 storeSlug: string;
 title: string;
 designer: string | null;
 oldPrice: number;
 newPrice: number;
 priceDelta: number;
 currency: string;
 changedAt: string;
};

export async function getMarketSummary(days = 30): Promise<MarketSummary> {
 const sql = neon(getDatabaseUrl());
 const [row] = await sql`
 SELECT
 COUNT(*)::int AS total_sold,
 COALESCE(SUM(final_price), 0) AS total_gmv,
 AVG(days_listed) AS avg_days,
 AVG(CASE WHEN original_price > 0 THEN final_price / original_price END) AS avg_realization
 FROM sold_items
 WHERE sold_at >= NOW() - (${days} || ' days')::interval
 `;
 return {
 totalSold: Number(row.total_sold),
 totalGmv: Number(row.total_gmv),
 avgDaysToSell: row.avg_days != null ? Math.round(Number(row.avg_days) * 10) / 10 : null,
 avgPriceRealization: row.avg_realization != null ? Math.round(Number(row.avg_realization) * 1000) / 1000 : null,
 periodDays: days,
 };
}

export async function getTopDesigners(days = 90, limit = 25): Promise<DesignerStat[]> {
 const sql = neon(getDatabaseUrl());
 const rows = await sql`
 SELECT
 designer,
 SUM(items_sold)::int AS items_sold,
 AVG(avg_price) AS avg_price,
 AVG(avg_days) AS avg_days,
 SUM(total_gmv) AS total_gmv,
 MIN(min_price) AS min_price,
 MAX(max_price) AS max_price
 FROM (
 -- Source 1: sold_items (products that dropped off the feed)
 SELECT
 designer,
 COUNT(*)::int AS items_sold,
 AVG(final_price) AS avg_price,
 AVG(days_listed) AS avg_days,
 SUM(final_price) AS total_gmv,
 MIN(final_price) AS min_price,
 MAX(final_price) AS max_price
 FROM sold_items
 WHERE designer IS NOT NULL
 AND designer != ''
 AND sold_at >= NOW() - (${days} || ' days')::interval
 GROUP BY designer

 UNION ALL

 -- Source 2: conversions matched to current products (for designer data when sold_items is sparse)
 SELECT
 COALESCE(NULLIF(p.brand, ''), NULLIF(p.product_type, '')) AS designer,
 COUNT(*)::int AS items_sold,
 AVG((item->>'price')::numeric) AS avg_price,
 NULL::numeric AS avg_days,
 SUM((item->>'price')::numeric) AS total_gmv,
 MIN((item->>'price')::numeric) AS min_price,
 MAX((item->>'price')::numeric) AS max_price
 FROM conversions c
 CROSS JOIN LATERAL jsonb_array_elements(c.items) AS t(item)
 JOIN products p
 ON LOWER(TRIM(item->>'productName')) = LOWER(TRIM(p.title))
 AND c.store_slug = p.store_slug
 WHERE c.order_total > 0
 AND (c.returned IS NULL OR c.returned = false)
 AND c.items IS NOT NULL
 AND jsonb_array_length(c.items) > 0
 AND (item->>'productName') IS NOT NULL
 AND LENGTH(item->>'productName') > 3
 AND (item->>'productName') NOT ILIKE '%shopify collabs%'
 AND (item->>'productName') NOT ILIKE '%order via%'
 AND COALESCE(NULLIF(p.brand, ''), NULLIF(p.product_type, '')) IS NOT NULL
 AND c.timestamp >= NOW() - (${days} || ' days')::interval
 GROUP BY COALESCE(NULLIF(p.brand, ''), NULLIF(p.product_type, ''))

 UNION ALL

 -- Source 3: current live inventory by brand (always populated from products table)
 SELECT
 COALESCE(NULLIF(brand, ''), NULLIF(product_type, '')) AS designer,
 COUNT(*)::int AS items_sold,
 AVG(price) AS avg_price,
 NULL::numeric AS avg_days,
 SUM(price) AS total_gmv,
 MIN(price) AS min_price,
 MAX(price) AS max_price
 FROM products
 WHERE COALESCE(NULLIF(brand, ''), NULLIF(product_type, '')) IS NOT NULL
 AND price > 0
 GROUP BY COALESCE(NULLIF(brand, ''), NULLIF(product_type, ''))
 ) combined
 WHERE designer IS NOT NULL AND designer != ''
 GROUP BY designer
 ORDER BY items_sold DESC, total_gmv DESC
 LIMIT ${limit}
 `;
 return rows.map((r) => ({
 designer: r.designer as string,
 itemsSold: Number(r.items_sold),
 avgPrice: Math.round(Number(r.avg_price) * 100) / 100,
 avgDaysToSell: r.avg_days != null ? Math.round(Number(r.avg_days) * 10) / 10 : null,
 totalGmv: Math.round(Number(r.total_gmv) * 100) / 100,
 minPrice: Number(r.min_price),
 maxPrice: Number(r.max_price),
 }));
}

export async function getTopBrands(limit = 50): Promise<BrandStat[]> {
 const sql = neon(getDatabaseUrl());
 // Fetch per-product data — brand is inferred from title in TypeScript
 // because stores set Shopify vendor to their store name, not the designer
 const rows = await sql`
 SELECT
 p.title,
 p.price,
 COALESCE(pv_agg.views, 0)::int AS clicks,
 COALESCE(fav_agg.favs, 0)::int AS hearts,
 COALESCE(pur_agg.purchases, 0)::int AS purchases
 FROM products p
 LEFT JOIN (
 SELECT product_id, COUNT(*)::int AS views FROM product_views GROUP BY product_id
 ) pv_agg ON pv_agg.product_id = (p.store_slug || '-' || p.id::text)
 LEFT JOIN (
 SELECT product_id, COUNT(*)::int AS favs FROM product_favorites GROUP BY product_id
 ) fav_agg ON fav_agg.product_id = p.id
 LEFT JOIN (
 SELECT cl.product_id, COUNT(DISTINCT c.conversion_id)::int AS purchases
 FROM conversions c
 JOIN clicks cl ON c.via_click_id = cl.click_id
 WHERE c.order_total > 0 AND (c.returned IS NULL OR c.returned = false)
 GROUP BY cl.product_id
 ) pur_agg ON pur_agg.product_id = (p.store_slug || '-' || p.id::text)
 WHERE p.price > 0
 `;

 const merged = new Map<string, BrandStat>();
 for (const r of rows) {
 const label = inferBrandFromTitle(r.title as string);
 if (!label) continue;
 const price = Number(r.price);
 const existing = merged.get(label);
 if (existing) {
 const newItems = existing.items + 1;
 const newTotal = existing.totalValue + price;
 merged.set(label, {
 brand: label,
 items: newItems,
 avgPrice: Math.round((newTotal / newItems) * 100) / 100,
 minPrice: Math.min(existing.minPrice, price),
 maxPrice: Math.max(existing.maxPrice, price),
 totalValue: Math.round(newTotal * 100) / 100,
 clicks: existing.clicks + Number(r.clicks),
 hearts: existing.hearts + Number(r.hearts),
 purchases: existing.purchases + Number(r.purchases),
 });
 } else {
 merged.set(label, {
 brand: label,
 items: 1,
 avgPrice: Math.round(price * 100) / 100,
 minPrice: price,
 maxPrice: price,
 totalValue: Math.round(price * 100) / 100,
 clicks: Number(r.clicks),
 hearts: Number(r.hearts),
 purchases: Number(r.purchases),
 });
 }
 }

 return [...merged.values()]
 .sort((a, b) => b.clicks - a.clicks || b.items - a.items)
 .slice(0, limit);
}

// Maps any Shopify product_type value → VYA canonical category label.
// Returns null for non-category values that should be excluded.
export function normalizeCategory(raw: string): string | null {
 const lower = raw.toLowerCase().trim();

 // Hard blocklist — business model labels, not product categories
 const BLOCKED = new Set([
 'consignment', 'gift card', 'gift cards', 'authentication', 'authentication fee',
 'item authentication', 'listing fee', 'service', 'fee', 'fees', 'new arrivals',
 'new arrival', 'sale', 'clearance', 'misc', 'other', 'unknown', 'test', 'sample',
 'vintage', 'pre-owned', 'pre owned', 'resale',
 ]);
 if (BLOCKED.has(lower)) return null;

 // Dresses
 if (/\b(dress|dresses|gown|gowns|midi dress|mini dress|maxi dress)\b/.test(lower)) return 'Dresses';

 // Tops (checked before coats/jackets to avoid "vest" conflicts)
 if (/\b(top|tops|blouse|blouses|shirt|shirts|tee|tees|t-shirt|t-shirts|tank|tanks|cami|camis|camisole|bodysuit|bodysuits|tube top|crop top|corset|bustier|halter)\b/.test(lower)) return 'Tops';

 // Sweaters
 if (/\b(sweater|sweaters|cardigan|cardigans|knit|knitwear|pullover|jumper|jumpers|hoodie|hoodies|sweatshirt|sweatshirts|crewneck|turtleneck|polo)\b/.test(lower)) return 'Sweaters';

 // Coats & Jackets
 if (/\b(jacket|jackets|coat|coats|blazer|blazers|trench|trenches|puffer|bombers?|bomber|leather jacket|denim jacket|windbreaker|cape|capes|poncho|ponchos|vest|vests|gilet|shearling|fur coat|pea coat)\b/.test(lower)) return 'Coats & Jackets';

 // Jeans (before pants to catch "jeans" specifically)
 if (/\b(jean|jeans|denim pants|denim trouser)\b/.test(lower)) return 'Jeans';

 // Pants
 if (/\b(pant|pants|trouser|trousers|legging|leggings|culottes?|wide leg|palazzo|cargo pant|chino|chinos|slacks|jogger|joggers)\b/.test(lower)) return 'Pants';

 // Skirts
 if (/\b(skirt|skirts|mini skirt|midi skirt|maxi skirt)\b/.test(lower)) return 'Skirts';

 // Shorts
 if (/\b(short|shorts|bermuda|hot pants)\b/.test(lower)) return 'Shorts';

 // Jumpsuits
 if (/\b(jumpsuit|jumpsuits|romper|rompers|playsuit|playsuits|overalls?)\b/.test(lower)) return 'Jumpsuits';

 // Bags
 if (/\b(bag|bags|handbag|handbags|tote|totes|clutch|clutches|crossbody|satchel|satchels|baguette|bucket bag|shoulder bag|backpack|backpacks|pouch|pouches|purse|purses|wallet|wallets|wristlet|wristlets|mini bag|belt bag|fanny pack)\b/.test(lower)) return 'Bags';

 // Shoes
 if (/\b(shoe|shoes|heel|heels|boot|boots|bootie|booties|sandal|sandals|sneaker|sneakers|loafer|loafers|flat|flats|mule|mules|pump|pumps|slingback|espadrille|espadrilles|wedge|wedges|oxford|derbies|derby|brogue|brogues|kitten heel|stiletto|platforms?|trainers?|slip-?on|ballet flat|ballet flats)\b/.test(lower)) return 'Shoes';

 // Accessories
 if (/\b(accessori|scarf|scarves|hat|hats|cap|caps|belt|belts|jewelry|jewellery|jewels|necklace|necklaces|earring|earrings|ring|rings|bracelet|bracelets|sunglasses|glasses|watch|watches|glove|gloves|hair|headband|brooch|pin|pins|charm|keychain)\b/.test(lower)) return 'Accessories';

 // Home
 if (/\b(home|decor|candle|candles|vase|vases|pillow|pillows|throw|blanket|art|artwork|frame|dish|dishes|furniture|mirror|lamp|lamps|rug|rugs|tableware|kitchenware|ceramics?)\b/.test(lower)) return 'Home';

 return null; // don't show unrecognized product types
}

// ── Category families ───────────────────────────────────────────────────────────────────────────
// The tier ABOVE normalizeCategory's buckets. A shopper looking for a skirt starts at "Clothing",
// not at a flat list of thirteen buckets — so a storefront menu can read Clothing → Tops · Skirts
// while the buckets underneath stay exactly the ones every other number on VYA is counted by.
// Ordered as a shopper scans: what you wear, then what you carry, then the rest.
export const CATEGORY_FAMILIES: { label: string; members: string[] }[] = [
 { label: "Clothing", members: ["Tops", "Sweaters", "Dresses", "Skirts", "Pants", "Jeans", "Shorts", "Jumpsuits", "Coats & Jackets"] },
 { label: "Bags", members: ["Bags"] },
 { label: "Shoes", members: ["Shoes"] },
 { label: "Accessories", members: ["Accessories"] },
 { label: "Home", members: ["Home"] },
];

/** The family a canonical bucket belongs to ("Skirts" → "Clothing"). Null for anything unrecognized. */
export function categoryFamily(bucket: string | null | undefined): string | null {
 if (!bucket) return null;
 return CATEGORY_FAMILIES.find((f) => f.members.includes(bucket))?.label ?? null;
}

/** The buckets a family covers ("clothing" → ["Tops", …]). Accepts a label or its slug. Empty if unknown. */
export function familyMembers(labelOrSlug: string): string[] {
 const k = labelOrSlug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
 return CATEGORY_FAMILIES.find((f) => f.label.toLowerCase().replace(/[^a-z0-9]+/g, "-") === k)?.members ?? [];
}

export async function getTopCategories(limit = 50): Promise<CategoryStat[]> {
 const sql = neon(getDatabaseUrl());
 const rows = await sql`
 WITH
 pv_agg AS (
 SELECT product_id, COUNT(*)::int AS views FROM product_views GROUP BY product_id
 ),
 fav_agg AS (
 SELECT product_id, COUNT(*)::int AS favs FROM product_favorites GROUP BY product_id
 ),
 pur_by_cat AS (
 SELECT p2.product_type, COUNT(DISTINCT c.conversion_id)::int AS purchases
 FROM conversions c
 JOIN clicks cl ON c.via_click_id = cl.click_id
 JOIN products p2 ON cl.product_id = (p2.store_slug || '-' || p2.id::text)
 WHERE c.order_total > 0
 AND (c.returned IS NULL OR c.returned = false)
 AND p2.product_type IS NOT NULL AND p2.product_type != ''
 GROUP BY p2.product_type
 )
 SELECT
 p.product_type AS category,
 COUNT(DISTINCT p.id)::int AS items,
 AVG(p.price) AS avg_price,
 MIN(p.price) AS min_price,
 MAX(p.price) AS max_price,
 SUM(p.price) AS total_value,
 COALESCE(SUM(pv_agg.views), 0)::int AS clicks,
 COALESCE(SUM(fav_agg.favs), 0)::int AS hearts,
 COALESCE(MAX(pc.purchases), 0)::int AS purchases
 FROM products p
 LEFT JOIN pv_agg ON pv_agg.product_id = (p.store_slug || '-' || p.id::text)
 LEFT JOIN fav_agg ON fav_agg.product_id = p.id
 LEFT JOIN pur_by_cat pc ON pc.product_type = p.product_type
 WHERE p.product_type IS NOT NULL AND p.product_type != '' AND p.price > 0
 GROUP BY p.product_type
 ORDER BY clicks DESC, items DESC
 LIMIT 300
 `;

 // Normalize and merge duplicates (e.g. "Dress"/"Dresses"/"dress" → "Dress")
 const merged = new Map<string, CategoryStat>();
 for (const r of rows) {
 const normalized = normalizeCategory(r.category as string);
 if (!normalized) continue;
 const existing = merged.get(normalized);
 if (existing) {
 const newItems = existing.items + Number(r.items);
 const newTotal = existing.totalValue + Number(r.total_value);
 merged.set(normalized, {
 category: normalized,
 items: newItems,
 avgPrice: newItems > 0 ? Math.round((newTotal / newItems) * 100) / 100 : 0,
 minPrice: Math.min(existing.minPrice, Number(r.min_price)),
 maxPrice: Math.max(existing.maxPrice, Number(r.max_price)),
 totalValue: Math.round(newTotal * 100) / 100,
 clicks: existing.clicks + Number(r.clicks),
 hearts: existing.hearts + Number(r.hearts),
 purchases: existing.purchases + Number(r.purchases),
 });
 } else {
 const totalValue = Math.round(Number(r.total_value) * 100) / 100;
 const items = Number(r.items);
 merged.set(normalized, {
 category: normalized,
 items,
 avgPrice: Math.round(Number(r.avg_price) * 100) / 100,
 minPrice: Number(r.min_price),
 maxPrice: Number(r.max_price),
 totalValue,
 clicks: Number(r.clicks),
 hearts: Number(r.hearts),
 purchases: Number(r.purchases),
 });
 }
 }

 return [...merged.values()]
 .sort((a, b) => b.clicks - a.clicks || b.items - a.items)
 .slice(0, limit);
}

export async function getPriceTierBreakdown(days = 90): Promise<PriceTierStat[]> {
 const sql = neon(getDatabaseUrl());
 const rows = await sql`
 SELECT
 CASE
 WHEN final_price < 100 THEN 'Under $100'
 WHEN final_price < 500 THEN '$100–$500'
 WHEN final_price < 1000 THEN '$500–$1,000'
 WHEN final_price < 5000 THEN '$1,000–$5,000'
 ELSE '$5,000+'
 END AS tier,
 CASE
 WHEN final_price < 100 THEN 1
 WHEN final_price < 500 THEN 2
 WHEN final_price < 1000 THEN 3
 WHEN final_price < 5000 THEN 4
 ELSE 5
 END AS sort_order,
 COUNT(*)::int AS count,
 AVG(days_listed) AS avg_days,
 SUM(final_price) AS total_gmv,
 AVG(final_price) AS avg_price
 FROM sold_items
 WHERE sold_at >= NOW() - (${days} || ' days')::interval
 GROUP BY tier, sort_order
 ORDER BY sort_order
 `;
 return rows.map((r) => ({
 tier: r.tier as string,
 count: Number(r.count),
 avgDaysToSell: r.avg_days != null ? Math.round(Number(r.avg_days) * 10) / 10 : null,
 totalGmv: Math.round(Number(r.total_gmv) * 100) / 100,
 avgPrice: Math.round(Number(r.avg_price) * 100) / 100,
 }));
}

export async function getStoreVelocity(days = 90): Promise<StoreVelocityStat[]> {
 const sql = neon(getDatabaseUrl());
 const rows = await sql`
 SELECT
 store_slug,
 store_name,
 COUNT(*)::int AS items_sold,
 AVG(days_listed) AS avg_days,
 SUM(final_price) AS total_gmv
 FROM sold_items
 WHERE sold_at >= NOW() - (${days} || ' days')::interval
 GROUP BY store_slug, store_name
 ORDER BY items_sold DESC
 `;
 return rows.map((r) => ({
 storeSlug: r.store_slug as string,
 storeName: r.store_name as string,
 itemsSold: Number(r.items_sold),
 avgDaysToSell: r.avg_days != null ? Math.round(Number(r.avg_days) * 10) / 10 : null,
 totalGmv: Math.round(Number(r.total_gmv) * 100) / 100,
 }));
}

export async function getWeeklyTrend(weeks = 12): Promise<WeeklyTrendPoint[]> {
 const sql = neon(getDatabaseUrl());
 const rows = await sql`
 SELECT
 DATE_TRUNC('week', sold_at)::date::text AS week,
 COUNT(*)::int AS items_sold,
 SUM(final_price) AS gmv
 FROM sold_items
 WHERE sold_at >= NOW() - (${weeks * 7} || ' days')::interval
 GROUP BY DATE_TRUNC('week', sold_at)
 ORDER BY DATE_TRUNC('week', sold_at) ASC
 `;
 return rows.map((r) => ({
 week: r.week as string,
 itemsSold: Number(r.items_sold),
 gmv: Math.round(Number(r.gmv) * 100) / 100,
 }));
}

export async function getRecentSales(limit = 50): Promise<RecentSale[]> {
 const sql = neon(getDatabaseUrl());
 const rows = await sql`
 SELECT * FROM sold_items
 ORDER BY sold_at DESC
 LIMIT ${limit}
 `;
 return rows.map((r) => ({
 id: r.id as number,
 storeSlug: r.store_slug as string,
 storeName: r.store_name as string,
 title: r.title as string,
 designer: r.designer as string | null,
 finalPrice: Number(r.final_price),
 originalPrice: r.original_price != null ? Number(r.original_price) : null,
 currency: r.currency as string,
 image: r.image as string | null,
 size: r.size as string | null,
 clickCount: Number(r.click_count),
 favoriteCount: Number(r.favorite_count),
 daysListed: r.days_listed != null ? Number(r.days_listed) : null,
 soldAt: r.sold_at as string,
 }));
}

export async function getRecentPriceChanges(limit = 50, dropsOnly = true): Promise<PriceChangeEntry[]> {
 const sql = neon(getDatabaseUrl());
 const rows = dropsOnly
 ? await sql`
 SELECT *, (new_price - old_price) AS price_delta
 FROM price_history
 WHERE new_price < old_price
 ORDER BY changed_at DESC
 LIMIT ${limit}
 `
 : await sql`
 SELECT *, (new_price - old_price) AS price_delta
 FROM price_history
 ORDER BY changed_at DESC
 LIMIT ${limit}
 `;
 return rows.map((r) => ({
 id: r.id as number,
 storeSlug: r.store_slug as string,
 title: r.title as string,
 designer: r.designer as string | null,
 oldPrice: Number(r.old_price),
 newPrice: Number(r.new_price),
 priceDelta: Number(r.price_delta),
 currency: r.currency as string,
 changedAt: r.changed_at as string,
 }));
}

export async function getTotalSoldItems(): Promise<number> {
 const sql = neon(getDatabaseUrl());
 const [row] = await sql`SELECT COUNT(*)::int AS cnt FROM sold_items`;
 return Number(row.cnt);
}
