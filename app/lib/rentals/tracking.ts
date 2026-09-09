// Ask the carrier about the rentals that are out, and remember what it said.
//
// Deliberately thin: the DECIDING is in tracking-core (pure, tested), and this only does the parts
// that touch the network and the database. Failure is never fatal — a screen that can't reach a
// carrier falls back to the booking's own dates, which is exactly what it showed before any of
// this existed.
import { listBookings, setRentalTracking, type Booking } from "./rentals-db";
import { getTracking } from "../ship-provider";
import { needsRefresh, whereabouts, type RentalWhereabouts } from "./tracking-core";

const today = () => new Date().toISOString().slice(0, 10);

/** One booking, refreshed if it's due. Returns whether anything changed. */
export async function refreshOne(b: Booking, now = Date.now()): Promise<boolean> {
 if (!needsRefresh(b as never, now)) return false;
 const snap = await getTracking(b.returnTracking!, b.returnCarrier ?? null).catch(() => null);
 if (!snap) return false;
 await setRentalTracking(b.id, { status: snap.status, eta: snap.eta, carrier: snap.carrier });
 return true;
}

/**
 * Refresh every rental of one store that's worth asking about.
 *
 * Rate-limited by `needsRefresh` rather than by a cron schedule, so calling this on a page load is
 * cheap: a store with nothing out makes no carrier calls at all.
 */
export async function refreshStoreTracking(sellerId: string): Promise<number> {
 const out = await listBookings(sellerId, ["out", "booked", "overdue"] as never).catch(() => []);
 const due = out.filter((b) => needsRefresh(b as never, Date.now()));
 // A handful at a time. A studio with sixty pieces out shouldn't turn one page load into sixty
 // carrier calls — the rest are picked up on the next load, and nothing here is time-critical.
 const batch = due.slice(0, 12);
 const done = await Promise.all(batch.map((b) => refreshOne(b).catch(() => false)));
 return done.filter(Boolean).length;
}

/** Where each of these is, for the seller's screen. */
export function locate(bookings: Booking[]): Map<string, RentalWhereabouts> {
 const t = today();
 return new Map(bookings.map((b) => [b.id, whereabouts(b as never, t)]));
}
