import { NextRequest, NextResponse } from "next/server";
import { countPending } from "@/app/lib/rentals/rentals-db";
import { seller, unauthorized } from "../_shared";

export const dynamic = "force-dynamic";

// One small number for the sidebar: appointments waiting to be confirmed plus rental applications
// waiting for an answer. Both are someone standing at the counter — they belong in the same count.
export async function GET(request: NextRequest) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 return NextResponse.json(await countPending(acting.seller.id));
}
