type BigCartelImage = {
 url: string;
 thumb?: string;
};

type BigCartelVariant = {
 id: string;
 name: string;
 price: number;
};

type BigCartelItem = {
 id: string;
 name?: string;
 url?: string;
 price?: number;
 on_sale?: boolean;
 sale_price?: number | null;
 sold_out?: boolean;
 images?: BigCartelImage[];
 description?: string | null;
 variants?: BigCartelVariant[];
};

export type BigCartelResult = {
 products: Array<{
 title: string;
 price: number;
 compareAtPrice: number | null;
 image: string | null;
 images: string[];
 externalUrl: string;
 description: string | null;
 }>;
 skippedCount: number;
};

/**
 * Fetches and parses products from a Big Cartel store's public JSON API.
 * No API key required. Big Cartel's product feed is publicly accessible.
 * @param storeSlug - The store's Big Cartel slug (e.g. "kikiddesignandconsign")
 * @param storeName - Display name to tag products with
 */
export async function parseBigCartelJSON(
 storeSlug: string,
 storeName: string
): Promise<BigCartelResult> {
 const apiUrl = `https://api.bigcartel.com/${storeSlug}/products.json`;

 const response = await fetch(apiUrl, {
 headers: {
 "User-Agent": "VYA-Sync/1.0",
 Accept: "application/json",
 },
 next: { revalidate: 0 },
 });

 if (!response.ok) {
 throw new Error(
 `Failed to fetch Big Cartel products: ${response.status} ${response.statusText}`
 );
 }

 const items: BigCartelItem[] = await response.json();
 const products: BigCartelResult["products"] = [];
 let skippedCount = 0;

 for (const item of items) {
 const title = item.name?.trim();
 if (!title) continue;

 if (item.sold_out) {
 skippedCount++;
 continue;
 }

 // Price: prefer sale price when on sale, otherwise regular price
 const originalPrice = item.price ?? 0;
 const isOnSale = item.on_sale && item.sale_price != null && item.sale_price > 0;
 const price = isOnSale ? item.sale_price! : originalPrice;
 const compareAtPrice = isOnSale && originalPrice > price ? originalPrice : null;
 if (price <= 0) continue;

 if (!item.url) continue;

 const images = (item.images ?? [])
 .map((img) => img.url)
 .filter((u): u is string => !!u);
 const image = images[0] ?? null;

 products.push({
 title,
 price,
 compareAtPrice,
 image,
 images,
 externalUrl: item.url,
 description: item.description ?? null,
 });
 }

 return { products, skippedCount };
}
