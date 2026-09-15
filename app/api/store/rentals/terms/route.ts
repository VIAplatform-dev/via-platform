import { NextRequest, NextResponse } from "next/server";
import { listRentalItems } from "@/app/lib/rentals/rentals-db";
import { seller, unauthorized } from "../_shared";

export const dynamic = "force-dynamic";

// GET: every piece this shop rents out, with its live booking status.
//
// The per-item route next door answers "is THIS piece rentable". Nothing answered "what do I rent
// out", which is the question the Rentals screen opens on: a shop with a quiet week saw "Nothing
// out and nothing booked" and no way to reach the pieces it rents.
export async function GET(request: NextRequest) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 return NextResponse.json({ items: await listRentalItems(acting.seller.id) });
}
