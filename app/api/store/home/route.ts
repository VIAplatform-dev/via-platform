import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listSellerItems } from "@/app/lib/db/inventory";
import { listSellerOrders, listPickupOrderIds } from "@/app/lib/db/orders";
import { getStoreAnalytics } from "@/app/lib/store-analytics-db";
import { getConsignmentSummary } from "@/app/lib/consignment-db";
import { getConversationsByStore } from "@/app/lib/messaging-db";
import { listHolds } from "@/app/lib/holds-db";
import { attentionForStore } from "@/app/lib/attention-db";
import { getMarketMode } from "@/app/lib/market/mode-db";
import { agingBuckets } from "@/app/lib/aging-core";
import { groupIntoParcels } from "@/app/lib/parcels-core";
import { getStoreSettings as getRentalSettings, listBookings } from "@/app/lib/rentals/rentals-db";
import { getAppointmentSettings, listAppointments } from "@/app/lib/appointments/appointments-db";

export const dynamic = "force-dynamic";

// EVERYTHING THE PHONE'S HOME SCREEN NEEDS, IN ONE ROUND TRIP.
//
// It was fifteen. Fifteen separate HTTPS requests, fired in parallel the instant the screen mounted,
// and Home was only ever as fast as the slowest of them — which on a stall's cellular signal is not
// a theoretical problem. Worse, one of the fifteen was /api/store/items, which returns the WHOLE
// inventory: a screen that wanted "412 live · 2 over 90 days" was downloading every piece and every
// image URL the store has to work it out on the phone.
//
// So this route does two things, and the second matters more than the first:
//
//   1. One request instead of fifteen. One TLS handshake, one round trip.
//   2. COUNTS, NOT CATALOGUES. The aging arithmetic runs here, next to the database, and what
//      crosses the wire is three numbers. The lists that DO cross are the ones Home actually draws
//      by name — parcels to post, unread threads, consignors owed, holds lapsing — and they are
//      short by nature and capped anyway.
//
// Every figure is composed from the SAME helper the dedicated route uses, so this can never quietly
// disagree with the screen a seller taps into from here. Nothing is reimplemented.
//
// Failures are per-section, not global. A carrier outage inside rentals, or an analytics query that
// times out, must not blank the whole screen — each block falls back to its own empty state and the
// rest of Home still renders. That is the difference between a slow day and a broken app.

/** Small lists still cross the wire; these are the ceilings, so one busy day can't make it big. */
const MAX_ROWS = 20;

export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const seller = await getSellerBySlug(slug);
 if (!seller) return NextResponse.json({ error: "No such store" }, { status: 404 });

 // The two opt-in modes decide whether their sections are fetched at all — a shop that doesn't rent
 // pays nothing for the rentals block.
 const [rentalSettings, apptSettings] = await Promise.all([
  getRentalSettings(slug).catch(() => null),
  getAppointmentSettings(slug).catch(() => null),
 ]);
 const rentalsOn = Boolean(rentalSettings?.enabled);
 const apptsOn = Boolean(apptSettings?.enabled);
 const day = todayDay();

 const [
  analytics, items, orders, pickupIds, consignment, conversations, holds, attention, market, bookings, appointments,
 ] = await Promise.all([
  getStoreAnalytics(slug, 1).catch(() => null),
  listSellerItems(seller.id).catch(() => []),
  listSellerOrders(seller.id).catch(() => []),
  listPickupOrderIds(seller.id).then((ids) => new Set(ids)).catch(() => new Set<string>()),
  getConsignmentSummary(slug).catch(() => null),
  getConversationsByStore(slug).catch(() => []),
  listHolds(seller.id).catch(() => ({ holds: [], today: [], thisWeek: [] })),
  attentionForStore(slug).catch(() => ({ rows: [], lowConfidenceIds: [] })),
  getMarketMode(slug).catch(() => false),
  rentalsOn ? listBookings(seller.id).catch(() => []) : Promise.resolve([]),
  apptsOn ? listAppointments(seller.id, day, day).catch(() => []) : Promise.resolve([]),
 ]);

 // The expensive one, spent here rather than on the wire.
 const aging = agingBuckets(items);
 const live = items.filter((i) => i.status === "active").length;
 const drafts = items.filter((i) => i.status === "draft").length;

 const orderRows = orders.map((o) => ({
  ...o,
  deliveryMethod: (pickupIds.has(String(o.id)) ? "pickup" : "ship") as "pickup" | "ship",
 }));

 return NextResponse.json({
  ok: true,
  // NO STORE IDENTITY HERE ON PURPOSE. Name, currency and website come from /api/store/me, which
  // resolves them from the static store map AND the database — logic worth exactly one home, since
  // getting it wrong is how a seller was once greeted by her own slug. Home keeps that call; it is
  // cheap, and every other screen shares the cached answer anyway.
  takings: {
   revenueCents: analytics?.revenueCents ?? 0,
   priorRevenueCents: analytics?.prior?.revenueCents ?? 0,
  },
  inventory: { live, drafts, aging },
  // Parcels, not pieces — the same grouping the Orders screen counts in.
  parcels: groupIntoParcels(orderRows).slice(0, MAX_ROWS),
  inbox: { unread: conversations.filter((c) => c.storeUnread > 0).slice(0, MAX_ROWS) },
  consignment: {
   payable: (consignment?.activity ?? []).filter((a) => a.status === "payable").slice(0, MAX_ROWS),
  },
  holds: { today: (holds.today ?? []).slice(0, MAX_ROWS) },
  attention: attention.rows ?? [],
  market: { enabled: Boolean(market) },
  rentals: rentalsOn ? { enabled: true, bookings } : { enabled: false, bookings: [] },
  appointments: apptsOn ? { enabled: true, day, appointments } : { enabled: false, day, appointments: [] },
 });
}

/** Today as the server writes days, in the store's own reckoning. */
function todayDay(now = new Date()): string {
 const p = (n: number) => String(n).padStart(2, "0");
 return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
