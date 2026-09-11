// What a rental day actually looks like, from the booking list.
//
// The seller's question at the counter is never "show me all bookings". It is "what leaves today,
// what comes back today, and what is late" — three answers, in that order, because the first two
// are work she has to do before closing and the third is a phone call.
//
// Mirrors the statuses in app/lib/rentals/rentals-db.ts. Dates are plain YYYY-MM-DD days, compared
// as strings: they are days, not instants, and turning them into Dates only introduces a timezone
// where the server never had one.

export type Booking = {
  id: string;
  itemId: string;
  status: string;
  shipBy: string | null;
  dueBack: string | null;
  returnedAt: string | null;
  renterName?: string | null;
  title?: string | null;
  image?: string | null;
  returnLabelUrl?: string | null;
  returnTracking?: string | null;
  trackingStatus?: string | null;
  trackingEta?: string | null;
  lateFeeCents?: number;
};

/** Today as the server writes days. Local, because "today" is where she is standing. */
export function todayDay(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** A booking that is over and done with has nothing to say on a day view. */
const FINISHED = new Set(["closed", "cancelled", "expired"]);
/** It is physically with the renter. */
const AWAY = new Set(["out", "due"]);

export type RentalDay = {
  goingOut: Booking[];
  comingBack: Booking[];
  overdue: Booking[];
  out: Booking[];
};

/**
 * The day, split four ways.
 *
 * OVERDUE IS SEPARATE FROM COMING BACK and takes precedence: a piece that was due yesterday is not
 * "coming back", it is a problem, and burying it in the same list as today's returns is how it
 * stays lost for a week. Anything already returned drops out of both.
 */
export function rentalDay(bookings: Booking[], today: string = todayDay()): RentalDay {
  const live = bookings.filter((b) => !FINISHED.has(b.status));
  const out: Booking[] = [];
  const goingOut: Booking[] = [];
  const comingBack: Booking[] = [];
  const overdue: Booking[] = [];

  for (const b of live) {
    if (AWAY.has(b.status)) out.push(b);
    // Ships today and hasn't gone yet.
    if (b.shipBy === today && !AWAY.has(b.status) && b.status !== "returned" && b.status !== "inspected") {
      goingOut.push(b);
    }
    if (b.returnedAt) continue;
    if (b.dueBack && b.dueBack < today && AWAY.has(b.status)) overdue.push(b);
    else if (b.dueBack === today && AWAY.has(b.status)) comingBack.push(b);
  }
  // Worst first within overdue — the longest gone is the one to ring about.
  overdue.sort((a, b) => String(a.dueBack).localeCompare(String(b.dueBack)));
  return { goingOut, comingBack, overdue, out };
}

/** "Out with Marta · back Friday" — the line under a piece's name. */
export function bookingLine(b: Booking, today: string = todayDay()): string {
  const who = b.renterName?.trim();
  if (b.returnedAt) return who ? `Back from ${who}` : "Back";
  if (AWAY.has(b.status)) {
    const late = b.dueBack && b.dueBack < today;
    const when = b.dueBack === today ? "due back today" : late ? `due back ${b.dueBack}` : b.dueBack ? `back ${b.dueBack}` : "out";
    return who ? `${who} · ${when}` : when;
  }
  if (b.shipBy) return who ? `${who} · ships ${b.shipBy}` : `Ships ${b.shipBy}`;
  return who ?? "Booked";
}

/** The carrier's own words, when there are any. Null rather than a guess. */
export function trackingLine(b: Booking): string | null {
  if (!b.trackingStatus) return null;
  const eta = b.trackingEta ? ` · due ${b.trackingEta}` : "";
  return `${b.trackingStatus}${eta}`;
}

/** One sentence for the Home tile — the two numbers that decide whether she opens the screen. */
export function rentalsTileLine(d: RentalDay): string {
  if (d.overdue.length) return `${d.overdue.length} overdue`;
  const bits: string[] = [];
  if (d.goingOut.length) bits.push(`${d.goingOut.length} out today`);
  if (d.comingBack.length) bits.push(`${d.comingBack.length} back today`);
  if (bits.length) return bits.join(" · ");
  return d.out.length ? `${d.out.length} out` : "Nothing out";
}
