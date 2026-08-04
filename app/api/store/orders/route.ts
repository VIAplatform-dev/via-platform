import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listSellerOrders } from "@/app/lib/db/orders";
import { getImportedOrders } from "@/app/lib/imported-orders-db";

export const dynamic = "force-dynamic";

// GET — the acting store's orders: live VYA sales + any imported historical orders.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const seller = await getSellerBySlug(slug);
 const [orders, imported] = await Promise.all([
 seller ? listSellerOrders(seller.id) : Promise.resolve([]),
 getImportedOrders(slug).catch(() => []),
 ]);
 return NextResponse.json({ ok: true, orders, imported });
}
