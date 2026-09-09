import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { reorderCollections } from "@/app/lib/db/collections";

export const dynamic = "force-dynamic";

// POST { order: string[] } — the seller's own order for her collections, top to bottom.
//
// This is not decoration: a "shop by collection" row on her storefront has room for however many
// tiles her theme drew, so WHICH collections appear there is exactly this order.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const seller = await getSellerBySlug(slug);
 if (!seller) return NextResponse.json({ error: "Not found" }, { status: 404 });
 const body = await request.json().catch(() => ({}));
 const order = Array.isArray(body?.order) ? (body.order as unknown[]).filter((v): v is string => typeof v === "string") : [];
 if (!order.length) return NextResponse.json({ error: "Nothing to order." }, { status: 400 });
 await reorderCollections(seller.id, order);
 return NextResponse.json({ ok: true, ordered: order.length });
}
