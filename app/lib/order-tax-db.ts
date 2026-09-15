// Which Stripe Tax transaction belongs to which order.
//
// Needed because a refund has to REVERSE the exact transaction the sale filed, and Stripe gives no
// way to look one up by the reference we supplied when creating it. Kept in its own self-healing
// table, the same shape as shippo_labels, so no migration is needed on the orders table.
//
// Keyed on the PaymentIntent rather than the order id: an order row is per PIECE, so a bag of three
// shares one intent and files ONE tax transaction between them. Keying on the order would record
// the same transaction three times and try to reverse it three times.

import { neon } from "@neondatabase/serverless";

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 await db()`CREATE TABLE IF NOT EXISTS order_tax_transactions (
  payment_intent TEXT PRIMARY KEY,
  tax_transaction_id TEXT NOT NULL,
  stripe_account_id TEXT NOT NULL,
  reversed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`.catch(() => {});
 ensured = true;
}

/** Remember the transaction a sale filed, so a refund can undo it. */
export async function recordOrderTaxTransaction(paymentIntent: string, taxTransactionId: string, stripeAccountId: string): Promise<void> {
 if (!paymentIntent || !taxTransactionId) return;
 await ensureTable();
 await db()`INSERT INTO order_tax_transactions (payment_intent, tax_transaction_id, stripe_account_id)
  VALUES (${paymentIntent}, ${taxTransactionId}, ${stripeAccountId})
  ON CONFLICT (payment_intent) DO NOTHING`.catch(() => {});
}

/** The transaction still standing against this intent, or null when there is none or it is reversed. */
export async function taxTransactionFor(paymentIntent: string): Promise<{ id: string; acctId: string } | null> {
 if (!paymentIntent) return null;
 await ensureTable();
 const rows = (await db()`SELECT tax_transaction_id, stripe_account_id FROM order_tax_transactions
  WHERE payment_intent = ${paymentIntent} AND reversed_at IS NULL LIMIT 1`.catch(() => [])) as { tax_transaction_id: string; stripe_account_id: string }[];
 const r = rows[0];
 return r ? { id: r.tax_transaction_id, acctId: r.stripe_account_id } : null;
}

/** Mark it undone, so a second refund on the same intent files one reversal and not two. */
export async function markTaxTransactionReversed(paymentIntent: string): Promise<void> {
 await ensureTable();
 await db()`UPDATE order_tax_transactions SET reversed_at = now()
  WHERE payment_intent = ${paymentIntent} AND reversed_at IS NULL`.catch(() => {});
}
