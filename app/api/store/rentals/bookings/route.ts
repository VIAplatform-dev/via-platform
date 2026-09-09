import { NextRequest, NextResponse } from "next/server";
import { listBookings, type BookingStatus } from "@/app/lib/rentals/rentals-db";
import { refreshStoreTracking, locate } from "@/app/lib/rentals/tracking";
import { seller, unauthorized } from "../_shared";

export const dynamic = "force-dynamic";

// GET — the seller's own bookings, optionally filtered.
//
// Each booking comes back with WHERE IT IS as well as when it's due: the turnaround settings are an
// estimate made before anything shipped, and once a return label has been scanned the carrier knows
// better. Refreshed here rather than on a cron because it's rate-limited per booking — a store with
// nothing out makes no carrier calls at all, and a page load is exactly when the answer is wanted.
export async function GET(request: NextRequest) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 const raw = request.nextUrl.searchParams.get("status");
 const statuses = raw ? (raw.split(",").filter(Boolean) as BookingStatus[]) : undefined;

 // Never let a carrier outage cost the seller their screen.
 await refreshStoreTracking(acting.seller.id).catch(() => 0);

 const bookings = await listBookings(acting.seller.id, statuses);
 const where = locate(bookings);
 return NextResponse.json({
  bookings: bookings.map((b) => ({ ...b, whereabouts: where.get(b.id) ?? null })),
 });
}
