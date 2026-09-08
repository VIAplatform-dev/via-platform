import { and, eq, isNull, like } from "drizzle-orm";
import { getDb, items, reservations } from "./db/index";
import { reserveItem, releaseReservation, currentReservationRef } from "./db/inventory";
import { holdRef, parseHoldRef, holdUntil, holdsDueSoon, type HoldSummary } from "./holds-core";

// Holds ride the reservations table so a held piece is unavailable to every path that already
// respects reservations (checkout, cart-intent, Market Mode) and is released by the same sweep.

export type Hold = HoldSummary & { title: string | null; image: string | null; priceCents: number | null; currency: string | null };

/** Keep a piece back for someone. Null when the piece is not active (already held, reserved or sold). */
export async function placeHold(itemId: string, name: string, until: { days?: number; until?: string }, now = new Date()) {
 const seconds = holdUntil(until, now);
 return reserveItem(itemId, holdRef(name), seconds);
}

/** Release a hold. Refuses to touch a reservation that is a buyer mid-checkout or an accepted offer. */
export async function releaseHold(itemId: string): Promise<{ released: boolean; reason?: string }> {
 const ref = await currentReservationRef(itemId);
 if (ref === null) return { released: false, reason: "Nothing is holding this piece" };
 if (!parseHoldRef(ref)) return { released: false, reason: "This piece is reserved by a buyer, not a hold" };
 await releaseReservation(itemId);
 return { released: true };
}

export async function listHolds(sellerId: string, now = new Date()): Promise<{ holds: Hold[]; today: Hold[]; thisWeek: Hold[] }> {
 const db = getDb();
 const rows = await db
 .select({ itemId: reservations.itemId, buyerRef: reservations.buyerRef, expiresAt: reservations.expiresAt, title: items.title, images: items.images, priceCents: items.priceCents, currency: items.currency })
 .from(reservations)
 .innerJoin(items, eq(items.id, reservations.itemId))
 .where(and(eq(items.sellerId, sellerId), eq(items.status, "reserved"), isNull(reservations.releasedAt), like(reservations.buyerRef, "hold:%")))
 .orderBy(reservations.expiresAt);
 const holds: Hold[] = rows.map((r) => ({
  itemId: r.itemId,
  name: parseHoldRef(r.buyerRef)?.name ?? "",
  expiresAt: r.expiresAt.toISOString(),
  title: r.title ?? null,
  image: (r.images as string[] | null)?.[0] ?? null,
  priceCents: r.priceCents ?? null,
  currency: r.currency ?? null,
 }));
 return { holds, ...holdsDueSoon(holds, now) };
}
