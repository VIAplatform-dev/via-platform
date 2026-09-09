import { NextRequest, NextResponse } from "next/server";
import { countPendingAppointments, listPending } from "@/app/lib/appointments/appointments-db";
import { seller, unauthorized } from "../_shared";

export const dynamic = "force-dynamic";

// Bookings waiting on the shop's answer. One number for the sidebar badge; ?list=1 for the inbox,
// which shows them and answers them.
export async function GET(request: NextRequest) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 if (request.nextUrl.searchParams.get("list")) {
  const appointments = await listPending(acting.seller.id);
  return NextResponse.json({ pending: appointments.length, appointments });
 }
 return NextResponse.json({ pending: await countPendingAppointments(acting.seller.id) });
}
