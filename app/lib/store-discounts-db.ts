import { neon } from "@neondatabase/serverless";

// Per-store discount codes. A store can keep many (to feature in campaigns / on the
// store page), but only ONE can be the click-through auto-apply (Shopify applies one
// code), enforced by clearing the others when one is set. The code is the seller's
// real store code; kind/value are for display + the seller's own reference.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 await db()`CREATE TABLE IF NOT EXISTS store_discounts (
 id SERIAL PRIMARY KEY,
 store_slug TEXT NOT NULL,
 code TEXT NOT NULL,
 label TEXT,
 kind TEXT NOT NULL DEFAULT 'percent',
 value NUMERIC,
 active BOOLEAN NOT NULL DEFAULT true,
 auto_apply BOOLEAN NOT NULL DEFAULT false,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await db()`CREATE INDEX IF NOT EXISTS idx_store_discounts_store ON store_discounts(store_slug)`;
 ensured = true;
}

export type Discount = { id: number; code: string; label: string | null; kind: string; value: number | null; active: boolean; autoApply: boolean };

type Row = { id: number; code: string; label: string | null; kind: string; value: number | null; active: boolean; auto_apply: boolean };
const map = (r: Row): Discount => ({ id: Number(r.id), code: r.code, label: r.label, kind: r.kind, value: r.value == null ? null : Number(r.value), active: !!r.active, autoApply: !!r.auto_apply });

export async function listDiscounts(storeSlug: string): Promise<Discount[]> {
 await ensureTable();
 const rows = await db()`SELECT id, code, label, kind, value, active, auto_apply FROM store_discounts WHERE store_slug = ${storeSlug} ORDER BY created_at DESC`;
 return (rows as Row[]).map(map);
}

export async function addDiscount(storeSlug: string, d: { code: string; label?: string; kind?: string; value?: number | null }): Promise<Discount | null> {
 await ensureTable();
 const code = (d.code || "").trim().toUpperCase().slice(0, 64);
 if (!code) return null;
 const kind = ["percent", "fixed", "free_shipping", "other"].includes(d.kind || "") ? d.kind! : "percent";
 const value = d.value == null || Number.isNaN(Number(d.value)) ? null : Number(d.value);
 // First discount for the store becomes the auto-apply by default.
 const existing = await db()`SELECT COUNT(*)::int AS n FROM store_discounts WHERE store_slug = ${storeSlug}`;
 const isFirst = Number((existing[0] as { n: number }).n) === 0;
 const rows = await db()`INSERT INTO store_discounts (store_slug, code, label, kind, value, auto_apply)
 VALUES (${storeSlug}, ${code}, ${d.label?.trim() || null}, ${kind}, ${value}, ${isFirst})
 RETURNING id, code, label, kind, value, active, auto_apply`;
 return map(rows[0] as Row);
}

export async function updateDiscount(storeSlug: string, id: number, patch: { active?: boolean; autoApply?: boolean }): Promise<void> {
 await ensureTable();
 if (patch.autoApply === true) {
 // only one auto-apply per store
 await db()`UPDATE store_discounts SET auto_apply = false WHERE store_slug = ${storeSlug}`;
 await db()`UPDATE store_discounts SET auto_apply = true, active = true WHERE store_slug = ${storeSlug} AND id = ${id}`;
 return;
 }
 if (patch.autoApply === false) {
 await db()`UPDATE store_discounts SET auto_apply = false WHERE store_slug = ${storeSlug} AND id = ${id}`;
 }
 if (typeof patch.active === "boolean") {
 await db()`UPDATE store_discounts SET active = ${patch.active}, auto_apply = (auto_apply AND ${patch.active}) WHERE store_slug = ${storeSlug} AND id = ${id}`;
 }
}

export async function deleteDiscount(storeSlug: string, id: number): Promise<void> {
 await ensureTable();
 await db()`DELETE FROM store_discounts WHERE store_slug = ${storeSlug} AND id = ${id}`;
}

/** The active auto-apply code for click-through (or null). Used by /api/track. */
export async function getAutoApplyCode(storeSlug: string): Promise<string | null> {
 await ensureTable();
 const rows = await db()`SELECT code FROM store_discounts WHERE store_slug = ${storeSlug} AND active = true AND auto_apply = true LIMIT 1`;
 const v = rows[0] ? (rows[0] as { code: string }).code : null;
 return v && v.trim() ? v.trim() : null;
}

// ── Native checkout application ──────────────────────────────────────────────
// Codes are strictly per-store: validation is always scoped by store_slug, so a
// code created by store A can never match store B's items. Used by the native
// VYA checkout (single-item + cart), NOT the click-through marketplace.

export type ValidDiscount = { id: number; code: string; label: string | null; kind: string; value: number | null };

/** Look up an ACTIVE code for THIS store only. Returns null if it isn't this store's code. */
export async function validateDiscount(storeSlug: string, codeRaw: string): Promise<ValidDiscount | null> {
 await ensureTable();
 const code = (codeRaw || "").trim().toUpperCase();
 if (!code) return null;
 const rows = await db()`
 SELECT id, code, label, kind, value FROM store_discounts
 WHERE store_slug = ${storeSlug} AND active = true AND UPPER(code) = ${code}
 LIMIT 1`;
 if (!rows[0]) return null;
 const r = rows[0] as { id: number; code: string; label: string | null; kind: string; value: number | null };
 return { id: Number(r.id), code: r.code, label: r.label, kind: r.kind, value: r.value == null ? null : Number(r.value) };
}

/** How much a discount takes off a subtotal (cents), and whether it waives shipping.
 *  percent → value% of subtotal · fixed → $value (value is dollars) · free_shipping → waive shipping · other → no native effect. */
export function computeDiscount(d: { kind: string; value: number | null }, subtotalCents: number): { offCents: number; freeShipping: boolean } {
 const v = d.value ?? 0;
 if (d.kind === "percent") return { offCents: Math.min(subtotalCents, Math.max(0, Math.round((subtotalCents * v) / 100))), freeShipping: false };
 if (d.kind === "fixed") return { offCents: Math.min(subtotalCents, Math.max(0, Math.round(v * 100))), freeShipping: false };
 if (d.kind === "free_shipping") return { offCents: 0, freeShipping: true };
 return { offCents: 0, freeShipping: false };
}

/** Spread `offCents` across line-item amounts proportionally, exactly (remainder lands on the last item). */
export function distributeDiscount(amounts: number[], offCents: number): number[] {
 const total = amounts.reduce((a, b) => a + b, 0);
 if (offCents <= 0 || total <= 0) return amounts.slice();
 const capped = Math.min(offCents, total);
 let allocated = 0;
 return amounts.map((a, i) => {
  const share = i === amounts.length - 1 ? capped - allocated : Math.round((capped * a) / total);
  allocated += share;
  return Math.max(0, a - share);
 });
}

let redemptionsReady = false;
async function ensureRedemptions() {
 if (redemptionsReady) return;
 await db()`CREATE TABLE IF NOT EXISTS store_discount_redemptions (
  id SERIAL PRIMARY KEY,
  store_slug TEXT NOT NULL,
  discount_id INTEGER,
  code TEXT NOT NULL,
  order_ref TEXT,
  amount_off_cents INTEGER NOT NULL DEFAULT 0,
  buyer_email TEXT,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await db()`CREATE UNIQUE INDEX IF NOT EXISTS idx_discount_redemption_order ON store_discount_redemptions(store_slug, code, order_ref)`;
 redemptionsReady = true;
}

/** Record a redemption at fulfillment (idempotent per store+code+order). */
export async function recordDiscountRedemption(r: {
 storeSlug: string; discountId?: number | null; code: string; orderRef: string; amountOffCents: number; buyerEmail?: string | null;
}): Promise<void> {
 await ensureRedemptions();
 await db()`
 INSERT INTO store_discount_redemptions (store_slug, discount_id, code, order_ref, amount_off_cents, buyer_email)
 VALUES (${r.storeSlug}, ${r.discountId ?? null}, ${r.code.toUpperCase()}, ${r.orderRef}, ${Math.max(0, Math.round(r.amountOffCents))}, ${r.buyerEmail ?? null})
 ON CONFLICT (store_slug, code, order_ref) DO NOTHING`.catch(() => {});
}

/** Times a code has been redeemed (for the seller's discounts UI). */
export async function redemptionCount(storeSlug: string, code: string): Promise<number> {
 await ensureRedemptions();
 const rows = await db()`SELECT COUNT(*)::int AS n FROM store_discount_redemptions WHERE store_slug = ${storeSlug} AND UPPER(code) = ${code.toUpperCase()}`;
 return Number((rows[0] as { n: number }).n) || 0;
}
