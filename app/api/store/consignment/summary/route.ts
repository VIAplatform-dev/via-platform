import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getConsignmentSummary } from "@/app/lib/consignment-db";

export const dynamic = "force-dynamic";

// GET — the consignment dashboard rollup: balances, 8-week sales volume, recent payout activity.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 try {
 return NextResponse.json({ ok: true, ...(await getConsignmentSummary(slug)) });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}
