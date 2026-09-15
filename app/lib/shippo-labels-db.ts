import { neon } from "@neondatabase/serverless";

// Maps an order to the Shippo transaction id of its purchased label, so the label can be voided
// (refunded) if the order is later refunded before it ships. Kept in its own self-healing table so
// we don't need a Drizzle migration on the orders table.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 await db()`CREATE TABLE IF NOT EXISTS shippo_labels (
  order_id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  voided BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`.catch(() => {});
 // The adjustment webhook arrives knowing only the carrier's id, so that column is searched too.
 await db()`CREATE INDEX IF NOT EXISTS shippo_labels_transaction ON shippo_labels (transaction_id)`.catch(() => {});
 ensured = true;
}

/** Record the label's Shippo transaction id when a label is bought for an order. */
export async function recordLabelTransaction(orderId: string, transactionId: string): Promise<void> {
 if (!transactionId) return;
 await ensureTable();
 await db()`INSERT INTO shippo_labels (order_id, transaction_id) VALUES (${orderId}, ${transactionId})
  ON CONFLICT (order_id) DO UPDATE SET transaction_id = EXCLUDED.transaction_id`.catch(() => {});
}

/** The label transaction id for an order (if we bought one), for voiding on refund. Null if none/voided. */
export async function getLabelTransaction(orderId: string): Promise<string | null> {
 await ensureTable();
 const rows = (await db()`SELECT transaction_id FROM shippo_labels WHERE order_id = ${orderId} AND voided = false`.catch(() => [])) as { transaction_id: string }[];
 return rows[0]?.transaction_id ?? null;
}

/** Mark a label voided so we never try to refund it twice. */
export async function markLabelVoided(orderId: string): Promise<void> {
 await ensureTable();
 await db()`UPDATE shippo_labels SET voided = true WHERE order_id = ${orderId}`.catch(() => {});
}

/**
 * Which order a carrier's shipment id belongs to. The reverse of the map above.
 *
 * A carrier adjustment arrives weeks after the label, naming only its own id, so this is the only
 * way back to an order and therefore to a store. Voided labels are included deliberately: a parcel
 * that shipped and was later re-rated still produces a real bill, whatever happened to the order.
 */
export async function orderForLabelTransaction(transactionId: string): Promise<string | null> {
 if (!transactionId) return null;
 await ensureTable();
 const rows = (await db()`SELECT order_id FROM shippo_labels WHERE transaction_id = ${transactionId} LIMIT 1`.catch(() => [])) as { order_id: string }[];
 return rows[0]?.order_id ?? null;
}
