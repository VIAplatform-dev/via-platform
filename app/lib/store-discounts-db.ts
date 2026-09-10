import { neon } from "@neondatabase/serverless";
import type { DiscountAudience } from "./discount-scope";

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

/** `ends_at` — when a code stops working on its own. Added lazily and idempotently, like the other
 *  additive columns here, so a deploy never lands code that reads a column the database lacks. */
let endsAtReady = false;
async function ensureEndsAt() {
 if (endsAtReady) return;
 await db()`ALTER TABLE store_discounts ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ`.catch(() => {});
 // Scope: WHICH pieces a code is for, and WHO may use it. Added the same lazy, idempotent way.
 await db()`ALTER TABLE store_discounts
  ADD COLUMN IF NOT EXISTS item_ids JSONB,
  ADD COLUMN IF NOT EXISTS audience TEXT,
  ADD COLUMN IF NOT EXISTS lapsed_days INTEGER`.catch(() => {});
 endsAtReady = true;
}

export type Discount = { id: number; code: string; label: string | null; kind: string; value: number | null; active: boolean; autoApply: boolean; endsAt: string | null; itemIds: string[]; audience: DiscountAudience; lapsedDays: number | null };

type Row = { id: number; code: string; label: string | null; kind: string; value: number | null; active: boolean; auto_apply: boolean; ends_at?: string | Date | null; item_ids?: unknown; audience?: string | null; lapsed_days?: number | null };
const AUDIENCES = new Set(["all", "new", "lapsed"]);
const map = (r: Row): Discount => ({
 id: Number(r.id), code: r.code, label: r.label, kind: r.kind,
 value: r.value == null ? null : Number(r.value),
 active: !!r.active, autoApply: !!r.auto_apply,
 endsAt: r.ends_at ? new Date(r.ends_at).toISOString() : null,
 itemIds: Array.isArray(r.item_ids) ? (r.item_ids as unknown[]).map(String).filter(Boolean) : [],
 audience: (AUDIENCES.has(String(r.audience)) ? String(r.audience) : "all") as DiscountAudience,
 lapsedDays: r.lapsed_days == null ? null : Number(r.lapsed_days),
});

export async function listDiscounts(storeSlug: string): Promise<Discount[]> {
 await ensureTable(); await ensureEndsAt();
 const rows = await db()`SELECT id, code, label, kind, value, active, auto_apply, ends_at, item_ids, audience, lapsed_days FROM store_discounts WHERE store_slug = ${storeSlug} ORDER BY created_at DESC`;
 return (rows as Row[]).map(map);
}

export async function addDiscount(storeSlug: string, d: { code: string; label?: string; kind?: string; value?: number | null; endsAt?: string | null; itemIds?: string[] | null; audience?: string | null; lapsedDays?: number | null }): Promise<Discount | null> {
 await ensureTable(); await ensureEndsAt();
 const code = (d.code || "").trim().toUpperCase().slice(0, 64);
 if (!code) return null;
 const kind = ["percent", "fixed", "free_shipping", "other"].includes(d.kind || "") ? d.kind! : "percent";
 const value = d.value == null || Number.isNaN(Number(d.value)) ? null : Number(d.value);
 // First discount for the store becomes the auto-apply by default.
 const existing = await db()`SELECT COUNT(*)::int AS n FROM store_discounts WHERE store_slug = ${storeSlug}`;
 const isFirst = Number((existing[0] as { n: number }).n) === 0;
 const endsAt = d.endsAt && !Number.isNaN(Date.parse(d.endsAt)) ? new Date(d.endsAt).toISOString() : null;
 const ids = Array.isArray(d.itemIds) ? d.itemIds.map(String).filter(Boolean).slice(0, 200) : [];
 const aud = AUDIENCES.has(String(d.audience)) ? String(d.audience) : "all";
 const lapsed = d.lapsedDays == null ? null : Math.max(1, Math.round(Number(d.lapsedDays) || 0)) || null;
 const rows = await db()`INSERT INTO store_discounts (store_slug, code, label, kind, value, auto_apply, ends_at, item_ids, audience, lapsed_days)
 VALUES (${storeSlug}, ${code}, ${d.label?.trim() || null}, ${kind}, ${value}, ${isFirst}, ${endsAt}, ${JSON.stringify(ids)}, ${aud}, ${lapsed})
 RETURNING id, code, label, kind, value, active, auto_apply, ends_at, item_ids, audience, lapsed_days`;
 return map(rows[0] as Row);
}

/**
 * Change a code. Everything about it, not only whether it is switched on.
 *
 * This used to take `active` and `autoApply` and nothing else, so a code created with the wrong
 * number — a WELCOME10 saved before the "10" was typed, which is how it was reported — could only be
 * deleted and made again. The percentage, the code itself, its label and when it stops are all
 * editable now; only fields actually present in the patch are written.
 */
export async function updateDiscount(storeSlug: string, id: number, patch: { active?: boolean; autoApply?: boolean; code?: string; label?: string | null; kind?: string; value?: number | null; endsAt?: string | null; itemIds?: string[] | null; audience?: string | null; lapsedDays?: number | null }): Promise<void> {
 await ensureTable(); await ensureEndsAt();
 if (typeof patch.code === "string") {
  const code = patch.code.trim().toUpperCase().slice(0, 64);
  if (code) await db()`UPDATE store_discounts SET code = ${code} WHERE store_slug = ${storeSlug} AND id = ${id}`;
 }
 if (patch.label !== undefined) {
  await db()`UPDATE store_discounts SET label = ${patch.label?.trim() || null} WHERE store_slug = ${storeSlug} AND id = ${id}`;
 }
 if (typeof patch.kind === "string" && ["percent", "fixed", "free_shipping", "other"].includes(patch.kind)) {
  await db()`UPDATE store_discounts SET kind = ${patch.kind} WHERE store_slug = ${storeSlug} AND id = ${id}`;
 }
 if (patch.value !== undefined) {
  const v = patch.value == null || Number.isNaN(Number(patch.value)) ? null : Number(patch.value);
  await db()`UPDATE store_discounts SET value = ${v} WHERE store_slug = ${storeSlug} AND id = ${id}`;
 }
 if (patch.endsAt !== undefined) {
  const e = patch.endsAt && !Number.isNaN(Date.parse(patch.endsAt)) ? new Date(patch.endsAt).toISOString() : null;
  await db()`UPDATE store_discounts SET ends_at = ${e} WHERE store_slug = ${storeSlug} AND id = ${id}`;
 }
 if (patch.itemIds !== undefined) {
  const ids = Array.isArray(patch.itemIds) ? patch.itemIds.map(String).filter(Boolean).slice(0, 200) : [];
  await db()`UPDATE store_discounts SET item_ids = ${JSON.stringify(ids)} WHERE store_slug = ${storeSlug} AND id = ${id}`;
 }
 if (patch.audience !== undefined) {
  const aud = AUDIENCES.has(String(patch.audience)) ? String(patch.audience) : "all";
  await db()`UPDATE store_discounts SET audience = ${aud} WHERE store_slug = ${storeSlug} AND id = ${id}`;
 }
 if (patch.lapsedDays !== undefined) {
  const d2 = patch.lapsedDays == null ? null : Math.max(1, Math.round(Number(patch.lapsedDays) || 0)) || null;
  await db()`UPDATE store_discounts SET lapsed_days = ${d2} WHERE store_slug = ${storeSlug} AND id = ${id}`;
 }
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

export type ValidDiscount = { id: number; code: string; label: string | null; kind: string; value: number | null; itemIds: string[]; audience: DiscountAudience; lapsedDays: number | null };

/** Look up an ACTIVE code for THIS store only. Returns null if it isn't this store's code. */
export async function validateDiscount(storeSlug: string, codeRaw: string): Promise<ValidDiscount | null> {
 await ensureTable();
 const code = (codeRaw || "").trim().toUpperCase();
 if (!code) return null;
 await ensureEndsAt();
 // An expiry that isn't enforced here is decoration: this is the one gate every checkout path goes
 // through, so "15% off for 24 hours only" has to mean the code stops working when the day is up.
 const rows = await db()`
 SELECT id, code, label, kind, value, active, auto_apply, ends_at, item_ids, audience, lapsed_days FROM store_discounts
 WHERE store_slug = ${storeSlug} AND active = true AND UPPER(code) = ${code}
   AND (ends_at IS NULL OR ends_at > now())
 LIMIT 1`;
 if (!rows[0]) return null;
 const d = map(rows[0] as Row);
 return { id: d.id, code: d.code, label: d.label, kind: d.kind, value: d.value, itemIds: d.itemIds, audience: d.audience, lapsedDays: d.lapsedDays };
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

/**
 * When this buyer last bought from THIS store — null if never.
 *
 * The one fact an audience-gated code needs. Matched on the email the buyer is checking out with,
 * case-insensitively, because that is the only identity a guest checkout has.
 */
export async function lastOrderAtForBuyer(storeSlug: string, email: string | null | undefined): Promise<Date | null> {
 const e = (email || "").trim().toLowerCase();
 if (!e) return null;
 try {
  const rows = await db()`
   SELECT MAX(o.created_at) AS last_at
   FROM orders o
   JOIN sellers s ON s.id = o.seller_id
   WHERE s.slug = ${storeSlug} AND LOWER(o.buyer_email) = ${e}`;
  const v = (rows[0] as { last_at?: string | Date | null } | undefined)?.last_at;
  return v ? new Date(v) : null;
 } catch {
  // A history we cannot read must not hand out a discount the buyer may not be entitled to.
  return new Date();
 }
}
