import { NextResponse } from "next/server";
import { listOverdue, setLateFee, sweepExpired, getStoreSettings } from "@/app/lib/rentals/rentals-db";
import { resolveSettings, type RentalSettings } from "@/app/lib/rentals/settings-core";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The rental day, once a day.
//
// Three jobs, all of them things a seller shouldn't have to remember:
//   · release soft holds and abandoned checkouts, so dates nobody paid for go back on sale;
//   · move rentals past their return date into `due`, so they surface in the queue;
//   · recompute what lateness has cost.
//
// Charging is deliberately NOT here. Late fees accrue silently and are taken when the piece is
// checked back in, alongside any damage, so a customer gets one charge and a conversation rather
// than a daily drip of surprise card debits while the parcel is still in transit.
//
// Auth: CRON_SECRET, same as the other crons.

const LATE_FEE_HARD_CAP_CENTS = 100_000_00;

export async function GET(request: Request) {
 if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
 if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const today = new Date().toISOString().slice(0, 10);
 const released = await sweepExpired().catch(() => ({ bookings: 0, requests: 0 }));

 const overdue = await listOverdue(today).catch(() => []);
 // One settings read per store, not per rental — a store with thirty pieces out has one answer.
 const perStore = new Map<string, RentalSettings>();
 let charged = 0;
 let skipped = 0;
 let totalCents = 0;

 for (const r of overdue) {
  try {
   let store = perStore.get(r.storeSlug);
   if (!store) { store = await getStoreSettings(r.storeSlug); perStore.set(r.storeSlug, store); }
   const s = resolveSettings(store, r.overrides);

   // A store that doesn't charge for lateness still wants the rental marked overdue, so the queue
   // shows it — it just never grows a fee.
   const rate = s.lateFees ? s.lateFeeCentsPerDay : 0;
   const raw = rate * r.daysLate;

   // Never let lateness cost more than the piece is worth. Past that point a store wants the
   // replacement conversation, not a bigger number.
   const cap = r.replacementCents && r.replacementCents > 0
    ? Math.min(r.replacementCents, LATE_FEE_HARD_CAP_CENTS)
    : LATE_FEE_HARD_CAP_CENTS;
   const fee = Math.min(raw, cap);

   if (await setLateFee(r.id, fee)) { charged++; totalCents += fee; } else skipped++;
  } catch {
   skipped++; // one bad rental must not stop the rest of the run
  }
 }

 return NextResponse.json({
  ok: true, today,
  released,
  overdue: overdue.length,
  updated: charged,
  unchanged: skipped,
  lateFeesCents: totalCents,
 });
}
