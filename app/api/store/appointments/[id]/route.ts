import { NextRequest, NextResponse } from "next/server";
import { getAppointment, setAppointmentStatus } from "@/app/lib/appointments/appointments-db";
import { notifyAppointmentDecision } from "@/app/lib/appointments/notify";
import { seller, unauthorized, notFound, bad } from "../_shared";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "booked", "attended", "no-show", "cancelled"] as const;

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 const { id } = await ctx.params;
 const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
 const status = STATUSES.find((s) => s === body.status);
 if (!status) return bad(`status must be one of: ${STATUSES.join(", ")}.`);
 // Read the old status first: only a real CHANGE is worth emailing about. Re-saving 'booked' on
 // something already booked shouldn't send a second confirmation.
 const before = await getAppointment(id);
 const appointment = await setAppointmentStatus(id, acting.seller.id, status);
 if (!appointment) return notFound();
 if (before?.status !== status && (status === "booked" || status === "cancelled")) {
  void notifyAppointmentDecision(acting.slug, appointment, status);
 }
 return NextResponse.json({ appointment });
}
