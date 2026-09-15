import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getOrOpenSession } from "@/app/lib/market/sessions-db";
import { countsAtMarket } from "@/app/lib/market/inventory-db";
import { getSellerPayments } from "@/app/lib/seller-payments-db";
import { listCheckouts } from "@/app/lib/market/checkout-db";
import { getItem } from "@/app/lib/db/inventory";

export const dynamic = "force-dynamic";

// GET: everything the Market Mode home screen needs in one round trip.
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

 // WHICH PIECE IT IS, not just what it costs.
 //
 // This sent an id and an amount, so Market Mode's home could only say "$400 checkout in progress"
 // and Resume opened on "Total $400". At a market a seller has a queue of people and several
 // half-finished checkouts, and a number is not enough to tell them apart: the question is always
 // "which one is this", and the answer is the photograph.
 //
 // Five at most (listCheckouts caps it), so the lookups are cheap, and a piece that has since been
 // deleted degrades to the amount alone rather than failing the whole screen.
 const withPieces = await Promise.all(
 inProgress.map(async (c) => {
  const item = await getItem(c.itemId).catch(() => null);
  return {
   id: c.id,
   itemId: c.itemId,
   amountCents: c.amountCents,
   createdAt: c.createdAt,
   title: item?.title ?? null,
   image: Array.isArray(item?.images) ? (item.images[0] ?? null) : null,
  };
 }),
 );

 return NextResponse.json({
 session,
 payments: { chargesEnabled: Boolean(pay?.chargesEnabled) },
 counts,
 inProgress: withPieces,
 });
}
