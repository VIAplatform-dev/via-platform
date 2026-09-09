import { NextRequest, NextResponse } from "next/server";
import {
 getAppointment, listCustomerVisits, listVisitItems, setVisitItem, removeVisitItem,
 VISIT_OUTCOMES, type VisitOutcome,
} from "@/app/lib/appointments/appointments-db";
import { seller, unauthorized, notFound, bad } from "../../_shared";

export const dynamic = "force-dynamic";

// One visit, in full: who came, what they handled, and every other time they've been in.
//
// The record is the point of taking appointments at all — someone comes in, tries six things and
// leaves, and without knowing which six the follow-up is "hope you enjoyed your visit".

async function ownedAppointment(request: NextRequest, id: string) {
 const acting = await seller(request);
 if (!acting) return { error: unauthorized() as NextResponse };
 const appointment = await getAppointment(id);
 // Same 404 for "doesn't exist" and "isn't yours" — a store must not be able to probe for another
 // store's bookings by id.
 if (!appointment || appointment.sellerId !== acting.seller.id) return { error: notFound() as NextResponse };
 return { acting, appointment };
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
 const { id } = await ctx.params;
 const found = await ownedAppointment(request, id);
 if ("error" in found) return found.error;
 const { acting, appointment } = found;

 const [items, history] = await Promise.all([
  listVisitItems(id),
  appointment.customerEmail ? listCustomerVisits(acting.seller.id, appointment.customerEmail) : Promise.resolve([]),
 ]);
 return NextResponse.json({
  appointment,
  items,
  // Their other visits, this one excluded — "have they been in before, and what happened".
  history: history.filter((h) => h.id !== id),
 });
}

// POST { itemId, outcome } — record a piece as tried / liked / bought.
// POST { itemId, remove: true } — take it off the visit.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
 const { id } = await ctx.params;
 const found = await ownedAppointment(request, id);
 if ("error" in found) return found.error;

 const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
 const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
 if (!itemId) return bad("An itemId is required.");

 if (body.remove === true) {
  await removeVisitItem(id, itemId);
  return NextResponse.json({ ok: true, items: await listVisitItems(id) });
 }

 const outcome = VISIT_OUTCOMES.find((o) => o === body.outcome) as VisitOutcome | undefined;
 if (!outcome) return bad(`outcome must be one of: ${VISIT_OUTCOMES.join(", ")}.`);
 await setVisitItem(id, itemId, outcome);
 return NextResponse.json({ ok: true, items: await listVisitItems(id) });
}
