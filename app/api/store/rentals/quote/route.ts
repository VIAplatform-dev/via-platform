import { NextRequest, NextResponse } from "next/server";
import { takenBands } from "@/app/lib/rentals/rentals-db";
import { quote } from "@/app/lib/rentals/availability-core";
import { rentableItem, spanFrom, today, notFound, bad } from "../_shared";

export const dynamic = "force-dynamic";

// Price a specific set of dates. The same function runs again when money is taken —
// a quote the shopper was shown is never trusted on the way back in.

export async function POST(request: NextRequest) {
 const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
 const itemId = typeof body.itemId === "string" ? body.itemId : "";
 if (!itemId) return bad("itemId is required.");
 const rented = spanFrom(body);
 if (!rented) return bad("Give a start and end date as YYYY-MM-DD.");

 const ctx = await rentableItem(itemId);
 if (!ctx) return notFound("This piece isn't available to rent.");

 const taken = await takenBands(itemId);
 const q = quote(rented, ctx.settings, ctx.tiers, today(), taken);
 if (!q.ok) return NextResponse.json({ ok: false, reason: q.reason }, { status: 200 });

 const s = ctx.settings;
 const waiverCents = s.security === "waiver" ? Math.round((q.cents * s.waiverPct) / 100) : 0;
 return NextResponse.json({
  ok: true,
  days: q.days,
  rentCents: q.cents,
  waiverCents,
  depositCents: s.security === "deposit" ? s.depositCents : null,
  totalDueCents: q.cents + waiverCents,
  rented: q.rented,
  // What the shopper is really taking off the calendar, so "back by" can be honest.
  blocked: q.blocked,
 });
}
