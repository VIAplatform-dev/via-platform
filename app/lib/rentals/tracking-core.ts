// ───────────────────────────────────────────────────────────────────────────
// Where the piece actually is, from the carrier rather than from a guess.
//
// The turnaround settings are ESTIMATES — "getting it back takes 2 days" — and they do two jobs at
// once: they block the calendar so nothing double-books, and they tell the store when to expect a
// piece home. The first job needs an estimate, because the booking is made before anything ships.
// The second doesn't: once a return label has been scanned, the carrier knows more than the setting
// does, and a store staring at a shelf should be told what the carrier says rather than what a
// number in Settings assumed weeks ago.
//
// So: estimates block the calendar, tracking corrects the expectation. This file is the correcting
// part, and it is pure — a status string and two dates in, a stage and a sentence out.
// ───────────────────────────────────────────────────────────────────────────

/** What the carrier told us, normalised. Shippo and EasyPost agree on these words. */
export type CarrierStatus = "UNKNOWN" | "PRE_TRANSIT" | "TRANSIT" | "DELIVERED" | "RETURNED" | "FAILURE";

export type TrackedBooking = {
 status: string;               // our booking status
 dueBack: string | null;       // yyyy-mm-dd, from the rental terms
 returnedAt: string | null;    // set when the store marks it back
 returnTracking?: string | null;
 trackingStatus?: CarrierStatus | null;
 trackingEta?: string | null;  // yyyy-mm-dd, the carrier's own estimate
 trackingAt?: string | null;   // when we last heard from the carrier
};

export type Stage =
 | "not-out"        // nothing has left yet
 | "with-renter"    // they have it; no return movement seen
 | "coming-back"    // the return label has been scanned
 | "back"           // delivered to the store, or marked back by hand
 | "overdue";       // past due and nothing is moving

export type RentalWhereabouts = {
 stage: Stage;
 /** One line for the seller. Never speculative — it says what is known and who says so. */
 line: string;
 /** The date to expect it, carrier first, then the rental's own due date. */
 expected: string | null;
 /** True when the carrier's estimate is LATER than the due date — the store's calendar is wrong. */
 runningLate: boolean;
};

const day = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
const pretty = (d: string) =>
 new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Normalise whatever the carrier called it. Anything unrecognised is UNKNOWN, never a guess. */
export function carrierStatus(raw: string | null | undefined): CarrierStatus {
 const s = String(raw || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
 if (s === "PRE_TRANSIT" || s === "PRETRANSIT" || s === "UNKNOWN_PRE_TRANSIT") return "PRE_TRANSIT";
 if (s === "TRANSIT" || s === "IN_TRANSIT" || s === "OUT_FOR_DELIVERY") return "TRANSIT";
 if (s === "DELIVERED") return "DELIVERED";
 if (s === "RETURNED") return "RETURNED";
 if (s === "FAILURE" || s === "ERROR" || s === "EXCEPTION") return "FAILURE";
 return "UNKNOWN";
}

/**
 * Where one rental is right now.
 *
 * `today` is passed in rather than read, so this is testable and so a store's own timezone can
 * decide what "overdue" means rather than the server's.
 */
export function whereabouts(b: TrackedBooking, today: string): RentalWhereabouts {
 const due = day(b.dueBack);
 const eta = day(b.trackingEta);
 const status = carrierStatus(b.trackingStatus);

 // Already home. The store marking it back is the last word — it's holding the piece.
 if (b.returnedAt || b.status === "closed") {
  return { stage: "back", line: "Back with you.", expected: null, runningLate: false };
 }
 if (b.status !== "out" && b.status !== "booked" && b.status !== "overdue") {
  return { stage: "not-out", line: "Not out yet.", expected: due, runningLate: false };
 }

 if (status === "DELIVERED") {
  // The carrier says it arrived, but nobody has checked it in. That gap is worth naming: the piece
  // is physically back and still blocking the calendar.
  return {
   stage: "back",
   line: "The carrier says it's been delivered back to you — check it in to free up the dates.",
   expected: null,
   runningLate: false,
  };
 }

 if (status === "TRANSIT" || status === "PRE_TRANSIT") {
  const when = eta || due;
  const late = Boolean(eta && due && eta > due);
  return {
   stage: "coming-back",
   line: status === "PRE_TRANSIT"
    ? `They've printed the label${when ? `, due back ${pretty(when)}` : ""}. Nothing scanned yet.`
    : `On its way back to you${when ? `, expected ${pretty(when)}` : ""}.`,
   expected: when,
   runningLate: late,
  };
 }

 if (status === "FAILURE") {
  return {
   stage: "coming-back",
   line: "The carrier has flagged a problem with the return — worth chasing.",
   expected: eta || due,
   runningLate: true,
  };
 }

 // Nothing from the carrier. Fall back to the dates the booking was made with.
 if (due && today > due) {
  return {
   stage: "overdue",
   line: `Due back ${pretty(due)} and nothing has been scanned yet.`,
   expected: due,
   runningLate: true,
  };
 }
 return {
  stage: "with-renter",
  line: due ? `With the renter, due back ${pretty(due)}.` : "With the renter.",
  expected: due,
  runningLate: false,
 };
}

/**
 * Should we ask the carrier about this one?
 *
 * Only for pieces that are out and have a label, and at most once an hour — carriers rate-limit,
 * and a rental moves on the scale of days.
 */
export function needsRefresh(b: TrackedBooking, now: number, minMs = 60 * 60 * 1000): boolean {
 if (!b.returnTracking) return false;
 if (b.returnedAt || b.status === "closed") return false;
 if (carrierStatus(b.trackingStatus) === "DELIVERED") return false;
 if (!b.trackingAt) return true;
 const last = Date.parse(b.trackingAt);
 return !Number.isFinite(last) || now - last > minMs;
}
