// A ledger of what postage actually cost VYA beyond what buyers paid, per order, per store.
//
// WHY A TABLE AND NOT AN EMAIL. This was one alert to ops saying "thin shipping margin on order X",
// sent and forgotten. Nothing accumulated, nothing could be totalled, and the two reasons for a
// shortfall (she under-declared the parcel / VYA priced the route thin) arrived in the same
// sentence. So a store that under-declared every parcel cost money indefinitely and there was no
// number anyone could point at.
//
// RECORDED, NOT CHARGED. Nothing here bills anybody. It writes down what happened and who it
// belongs to, which is the thing that has to exist before a charge-back can be fair: an invoice
// nobody can reconcile is worse than no invoice.

import { neon } from "@neondatabase/serverless";
import { classifyShortfall, type Shortfall, type ShortfallInput } from "./shipping-shortfall";

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 await db()`CREATE TABLE IF NOT EXISTS shipping_shortfalls (
  order_id TEXT PRIMARY KEY,
  store_slug TEXT NOT NULL,
  shortfall_cents INTEGER NOT NULL,
  cause TEXT NOT NULL,
  recoverable BOOLEAN NOT NULL,
  note TEXT,
  paid_cents INTEGER,
  label_cost_cents INTEGER,
  recovered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await db()`CREATE INDEX IF NOT EXISTS shipping_shortfalls_store ON shipping_shortfalls (store_slug, created_at DESC)`.catch(() => {});
 ensured = true;
}

export type ShortfallRow = {
 orderId: string;
 storeSlug: string;
 shortfallCents: number;
 cause: string;
 recoverable: boolean;
 note: string | null;
 paidCents: number | null;
 labelCostCents: number | null;
 recoveredAt: string | null;
 createdAt: string;
};

/**
 * Record what an order's postage cost beyond what was collected.
 *
 * Only writes when there IS a shortfall: a ledger of zeroes is a table nobody can read. Keyed on
 * the order so a retried label purchase updates its row rather than adding a second one.
 *
 * Returns the classification either way, so the caller can act on it without a second call.
 */
export async function recordShortfall(args: { orderId: string; storeSlug: string } & ShortfallInput): Promise<Shortfall> {
 const s = classifyShortfall(args);
 if (s.shortfallCents <= 0) return s;
 await ensureTable();
 await db()`
  INSERT INTO shipping_shortfalls (order_id, store_slug, shortfall_cents, cause, recoverable, note, paid_cents, label_cost_cents)
  VALUES (${args.orderId}, ${args.storeSlug}, ${s.shortfallCents}, ${s.cause}, ${s.recoverable}, ${s.note},
          ${Math.round(Number(args.paidCents) || 0)}, ${Math.round(Number(args.labelCostCents) || 0)})
  ON CONFLICT (order_id) DO UPDATE SET
   shortfall_cents = ${s.shortfallCents}, cause = ${s.cause}, recoverable = ${s.recoverable},
   note = ${s.note}, paid_cents = ${Math.round(Number(args.paidCents) || 0)},
   label_cost_cents = ${Math.round(Number(args.labelCostCents) || 0)}
 `;
 return s;
}

/** What one store is down, split by whose it is. The number a charge-back conversation starts from. */
export async function shortfallsForStore(storeSlug: string, limit = 100): Promise<{ rows: ShortfallRow[]; recoverableCents: number; absorbedCents: number }> {
 await ensureTable();
 /* eslint-disable @typescript-eslint/no-explicit-any */
 const raw = (await db()`
  SELECT * FROM shipping_shortfalls WHERE store_slug = ${storeSlug}
  ORDER BY created_at DESC LIMIT ${Math.min(500, Math.max(1, limit))}
 `.catch(() => [])) as any[];
 const rows: ShortfallRow[] = raw.map((r) => ({
  orderId: r.order_id, storeSlug: r.store_slug,
  shortfallCents: Number(r.shortfall_cents) || 0,
  cause: String(r.cause), recoverable: r.recoverable === true, note: r.note ?? null,
  paidCents: r.paid_cents ?? null, labelCostCents: r.label_cost_cents ?? null,
  recoveredAt: r.recovered_at ? new Date(r.recovered_at).toISOString() : null,
  createdAt: new Date(r.created_at).toISOString(),
 }));
 // Only what is still outstanding: a recovered row is history, not a debt.
 const open = rows.filter((r) => !r.recoveredAt);
 return {
  rows,
  recoverableCents: open.filter((r) => r.recoverable).reduce((n, r) => n + r.shortfallCents, 0),
  absorbedCents: open.filter((r) => !r.recoverable).reduce((n, r) => n + r.shortfallCents, 0),
 };
}

/** Mark one as settled, however it was settled. Recovery itself happens outside VYA for now. */
export async function markShortfallRecovered(orderId: string): Promise<void> {
 await ensureTable();
 await db()`UPDATE shipping_shortfalls SET recovered_at = now() WHERE order_id = ${orderId} AND recovered_at IS NULL`;
}
