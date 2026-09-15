import { NextResponse } from "next/server";
import { getMobileUserId } from "@/app/lib/mobileAuth";
import { getUserFavoritedProducts, setProductFavorite } from "@/app/lib/favorites-db";
import { formatPrice } from "@/app/lib/formatPrice";

export const dynamic = "force-dynamic";

/** GET /api/mobile/favorites. The signed-in user's favorited products, shaped
 * for the app's ProductCard (live data when available, snapshot otherwise). */
export async function GET(request: Request) {
 const userId = getMobileUserId(request);
 if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const entries = await getUserFavoritedProducts(userId);
 const products = entries.map((e) => {
 const p = e.product;
 const snap = e.snapshot;
 const rawImages = (p?.images ?? snap?.images ?? null) as string | null;
 let images: string[] | undefined;
 if (rawImages) {
 try {
 const parsed = JSON.parse(rawImages);
 if (Array.isArray(parsed)) images = parsed;
 } catch {}
 }
 const price = p
 ? formatPrice(Number(p.price), p.currency)
 : formatPrice(Number(snap?.price ?? 0), "USD");
 return {
 id: e.productId,
 name: p?.title ?? snap?.title ?? "Item",
 price,
 image: p?.image ?? snap?.image ?? null,
 images,
 storeSlug: p?.store_slug ?? snap?.store_slug ?? "",
 storeName: p?.store_name ?? snap?.store_name ?? "",
 size: p?.size ?? snap?.size ?? null,
 soldOut: e.soldOut,
 };
 });
 return NextResponse.json({ products });
}

/** POST /api/mobile/favorites. Idempotently add/remove a favorite.
 * Body: { productId: number, favorited: boolean }. Writes to product_favorites,
 * which feeds the For-You ranking (favorites are the strongest signal). */
export async function POST(request: Request) {
 const userId = getMobileUserId(request);
 if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => ({}));
 const productId = Number(body?.productId);
 const favorited = body?.favorited === true;
 if (!productId || isNaN(productId)) {
 return NextResponse.json({ error: "productId required" }, { status: 400 });
 }

 await setProductFavorite(userId, productId, favorited);
 return NextResponse.json({ ok: true, productId, favorited });
}
