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

 // A CARRIER CALL, SO NOT ON EVERY SCREEN THAT WANTS A COUNT.
 //
 // Refreshing here rather than on a cron is right for the Rentals screen: it is rate-limited per
 // booking, and opening the queue is exactly when the answer is wanted. It is wrong for the phone's
 // Home, which fetches this only to say "2 back today" and is opened many times a day — that would
 // put a carrier round-trip in front of the seller's first screen. `?tracking=0` asks for the rows
 // without it.
 //
 // Never let a carrier outage cost the seller their screen either way.
 if (request.nextUrl.searchParams.get("tracking") !== "0") {
 await refreshStoreTracking(acting.seller.id).catch(() => 0);
 }

 const bookings = await listBookings(acting.seller.id, statuses);
 const where = locate(bookings);
 return NextResponse.json({
  bookings: bookings.map((b) => ({ ...b, whereabouts: where.get(b.id) ?? null })),
 });
}
