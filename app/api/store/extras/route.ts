import { NextRequest, NextResponse } from "next/server";
import { getStoreActivity } from "@/app/lib/store-extras-db";
import { getListingQuality } from "@/app/lib/listing-quality-db";
import { resolveStoreSlug } from "@/app/lib/storeAuth";

export const dynamic = "force-dynamic";

// GET /api/store/extras. Free-layer store features (listing quality + activity),
// built only from the store's own data. Listing quality scans live products, so
// it always reflects the latest sync.
export async function GET(request: NextRequest) {
 const storeSlug = await resolveStoreSlug(request);
 if (!storeSlug) return NextResponse.json({ error: "Not a registered store partner" }, { status: 403 });

 try {
 const [quality, activity] = await Promise.all([
 getListingQuality(storeSlug),
 getStoreActivity(storeSlug),
 ]);
 const summary = quality.stores[0] ?? null;
 // Return every flagged listing (capped high) so the store can work through them
 // all, not just a preview slice.
 const listing = summary
 ? { ...summary, products: quality.products.slice(0, 500) }
 : null;
 return NextResponse.json({ listing, activity });
 } catch (err) {
 console.error("[store/extras] error:", err);
 return NextResponse.json({ listing: null, activity: [] });
 }
}
