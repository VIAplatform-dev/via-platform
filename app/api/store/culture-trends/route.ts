import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlug } from "@/app/lib/storeAuth";
import { isStorePro } from "@/app/lib/store-plans-db";
import { getPinterestTrends, isPinterestConfigured } from "@/app/lib/pinterest-trends";

export const dynamic = "force-dynamic";

// GET /api/store/culture-trends — "Rising in culture": the fastest-growing fashion searches on
// Pinterest right now, a LEADING outside-VYA discovery signal (taste forms here before resale demand
// moves). VYA Pro. Stays empty until Pinterest is configured and the daily snapshot has run.
export async function GET(request: NextRequest) {
 const storeSlug = await resolveStoreSlug(request);
 if (!storeSlug) return NextResponse.json({ error: "Not a registered store partner" }, { status: 403 });
 if (!(await isStorePro(storeSlug))) return NextResponse.json({ locked: true });

 try {
  const trends = await getPinterestTrends(15);
  return NextResponse.json({ source: "pinterest", configured: isPinterestConfigured(), trends, empty: trends.length === 0 });
 } catch {
  return NextResponse.json({ source: "pinterest", configured: false, trends: [], empty: true });
 }
}
