import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { stores } from "@/app/lib/stores";
import { getStorefrontBySlug } from "@/app/lib/storefront-db";
import { getListingsByStore } from "@/app/lib/listings-db";
import { getShippingSettings, hasShipFrom } from "@/app/lib/store-shipping-db";

export const dynamic = "force-dynamic";

// Has this store set up yet? Onboarded = storefront published OR has any listings.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const [sf, listings, shipping] = await Promise.all([
 getStorefrontBySlug(slug).catch(() => null),
 getListingsByStore(slug, false).catch(() => []),
 getShippingSettings(slug).catch(() => null),
 ]);
 const onboarded = Boolean(sf?.enabled) || listings.length > 0;
 // A ship-from address is required to publish live listings (so we can quote/floor shipping and buy
 // labels) — surface it so the dashboard can prompt for it before the store hits the publish wall.
 const shipFromSet = shipping ? hasShipFrom(shipping) : false;
 const store = stores.find((s) => s.slug === slug);
 return NextResponse.json({ ok: true, onboarded, shipFromSet, storeName: store?.name || slug });
}
