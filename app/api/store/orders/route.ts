import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listSellerOrders, listPickupOrderIds } from "@/app/lib/db/orders";
import { getImportedOrders } from "@/app/lib/imported-orders-db";
import { groupIntoParcels } from "@/app/lib/parcels-core";

export const dynamic = "force-dynamic";

// GET — the acting store's orders: live VYA sales + any imported historical orders.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const seller = await getSellerBySlug(slug);
 const [orders, imported, pickupIds] = await Promise.all([
 seller ? listSellerOrders(seller.id) : Promise.resolve([]),
 getImportedOrders(slug).catch(() => []),
 // Collections, so the list can say so and the seller knows not to look for a label.
 seller ? listPickupOrderIds(seller.id).catch(() => [] as string[]) : Promise.resolve([] as string[]),
 ]);
 const collected = new Set(pickupIds);
 const rows = orders.map((o) => ({ ...o, deliveryMethod: (collected.has(String(o.id)) ? "pickup" : "ship") as "pickup" | "ship" }));
 // Parcels, not pieces: the same rows grouped by payment (parcels-core.ts), so every screen that
 // counts "to post" counts bags. The flat list stays for everything that reads orders one by one.
 const parcels = groupIntoParcels(rows).map((p) => ({ ...p, orderIds: p.orders.map((o) => String(o.id)), orders: undefined }));
 return NextResponse.json({ ok: true, orders: rows, parcels, imported });
}
