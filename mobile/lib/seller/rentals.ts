// What a rental day actually looks like, from the booking list.
//
// The seller's question at the counter is never "show me all bookings". It is "what leaves today,
// what comes back today, and what is late". Three answers, in that order, because the first two
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
  // Worst first within overdue. The longest gone is the one to ring about.
  overdue.sort((a, b) => String(a.dueBack).localeCompare(String(b.dueBack)));
  return { goingOut, comingBack, overdue, out };
}

/** "Out with Marta · back Friday". The line under a piece's name. */
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

/** One sentence for the Home tile. The two numbers that decide whether she opens the screen. */
export function rentalsTileLine(d: RentalDay): string {
  if (d.overdue.length) return `${d.overdue.length} overdue`;
  const bits: string[] = [];
  if (d.goingOut.length) bits.push(`${d.goingOut.length} out today`);
  if (d.comingBack.length) bits.push(`${d.comingBack.length} back today`);
  if (bits.length) return bits.join(" · ");
  return d.out.length ? `${d.out.length} out` : "Nothing out";
}

/* ── the catalogue: what this shop rents out ────────────────────────────────────────────────── */

/** One rentable piece, as /api/store/rentals/terms lists them. */
export type RentalItem = {
  itemId: string;
  title: string | null;
  image: string | null;
  itemStatus: string | null;
  tiers: { days: number; cents: number }[];
  replacementCents: number | null;
  /** The LIVE booking's status, or null when nothing is happening to it. */
  bookingStatus: string | null;
  dueBack: string | null;
  shipBy: string | null;
  renterName?: string | null;
};

/**
 * Where a rentable piece stands today.
 *
 * Deliberately fewer states than the booking table has. A seller does not need to know the
 * difference between "requested" and "held"; she needs to know whether the piece is in the shop,
 * promised to someone, or out of the building. Overdue is split from out because it is the only
 * one that is a phone call.
 */
export type RentalState = "available" | "booked" | "out" | "overdue" | "unavailable";

const LIVE_AWAY = new Set(["out", "due"]);
const LIVE_PROMISED = new Set(["requested", "approved", "held", "confirmed", "paid", "booked"]);

export function rentalState(item: RentalItem, today: string = todayDay()): RentalState {
  // A piece that has sold or been drafted away cannot be rented whatever its terms say, and
  // showing it as "available" is how a seller promises something she no longer has.
  if (item.itemStatus && item.itemStatus !== "active" && item.itemStatus !== "reserved") return "unavailable";
  const s = (item.bookingStatus ?? "").toLowerCase();
  if (LIVE_AWAY.has(s)) return item.dueBack && item.dueBack < today ? "overdue" : "out";
  if (LIVE_PROMISED.has(s)) return "booked";
  return "available";
}

/** The chip labels, in reading order: what you have, then what is spoken for. */
export const RENTAL_STATES: { key: RentalState | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "available", label: "Available" },
  { key: "booked", label: "Booked" },
  { key: "out", label: "Out" },
  { key: "overdue", label: "Overdue" },
];

export function filterRentalItems(items: RentalItem[], state: RentalState | "all", today: string = todayDay()): RentalItem[] {
  if (state === "all") return items;
  return items.filter((i) => rentalState(i, today) === state);
}

/** How many sit in each state, for the counts beside the chips. */
export function countByState(items: RentalItem[], today: string = todayDay()): Record<string, number> {
  const out: Record<string, number> = { all: items.length };
  for (const i of items) {
    const s = rentalState(i, today);
    out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}

/** "$45 for 4 days", the cheapest tier, which is the one a shopper sees first. */
export function fromPrice(item: RentalItem, currency = "USD"): string | null {
  const cheapest = item.tiers.filter((t) => t.cents > 0).sort((a, b) => a.cents - b.cents)[0];
  if (!cheapest) return null;
  const money = new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(cheapest.cents / 100);
  return `${money} for ${cheapest.days} ${cheapest.days === 1 ? "day" : "days"}`;
}

/** The line under a piece: who has it and until when, or that it is free. */
export function stateLine(item: RentalItem, today: string = todayDay()): string {
  const state = rentalState(item, today);
  const who = item.renterName?.trim();
  if (state === "overdue") return `Overdue${item.dueBack ? ` since ${item.dueBack}` : ""}${who ? ` · ${who}` : ""}`;
  if (state === "out") return `Out${item.dueBack ? ` until ${item.dueBack}` : ""}${who ? ` · ${who}` : ""}`;
  if (state === "booked") return `Booked${item.shipBy ? ` · ships ${item.shipBy}` : ""}${who ? ` · ${who}` : ""}`;
  if (state === "unavailable") return item.itemStatus === "sold" ? "Sold" : "Not listed";
  return "Available";
}
