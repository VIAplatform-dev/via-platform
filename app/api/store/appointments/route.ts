import { NextRequest, NextResponse } from "next/server";
import { listAppointments, bookedSlots, createAppointment, getAppointmentSettings } from "@/app/lib/appointments/appointments-db";
import { slotsBetween, canBook, isDay, isTime } from "@/app/lib/appointments/slots-core";
import { notifyAppointmentBooked } from "@/app/lib/appointments/notify";
import { seller, unauthorized, bad, today } from "./_shared";

export const dynamic = "force-dynamic";

// The store's own diary. GET returns what's booked AND the shape of the days around it, so an open
// Thursday with nobody in it reads as available rather than as a blank.
export async function GET(request: NextRequest) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 const q = request.nextUrl.searchParams;
 const from = q.get("from") || today();
 const to = q.get("to") || from;
 if (!isDay(from) || !isDay(to)) return bad("from and to must be YYYY-MM-DD.");

 const [settings, appointments] = await Promise.all([
  getAppointmentSettings(acting.slug),
  listAppointments(acting.seller.id, from, to),
 ]);
 const slots = slotsBetween(from, to, settings, appointments.map((a) => ({ day: a.day, start: a.start })));
 return NextResponse.json({ appointments, slots, settings });
}

// POST — the store writing someone in itself: a phone call, a walk-in. Confirmed on the spot, since
// the shop was already there when it agreed to the time, and never charged a deposit.
export async function POST(request: NextRequest) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
 const day = String(body.day || "");
 const start = String(body.start || "");
 if (!isDay(day) || !isTime(start)) return bad("A date and time are required.");

 const settings = await getAppointmentSettings(acting.slug);
 const booked = await bookedSlots(acting.seller.id, day, day);
 const check = canBook(day, start, settings, body.force === true ? [] : booked);
 if (!check.ok) return NextResponse.json({ ok: false, reason: check.reason }, { status: 200 });

 const slot = slotsBetween(day, day, settings, []).find((s) => s.start === start);
 const appointment = await createAppointment({
  sellerId: acting.seller.id,
  kind: typeof body.kind === "string" && body.kind.trim() ? body.kind.trim().slice(0, 40) : (settings.types[0] || "Try-on"),
  day, start, end: slot?.end ?? start,
  customerName: typeof body.name === "string" ? body.name.trim().slice(0, 120) : null,
  customerEmail: typeof body.email === "string" ? body.email.trim().slice(0, 200) : null,
  customerPhone: typeof body.phone === "string" ? body.phone.trim().slice(0, 40) : null,
  note: typeof body.note === "string" ? body.note.trim().slice(0, 1000) : null,
  status: "booked",
 });
 // The customer still gets their confirmation when the shop writes them in by hand; the shop
 // doesn't get told about a booking it just made itself.
 void notifyAppointmentBooked(acting.slug, appointment, { ...settings, notifyOnBooking: false });
 return NextResponse.json({ ok: true, appointment });
}
