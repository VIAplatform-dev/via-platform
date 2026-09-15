import { brands } from "./brandData";

/**
 * Compute a composite ranking score for a product.
 *
 * Designed for a curated vintage/secondhand platform where engagement data
 * is sparse. When clicks/favorites exist they dominate, but for zero-
 * engagement products the score is driven by listing quality (images),
 * moderate brand recognition, and price attractiveness, NOT just brand
 * name alone.
 *
 * Score components (with max contribution):
 * 1. Engagement: clicks, favorites, conversions (uncapped, ×5)
 * 2. Images: more photos = better listing (0–25)
 * 3. Recency: small freshness nudge (0–12)
 * 4. Brand: light boost, not dominant (0–8)
 * 5. Price: mid-range vintage sweet spot (0–8)
 */

const TIER1_BRANDS = new Set([
 "chanel", "hermes", "louis-vuitton", "dior", "prada",
 "bottega-veneta", "celine", "saint-laurent",
]);

const TIER2_BRANDS = new Set([
 "gucci", "fendi", "balenciaga", "valentino", "givenchy",
 "loewe", "miu-miu", "burberry", "versace",
]);

const TIER3_BRANDS = new Set(
 brands.map((b) => b.slug).filter((s) => !TIER1_BRANDS.has(s) && !TIER2_BRANDS.has(s))
);

export type RankingInput = {
 engagementScore: number;
 syncedAt: Date | string;
 imageCount: number;
 brandSlug: string | null;
 price: number;
 title?: string;
};

export function computeProductScore(input: RankingInput): number {
 let score = 0;

 // ── 1. Engagement (strongest signal when available) ──
 // Weighted heavily so any product with real clicks always ranks above
 // zero-click products regardless of image count, brand, or price.
 score += input.engagementScore * 50;

 // ── 2. Image quality (0–25) ──
 // This is the biggest quality signal for zero-engagement products.
 // Items with more photos are better-curated listings and look better
 // when browsing. Heavily reward 3+ images.
 if (input.imageCount >= 5) score += 25;
 else if (input.imageCount >= 4) score += 22;
 else if (input.imageCount >= 3) score += 18;
 else if (input.imageCount >= 2) score += 10;
 else if (input.imageCount >= 1) score += 3;

 // ── 3. Recency (0–12) ──
 // Small nudge for fresh inventory. Kept low because synced_at
 // updates on every sync cycle, so it's not true "new arrival" date.
 const msAge = Date.now() - new Date(input.syncedAt).getTime();
 const daysOld = msAge / (1000 * 60 * 60 * 24);
 score += Math.max(0, 12 * Math.exp(-daysOld / 14));

 // ── 4. Brand recognition (0–8) ──
 // Light touch: brand is a signal but shouldn't dominate.
 // A great unbranded piece should rank close to a branded one.
 if (input.brandSlug) {
 if (TIER1_BRANDS.has(input.brandSlug)) score += 8;
 else if (TIER2_BRANDS.has(input.brandSlug)) score += 5;
 else if (TIER3_BRANDS.has(input.brandSlug)) score += 3;
 }

 // ── 5. Price sweet spot (0–8) ──
 if (input.price >= 50 && input.price <= 600) {
 score += 8;
 } else if (input.price >= 30 && input.price < 50) {
 score += 5;
 } else if (input.price > 600 && input.price <= 1200) {
 score += 5;
 } else if (input.price > 1200) {
 score += 2;
 }

 // ── 6. Men's item penalty ──
 // VYA's audience is primarily women's vintage/secondhand. Demote
 // items with men's keywords so they appear further down.
 if (input.title) {
 const t = input.title.toLowerCase();
 if (/\bmen'?s?\b/.test(t) || /\bhomme\b/.test(t)) {
 score -= 30;
 }
 }

 return Math.round(score * 100) / 100;
}

/**
 * Diversity-aware reordering.
 *
 * After scoring, pure score-sort clusters items from the same store
 * together (because they share similar brand/image/recency traits).
 * This interleave ensures variety, no more than `maxConsecutive` items
 * from the same store appear in a row, while still respecting score
 * order as much as possible.
 */
export function diversityInterleave<T>(
 items: T[],
 getGroup: (item: T) => string,
 maxConsecutive: number = 2,
): T[] {
 if (items.length <= 1) return items;

 const result: T[] = [];
 const remaining = [...items]; // already sorted by score
 const recentGroups: string[] = []; // track last N groups added

 while (remaining.length > 0) {
 // Find the highest-scored item whose group hasn't appeared
 // too many times consecutively
 let picked = -1;
 for (let i = 0; i < remaining.length; i++) {
 const group = getGroup(remaining[i]);
 const consecutiveCount = countTrailing(recentGroups, group);
 if (consecutiveCount < maxConsecutive) {
 picked = i;
 break;
 }
 }

 // If all remaining items are from the same group, just take the top one
 if (picked === -1) picked = 0;

 const item = remaining.splice(picked, 1)[0];
 result.push(item);
 recentGroups.push(getGroup(item));
 // Only track the last few to keep it efficient
 if (recentGroups.length > maxConsecutive * 2) {
 recentGroups.shift();
 }
 }

 return result;
}

function countTrailing(arr: string[], value: string): number {
 let count = 0;
 for (let i = arr.length - 1; i >= 0; i--) {
 if (arr[i] === value) count++;
 else break;
 }
 return count;
}
