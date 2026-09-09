import { NextResponse } from "next/server";
import { listRemindable, claimReminder, sweepUnpaidAppointments, getAppointmentSettings } from "@/app/lib/appointments/appointments-db";
import { notifyAppointmentReminder } from "@/app/lib/appointments/notify";
import type { AppointmentSettings } from "@/app/lib/appointments/settings-core";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The appointment day, every hour.
//
// Two jobs:
//   · drop deposit bookings nobody paid for, so they stop cluttering the diary;
//   · send each customer their reminder, at whatever lead time their store set.
//
// Hourly rather than daily because the lead time is a store's own number: a shop that says
// "two hours before" means two hours, and a once-a-day run can only ever mean "sometime yesterday".
// `claimReminder` is the guard — a reminder is claimed before it is sent, so an overlapping run,
// a retry, or a redeploy mid-run can't send the same person the same email twice.
//
// Auth: CRON_SECRET, same as the other crons.

export async function GET(request: Request) {
 if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
 if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const swept = await sweepUnpaidAppointments().catch(() => 0);
 // Logged, not swallowed: a query that starts failing would otherwise look exactly like a quiet
 // day, and nobody would notice reminders had stopped.
 const due = await listRemindable().catch((e) => { console.error("[cron/appointments] listRemindable failed", e); return []; });

 // One settings read per store, not per appointment — a shop with a full Saturday has one answer.
 const perStore = new Map<string, AppointmentSettings>();
 const now = Date.now();
 let sent = 0;
 let skipped = 0;

 for (const a of due) {
  try {
   let s = perStore.get(a.storeSlug);
   if (!s) { s = await getAppointmentSettings(a.storeSlug); perStore.set(a.storeSlug, s); }
   if (s.reminderHours <= 0) { skipped++; continue; }

   const startsAt = Date.parse(`${a.day}T${a.start}:00Z`);
   if (!Number.isFinite(startsAt)) { skipped++; continue; }
   // Not yet inside the window, or already past — a reminder after the fact is just noise.
   if (now < startsAt - s.reminderHours * 3_600_000 || now >= startsAt) { skipped++; continue; }

   if (!(await claimReminder(a.id))) { skipped++; continue; }
   await notifyAppointmentReminder(a.storeSlug, a);
   sent++;
  } catch {
   skipped++; // one bad appointment must not stop the rest of the run
  }
 }

 return NextResponse.json({ ok: true, cancelledUnpaid: swept, considered: due.length, sent, skipped });
}
