import { NextRequest, NextResponse } from "next/server";
import { listRequests, type RequestStatus } from "@/app/lib/rentals/rentals-db";
import { seller, unauthorized } from "../_shared";

export const dynamic = "force-dynamic";

// The gated path. A stylist applies; the store decides. Whether the application
// holds the dates while the store thinks about it is the STORE'S setting, and
// createRequest snapshots that choice onto the row.

// GET — the seller's inbox.
export async function GET(request: NextRequest) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 const raw = request.nextUrl.searchParams.get("status");
 const statuses = raw ? (raw.split(",").filter(Boolean) as RequestStatus[]) : undefined;
 return NextResponse.json({ requests: await listRequests(acting.seller.id, statuses) });
}
