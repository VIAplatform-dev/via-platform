import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listHolds } from "@/app/lib/holds-db";

export const dynamic = "force-dynamic";

// GET — every piece the store is holding for someone, soonest to lapse first, with the ones that
// lapse today and this week picked out for Home. Web session or the phone's JWT.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const seller = await getSellerBySlug(slug);
 if (!seller) return NextResponse.json({ holds: [], today: [], thisWeek: [] });
 return NextResponse.json(await listHolds(seller.id));
}
