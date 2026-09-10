// The rows a seller brought over from her own spreadsheet.
//
// Kept apart from VYA's own records on purpose. An imported figure is her word for what happened
// before (or alongside) VYA; a VYA figure is something the platform actually did. Mixing them into
// one table would make it impossible to say which is which, undo one import, or warn her that a
// month now holds both — which is how a P&L quietly doubles.
//
// Costs could almost live in store_expenses (its `source` already allows "import"), but revenue has
// no home there and splitting one upload across two tables makes "undo this import" unanswerable.

import { neon } from "@neondatabase/serverless";
import type { LedgerEntry } from "./pnl-grid";

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ready = false;
async function ensure() {
 if (ready) return;
 await db()`CREATE TABLE IF NOT EXISTS store_pnl_imports (
  id SERIAL PRIMARY KEY,
  store_slug TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  occurred_on DATE NOT NULL,
  label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  direction TEXT NOT NULL,
  row_key TEXT NOT NULL,
  file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await db()`CREATE INDEX IF NOT EXISTS idx_pnl_imports_store ON store_pnl_imports(store_slug, occurred_on)`;
 ready = true;
}

export type ImportBatch = { batchId: string; fileName: string | null; rows: number; inCents: number; outCents: number; from: string; to: string; createdAt: string };

/** Write one upload. Returns the batch id, which is what makes it undoable as a unit. */
export async function saveImport(storeSlug: string, fileName: string | null, rows: { date: string; label: string; amountCents: number; direction: "in" | "out"; rowKey: string }[]): Promise<string> {
 await ensure();
 const batchId = `imp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
 for (const r of rows.slice(0, 20_000)) {
  await db()`
   INSERT INTO store_pnl_imports (store_slug, batch_id, occurred_on, label, amount_cents, direction, row_key, file_name)
   VALUES (${storeSlug}, ${batchId}, ${r.date}, ${r.label.slice(0, 200)}, ${Math.abs(Math.round(r.amountCents))}, ${r.direction === "out" ? "out" : "in"}, ${r.rowKey}, ${fileName?.slice(0, 200) ?? null})`;
 }
 return batchId;
}

/** Everything she has imported, as ledger entries the grid can add up. */
export async function importedEntries(storeSlug: string): Promise<LedgerEntry[]> {
 await ensure();
 const rows = (await db()`
  SELECT occurred_on, label, amount_cents, direction, row_key
  FROM store_pnl_imports WHERE store_slug = ${storeSlug}
  ORDER BY occurred_on`) as Array<Record<string, unknown>>;
 return rows.map((r) => ({
  date: String(r.occurred_on).slice(0, 10),
  rowKey: String(r.row_key),
  amountCents: Number(r.amount_cents) || 0,
  direction: String(r.direction) === "out" ? "out" : "in",
  imported: true,
 }));
}

/** The uploads themselves, so she can see what she brought over and take one back out. */
export async function listImports(storeSlug: string): Promise<ImportBatch[]> {
 await ensure();
 const rows = (await db()`
  SELECT batch_id, MAX(file_name) AS file_name, COUNT(*)::int AS rows,
   COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cents ELSE 0 END), 0)::int AS in_cents,
   COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cents ELSE 0 END), 0)::int AS out_cents,
   MIN(occurred_on) AS from_on, MAX(occurred_on) AS to_on, MIN(created_at) AS created_at
  FROM store_pnl_imports WHERE store_slug = ${storeSlug}
  GROUP BY batch_id ORDER BY MIN(created_at) DESC`) as Array<Record<string, unknown>>;
 return rows.map((r) => ({
  batchId: String(r.batch_id),
  fileName: r.file_name ? String(r.file_name) : null,
  rows: Number(r.rows) || 0,
  inCents: Number(r.in_cents) || 0,
  outCents: Number(r.out_cents) || 0,
  from: String(r.from_on).slice(0, 10),
  to: String(r.to_on).slice(0, 10),
  createdAt: new Date(String(r.created_at)).toISOString(),
 }));
}

/** Take one upload back out, whole. */
export async function deleteImport(storeSlug: string, batchId: string): Promise<number> {
 await ensure();
 const rows = (await db()`DELETE FROM store_pnl_imports WHERE store_slug = ${storeSlug} AND batch_id = ${batchId} RETURNING id`) as unknown[];
 return rows.length;
}
