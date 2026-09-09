import { NextRequest, NextResponse } from "next/server";
import { getBooking, setBookingStatus, type BookingStatus } from "@/app/lib/rentals/rentals-db";
import { seller, unauthorized, notFound, bad } from "../../_shared";

export const dynamic = "force-dynamic";

/**
 * Where a booking may go next. Written out rather than "any status to any status"
 * so a mis-wired button can't mark an unpaid hold as returned, and so the shape of
 * the rental lifecycle lives in one readable place.
 */
const NEXT: Record<string, BookingStatus[]> = {
 requested: ["held", "cancelled", "expired"],
 held: ["booked", "cancelled", "expired"],
 booked: ["picking", "cancelled"],
 picking: ["out", "cancelled"],
 out: ["due", "returned"],
 due: ["returned"],
 returned: ["inspected"],
 inspected: ["closed"],
};

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 const { id } = await ctx.params;
 const booking = await getBooking(id);
 if (!booking || booking.sellerId !== acting.seller.id) return notFound();
 return NextResponse.json({ booking });
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 const { id } = await ctx.params;
 const booking = await getBooking(id);
 if (!booking || booking.sellerId !== acting.seller.id) return notFound();

 const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
 const status = typeof body.status === "string" ? (body.status as BookingStatus) : null;
 if (!status) return bad("A status is required.");
 const allowed = NEXT[booking.status] ?? [];
 if (!allowed.includes(status)) {
  return bad(`A ${booking.status} rental can't become ${status}. Allowed: ${allowed.join(", ") || "nothing"}.`);
 }

 const updated = await setBookingStatus(id, status, {
  orderId: typeof body.orderId === "string" ? body.orderId : undefined,
  returnedAt: status === "returned" ? new Date() : undefined,
  lateFeeCents: body.lateFeeCents == null ? undefined : Math.round(Number(body.lateFeeCents)),
  damageCents: body.damageCents == null ? undefined : Math.round(Number(body.damageCents)),
 });
 return NextResponse.json({ booking: updated });
}
