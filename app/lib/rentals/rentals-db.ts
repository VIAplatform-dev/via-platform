import { neon } from "@neondatabase/serverless";
import { resolveSettings, type RentalSettings } from "./settings-core";
import { blockedBand, fromDateRange, toDateRange, type Span, type Tier } from "./availability-core";

// ───────────────────────────────────────────────────────────────────────────
// Rentals — storage.
//
// Four tables. The decision rules live next door in settings-core / availability-core,
// pure and tested; this file is only persistence and the one thing that CANNOT be
// done in application code: refusing a double-booking.
//
// A piece is one-of-one. Two tabs, a retried webhook, or a store approving two
// stylists a minute apart all produce the same overlap, and no amount of checking
// before the insert closes that window. So the exclusion constraint below is the
// real guarantee, and every write path treats its violation as a normal outcome.
// ───────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

/** Statuses that still hold their dates. Anything else frees the calendar. */
export const LIVE_STATUSES = ["requested", "held", "booked", "picking", "out", "due", "returned", "inspected"] as const;
export type BookingStatus = (typeof LIVE_STATUSES)[number] | "closed" | "cancelled" | "expired";
export type RequestStatus = "new" | "approved" | "declined" | "expired" | "converted";

let ensured = false;
export async function ensureRentalTables(): Promise<void> {
 if (ensured) return;
 const sql = db();
 // btree_gist is what lets a plain uuid sit beside a range in one exclusion constraint.
 await sql`CREATE EXTENSION IF NOT EXISTS btree_gist`;

 await sql`CREATE TABLE IF NOT EXISTS rental_settings (
  store_slug TEXT PRIMARY KEY,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;

 await sql`CREATE TABLE IF NOT EXISTS rental_terms (
  item_id UUID PRIMARY KEY,
  seller_id UUID NOT NULL,
  tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  replacement_cents INTEGER,
  fits_sizes TEXT,
  overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  also_for_sale BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_rental_terms_seller ON rental_terms (seller_id)`;

 await sql`CREATE TABLE IF NOT EXISTS rental_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL,
  seller_id UUID NOT NULL,
  order_id UUID,
  status TEXT NOT NULL DEFAULT 'held',
  origin TEXT NOT NULL DEFAULT 'open',
  rented DATERANGE NOT NULL,
  blocked DATERANGE NOT NULL,
  price_cents INTEGER,
  ship_by DATE,
  due_back DATE,
  returned_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  deposit_intent TEXT,
  late_fee_cents INTEGER NOT NULL DEFAULT 0,
  damage_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_rental_bookings_item ON rental_bookings (item_id, status)`;
 // WHO rented it, and where it went.
 //
 // The checkout collects all of this and puts it in the payment's metadata — and then the webhook
 // only flipped the status, so it was gone the moment the payment settled. A store with a piece out
 // couldn't see whose name was on it, couldn't email them, and couldn't post them a return label,
 // because nothing on the booking said where the piece was.
 for (const col of [
  "renter_name TEXT", "renter_email TEXT", "renter_phone TEXT",
  "ship_line1 TEXT", "ship_line2 TEXT", "ship_city TEXT", "ship_state TEXT", "ship_zip TEXT", "ship_country TEXT",
  "delivery TEXT", "return_label_url TEXT", "return_tracking TEXT", "return_label_cents INTEGER",
  // What the CARRIER says, kept beside what the settings guessed. The turnaround numbers block the
  // calendar (they have to — the booking is made before anything ships), but once a return label has
  // been scanned the carrier knows more than an estimate made weeks ago, and the store should be
  // told the real date rather than the assumed one.
  "return_carrier TEXT", "return_tracking_status TEXT", "return_tracking_eta DATE", "return_tracking_at TIMESTAMPTZ",
 ]) await sql`ALTER TABLE rental_bookings ADD COLUMN IF NOT EXISTS ${db().unsafe(col)}`;
 await sql`CREATE INDEX IF NOT EXISTS idx_rental_bookings_seller ON rental_bookings (seller_id, status)`;
 // ADD CONSTRAINT has no IF NOT EXISTS, so check the catalogue first.
 await sql`DO $$
  BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rental_bookings_no_overlap') THEN
    ALTER TABLE rental_bookings ADD CONSTRAINT rental_bookings_no_overlap
     EXCLUDE USING gist (item_id WITH =, blocked WITH &&)
     WHERE (status NOT IN ('closed','cancelled','expired'));
   END IF;
  END
 $$`;

 await sql`CREATE TABLE IF NOT EXISTS rental_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL,
  seller_id UUID NOT NULL,
  requester_name TEXT,
  requester_email TEXT,
  requester_phone TEXT,
  affiliation TEXT,
  wanted DATERANGE NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  quoted_cents INTEGER,
  holds_dates BOOLEAN NOT NULL DEFAULT false,
  hold_expires_at TIMESTAMPTZ,
  booking_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_rental_requests_seller ON rental_requests (seller_id, status)`;

 ensured = true;
}

/** Postgres raises 23P01 when the exclusion constraint refuses an overlap. */
function isOverlapViolation(e: unknown): boolean {
 const code = (e as { code?: string })?.code;
 const msg = e instanceof Error ? e.message : String(e);
 return code === "23P01" || /rental_bookings_no_overlap|conflicting key value|exclusion constraint/i.test(msg);
}

// ── settings & terms ───────────────────────────────────────────────────────

export async function getStoreSettings(storeSlug: string): Promise<RentalSettings> {
 await ensureRentalTables();
 const rows = await db()`SELECT settings FROM rental_settings WHERE store_slug = ${storeSlug} LIMIT 1`;
 return resolveSettings((rows[0]?.settings as Partial<RentalSettings>) ?? null);
}

/** Merge a patch over what's stored. Callers send only what changed. */
export async function saveStoreSettings(storeSlug: string, patch: Partial<RentalSettings>): Promise<RentalSettings> {
 await ensureRentalTables();
 const current = await getStoreSettings(storeSlug);
 const next = resolveSettings({ ...current, ...patch });
 await db()`INSERT INTO rental_settings (store_slug, settings) VALUES (${storeSlug}, ${JSON.stringify(next)}::jsonb)
  ON CONFLICT (store_slug) DO UPDATE SET settings = EXCLUDED.settings, updated_at = now()`;
 return next;
}

export type RentalTerms = {
 itemId: string; sellerId: string; tiers: Tier[]; replacementCents: number | null;
 fitsSizes: string | null; overrides: Partial<RentalSettings>; alsoForSale: boolean;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function termsRow(r: any): RentalTerms {
 const j = (v: unknown, fallback: unknown) => (typeof v === "string" ? JSON.parse(v) : v) ?? fallback;
 return {
  itemId: String(r.item_id),
  sellerId: String(r.seller_id),
  tiers: (j(r.tiers, []) as Tier[]) ?? [],
  replacementCents: r.replacement_cents == null ? null : Number(r.replacement_cents),
  fitsSizes: r.fits_sizes ? String(r.fits_sizes) : null,
  overrides: (j(r.overrides, {}) as Partial<RentalSettings>) ?? {},
  alsoForSale: r.also_for_sale !== false,
 };
}

export async function getItemTerms(itemId: string): Promise<RentalTerms | null> {
 await ensureRentalTables();
 const rows = await db()`SELECT * FROM rental_terms WHERE item_id = ${itemId} LIMIT 1`;
 return rows[0] ? termsRow(rows[0]) : null;
}

/** A piece becomes rentable the moment a terms row exists for it. */
export async function saveItemTerms(t: RentalTerms): Promise<RentalTerms> {
 await ensureRentalTables();
 const rows = await db()`
  INSERT INTO rental_terms (item_id, seller_id, tiers, replacement_cents, fits_sizes, overrides, also_for_sale)
  VALUES (${t.itemId}, ${t.sellerId}, ${JSON.stringify(t.tiers ?? [])}::jsonb, ${t.replacementCents ?? null},
          ${t.fitsSizes ?? null}, ${JSON.stringify(t.overrides ?? {})}::jsonb, ${t.alsoForSale !== false})
  ON CONFLICT (item_id) DO UPDATE SET
   tiers = EXCLUDED.tiers, replacement_cents = EXCLUDED.replacement_cents, fits_sizes = EXCLUDED.fits_sizes,
   overrides = EXCLUDED.overrides, also_for_sale = EXCLUDED.also_for_sale, updated_at = now()
  RETURNING *`;
 return termsRow(rows[0]);
}

export async function removeItemTerms(itemId: string): Promise<void> {
 await ensureRentalTables();
 await db()`DELETE FROM rental_terms WHERE item_id = ${itemId}`;
}

/**
 * Who owns a piece, and under which storefront. Storefront callers have an item id and nothing
 * else — no admin session to resolve a store from — so context comes from the item itself.
 */
export async function ownerOfItem(itemId: string): Promise<{ sellerId: string; storeSlug: string } | null> {
 const rows = await db()`SELECT i.seller_id, s.slug FROM items i JOIN sellers s ON s.id = i.seller_id
  WHERE i.id = ${itemId} LIMIT 1` as any[];
 if (!rows[0]?.seller_id || !rows[0]?.slug) return null;
 return { sellerId: String(rows[0].seller_id), storeSlug: String(rows[0].slug) };
}

/** Everything needed to quote a piece: its ladder plus its fully resolved rules. */
export async function rentalContext(itemId: string, storeSlug: string): Promise<{ settings: RentalSettings; terms: RentalTerms | null }> {
 const [store, terms] = await Promise.all([getStoreSettings(storeSlug), getItemTerms(itemId)]);
 return { settings: resolveSettings(store, terms?.overrides ?? null), terms };
}

// ── bookings ───────────────────────────────────────────────────────────────

export type Booking = {
 id: string; itemId: string; sellerId: string; orderId: string | null;
 status: BookingStatus; origin: "open" | "request";
 rented: Span | null; blocked: Span | null;
 priceCents: number | null; shipBy: string | null; dueBack: string | null;
 returnedAt: string | null; expiresAt: string | null;
 lateFeeCents: number; damageCents: number; createdAt: string;
 /** Who has it, and where it went. Written when the payment settles — see confirmBookingPaid. */
 renterName?: string | null; renterEmail?: string | null; renterPhone?: string | null;
 delivery?: "ship" | "pickup";
 ship?: { line1: string; line2: string | null; city: string; state: string; zip: string; country: string } | null;
 returnLabelUrl?: string | null; returnTracking?: string | null;
 /** The carrier's own account of the return leg. Null until a label exists and has been checked. */
 returnCarrier?: string | null; trackingStatus?: string | null; trackingEta?: string | null; trackingAt?: string | null;
 /** Joined for the seller's queue — a list of uuids is not a working screen. */
 title?: string | null; image?: string | null;
};

/** The renter, as the checkout collected them. Stripe metadata values are all strings. */
export type RenterDetails = {
 name?: string | null; email?: string | null; phone?: string | null;
 delivery?: string | null;
 line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; zip?: string | null; country?: string | null;
};

function bookingRow(r: any): Booking {
 return {
  id: String(r.id), itemId: String(r.item_id), sellerId: String(r.seller_id),
  orderId: r.order_id ? String(r.order_id) : null,
  status: String(r.status) as BookingStatus,
  origin: r.origin === "request" ? "request" : "open",
  rented: fromDateRange(r.rented == null ? null : String(r.rented)),
  blocked: fromDateRange(r.blocked == null ? null : String(r.blocked)),
  priceCents: r.price_cents == null ? null : Number(r.price_cents),
  shipBy: r.ship_by ? new Date(r.ship_by).toISOString().slice(0, 10) : null,
  dueBack: r.due_back ? new Date(r.due_back).toISOString().slice(0, 10) : null,
  returnedAt: r.returned_at ? new Date(r.returned_at).toISOString() : null,
  expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
  lateFeeCents: Number(r.late_fee_cents) || 0,
  damageCents: Number(r.damage_cents) || 0,
  createdAt: new Date(r.created_at).toISOString(),
  renterName: r.renter_name ?? null,
  renterEmail: r.renter_email ?? null,
  renterPhone: r.renter_phone ?? null,
  delivery: r.delivery === "pickup" ? "pickup" : "ship",
  ship: r.ship_line1
   ? { line1: r.ship_line1, line2: r.ship_line2 ?? null, city: r.ship_city ?? "", state: r.ship_state ?? "", zip: r.ship_zip ?? "", country: r.ship_country ?? "US" }
   : null,
  returnLabelUrl: r.return_label_url ?? null,
  returnTracking: r.return_tracking ?? null,
  returnCarrier: r.return_carrier ?? null,
  trackingStatus: r.return_tracking_status ?? null,
  trackingEta: r.return_tracking_eta ? new Date(r.return_tracking_eta).toISOString().slice(0, 10) : null,
  trackingAt: r.return_tracking_at ? new Date(r.return_tracking_at).toISOString() : null,
  title: r.title == null ? null : String(r.title),
  image: (() => {
   const imgs = typeof r.images === "string" ? JSON.parse(r.images) : r.images;
   return Array.isArray(imgs) && imgs[0] ? String(imgs[0]) : null;
  })(),
 };
}

/** The bands a piece is already spoken for — feeds the date picker and quoting. */
export async function takenBands(itemId: string): Promise<Span[]> {
 await ensureRentalTables();
 const rows = await db()`SELECT blocked FROM rental_bookings
  WHERE item_id = ${itemId} AND status NOT IN ('closed','cancelled','expired')` as any[];
 return rows.map((r) => fromDateRange(String(r.blocked))).filter((s): s is Span => s !== null);
}

export async function listBookings(sellerId: string, statuses?: BookingStatus[]): Promise<Booking[]> {
 await ensureRentalTables();
 const rows = statuses?.length
  ? await db()`SELECT b.*, i.title, i.images FROM rental_bookings b LEFT JOIN items i ON i.id = b.item_id
     WHERE b.seller_id = ${sellerId} AND b.status = ANY(${statuses}) ORDER BY lower(b.rented) ASC`
  : await db()`SELECT b.*, i.title, i.images FROM rental_bookings b LEFT JOIN items i ON i.id = b.item_id
     WHERE b.seller_id = ${sellerId} ORDER BY lower(b.rented) ASC`;
 return (rows as any[]).map(bookingRow);
}

export async function getBooking(id: string): Promise<Booking | null> {
 await ensureRentalTables();
 const rows = await db()`SELECT * FROM rental_bookings WHERE id = ${id} LIMIT 1`;
 return rows[0] ? bookingRow(rows[0] as any) : null;
}

export type NewBooking = {
 itemId: string; sellerId: string; rented: Span;
 settings: Pick<RentalSettings, "shipOutDays" | "shipBackDays" | "turnaroundDays">;
 status?: BookingStatus; origin?: "open" | "request";
 priceCents?: number | null; orderId?: string | null; expiresAt?: Date | null;
};

/**
 * Take the dates, or find out someone else already has them.
 *
 * `blocked` is computed here and frozen onto the row. It is never recomputed:
 * a store that lengthens its cleaning turnaround next week must not silently
 * move the dates of rentals already out with customers.
 *
 * Returns null when the constraint refuses — the caller shows "those dates just
 * went", which is the truth, rather than an error.
 */
export async function createBooking(b: NewBooking): Promise<Booking | null> {
 await ensureRentalTables();
 const blocked = blockedBand(b.rented, b.settings);
 try {
  const rows = await db()`
   INSERT INTO rental_bookings (item_id, seller_id, order_id, status, origin, rented, blocked, price_cents, ship_by, due_back, expires_at)
   VALUES (${b.itemId}, ${b.sellerId}, ${b.orderId ?? null}, ${b.status ?? "held"}, ${b.origin ?? "open"},
           ${toDateRange(b.rented)}::daterange, ${toDateRange(blocked)}::daterange, ${b.priceCents ?? null},
           ${blocked.start}::date, ${b.rented.end}::date, ${b.expiresAt ? b.expiresAt.toISOString() : null})
   RETURNING *`;
  return bookingRow(rows[0] as any);
 } catch (e) {
  if (isOverlapViolation(e)) return null;
  throw e;
 }
}

export async function setBookingStatus(id: string, status: BookingStatus, patch?: { orderId?: string; returnedAt?: Date; lateFeeCents?: number; damageCents?: number }): Promise<Booking | null> {
 await ensureRentalTables();
 const rows = await db()`UPDATE rental_bookings SET
   status = ${status},
   order_id = COALESCE(${patch?.orderId ?? null}, order_id),
   returned_at = COALESCE(${patch?.returnedAt ? patch.returnedAt.toISOString() : null}, returned_at),
   late_fee_cents = COALESCE(${patch?.lateFeeCents ?? null}, late_fee_cents),
   damage_cents = COALESCE(${patch?.damageCents ?? null}, damage_cents),
   updated_at = now()
  WHERE id = ${id} RETURNING *`;
 return rows[0] ? bookingRow(rows[0] as any) : null;
}

/**
 * Payment landed: the dates are now really theirs.
 *
 * Guarded to held/requested so a replayed webhook — Stripe sends the same event more than once —
 * can't drag a rental that's already out with a customer back to `booked`. Returns the booking when
 * this call is the one that confirmed it, null when there was nothing left to do.
 */
export async function confirmBookingPaid(id: string, paymentRef?: string | null, renter?: RenterDetails | null): Promise<Booking | null> {
 await ensureRentalTables();
 // COALESCE on every renter field so a replayed webhook can't blank details that are already
 // there — and so a booking the store filled in by hand isn't overwritten by a thinner payload.
 const r = renter ?? {};
 const rows = await db()`UPDATE rental_bookings SET
   status = 'booked', expires_at = NULL,
   deposit_intent = COALESCE(${paymentRef ?? null}, deposit_intent),
   renter_name = COALESCE(NULLIF(${r.name ?? null}, ''), renter_name),
   renter_email = COALESCE(NULLIF(${r.email ?? null}, ''), renter_email),
   renter_phone = COALESCE(NULLIF(${r.phone ?? null}, ''), renter_phone),
   delivery = COALESCE(NULLIF(${r.delivery ?? null}, ''), delivery),
   ship_line1 = COALESCE(NULLIF(${r.line1 ?? null}, ''), ship_line1),
   ship_line2 = COALESCE(NULLIF(${r.line2 ?? null}, ''), ship_line2),
   ship_city = COALESCE(NULLIF(${r.city ?? null}, ''), ship_city),
   ship_state = COALESCE(NULLIF(${r.state ?? null}, ''), ship_state),
   ship_zip = COALESCE(NULLIF(${r.zip ?? null}, ''), ship_zip),
   ship_country = COALESCE(NULLIF(${r.country ?? null}, ''), ship_country),
   updated_at = now()
  WHERE id = ${id} AND status IN ('held','requested') RETURNING *`;
 return rows[0] ? bookingRow(rows[0] as any) : null;
}

/** What the carrier last said about the return leg. */
export async function setRentalTracking(
 id: string, t: { status: string; eta?: string | null; carrier?: string | null },
): Promise<void> {
 await ensureRentalTables();
 await db()`UPDATE rental_bookings SET
   return_tracking_status = ${t.status},
   return_tracking_eta = ${t.eta ?? null},
   return_carrier = COALESCE(${t.carrier ?? null}, return_carrier),
   return_tracking_at = now(), updated_at = now()
  WHERE id = ${id}`;
}

/** Store the return label bought for a rental, so it isn't bought twice. */
export async function setRentalReturnLabel(id: string, label: { url: string; trackingNumber?: string | null; costCents?: number | null }): Promise<void> {
 await ensureRentalTables();
 await db()`UPDATE rental_bookings SET return_label_url = ${label.url}, return_tracking = ${label.trackingNumber ?? null},
   return_label_cents = ${label.costCents ?? null}, updated_at = now() WHERE id = ${id}`;
}

// ── requests ───────────────────────────────────────────────────────────────

export type RentalRequest = {
 id: string; itemId: string; sellerId: string;
 requesterName: string | null; requesterEmail: string | null; requesterPhone: string | null;
 affiliation: string | null; wanted: Span | null; message: string | null;
 status: RequestStatus; quotedCents: number | null;
 holdsDates: boolean; holdExpiresAt: string | null; bookingId: string | null; createdAt: string;
};

function requestRow(r: any): RentalRequest {
 return {
  id: String(r.id), itemId: String(r.item_id), sellerId: String(r.seller_id),
  requesterName: r.requester_name ? String(r.requester_name) : null,
  requesterEmail: r.requester_email ? String(r.requester_email) : null,
  requesterPhone: r.requester_phone ? String(r.requester_phone) : null,
  affiliation: r.affiliation ? String(r.affiliation) : null,
  wanted: fromDateRange(r.wanted == null ? null : String(r.wanted)),
  message: r.message ? String(r.message) : null,
  status: String(r.status) as RequestStatus,
  quotedCents: r.quoted_cents == null ? null : Number(r.quoted_cents),
  holdsDates: r.holds_dates === true,
  holdExpiresAt: r.hold_expires_at ? new Date(r.hold_expires_at).toISOString() : null,
  bookingId: r.booking_id ? String(r.booking_id) : null,
  createdAt: new Date(r.created_at).toISOString(),
 };
}

export type NewRequest = {
 itemId: string; sellerId: string; wanted: Span; settings: RentalSettings;
 requesterName?: string; requesterEmail?: string; requesterPhone?: string;
 affiliation?: string; message?: string;
};

/**
 * Log an application to rent.
 *
 * Whether it holds the dates is the STORE'S choice, not ours. When it does, the
 * hold is a real booking row in `requested` — so the exclusion constraint covers
 * it and two stylists cannot both be approved for the same week — and it expires,
 * so one unanswered enquiry can't sit on a gown indefinitely.
 *
 * `holds_dates` is snapshotted onto the row: changing the setting later must not
 * retroactively change what an existing request did.
 */
export async function createRequest(r: NewRequest): Promise<{ request: RentalRequest; held: boolean } | null> {
 await ensureRentalTables();
 const holds = r.settings.requestHoldsDates;
 const expires = holds ? new Date(Date.now() + r.settings.requestHoldHours * 3_600_000) : null;

 let bookingId: string | null = null;
 if (holds) {
  const hold = await createBooking({
   itemId: r.itemId, sellerId: r.sellerId, rented: r.wanted, settings: r.settings,
   status: "requested", origin: "request", expiresAt: expires,
  });
  if (!hold) return null; // someone already has those dates
  bookingId = hold.id;
 }

 const rows = await db()`
  INSERT INTO rental_requests (item_id, seller_id, requester_name, requester_email, requester_phone,
   affiliation, wanted, message, status, holds_dates, hold_expires_at, booking_id)
  VALUES (${r.itemId}, ${r.sellerId}, ${r.requesterName ?? null}, ${r.requesterEmail ?? null}, ${r.requesterPhone ?? null},
   ${r.affiliation ?? null}, ${toDateRange(r.wanted)}::daterange, ${r.message ?? null}, 'new',
   ${holds}, ${expires ? expires.toISOString() : null}, ${bookingId})
  RETURNING *`;
 return { request: requestRow(rows[0] as any), held: holds };
}

export async function listRequests(sellerId: string, statuses?: RequestStatus[]): Promise<RentalRequest[]> {
 await ensureRentalTables();
 const rows = statuses?.length
  ? await db()`SELECT * FROM rental_requests WHERE seller_id = ${sellerId} AND status = ANY(${statuses}) ORDER BY created_at DESC`
  : await db()`SELECT * FROM rental_requests WHERE seller_id = ${sellerId} ORDER BY created_at DESC`;
 return (rows as any[]).map(requestRow);
}

/**
 * The store says yes, optionally at its own price. If the request wasn't holding
 * the dates, approval takes them now — and can still lose, because someone may
 * have booked them while the store was deciding.
 */
export async function approveRequest(id: string, sellerId: string, opts: { quotedCents?: number | null; settings: RentalSettings }): Promise<{ request: RentalRequest; booking: Booking } | null> {
 await ensureRentalTables();
 const rows = await db()`SELECT * FROM rental_requests WHERE id = ${id} AND seller_id = ${sellerId} LIMIT 1`;
 if (!rows[0]) return null;
 const req = requestRow(rows[0] as any);
 if (!req.wanted || (req.status !== "new" && req.status !== "approved")) return null;

 let booking = req.bookingId ? await getBooking(req.bookingId) : null;
 if (!booking) {
  booking = await createBooking({
   itemId: req.itemId, sellerId, rented: req.wanted, settings: opts.settings,
   status: "requested", origin: "request",
   expiresAt: new Date(Date.now() + opts.settings.requestHoldHours * 3_600_000),
  });
  if (!booking) return null; // taken while the store deliberated
 }
 if (opts.quotedCents != null) {
  await db()`UPDATE rental_bookings SET price_cents = ${opts.quotedCents}, updated_at = now() WHERE id = ${booking.id}`;
 }
 const out = await db()`UPDATE rental_requests SET status = 'approved', quoted_cents = COALESCE(${opts.quotedCents ?? null}, quoted_cents),
   booking_id = ${booking.id}, updated_at = now() WHERE id = ${id} RETURNING *`;
 return { request: requestRow(out[0] as any), booking };
}

export async function declineRequest(id: string, sellerId: string): Promise<boolean> {
 await ensureRentalTables();
 const rows = await db()`UPDATE rental_requests SET status = 'declined', updated_at = now()
  WHERE id = ${id} AND seller_id = ${sellerId} AND status IN ('new','approved') RETURNING booking_id`;
 if (!rows[0]) return false;
 const bookingId = (rows[0] as any).booking_id;
 // Declining must free the dates immediately — that's the point of declining.
 if (bookingId) await db()`UPDATE rental_bookings SET status = 'cancelled', updated_at = now() WHERE id = ${bookingId}`;
 return true;
}

export type OverdueRental = {
 id: string; itemId: string; sellerId: string; storeSlug: string;
 dueBack: string; daysLate: number; status: string;
 lateFeeCents: number; replacementCents: number | null; overrides: Partial<RentalSettings>;
 title: string | null;
};

/** Rentals past their return date, with everything needed to price the lateness. */
export async function listOverdue(today: string): Promise<OverdueRental[]> {
 await ensureRentalTables();
 const rows = await db()`
  SELECT b.id, b.item_id, b.seller_id, b.status, b.due_back, b.late_fee_cents,
         s.slug AS store_slug, t.overrides, t.replacement_cents, i.title
  FROM rental_bookings b
  JOIN sellers s ON s.id = b.seller_id
  LEFT JOIN rental_terms t ON t.item_id = b.item_id
  LEFT JOIN items i ON i.id = b.item_id
  WHERE b.status IN ('out','due') AND b.due_back IS NOT NULL AND b.due_back < ${today}::date` as any[];
 const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
 return rows.map((r) => {
  const due = new Date(r.due_back).toISOString().slice(0, 10);
  const raw = typeof r.overrides === "string" ? JSON.parse(r.overrides) : r.overrides;
  return {
   id: String(r.id), itemId: String(r.item_id), sellerId: String(r.seller_id),
   storeSlug: String(r.store_slug), status: String(r.status),
   dueBack: due,
   daysLate: Math.max(0, Math.round((ms(today) - ms(due)) / 86_400_000)),
   lateFeeCents: Number(r.late_fee_cents) || 0,
   replacementCents: r.replacement_cents == null ? null : Number(r.replacement_cents),
   overrides: (raw ?? {}) as Partial<RentalSettings>,
   title: r.title == null ? null : String(r.title),
  };
 });
}

/**
 * Record what lateness has cost so far.
 *
 * The total is RECOMPUTED from days late, never incremented. A cron that runs twice, retries after a
 * timeout, or gets redeployed mid-run would otherwise charge a customer twice for the same day —
 * and this is money, so the operation has to be safe to repeat rather than merely unlikely to.
 */
export async function setLateFee(id: string, cents: number): Promise<boolean> {
 await ensureRentalTables();
 const rows = await db()`UPDATE rental_bookings
  SET late_fee_cents = ${cents}, status = 'due', updated_at = now()
  WHERE id = ${id} AND status IN ('out','due') AND (late_fee_cents IS DISTINCT FROM ${cents} OR status <> 'due')
  RETURNING id` as unknown[];
 return rows.length > 0;
}

/** Rental applications waiting on an answer — one number for the sidebar. */
export async function countPending(sellerId: string): Promise<{ requests: number; total: number }> {
 await ensureRentalTables();
 const [r] = await db()`SELECT count(*)::int AS n FROM rental_requests WHERE seller_id = ${sellerId} AND status = 'new'` as any[];
 const requests = r?.n ?? 0;
 return { requests, total: requests };
}

/**
 * Release what nobody acted on: expired soft holds and abandoned checkouts.
 * Runs on the daily cron, same shape as the `reservations` sweeper.
 */
export async function sweepExpired(): Promise<{ bookings: number; requests: number }> {
 await ensureRentalTables();
 const sql = db();
 const b = await sql`UPDATE rental_bookings SET status = 'expired', updated_at = now()
  WHERE status IN ('requested','held') AND expires_at IS NOT NULL AND expires_at < now() RETURNING id` as any[];
 const r = await sql`UPDATE rental_requests SET status = 'expired', updated_at = now()
  WHERE status = 'new' AND hold_expires_at IS NOT NULL AND hold_expires_at < now() RETURNING id` as any[];
 return { bookings: b.length, requests: r.length };
}
