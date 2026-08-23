import type { CategorySlug } from "./categoryMap.ts";

export type StoreProduct = {
 id: string;
 name: string;
 price: string;
 currency?: string;
 category: CategorySlug; // ✅ slug ONLY
 storeSlug: string;
 externalUrl?: string;
 image?: string;
 images?: string[];
 imageColor?: string | null; // colour read off the image by vision (normalized)
 size?: string | null;
 syncedAt?: string; // ISO timestamp from DB
 createdAt?: string; // ISO timestamp when first added to DB
};
