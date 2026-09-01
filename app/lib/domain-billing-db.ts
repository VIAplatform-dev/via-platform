import { neon } from "@neondatabase/serverless";

// ───────────────────────────────────────────────────────────────────────────
// Domain renewal billing.
//
// A domain bought through VYA is registered on VYA's Vercel account with
// auto-renew on. Year one nets out — the seller's card is charged the same
// amount VYA pays. Every year after that, Vercel charges VYA and nothing
// charges the seller, so the cost quietly accumulates with every domain sold.
//
// This is the ledger that closes that loop: one row per domain per renewal
// period, written BEFORE the charge is attempted, with a unique constraint that
// makes a double-charge impossible even if the cron overlaps itself or a
// deploy replays it.
// ───────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

export type RenewalStatus = "charged" | "failed" | "skipped";

export type RenewalRow = {
 domain: string;
 storeSlug: string;
 periodEnd: string; // the expiry this charge covers — the idempotency key
 amountCents: number;
 status: RenewalStatus;
 detail: string | null;
 chargedAt: string | null;
};

let ensured = false;
async function ensure() {
 if (ensured) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS domain_renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  store_slug TEXT NOT NULL,
  period_end DATE NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  detail TEXT,
  stripe_payment_intent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 // One attempt per domain per renewal period. This is what makes the cron safe
 // to run daily, overlap itself, or be replayed by a redeploy.
 await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_renewals_period ON domain_renewals (domain, period_end)`;
 ensured = true;
}

/**
 * Claim this domain's renewal period, returning false if it's already been
 * attempted. Written before the charge so a crash mid-charge can't produce a
 * second attempt — a stuck row is visible and fixable; a double charge is not.
 */
export async function claimRenewal(domain: string, storeSlug: string, periodEnd: string): Promise<boolean> {
 await ensure();
 const rows = (await db()`
  INSERT INTO domain_renewals (domain, store_slug, period_end, status)
  VALUES (${domain}, ${storeSlug}, ${periodEnd}, 'pending')
  ON CONFLICT (domain, period_end) DO NOTHING
  RETURNING id
 `) as unknown[];
 return rows.length > 0;
}

export async function settleRenewal(domain: string, periodEnd: string, r: { status: RenewalStatus; amountCents?: number; detail?: string | null; paymentIntent?: string | null }): Promise<void> {
 await ensure();
 await db()`
  UPDATE domain_renewals
  SET status = ${r.status}, amount_cents = ${r.amountCents ?? 0}, detail = ${r.detail ?? null}, stripe_payment_intent = ${r.paymentIntent ?? null}
  WHERE domain = ${domain} AND period_end = ${periodEnd}
 `;
}

/** Recent renewal attempts, newest first — for the admin and for support questions. */
export async function listRenewals(limit = 100): Promise<RenewalRow[]> {
 await ensure();
 const rows = (await db()`
  SELECT domain, store_slug, to_char(period_end, 'YYYY-MM-DD') AS period_end, amount_cents, status, detail, created_at
  FROM domain_renewals ORDER BY created_at DESC LIMIT ${limit}
 `) as Array<Record<string, unknown>>;
 return rows.map((r) => ({
  domain: String(r.domain),
  storeSlug: String(r.store_slug),
  periodEnd: String(r.period_end),
  amountCents: Number(r.amount_cents) || 0,
  status: (r.status === "charged" || r.status === "failed" ? r.status : "skipped") as RenewalStatus,
  detail: r.detail ? String(r.detail) : null,
  chargedAt: r.created_at ? new Date(r.created_at as string).toISOString() : null,
 }));
}

/** Every store with a connected domain — the set the renewal cron walks. */
export async function storesWithDomains(): Promise<{ storeSlug: string; domain: string }[]> {
 const rows = (await db()`
  SELECT store_slug, custom_domain FROM storefront_settings
  WHERE custom_domain IS NOT NULL AND custom_domain <> ''
 `) as Array<Record<string, unknown>>;
 return rows.map((r) => ({ storeSlug: String(r.store_slug), domain: String(r.custom_domain) }));
}
