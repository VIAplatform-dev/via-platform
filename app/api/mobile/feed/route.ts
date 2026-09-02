import { NextResponse } from "next/server";
import { getInventory } from "@/app/lib/inventory";
import { formatPrice } from "@/app/lib/formatPrice";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 120;
const MAX_LIMIT = 300;

/**
 * The app's default home feed — newest arrivals across every visible store.
 *
 * The Shop tab used to call /api/search?q= for this, but that handler returns an
 * empty result for any query under two characters (route.ts: `if (!q || q.length
 * < 2)`), so the feed could never have contained anything. Search is a search,
 * not a listing.
 *
 * Same source as the web /browse grid — getInventory() — and the same product
 * shape /api/mobile/search returns, so ProductCard renders either without
 * caring which one it came from.
 */
export async function GET(request: Request) {
 const { searchParams } = new URL(request.url);
 const parsed = parseInt(searchParams.get("limit") ?? "", 10);
 const limit = Number.isNaN(parsed) ? DEFAULT_LIMIT : Math.min(Math.max(parsed, 1), MAX_LIMIT);

 const inventory = await getInventory();

 // Newest first. createdAt is optional on InventoryItem, so anything without one
 // sorts last rather than poisoning the comparison with NaN.
 const sorted = [...inventory].sort((a, b) => {
  const at = a.createdAt ? Date.parse(a.createdAt) : 0;
  const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
  return bt - at;
 });

 const products = sorted.slice(0, limit).map((item) => ({
  // InventoryItem.id is the composite "store-slug-12345"; the app wants the
  // numeric id and rebuilds the composite itself for the product route.
  id: Number(item.id.split("-").pop()),
  name: item.title,
  storeSlug: item.storeSlug,
  storeName: item.store,
  price: formatPrice(item.price, item.currency),
  image: item.image,
  images: item.images,
 }));

 return NextResponse.json({ products, designers: [], categories: [], stores: [] });
}
