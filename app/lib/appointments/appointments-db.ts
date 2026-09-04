import { neon } from "@neondatabase/serverless";
import { resolveAppointmentSettings, type AppointmentSettings } from "./settings-core";

// ───────────────────────────────────────────────────────────────────────────
// Appointments — storage.
//
// Its own tables, because appointments are their own feature. They were briefly kept alongside
// rentals while being built, which made a shop that only sells switch on renting to open its diary.
// ───────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

export type AppointmentStatus = "pending" | "booked" | "attended" | "no-show" | "cancelled";

let ensured = false;
export async function ensureAppointmentTables(): Promise<void> {
 if (ensured) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS appointment_settings (
  store_slug TEXT PRIMARY KEY,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await sql`CREATE TABLE IF NOT EXISTS store_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL,
  kind TEXT NOT NULL DEFAULT 'Try-on',
  on_day DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  note TEXT,
  item_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  deposit_cents INTEGER NOT NULL DEFAULT 0,
  deposit_intent TEXT,
  deposit_paid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_store_appointments_day ON store_appointments (seller_id, on_day, status)`;
 // Added after the table shipped: the marker that stops a reminder going twice.
 await sql`ALTER TABLE store_appointments ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ`;
 ensured = true;
}

// ── settings ───────────────────────────────────────────────────────────────

export async function getAppointmentSettings(storeSlug: string): Promise<AppointmentSettings> {
 await ensureAppointmentTables();
 const rows = await db()`SELECT settings FROM appointment_settings WHERE store_slug = ${storeSlug} LIMIT 1`;
 return resolveAppointmentSettings((rows[0]?.settings as Partial<AppointmentSettings>) ?? null);
}

export async function saveAppointmentSettings(storeSlug: string, patch: Partial<AppointmentSettings>): Promise<AppointmentSettings> {
 await ensureAppointmentTables();
 const next = resolveAppointmentSettings({ ...(await getAppointmentSettings(storeSlug)), ...patch });
 await db()`INSERT INTO appointment_settings (store_slug, settings) VALUES (${storeSlug}, ${JSON.stringify(next)}::jsonb)
  ON CONFLICT (store_slug) DO UPDATE SET settings = EXCLUDED.settings, updated_at = now()`;
 return next;
}

// ── the diary ──────────────────────────────────────────────────────────────

export type Appointment = {
 id: string; sellerId: string; kind: string; day: string; start: string; end: string;
 customerName: string | null; customerEmail: string | null; customerPhone: string | null;
 note: string | null; itemId: string | null; status: AppointmentStatus;
 depositCents: number; depositPaid: boolean; createdAt: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function row(r: any): Appointment {
 return {
  id: String(r.id), sellerId: String(r.seller_id), kind: String(r.kind),
  day: new Date(r.on_day).toISOString().slice(0, 10),
  start: String(r.start_time), end: String(r.end_time),
  customerName: r.customer_name ? String(r.customer_name) : null,
  customerEmail: r.customer_email ? String(r.customer_email) : null,
  customerPhone: r.customer_phone ? String(r.customer_phone) : null,
  note: r.note ? String(r.note) : null,
  itemId: r.item_id ? String(r.item_id) : null,
  status: String(r.status) as AppointmentStatus,
  depositCents: Number(r.deposit_cents) || 0,
  depositPaid: r.deposit_paid === true,
  createdAt: new Date(r.created_at).toISOString(),
 };
}

export async function listAppointments(sellerId: string, from: string, to: string): Promise<Appointment[]> {
 await ensureAppointmentTables();
 const rows = await db()`SELECT * FROM store_appointments
  WHERE seller_id = ${sellerId} AND on_day BETWEEN ${from}::date AND ${to}::date AND status <> 'cancelled'
  ORDER BY on_day ASC, start_time ASC` as any[];
 return rows.map(row);
}

/**
 * Just the times, for the scheduler.
 *
 * A pending booking still consumes its slot: while the shop decides, nobody else can take that 2pm.
 * An unpaid deposit does NOT hold it — otherwise abandoning a payment page blocks the diary.
 */
export async function bookedSlots(sellerId: string, from: string, to: string): Promise<{ day: string; start: string }[]> {
 return (await listAppointments(sellerId, from, to))
  .filter((a) => a.depositCents === 0 || a.depositPaid)
  .map((a) => ({ day: a.day, start: a.start }));
}

export async function countPendingAppointments(sellerId: string): Promise<number> {
 await ensureAppointmentTables();
 const [r] = await db()`SELECT count(*)::int AS n FROM store_appointments
  WHERE seller_id = ${sellerId} AND status = 'pending' AND (deposit_cents = 0 OR deposit_paid)` as any[];
 return r?.n ?? 0;
}

/** The ones waiting on an answer, newest request first — what the inbox shows. */
export async function listPendingAppointments(sellerId: string, limit = 50): Promise<Appointment[]> {
 await ensureAppointmentTables();
 const rows = await db()`SELECT * FROM store_appointments
  WHERE seller_id = ${sellerId} AND status = 'pending' AND (deposit_cents = 0 OR deposit_paid)
  ORDER BY on_day ASC, start_time ASC LIMIT ${limit}` as any[];
 return rows.map(row);
}

export type NewAppointment = {
 sellerId: string; kind: string; day: string; start: string; end: string;
 customerName?: string | null; customerEmail?: string | null; customerPhone?: string | null;
 note?: string | null; itemId?: string | null;
 status?: AppointmentStatus; depositCents?: number;
};

export async function createAppointment(a: NewAppointment): Promise<Appointment> {
 await ensureAppointmentTables();
 const rows = await db()`INSERT INTO store_appointments
  (seller_id, kind, on_day, start_time, end_time, customer_name, customer_email, customer_phone, note, item_id, status, deposit_cents)
  VALUES (${a.sellerId}, ${a.kind}, ${a.day}::date, ${a.start}, ${a.end},
   ${a.customerName ?? null}, ${a.customerEmail ?? null}, ${a.customerPhone ?? null},
   ${a.note ?? null}, ${a.itemId ?? null}, ${a.status ?? "pending"}, ${a.depositCents ?? 0})
  RETURNING *`;
 return row(rows[0]);
}

export async function getAppointment(id: string): Promise<Appointment | null> {
 await ensureAppointmentTables();
 const rows = await db()`SELECT * FROM store_appointments WHERE id = ${id} LIMIT 1`;
 return rows[0] ? row(rows[0] as any) : null;
}

/** A no-show is kept, not deleted — it's why a shop stops holding things for someone. */
export async function setAppointmentStatus(id: string, sellerId: string, status: AppointmentStatus): Promise<Appointment | null> {
 await ensureAppointmentTables();
 const rows = await db()`UPDATE store_appointments SET status = ${status}, updated_at = now()
  WHERE id = ${id} AND seller_id = ${sellerId} RETURNING *`;
 return rows[0] ? row(rows[0] as any) : null;
}

export async function markDepositIntent(id: string, intentId: string): Promise<void> {
 await ensureAppointmentTables();
 await db()`UPDATE store_appointments SET deposit_intent = ${intentId}, updated_at = now() WHERE id = ${id}`;
}

/**
 * The deposit landed. Guarded so a replayed webhook can't rewind an appointment the shop has
 * already dealt with, and so it never un-cancels one.
 */
export async function markDepositPaid(id: string, requireApproval: boolean): Promise<Appointment | null> {
 await ensureAppointmentTables();
 const next: AppointmentStatus = requireApproval ? "pending" : "booked";
 const rows = await db()`UPDATE store_appointments
  SET deposit_paid = true, status = ${next}, updated_at = now()
  WHERE id = ${id} AND deposit_paid = false AND status <> 'cancelled' RETURNING *`;
 return rows[0] ? row(rows[0] as any) : null;
}

/** Unpaid deposits don't hold a slot, but they shouldn't linger in the diary either. */
export async function sweepUnpaidAppointments(olderThanMinutes = 30): Promise<number> {
 await ensureAppointmentTables();
 const rows = await db()`UPDATE store_appointments SET status = 'cancelled', updated_at = now()
  WHERE status = 'pending' AND deposit_cents > 0 AND deposit_paid = false
    AND created_at < now() - (${olderThanMinutes} * interval '1 minute') RETURNING id` as unknown[];
 return rows.length;
}

// ── reminders ──────────────────────────────────────────────────────────────

/** An appointment the reminder cron might be due to send, with the store slug it belongs to. */
export type RemindableAppointment = Appointment & { storeSlug: string };

/**
 * Confirmed appointments in the next `withinDays` that have never been reminded.
 *
 * Deliberately NOT filtered by lead time here: every store sets its own, so the cron reads each
 * store's setting and decides. Pending ones are skipped — reminding someone about a time the shop
 * hasn't agreed to yet is worse than saying nothing.
 */
export async function listRemindable(withinDays = 14): Promise<RemindableAppointment[]> {
 await ensureAppointmentTables();
 const rows = await db()`SELECT a.*, s.slug AS store_slug FROM store_appointments a
  JOIN sellers s ON s.id = a.seller_id
  WHERE a.status = 'booked'
    AND a.reminder_sent_at IS NULL
    AND (a.deposit_cents = 0 OR a.deposit_paid)
    AND a.on_day BETWEEN CURRENT_DATE AND CURRENT_DATE + (${withinDays}::int * INTERVAL '1 day')
  ORDER BY a.on_day ASC, a.start_time ASC
  LIMIT 500` as any[];
 return rows.map((r) => ({ ...row(r), storeSlug: String(r.store_slug) }));
}

/** Claim the reminder for one appointment. Returns false if another run got there first. */
export async function claimReminder(id: string): Promise<boolean> {
 await ensureAppointmentTables();
 const rows = await db()`UPDATE store_appointments SET reminder_sent_at = now()
  WHERE id = ${id} AND reminder_sent_at IS NULL RETURNING id` as unknown[];
 return rows.length > 0;
}
