import { NextResponse } from "next/server";
import { isApprovedRequest } from "@/app/lib/approval";
import { getProductById } from "@/app/lib/db";
import { deriveSize } from "@/app/lib/inventory";
import { formatPrice } from "@/app/lib/formatPrice";
import { stores } from "@/app/lib/stores";
import { getStoreProfile } from "@/app/lib/store-profile-db";
import { inferBroadCategory } from "@/app/lib/publicFilters";

export const dynamic = "force-dynamic";

/**
 * Public single-product endpoint for the mobile app.
 * Param: id = composite (e.g. "lei-vintage-42") or numeric DB id
 * Returns product details + the store's authenticity / shipping / return
 * policies so the app can render them in accordions.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
 if (!(await isApprovedRequest(request))) return NextResponse.json({ error: "Approval required", needsApproval: true }, { status: 403 });
 const { id: rawId } = await ctx.params;
 const numeric = /^\d+$/.test(rawId) ? parseInt(rawId, 10) : parseInt(rawId.split("-").pop() ?? "", 10);
 if (Number.isNaN(numeric)) {
 return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
 }

 const p = await getProductById(numeric);
 if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });

 let images: string[] = [];
 if (p.images) {
 try {
 const parsed = JSON.parse(p.images);
 if (Array.isArray(parsed) && parsed.length > 0) images = parsed;
 } catch {}
 }
 if (images.length === 0 && p.image) images = [p.image];

 // Store policies: WHAT THE SELLER WROTE first, then what VYA recorded at onboarding.
 //
 // This served the hardcoded text from app/lib/stores.ts and nothing else, so a seller could
 // rewrite her policies in Settings → Policies and the app's product page — which reads this
 // route — would still show the paragraph VYA typed for her when she joined.
 //
 // `authenticity` has no seller-editable field yet, so it stays curated; it is VYA's claim about
 // how the shop is vetted rather than the shop's promise to a buyer.
 const storeInfo = stores.find((s) => s.slug === p.store_slug);
 const profile = await getStoreProfile(String(p.store_slug)).catch(() => null);
 const storePolicies = {
  authenticity: (storeInfo as { authenticityPolicy?: string } | undefined)?.authenticityPolicy ?? null,
  shipping: profile?.policies?.shipping?.trim() || (storeInfo as { shippingPolicy?: string } | undefined)?.shippingPolicy || null,
  returns: profile?.policies?.returns?.trim() || (storeInfo as { returnPolicy?: string } | undefined)?.returnPolicy || null,
 };

 return NextResponse.json({
 id: p.id,
 compositeId: `${p.store_slug}-${p.id}`,
 title: p.title,
 description: p.description,
 price: Number(p.price),
 priceFormatted: formatPrice(Number(p.price), p.currency),
 currency: p.currency,
 compareAtPrice: p.compare_at_price != null ? Number(p.compare_at_price) : null,
 image: p.image,
 images,
 size: deriveSize(p),
 brand: p.product_type,
 category: inferBroadCategory(p.title ?? ""),
 variantId: p.variant_id,
 storeSlug: p.store_slug,
 storeName: p.store_name,
 storeWebsite: storeInfo?.website ?? null,
 externalUrl: p.external_url,
 collabsLink: p.collabs_link,
 storePolicies,
 });
}
