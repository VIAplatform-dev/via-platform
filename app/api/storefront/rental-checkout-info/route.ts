import { NextRequest, NextResponse } from "next/server";
import { getItem } from "@/app/lib/db/inventory";
import { getSellerById } from "@/app/lib/db/sellers";
import { getBooking, rentalContext, ownerOfItem } from "@/app/lib/rentals/rentals-db";

export const dynamic = "force-dynamic";

// GET ?rental=BOOKING_ID — what the checkout page needs to take payment for a rental.
//
// A rental checkout is NOT a sale: the piece isn't reserved by item status and never becomes sold.
// The dates are already held by the booking row (the exclusion constraint did that when the hold was
// taken), so the only questions left are who's paying and how much.
export async function GET(request: NextRequest) {
 const id = request.nextUrl.searchParams.get("rental") || "";
 if (!id) return NextResponse.json({ error: "rental required" }, { status: 400 });

 const booking = await getBooking(id);
 if (!booking) return NextResponse.json({ error: "This booking has expired." }, { status: 409 });
 // Only a hold or an approved application is payable. Anything further along is already paid for.
 if (booking.status !== "held" && booking.status !== "requested") {
  return NextResponse.json({ error: "This booking can no longer be paid for." }, { status: 409 });
 }
 if (booking.expiresAt && Date.parse(booking.expiresAt) < Date.now()) {
  return NextResponse.json({ error: "Those dates were released. Pick them again." }, { status: 409 });
 }

 const [item, owner] = await Promise.all([getItem(booking.itemId), ownerOfItem(booking.itemId)]);
 if (!item || !owner) return NextResponse.json({ error: "This piece is no longer available." }, { status: 409 });

 const { settings } = await rentalContext(booking.itemId, owner.storeSlug);
 const seller = await getSellerById(item.sellerId);

 // The price was fixed when the dates were taken — or countered by the store on an approval.
 const rentCents = booking.priceCents ?? 0;
 const waiverCents = settings.security === "waiver" ? Math.round((rentCents * settings.waiverPct) / 100) : 0;

 return NextResponse.json({
  rental: {
   id: booking.id,
   rented: booking.rented,
   dueBack: booking.dueBack,
   days: booking.rented ? Math.round((Date.parse(`${booking.rented.end}T00:00:00Z`) - Date.parse(`${booking.rented.start}T00:00:00Z`)) / 86400000) + 1 : 0,
   rentCents,
   waiverCents,
   totalCents: rentCents + waiverCents,
   depositCents: settings.security === "deposit" ? settings.depositCents : null,
   fulfilment: settings.fulfilment,
   termsText: settings.termsText,
  },
  item: { id: item.id, title: item.title, priceCents: item.priceCents, currency: item.currency, image: item.images?.[0] || null },
  storeName: seller?.name || "the store",
  publishableKey: (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY)?.trim(),
 });
}
