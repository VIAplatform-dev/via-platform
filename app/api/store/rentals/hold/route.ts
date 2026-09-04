import { NextRequest, NextResponse } from "next/server";
import { takenBands, createBooking } from "@/app/lib/rentals/rentals-db";
import { quote } from "@/app/lib/rentals/availability-core";
import { rentableItem, spanFrom, today, notFound, bad } from "../_shared";

export const dynamic = "force-dynamic";

/** How long a checkout may sit on the dates before they go back on sale. */
const HOLD_MINUTES = 10;

// Public: a shopper on a storefront has no session, which is why this lives on its
// own path rather than as POST on the seller's /bookings.

/**
 * POST — take the dates for a checkout in progress.
 *
 * Availability is re-checked here and then again by the database itself. The
 * second check is the one that counts: between quoting and inserting, someone
 * else's payment can land. A refusal is a normal answer, not an error.
 */
export async function POST(request: NextRequest) {
 const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
 const itemId = typeof body.itemId === "string" ? body.itemId : "";
 if (!itemId) return bad("itemId is required.");
 const rented = spanFrom(body);
 if (!rented) return bad("Give a start and end date as YYYY-MM-DD.");

 const ctx = await rentableItem(itemId);
 if (!ctx) return notFound("This piece isn't available to rent.");
 if (ctx.settings.bookingMode === "request") {
  return NextResponse.json({ ok: false, reason: "request-only" }, { status: 200 });
 }

 const taken = await takenBands(itemId);
 const q = quote(rented, ctx.settings, ctx.tiers, today(), taken);
 if (!q.ok) return NextResponse.json({ ok: false, reason: q.reason }, { status: 200 });

 const booking = await createBooking({
  itemId,
  sellerId: ctx.sellerId,
  rented: q.rented,
  settings: ctx.settings,
  status: "held",
  origin: "open",
  priceCents: q.cents,
  expiresAt: new Date(Date.now() + HOLD_MINUTES * 60_000),
 });
 // The constraint refused: someone paid for these dates while we were quoting.
 if (!booking) return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 200 });
 return NextResponse.json({ ok: true, booking });
}
