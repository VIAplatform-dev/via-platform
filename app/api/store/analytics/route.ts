import { NextRequest, NextResponse } from "next/server";
import { getStoreAnalytics } from "@/app/lib/analytics-db";
import { resolveStoreSlug } from "@/app/lib/storeAuth";
import { stores } from "@/app/lib/stores";
import { getCollabsCommissionForStore } from "@/app/lib/collabs-stats";

export async function GET(request: NextRequest) {
 const storeSlug = await resolveStoreSlug(request);
 if (!storeSlug) {
 return NextResponse.json({ error: "Not a registered store partner" }, { status: 403 });
 }

 const range = request.nextUrl.searchParams.get("range") || "30d";
 const analytics = await getStoreAnalytics(storeSlug, range);

 // For Shopify Collabs stores, the authoritative all-time VYA commission is the number
 // Collabs itself reports (synced into collabs_partnerships_snapshot), not our tracked-
 // conversions estimate, which misses orders for stores without order webhooks. Use it
 // for the all-time view (the Collabs total is cumulative, so it only maps to "all").
 const store = stores.find((s) => s.slug === storeSlug);
 if (range === "all" && store?.commissionType === "shopify-collabs") {
 const collabs = await getCollabsCommissionForStore(storeSlug).catch(() => null);
 if (collabs) {
 // Collabs reports a per-store TOTAL, not per-order. Our tracked per-sale commission
 // uses the assumed tiered rate (often wrong). Scale each recent sale by the effective
 // Collabs rate (total ÷ tracked revenue) so the line items reconcile with the total.
 const sales = analytics.sales ?? [];
 const trackedRev = sales.reduce((sum, s) => sum + (s.orderTotal || 0), 0);
 const rate = trackedRev > 0 ? collabs.commissionUsd / trackedRev : 0;
 const adjustedSales = sales.map((s) => ({ ...s, commission: Math.round((s.orderTotal || 0) * rate * 100) / 100 }));
 return NextResponse.json({ ...analytics, commissionEarned: collabs.commissionUsd, commissionSource: "shopify-collabs", sales: adjustedSales });
 }
 }

 return NextResponse.json(analytics);
}
