import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getOrOpenSession } from "@/app/lib/market/sessions-db";
import { countsAtMarket } from "@/app/lib/market/inventory-db";
import { getSellerPayments } from "@/app/lib/seller-payments-db";
import { listCheckouts } from "@/app/lib/market/checkout-db";

export const dynamic = "force-dynamic";

// GET — everything the Market Mode home screen needs in one round trip.
export async function GET(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { slug, seller } = acting;
 const session = await getOrOpenSession(seller.id);
 const [counts, pay, recent] = await Promise.all([
 countsAtMarket(seller.id, session.id),
 getSellerPayments(slug).catch(() => null),
 listCheckouts(seller.id, session.id, 5),
 ]);
 const inProgress = recent.filter((c) => c.status === "awaiting_payment");
 return NextResponse.json({
 session,
 payments: { chargesEnabled: Boolean(pay?.chargesEnabled) },
 counts,
 inProgress: inProgress.map((c) => ({ id: c.id, itemId: c.itemId, amountCents: c.amountCents, createdAt: c.createdAt })),
 });
}
