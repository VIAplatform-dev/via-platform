import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { resolveSplitPct, consignorCutCents, type SplitRule } from "./consignment-logic";

// ─────────────────────────────────────────────────────────────────────────────
// Consignment core — native to VYA (no Shopify). A thin layer over the existing products +
// orders: six tables (settings, consignors, split rules, items, ledger, payouts). Pure business
// logic lives in consignment-logic.ts.
// ─────────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

let ensured = false;
export async function ensureConsignmentTables(): Promise<void> {
 if (ensured) return;
 const sql = db();
 await sql`
 CREATE TABLE IF NOT EXISTS consignment_settings (
  store_slug TEXT PRIMARY KEY,
  payout_methods TEXT[] NOT NULL DEFAULT ARRAY['store_credit'],
  default_payout_method TEXT NOT NULL DEFAULT 'store_credit',
  payout_cycle TEXT NOT NULL DEFAULT 'monthly',
  hold_days INT NOT NULL DEFAULT 14,
  auto_payout BOOLEAN NOT NULL DEFAULT false,
  store_credit_bonus_pct INT,
  store_default_split_pct INT NOT NULL DEFAULT 50,
  require_agreement BOOLEAN NOT NULL DEFAULT true,
  agreement_terms TEXT,
  collect_w9 BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`;
 await sql`
 CREATE TABLE IF NOT EXISTS consignors (
  id BIGSERIAL PRIMARY KEY,
  store_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  stripe_account_id TEXT,
  default_split_pct INT,
  payout_method TEXT,
  agreement_accepted_at TIMESTAMPTZ,
  portal_token TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`;
 // Self-healing: add columns/types to tables that were created under an earlier schema
 // (CREATE TABLE IF NOT EXISTS won't alter an existing table).
 await sql`ALTER TABLE consignors ADD COLUMN IF NOT EXISTS portal_token TEXT`;
 await sql`ALTER TABLE consignment_settings ADD COLUMN IF NOT EXISTS auto_payout BOOLEAN NOT NULL DEFAULT false`;
 await sql`CREATE INDEX IF NOT EXISTS idx_consignors_store ON consignors(store_slug, status)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_consignors_token ON consignors(portal_token)`;
 await sql`
 CREATE TABLE IF NOT EXISTS consignment_splits (
  id BIGSERIAL PRIMARY KEY,
  store_slug TEXT NOT NULL,
  min_price_cents INT NOT NULL DEFAULT 0,
  max_price_cents INT,
  category TEXT,
  split_pct INT NOT NULL
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_splits_store ON consignment_splits(store_slug)`;
 await sql`
 CREATE TABLE IF NOT EXISTS consignment_items (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  store_slug TEXT NOT NULL,
  consignor_id BIGINT NOT NULL,
  split_pct INT NOT NULL,
  listed_price_cents INT,
  intake_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  sold_order_id TEXT,
  sold_price_cents INT,
  sold_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`;
 await sql`ALTER TABLE consignment_items ALTER COLUMN product_id TYPE TEXT USING product_id::text`;
 await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_citems_product ON consignment_items(product_id)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_citems_store ON consignment_items(store_slug, status)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_citems_consignor ON consignment_items(consignor_id)`;
 await sql`
 CREATE TABLE IF NOT EXISTS consignor_ledger (
  id BIGSERIAL PRIMARY KEY,
  store_slug TEXT NOT NULL,
  consignor_id BIGINT NOT NULL,
  type TEXT NOT NULL,
  amount_cents INT NOT NULL,
  item_id BIGINT,
  order_id TEXT,
  payout_id BIGINT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_ledger_consignor ON consignor_ledger(consignor_id, created_at)`;
 await sql`
 CREATE TABLE IF NOT EXISTS consignor_payouts (
  id BIGSERIAL PRIMARY KEY,
  store_slug TEXT NOT NULL,
  consignor_id BIGINT NOT NULL,
  amount_cents INT NOT NULL,
  method TEXT NOT NULL,
  stripe_transfer_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_payouts_consignor ON consignor_payouts(consignor_id)`;
 ensured = true;
}

// ── Settings ──────────────────────────────────────────────────────────────────
export type ConsignmentSettings = {
 storeSlug: string;
 payoutMethods: string[];
 defaultPayoutMethod: string;
 payoutCycle: string;
 holdDays: number;
 autoPayout: boolean;
 storeCreditBonusPct: number | null;
 storeDefaultSplitPct: number;
 requireAgreement: boolean;
 agreementTerms: string | null;
 collectW9: boolean;
};

const DEFAULT_SETTINGS = (storeSlug: string): ConsignmentSettings => ({
 storeSlug, payoutMethods: ["store_credit"], defaultPayoutMethod: "store_credit", payoutCycle: "monthly",
 holdDays: 14, autoPayout: false, storeCreditBonusPct: null, storeDefaultSplitPct: 50, requireAgreement: true, agreementTerms: null, collectW9: true,
});

export async function getConsignmentSettings(storeSlug: string): Promise<ConsignmentSettings> {
 await ensureConsignmentTables();
 const sql = db();
 const rows = (await sql`SELECT * FROM consignment_settings WHERE store_slug = ${storeSlug}`) as Array<Record<string, unknown>>;
 if (!rows.length) return DEFAULT_SETTINGS(storeSlug);
 const r = rows[0];
 return {
 storeSlug,
 payoutMethods: (r.payout_methods as string[]) ?? ["store_credit"],
 defaultPayoutMethod: (r.default_payout_method as string) ?? "store_credit",
 payoutCycle: (r.payout_cycle as string) ?? "monthly",
 holdDays: Number(r.hold_days ?? 14),
 autoPayout: !!r.auto_payout,
 storeCreditBonusPct: r.store_credit_bonus_pct != null ? Number(r.store_credit_bonus_pct) : null,
 storeDefaultSplitPct: Number(r.store_default_split_pct ?? 50),
 requireAgreement: !!r.require_agreement,
 agreementTerms: (r.agreement_terms as string) ?? null,
 collectW9: !!r.collect_w9,
 };
}

export async function upsertConsignmentSettings(storeSlug: string, s: Partial<Omit<ConsignmentSettings, "storeSlug">>): Promise<void> {
 await ensureConsignmentTables();
 const cur = await getConsignmentSettings(storeSlug);
 const m = { ...cur, ...s };
 const sql = db();
 await sql`
 INSERT INTO consignment_settings (store_slug, payout_methods, default_payout_method, payout_cycle, hold_days, auto_payout, store_credit_bonus_pct, store_default_split_pct, require_agreement, agreement_terms, collect_w9, updated_at)
 VALUES (${storeSlug}, ${m.payoutMethods}, ${m.defaultPayoutMethod}, ${m.payoutCycle}, ${m.holdDays}, ${m.autoPayout}, ${m.storeCreditBonusPct}, ${m.storeDefaultSplitPct}, ${m.requireAgreement}, ${m.agreementTerms}, ${m.collectW9}, NOW())
 ON CONFLICT (store_slug) DO UPDATE SET
  payout_methods = EXCLUDED.payout_methods, default_payout_method = EXCLUDED.default_payout_method, payout_cycle = EXCLUDED.payout_cycle,
  hold_days = EXCLUDED.hold_days, auto_payout = EXCLUDED.auto_payout, store_credit_bonus_pct = EXCLUDED.store_credit_bonus_pct, store_default_split_pct = EXCLUDED.store_default_split_pct,
  require_agreement = EXCLUDED.require_agreement, agreement_terms = EXCLUDED.agreement_terms, collect_w9 = EXCLUDED.collect_w9, updated_at = NOW()`;
}

// ── Consignors ────────────────────────────────────────────────────────────────
export type Consignor = {
 id: number; storeSlug: string; name: string; email: string | null; phone: string | null;
 stripeAccountId: string | null; defaultSplitPct: number | null; payoutMethod: string | null;
 agreementAcceptedAt: string | null; portalToken: string | null; status: string;
};

const toConsignor = (r: Record<string, unknown>): Consignor => ({
 id: Number(r.id), storeSlug: r.store_slug as string, name: r.name as string,
 email: (r.email as string) ?? null, phone: (r.phone as string) ?? null,
 stripeAccountId: (r.stripe_account_id as string) ?? null,
 defaultSplitPct: r.default_split_pct != null ? Number(r.default_split_pct) : null,
 payoutMethod: (r.payout_method as string) ?? null,
 agreementAcceptedAt: r.agreement_accepted_at ? String(r.agreement_accepted_at) : null,
 portalToken: (r.portal_token as string) ?? null,
 status: r.status as string,
});

export async function listConsignors(storeSlug: string): Promise<Consignor[]> {
 await ensureConsignmentTables();
 const sql = db();
 const rows = (await sql`SELECT * FROM consignors WHERE store_slug = ${storeSlug} ORDER BY name ASC`) as Array<Record<string, unknown>>;
 return rows.map(toConsignor);
}

export async function getConsignor(id: number): Promise<Consignor | null> {
 await ensureConsignmentTables();
 const sql = db();
 const rows = (await sql`SELECT * FROM consignors WHERE id = ${id}`) as Array<Record<string, unknown>>;
 return rows.length ? toConsignor(rows[0]) : null;
}

export async function createConsignor(storeSlug: string, data: { name: string; email?: string | null; phone?: string | null; defaultSplitPct?: number | null; payoutMethod?: string | null }): Promise<Consignor> {
 await ensureConsignmentTables();
 const sql = db();
 const token = randomUUID().replace(/-/g, "");
 const rows = (await sql`
 INSERT INTO consignors (store_slug, name, email, phone, default_split_pct, payout_method, portal_token)
 VALUES (${storeSlug}, ${data.name}, ${data.email ?? null}, ${data.phone ?? null}, ${data.defaultSplitPct ?? null}, ${data.payoutMethod ?? null}, ${token})
 RETURNING *`) as Array<Record<string, unknown>>;
 return toConsignor(rows[0]);
}

/** Active consignors with a connected Stripe account — candidates for the auto-payout cron. */
export async function listStripeConnectedConsignors(): Promise<Array<{ id: number; storeSlug: string; stripeAccountId: string }>> {
 await ensureConsignmentTables();
 const sql = db();
 const rows = (await sql`SELECT id, store_slug, stripe_account_id FROM consignors WHERE stripe_account_id IS NOT NULL AND status = 'active'`) as Array<Record<string, unknown>>;
 return rows.map((r) => ({ id: Number(r.id), storeSlug: r.store_slug as string, stripeAccountId: r.stripe_account_id as string }));
}

export async function getConsignorsByEmail(email: string): Promise<Consignor[]> {
 await ensureConsignmentTables();
 const sql = db();
 const rows = (await sql`SELECT * FROM consignors WHERE LOWER(email) = LOWER(${email}) AND status = 'active'`) as Array<Record<string, unknown>>;
 return rows.map(toConsignor);
}

export async function getConsignorByToken(token: string): Promise<Consignor | null> {
 await ensureConsignmentTables();
 const sql = db();
 const rows = (await sql`SELECT * FROM consignors WHERE portal_token = ${token} LIMIT 1`) as Array<Record<string, unknown>>;
 return rows.length ? toConsignor(rows[0]) : null;
}

export async function updateConsignor(id: number, patch: Partial<{ name: string; email: string | null; phone: string | null; defaultSplitPct: number | null; payoutMethod: string | null; stripeAccountId: string | null; agreementAcceptedAt: string | null; status: string }>): Promise<void> {
 await ensureConsignmentTables();
 const cur = await getConsignor(id);
 if (!cur) return;
 const m = { ...cur };
 for (const [k, v] of Object.entries(patch)) if (v !== undefined) (m as Record<string, unknown>)[k] = v;
 const sql = db();
 await sql`UPDATE consignors SET name=${m.name}, email=${m.email}, phone=${m.phone}, default_split_pct=${m.defaultSplitPct}, payout_method=${m.payoutMethod}, stripe_account_id=${m.stripeAccountId}, agreement_accepted_at=${m.agreementAcceptedAt}, status=${m.status} WHERE id=${id}`;
}

/** Hard-delete a consignor and all their consignment records. For cleanup / mistaken adds —
 *  their ledger + payout history goes with them, so use deactivate (status) to just hide one. */
export async function deleteConsignor(id: number): Promise<void> {
 await ensureConsignmentTables();
 const sql = db();
 await sql`DELETE FROM consignor_ledger WHERE consignor_id = ${id}`;
 await sql`DELETE FROM consignor_payouts WHERE consignor_id = ${id}`;
 await sql`DELETE FROM consignment_items WHERE consignor_id = ${id}`;
 await sql`DELETE FROM consignors WHERE id = ${id}`;
}

// ── Split rules ───────────────────────────────────────────────────────────────
export async function getSplitRules(storeSlug: string): Promise<SplitRule[]> {
 await ensureConsignmentTables();
 const sql = db();
 const rows = (await sql`SELECT min_price_cents, max_price_cents, category, split_pct FROM consignment_splits WHERE store_slug = ${storeSlug}`) as Array<Record<string, unknown>>;
 return rows.map((r) => ({
 minPriceCents: Number(r.min_price_cents),
 maxPriceCents: r.max_price_cents != null ? Number(r.max_price_cents) : null,
 category: (r.category as string) ?? null,
 splitPct: Number(r.split_pct),
 }));
}

export async function setSplitRules(storeSlug: string, rules: SplitRule[]): Promise<void> {
 await ensureConsignmentTables();
 const sql = db();
 await sql`DELETE FROM consignment_splits WHERE store_slug = ${storeSlug}`;
 for (const r of rules) {
 await sql`INSERT INTO consignment_splits (store_slug, min_price_cents, max_price_cents, category, split_pct) VALUES (${storeSlug}, ${r.minPriceCents}, ${r.maxPriceCents}, ${r.category}, ${r.splitPct})`;
 }
}

/** The split % to freeze onto an item at intake — the consignor's rate, else a store rule, else default. */
export async function resolveSplitForIntake(storeSlug: string, consignorId: number, priceCents: number, category: string | null): Promise<number> {
 const [consignor, rules, settings] = await Promise.all([getConsignor(consignorId), getSplitRules(storeSlug), getConsignmentSettings(storeSlug)]);
 return resolveSplitPct({
 consignorDefaultPct: consignor?.defaultSplitPct ?? null,
 priceCents, category, rules, storeDefaultPct: settings.storeDefaultSplitPct,
 });
}

// ── Consignment items (intake) ────────────────────────────────────────────────
export type ConsignmentItem = {
 id: number; productId: string; storeSlug: string; consignorId: number; splitPct: number;
 listedPriceCents: number | null; intakeDate: string; expiresAt: string | null;
 status: string; soldOrderId: string | null; soldPriceCents: number | null; soldAt: string | null;
};

const toItem = (r: Record<string, unknown>): ConsignmentItem => ({
 id: Number(r.id), productId: String(r.product_id), storeSlug: r.store_slug as string, consignorId: Number(r.consignor_id),
 splitPct: Number(r.split_pct), listedPriceCents: r.listed_price_cents != null ? Number(r.listed_price_cents) : null,
 intakeDate: String(r.intake_date), expiresAt: r.expires_at ? String(r.expires_at) : null, status: r.status as string,
 soldOrderId: (r.sold_order_id as string) ?? null, soldPriceCents: r.sold_price_cents != null ? Number(r.sold_price_cents) : null,
 soldAt: r.sold_at ? String(r.sold_at) : null,
});

export async function createConsignmentItem(data: { productId: string; storeSlug: string; consignorId: number; splitPct: number; listedPriceCents?: number | null; expiresAt?: string | null }): Promise<ConsignmentItem> {
 await ensureConsignmentTables();
 const sql = db();
 const rows = (await sql`
 INSERT INTO consignment_items (product_id, store_slug, consignor_id, split_pct, listed_price_cents, expires_at)
 VALUES (${data.productId}, ${data.storeSlug}, ${data.consignorId}, ${data.splitPct}, ${data.listedPriceCents ?? null}, ${data.expiresAt ?? null})
 ON CONFLICT (product_id) DO UPDATE SET consignor_id = EXCLUDED.consignor_id, split_pct = EXCLUDED.split_pct, listed_price_cents = EXCLUDED.listed_price_cents, expires_at = EXCLUDED.expires_at
 RETURNING *`) as Array<Record<string, unknown>>;
 return toItem(rows[0]);
}

export async function getConsignmentItemByProduct(productId: string): Promise<ConsignmentItem | null> {
 await ensureConsignmentTables();
 const sql = db();
 const rows = (await sql`SELECT * FROM consignment_items WHERE product_id = ${productId}`) as Array<Record<string, unknown>>;
 return rows.length ? toItem(rows[0]) : null;
}

export async function listConsignmentItemsByConsignor(consignorId: number): Promise<ConsignmentItem[]> {
 await ensureConsignmentTables();
 const sql = db();
 const rows = (await sql`SELECT * FROM consignment_items WHERE consignor_id = ${consignorId} ORDER BY created_at DESC`) as Array<Record<string, unknown>>;
 return rows.map(toItem);
}

/**
 * Sale hook — when a VYA order sells a consigned item, mark it sold and credit the consignor
 * their split. Idempotent: only an item still 'active' is credited, so a re-delivered webhook
 * won't double-pay.
 */
export async function creditConsignedSale(opts: { productId: string; orderId: string; soldPriceCents: number }): Promise<{ credited: boolean; consignorId?: number; cutCents?: number }> {
 await ensureConsignmentTables();
 const sql = db();
 const rows = (await sql`SELECT id, store_slug, consignor_id, split_pct FROM consignment_items WHERE product_id = ${opts.productId} AND status = 'active' LIMIT 1`) as Array<Record<string, unknown>>;
 if (!rows.length) return { credited: false };
 const item = rows[0];
 const itemId = Number(item.id);
 const consignorId = Number(item.consignor_id);
 const cutCents = consignorCutCents(opts.soldPriceCents, Number(item.split_pct));
 const updated = (await sql`UPDATE consignment_items SET status = 'sold', sold_order_id = ${opts.orderId}, sold_price_cents = ${opts.soldPriceCents}, sold_at = NOW() WHERE id = ${itemId} AND status = 'active' RETURNING id`) as unknown[];
 if (!updated.length) return { credited: false };
 await sql`INSERT INTO consignor_ledger (store_slug, consignor_id, type, amount_cents, item_id, order_id) VALUES (${item.store_slug as string}, ${consignorId}, 'sale_credit', ${cutCents}, ${itemId}, ${opts.orderId})`;
 return { credited: true, consignorId, cutCents };
}

/**
 * Refund hook — undo a consigned sale: return the item to 'active' (it's relisted) and DEBIT back the
 * consignor's credit, so a refunded sale is never paid out. Idempotent: only a 'sold' item matching
 * this order reverses (the guarded UPDATE means a repeated refund can't double-debit).
 */
export async function reverseConsignedSale(opts: { productId: string; orderId: string }): Promise<{ reversed: boolean; consignorId?: number; cutCents?: number }> {
 await ensureConsignmentTables();
 const sql = db();
 const rows = (await sql`SELECT id, store_slug, consignor_id, split_pct, sold_price_cents FROM consignment_items WHERE product_id = ${opts.productId} AND status = 'sold' AND sold_order_id = ${opts.orderId} LIMIT 1`) as Array<Record<string, unknown>>;
 if (!rows.length) return { reversed: false };
 const item = rows[0];
 const itemId = Number(item.id);
 const consignorId = Number(item.consignor_id);
 const cutCents = consignorCutCents(Number(item.sold_price_cents), Number(item.split_pct));
 const updated = (await sql`UPDATE consignment_items SET status = 'active', sold_order_id = NULL, sold_price_cents = NULL, sold_at = NULL WHERE id = ${itemId} AND status = 'sold' AND sold_order_id = ${opts.orderId} RETURNING id`) as unknown[];
 if (!updated.length) return { reversed: false };
 await sql`INSERT INTO consignor_ledger (store_slug, consignor_id, type, amount_cents, item_id, order_id) VALUES (${item.store_slug as string}, ${consignorId}, 'sale_reversal', ${-Math.abs(cutCents)}, ${itemId}, ${opts.orderId})`;
 return { reversed: true, consignorId, cutCents };
}

// ── Ledger / balance / payouts ────────────────────────────────────────────────
export async function getConsignorBalanceCents(consignorId: number): Promise<number> {
 await ensureConsignmentTables();
 const sql = db();
 const rows = (await sql`SELECT COALESCE(SUM(amount_cents), 0) AS bal FROM consignor_ledger WHERE consignor_id = ${consignorId}`) as Array<Record<string, unknown>>;
 return Number(rows[0]?.bal ?? 0);
}

/** Balance eligible for payout now: sale credits older than the store's return-hold, minus payouts. */
export async function getPayableBalanceCents(consignorId: number, holdDays: number): Promise<number> {
 await ensureConsignmentTables();
 const sql = db();
 const rows = (await sql`
 SELECT COALESCE(SUM(amount_cents), 0) AS bal FROM consignor_ledger
 WHERE consignor_id = ${consignorId} AND (type NOT IN ('sale_credit', 'sale_reversal') OR created_at <= NOW() - (${holdDays} || ' days')::interval)`) as Array<Record<string, unknown>>;
 return Number(rows[0]?.bal ?? 0);
}

export async function listLedger(consignorId: number, limit = 200): Promise<Array<{ type: string; amountCents: number; orderId: string | null; createdAt: string; note: string | null }>> {
 await ensureConsignmentTables();
 const sql = db();
 const rows = (await sql`SELECT type, amount_cents, order_id, created_at, note FROM consignor_ledger WHERE consignor_id = ${consignorId} ORDER BY created_at DESC LIMIT ${limit}`) as Array<Record<string, unknown>>;
 return rows.map((r) => ({ type: r.type as string, amountCents: Number(r.amount_cents), orderId: (r.order_id as string) ?? null, createdAt: String(r.created_at), note: (r.note as string) ?? null }));
}

export type Payout = { id: number; consignorId: number; amountCents: number; method: string; status: string; stripeTransferId: string | null; createdAt: string; paidAt: string | null };

const toPayout = (r: Record<string, unknown>): Payout => ({
 id: Number(r.id), consignorId: Number(r.consignor_id), amountCents: Number(r.amount_cents), method: r.method as string,
 status: r.status as string, stripeTransferId: (r.stripe_transfer_id as string) ?? null, createdAt: String(r.created_at), paidAt: r.paid_at ? String(r.paid_at) : null,
});

export async function listPayouts(consignorId: number, limit = 100): Promise<Payout[]> {
 await ensureConsignmentTables();
 const sql = db();
 const rows = (await sql`SELECT * FROM consignor_payouts WHERE consignor_id = ${consignorId} ORDER BY created_at DESC LIMIT ${limit}`) as Array<Record<string, unknown>>;
 return rows.map(toPayout);
}

/** Record a payout + its ledger debit. Returns the payout id. `status`/`stripeTransferId` are
 *  set by the caller once the Stripe transfer (or manual payout) resolves. */
export async function recordPayout(opts: { storeSlug: string; consignorId: number; amountCents: number; method: string; status?: string; stripeTransferId?: string | null }): Promise<number> {
 await ensureConsignmentTables();
 const sql = db();
 const rows = (await sql`
 INSERT INTO consignor_payouts (store_slug, consignor_id, amount_cents, method, status, stripe_transfer_id, paid_at)
 VALUES (${opts.storeSlug}, ${opts.consignorId}, ${opts.amountCents}, ${opts.method}, ${opts.status ?? "pending"}, ${opts.stripeTransferId ?? null}, ${opts.status === "paid" ? new Date().toISOString() : null})
 RETURNING id`) as Array<Record<string, unknown>>;
 const payoutId = Number(rows[0].id);
 await sql`INSERT INTO consignor_ledger (store_slug, consignor_id, type, amount_cents, payout_id, note) VALUES (${opts.storeSlug}, ${opts.consignorId}, 'payout', ${-Math.abs(opts.amountCents)}, ${payoutId}, ${opts.method})`;
 return payoutId;
}

/** Everything a consignor sees: their items, ledger, payouts, and current balance. */
export async function getConsignorStatement(consignorId: number): Promise<{ items: ConsignmentItem[]; ledger: Awaited<ReturnType<typeof listLedger>>; payouts: Payout[]; balanceCents: number }> {
 const [items, ledger, payouts, balanceCents] = await Promise.all([
 listConsignmentItemsByConsignor(consignorId),
 listLedger(consignorId),
 listPayouts(consignorId),
 getConsignorBalanceCents(consignorId),
 ]);
 return { items, ledger, payouts, balanceCents };
}
