import { NextRequest, NextResponse } from "next/server";
import { listBookings, type BookingStatus } from "@/app/lib/rentals/rentals-db";
import { seller, unauthorized } from "../_shared";

export const dynamic = "force-dynamic";

// GET — the seller's own bookings, optionally filtered.
export async function GET(request: NextRequest) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 const raw = request.nextUrl.searchParams.get("status");
 const statuses = raw ? (raw.split(",").filter(Boolean) as BookingStatus[]) : undefined;
 return NextResponse.json({ bookings: await listBookings(acting.seller.id, statuses) });
}
