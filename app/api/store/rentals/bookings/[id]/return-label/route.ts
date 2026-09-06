import { NextRequest, NextResponse } from "next/server";
import { getBooking } from "@/app/lib/rentals/rentals-db";
import { generateRentalReturnLabel } from "@/app/lib/rentals/return-label";
import { seller, unauthorized, notFound } from "../../../_shared";

export const dynamic = "force-dynamic";

const WHY: Record<string, string> = {
 "shipping-not-configured": "Shipping labels aren't switched on for VYA yet.",
 "collected-in-person": "This one was collected in person, so there's nothing to post back.",
 "no-renter-address": "We don't have an address for this renter — it was booked before addresses were saved.",
 "store-does-not-prepay": "Your rental settings say the renter pays return postage. Turn on prepaid labels to buy one here.",
 "no-store-address": "Add your ship-from address in Settings › Locations first.",
 "no-rates": "No carrier would quote that parcel — check the piece's weight and size.",
 "label-failed": "The carrier refused the label. Try again in a moment.",
};

// Buy the return label for a rental — the thing "a prepaid return label is in the box" promises.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 const { id } = await ctx.params;

 const booking = await getBooking(id);
 // Same answer for missing and not-yours: a store must not be able to probe for another's bookings.
 if (!booking || booking.sellerId !== acting.seller.id) return notFound();

 const r = await generateRentalReturnLabel(id);
 if (!r.ok) {
  return NextResponse.json({ error: WHY[r.reason ?? ""] ?? "Couldn't buy a label just now.", reason: r.reason }, { status: 400 });
 }
 return NextResponse.json({ ok: true, labelUrl: r.labelUrl, trackingNumber: r.trackingNumber, costCents: r.costCents, alreadyBought: r.reason === "already-bought" });
}
