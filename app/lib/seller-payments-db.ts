import { neon } from "@neondatabase/serverless";
import { currentStripeMode, type StripeMode } from "./stripe-mode.ts";

// ───────────────────────────────────────────────────────────────────────────
// A store's payment-acceptance state. Each store gets a Stripe Connect *Express*
// account so it can accept card payments and have the money settle to its own
// bank — the SELLER is the merchant of record. VYA's revenue is the subscription,
// not the sale, so VYA is not in this money flow (beyond an optional future fee).
// ───────────────────────────────────────────────────────────────────────────

export type SellerPayments = {
 storeSlug: string;
 stripeAccountId: string | null;
 shipAccountId: string | null; // shipping sub-account handle (EasyPost Child-User key / Shippo managed-account id)
 chargesEnabled: boolean; // can accept payments
 payoutsEnabled: boolean; // can receive payouts to bank
 detailsSubmitted: boolean; // finished Stripe onboarding
 /** Which Stripe world this account lives in. Null on rows saved before the stamp existed — see
  *  stripe-mode.ts, which treats those as live (production has only ever run one key). */
 stripeMode: StripeMode | null;
};

const getDatabaseUrl = () => {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return url;
};

let tableReady: Promise<void> | null = null;
function ensureTable(): Promise<void> {
 if (!tableReady) {
 const sql = neon(getDatabaseUrl());
 tableReady = (async () => {
 await sql`
 CREATE TABLE IF NOT EXISTS seller_payments (
 store_slug TEXT PRIMARY KEY,
 stripe_account_id TEXT UNIQUE,
 charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ DEFAULT NOW(),
 updated_at TIMESTAMPTZ DEFAULT NOW()
 )
 `;
 // Shipping sub-account per store (EasyPost Forge Child-User key / Shippo managed-account id).
 // Self-healing add so existing rows get the column with no migration step.
 await sql`ALTER TABLE seller_payments ADD COLUMN IF NOT EXISTS ship_account_id TEXT`;
 // 'test' or 'live' — a connected account id looks identical in both, so the only way to know
 // which world it belongs to is to record it when we save it. See stripe-mode.ts.
 await sql`ALTER TABLE seller_payments ADD COLUMN IF NOT EXISTS stripe_mode TEXT`;
 })().catch((e) => {
 tableReady = null;
 throw e;
 });
 }
 return tableReady;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowTo(r: any): SellerPayments {
 return {
 storeSlug: r.store_slug,
 stripeAccountId: r.stripe_account_id ?? null,
 shipAccountId: r.ship_account_id ?? null,
 chargesEnabled: Boolean(r.charges_enabled),
 payoutsEnabled: Boolean(r.payouts_enabled),
 detailsSubmitted: Boolean(r.details_submitted),
 stripeMode: (r.stripe_mode as StripeMode | null) ?? null,
 };
}

export async function getSellerPayments(storeSlug: string): Promise<SellerPayments | null> {
 await ensureTable();
 const sql = neon(getDatabaseUrl());
 const rows = await sql`SELECT * FROM seller_payments WHERE store_slug = ${storeSlug}`;
 return rows.length ? rowTo(rows[0]) : null;
}

/** Look up the store that owns a connected account (for webhooks). */
export async function getStoreSlugByStripeAccount(accountId: string): Promise<string | null> {
 await ensureTable();
 const sql = neon(getDatabaseUrl());
 const rows = await sql`SELECT store_slug FROM seller_payments WHERE stripe_account_id = ${accountId}`;
 return rows.length ? (rows[0].store_slug as string) : null;
}

/** Record a newly created Connect account for a store. */
export async function saveStripeAccount(storeSlug: string, accountId: string): Promise<void> {
 await ensureTable();
 const sql = neon(getDatabaseUrl());
 // Stamped with the mode of the key that made it — the account id itself cannot tell us later.
 const mode = currentStripeMode();
 await sql`
 INSERT INTO seller_payments (store_slug, stripe_account_id, stripe_mode, updated_at)
 VALUES (${storeSlug}, ${accountId}, ${mode}, NOW())
 ON CONFLICT (store_slug) DO UPDATE SET stripe_account_id = EXCLUDED.stripe_account_id, stripe_mode = EXCLUDED.stripe_mode, updated_at = NOW()
 `;
}

/** The store's shipping sub-account handle (EasyPost Child-User key / Shippo managed-account id), or null. */
export async function getShipAccountId(storeSlug: string): Promise<string | null> {
 await ensureTable();
 const sql = neon(getDatabaseUrl());
 const rows = await sql`SELECT ship_account_id FROM seller_payments WHERE store_slug = ${storeSlug}`;
 return rows.length ? ((rows[0].ship_account_id as string) ?? null) : null;
}

/** Record a store's shipping sub-account handle (created lazily on first shipment). */
export async function saveShipAccount(storeSlug: string, shipAccountId: string): Promise<void> {
 await ensureTable();
 const sql = neon(getDatabaseUrl());
 await sql`
 INSERT INTO seller_payments (store_slug, ship_account_id, updated_at)
 VALUES (${storeSlug}, ${shipAccountId}, NOW())
 ON CONFLICT (store_slug) DO UPDATE SET ship_account_id = EXCLUDED.ship_account_id, updated_at = NOW()
 `;
}

/** Sync the capability flags pulled from Stripe (on status refresh or webhook). */
export async function updateSellerStatus(
 storeSlug: string,
 s: { chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean },
): Promise<void> {
 await ensureTable();
 const sql = neon(getDatabaseUrl());
 await sql`
 UPDATE seller_payments
 SET charges_enabled = ${s.chargesEnabled}, payouts_enabled = ${s.payoutsEnabled},
 details_submitted = ${s.detailsSubmitted}, updated_at = NOW()
 WHERE store_slug = ${storeSlug}
 `;
}
