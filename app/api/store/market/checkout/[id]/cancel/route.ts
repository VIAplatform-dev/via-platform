import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getCheckout, closeCheckout } from "@/app/lib/market/checkout-db";

export const dynamic = "force-dynamic";

// POST — seller cancels before payment. Releases the item. Idempotent.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { id } = await params;
 const c = await getCheckout(id);
 if (!c || c.sellerId !== acting.seller.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
 const closed = await closeCheckout(id, "canceled", "ui");
 return NextResponse.json({ ok: true, checkout: closed ?? (await getCheckout(id)) });
}
