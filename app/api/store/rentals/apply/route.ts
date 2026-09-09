import { NextRequest, NextResponse } from "next/server";
import { createRequest, takenBands } from "@/app/lib/rentals/rentals-db";
import { quote } from "@/app/lib/rentals/availability-core";
import { rentableItem, spanFrom, today, notFound, bad } from "../_shared";

export const dynamic = "force-dynamic";

// Public: applying to rent. The seller reads and answers these at /rentals/requests;
// this path exists so the allowlist can open the application form without also
// opening the store's inbox — the gate matches on path, not on method.

// POST — anyone may apply. No account needed; the store is vetting by hand anyway.
export async function POST(request: NextRequest) {
 const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
 const itemId = typeof body.itemId === "string" ? body.itemId : "";
 if (!itemId) return bad("itemId is required.");
 const wanted = spanFrom(body);
 if (!wanted) return bad("Give a start and end date as YYYY-MM-DD.");

 const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
 const email = str(body.email, 200);
 if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("A valid email is required.");

 const ctx = await rentableItem(itemId);
 if (!ctx) return notFound("This piece isn't available to rent.");
 if (ctx.settings.bookingMode === "open") {
  return NextResponse.json({ ok: false, reason: "open-booking" }, { status: 200 });
 }

 // Applications are held to the same window and price ladder as open bookings —
 // there's no point taking an enquiry the store could never fulfil.
 const taken = ctx.settings.requestHoldsDates ? await takenBands(itemId) : [];
 const q = quote(wanted, ctx.settings, ctx.tiers, today(), taken);
 if (!q.ok) return NextResponse.json({ ok: false, reason: q.reason }, { status: 200 });

 const made = await createRequest({
  itemId,
  sellerId: ctx.sellerId,
  wanted: q.rented,
  settings: ctx.settings,
  requesterName: str(body.name, 120),
  requesterEmail: email,
  requesterPhone: str(body.phone, 40),
  affiliation: str(body.affiliation, 200),
  message: str(body.message, 2000),
 });
 if (!made) return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 200 });

 return NextResponse.json({
  ok: true,
  request: made.request,
  held: made.held,
  // Only meaningful when the store holds dates; otherwise nothing is reserved.
  holdExpiresAt: made.request.holdExpiresAt,
  indicativeCents: q.cents,
 });
}
