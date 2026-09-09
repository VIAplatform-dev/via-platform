import { NextRequest, NextResponse } from "next/server";
import { bookedSlots, createAppointment, markDepositIntent } from "@/app/lib/appointments/appointments-db";
import { slotsBetween, canBook, isDay, isTime, addDays } from "@/app/lib/appointments/slots-core";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { getSellerPayments } from "@/app/lib/seller-payments-db";
import { payableAccountId } from "@/app/lib/stripe-mode";
import { stripePost, stripeConfigured } from "@/app/lib/stripe";
import { bookingEmbed } from "@/app/lib/appointments/embed-core";
import { notifyAppointmentBooked } from "@/app/lib/appointments/notify";
import { publicContext, bad, notFound, today } from "../_shared";

export const dynamic = "force-dynamic";

// Public: the times a shopper can come in, and booking one.

export async function GET(request: NextRequest) {
 const q = request.nextUrl.searchParams;
 const storeSlug = q.get("store") || "";
 const itemId = q.get("itemId") || "";
 // Neither is allowed here: that's the storefront editor, where the signed-in seller identifies
 // the shop. Without it the canvas could never show a shop its own diary.

 const ctx = await publicContext({ storeSlug, itemId, request });
 if (!ctx) return notFound("This store isn't taking appointments.");
 // A shop pointing at Calendly has no times of its own to offer.
 if (ctx.settings.bookingUrl) {
  const embed = ctx.settings.embedBooking ? bookingEmbed(ctx.settings.bookingUrl) : null;
  return NextResponse.json({
   bookingUrl: ctx.settings.bookingUrl,
   embed, // null = we don't recognise it, or the shop asked for a plain button
   slots: [], types: ctx.settings.types, intro: ctx.settings.intro,
  });
 }

 const from = isDay(q.get("from")) ? String(q.get("from")) : today();
 const to = isDay(q.get("to")) ? String(q.get("to")) : addDays(from, Math.min(ctx.settings.horizonDays, 60));
 const booked = await bookedSlots(ctx.sellerId, from, to);

 // Lead time is in HOURS, so it can bite inside today — "not before tomorrow" and "not for another
 // two hours" are different promises and a shop means the second one.
 const cutoff = new Date(Date.now() + ctx.settings.leadHours * 3_600_000);
 const cutoffDay = cutoff.toISOString().slice(0, 10);
 const cutoffTime = cutoff.toISOString().slice(11, 16);

 const slots = slotsBetween(from, to, ctx.settings, booked)
  .filter((s) => s.free && (s.day > cutoffDay || (s.day === cutoffDay && s.start >= cutoffTime)));

 return NextResponse.json({
  from, to,
  // "No times this month" and "this shop has never set any hours" look identical to a shopper and
  // need completely different words, so the difference is sent rather than guessed at.
  configured: ctx.settings.openingHours.length > 0,
  slots: slots.map(({ day, start, end }) => ({ day, start, end })),
  types: ctx.settings.types,
  intro: ctx.settings.intro,
  depositCents: ctx.settings.depositCents,
  depositCredits: ctx.settings.depositCredits,
  requireApproval: ctx.settings.requireApproval,
 });
}

export async function POST(request: NextRequest) {
 const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
 const storeSlug = typeof body.store === "string" ? body.store : "";
 const itemId = typeof body.itemId === "string" ? body.itemId : "";
 const day = String(body.day || "");
 const start = String(body.start || "");
 if (!storeSlug && !itemId) return bad("A store or itemId is required.");
 if (!isDay(day) || !isTime(start)) return bad("Pick a date and time.");
 const email = typeof body.email === "string" ? body.email.trim() : "";
 if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("A valid email is required.");

 const ctx = await publicContext({ storeSlug, itemId, request });
 if (!ctx) return notFound("This store isn't taking appointments.");

 const now = new Date();
 const booked = await bookedSlots(ctx.sellerId, day, day);
 // Re-checked here, never trusted from the page: between rendering the times and pressing the
 // button, the shop's last free 2pm can go.
 const check = canBook(day, start, ctx.settings, booked, {
  day: now.toISOString().slice(0, 10),
  time: now.toISOString().slice(11, 16),
 });
 if (!check.ok) return NextResponse.json({ ok: false, reason: check.reason }, { status: 200 });

 const deposit = ctx.settings.depositCents;
 const slot = slotsBetween(day, day, ctx.settings, []).find((s) => s.start === start);
 const appointment = await createAppointment({
  sellerId: ctx.sellerId,
  kind: typeof body.kind === "string" && body.kind.trim() ? body.kind.trim().slice(0, 40) : (ctx.settings.types[0] || "Try-on"),
  day, start, end: slot?.end ?? start,
  customerName: typeof body.name === "string" ? body.name.trim().slice(0, 120) : null,
  customerEmail: email,
  customerPhone: typeof body.phone === "string" ? body.phone.trim().slice(0, 40) : null,
  note: typeof body.note === "string" ? body.note.trim().slice(0, 1000) : null,
  itemId: itemId || null,
  // Free bookings land straight in the diary; paid ones only once the money is through, so an
  // abandoned payment page can't sit on a slot.
  status: deposit > 0 ? "pending" : ctx.settings.requireApproval ? "pending" : "booked",
  depositCents: deposit,
 });

 if (deposit <= 0) {
  // Fire-and-forget: the booking is already in the diary, and a mail outage must not turn a
  // successful booking into an error the shopper sees.
  void notifyAppointmentBooked(ctx.storeSlug, appointment, ctx.settings);
  return NextResponse.json({
   ok: true, appointment: { id: appointment.id, day, start, end: appointment.end, kind: appointment.kind },
   needsApproval: ctx.settings.requireApproval,
  });
 }

 // A deposit to hold the slot. Charged on the store's own Stripe account, like every other payment.
 if (!stripeConfigured()) return NextResponse.json({ ok: false, reason: "payments-off" }, { status: 200 });
 const sellerRow = await getSellerBySlug(ctx.storeSlug).catch(() => null);
 const acctId = payableAccountId(await getSellerPayments(ctx.storeSlug).catch(() => null));
 if (!sellerRow || !acctId) return NextResponse.json({ ok: false, reason: "payments-off" }, { status: 200 });

 try {
  const intent = await stripePost("payment_intents", {
   amount: deposit,
   currency: "usd",
   payment_method_types: { 0: "card" },
   receipt_email: email,
   metadata: {
    appointmentId: appointment.id,
    storeSlug: ctx.storeSlug,
    appointment_day: day,
    appointment_start: start,
    deposit_credits: ctx.settings.depositCredits ? "1" : "0",
   },
  }, acctId);
  await markDepositIntent(appointment.id, String(intent.id || ""));
  return NextResponse.json({
   ok: true,
   appointment: { id: appointment.id, day, start, end: appointment.end, kind: appointment.kind },
   deposit: {
    amountCents: deposit,
    credits: ctx.settings.depositCredits,
    clientSecret: intent.client_secret,
    publishableKey: (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY)?.trim(),
    stripeAccount: acctId,
   },
   needsApproval: ctx.settings.requireApproval,
  });
 } catch {
  return NextResponse.json({ ok: false, reason: "payments-off" }, { status: 200 });
 }
}
