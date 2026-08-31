import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getMarketItem } from "@/app/lib/market/inventory-db";
import { getOpenCheckoutForItem } from "@/app/lib/market/checkout-db";

export const dynamic = "force-dynamic";

// GET — one item for the Confirm screen, plus any checkout already in progress on it.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { id } = await params;
 const item = await getMarketItem(acting.seller.id, id);
 if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
 const open = item.status === "reserved" ? await getOpenCheckoutForItem(item.id) : null;
 return NextResponse.json({ item, openCheckout: open ? { id: open.id, createdAt: open.createdAt, deviceLabel: open.deviceLabel } : null });
}
