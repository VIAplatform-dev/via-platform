import { NextRequest, NextResponse } from "next/server";
import { takenBands } from "@/app/lib/rentals/rentals-db";
import { freeSpans } from "@/app/lib/rentals/availability-core";
import { rentableItem, today, notFound, bad } from "../_shared";

export const dynamic = "force-dynamic";

// Everything a date picker needs in one call: which days are free, and the rules
// it must enforce while the shopper drags across them.

export async function GET(request: NextRequest) {
 const itemId = request.nextUrl.searchParams.get("itemId") || "";
 if (!itemId) return bad("itemId is required.");

 const ctx = await rentableItem(itemId);
 if (!ctx) return notFound("This piece isn't available to rent.");

 const taken = await takenBands(itemId);
 const now = today();
 const s = ctx.settings;

 return NextResponse.json({
  today: now,
  free: freeSpans(taken, s, now),
  tiers: ctx.tiers,
  fitsSizes: ctx.fitsSizes,
  // Only sent when the store wants the retail figure shown beside the rental price.
  marketValueCents: s.showMarketValue ? ctx.replacementCents : null,
  rules: {
   bookingMode: s.bookingMode,
   minDays: s.minDays,
   maxDays: s.maxDays,
   leadDays: s.leadDays,
   horizonDays: s.horizonDays,
   fulfilment: s.fulfilment,
   dryCleaning: s.dryCleaning,
   prepaidLabel: s.prepaidLabel,
   lateFees: s.lateFees,
   lateFeeCentsPerDay: s.lateFees ? s.lateFeeCentsPerDay : 0,
   security: s.security,
   depositCents: s.security === "deposit" ? s.depositCents : null,
   waiverPct: s.security === "waiver" ? s.waiverPct : 0,
   termsText: s.termsText,
   rentLabel: s.rentLabel,
   pickupLabel: s.pickupLabel,
   deliverLabel: s.deliverLabel,
   fitGuideUrl: s.fitGuideUrl,
   highlightsText: s.highlightsText,
  },
 });
}
