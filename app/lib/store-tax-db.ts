import { neon } from "@neondatabase/serverless";

// ───────────────────────────────────────────────────────────────────────────
// Sales tax, per store.
//
// VYA does not calculate tax and should not: storefront sales are DIRECT charges
// on the seller's own Stripe account (checkout/route.ts), so the seller is
// merchant of record and the registrations, collection and filing are theirs.
// That is the model Stripe documents for Connect — "connected account is
// responsible" — and it is the same posture Shopify takes for merchant stores.
//
// So this holds one thing: whether the store has turned tax collection ON. When
// it is on, checkout asks Stripe Tax to calculate against THAT store's
// registrations, and the buyer is charged accordingly.
//
// Two deliberate choices:
//
//   ON BY DEFAULT. Stripe does not error in jurisdictions where the account has
//   no registration — it simply calculates nothing. So "on" collects exactly
//   where the seller is registered and nowhere else, which is the legally correct
//   behaviour: you cannot collect tax you aren't registered to collect. Leaving
//   it off would instead mean a registered seller silently under-collects, which
//   is a real liability. A store can still opt out, but it has to choose to.
//
//   NO RATE FIELD, AND NO SINGLE PRODUCT CODE. A flat per-store rate would be
//   wrong for this vertical — New York exempts clothing and footwear under $110,
//   Pennsylvania and New Jersey exempt most apparel outright — and so would one
//   product code, because those exemptions do not cover handbags, jewelry or
//   sunglasses. Rates come from Stripe Tax; the product code comes per listing
//   from its category (tax-codes.ts).
// ───────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

export type TaxSettings = {
 /** Charge sales tax at checkout, calculated on the store's own Stripe registrations. */
 enabled: boolean;
 /**
  * Optional override applied to EVERY listing. Null (the normal case) means each
  * item is coded from its own category — see tax-codes.ts.
  */
 productTaxCode: string | null;
};

/**
 * An OPTIONAL per-store override. Left null — which is the normal case — each
 * listing is coded from its own category (see tax-codes.ts), because a bag and a
 * dress are not taxed alike. This exists only for a store that sells one narrow
 * thing and knows better than the category mapping.
 */
export const DEFAULT_PRODUCT_TAX_CODE: string | null = null;

let ensured = false;
async function ensure() {
 if (ensured) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS store_tax_settings (
  store_slug TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  product_tax_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 ensured = true;
}

export async function getTaxSettings(storeSlug: string): Promise<TaxSettings> {
 try {
  await ensure();
  const rows = (await db()`SELECT enabled, product_tax_code FROM store_tax_settings WHERE store_slug = ${storeSlug}`) as Array<Record<string, unknown>>;
  const r = rows[0];
  // No row means the store has never touched this, which is ON — see the header.
  return {
   enabled: r ? Boolean(r.enabled) : true,
   productTaxCode: r?.product_tax_code ? String(r.product_tax_code) : null,
  };
 } catch {
  // A settings read must never break checkout. Falling back to OFF here is
  // deliberate: the alternative risks a hard failure on a sale, and Stripe's own
  // registration check is what actually governs whether tax is owed.
  return { enabled: false, productTaxCode: null };
 }
}

export async function setTaxSettings(storeSlug: string, s: Partial<TaxSettings>): Promise<TaxSettings> {
 await ensure();
 const current = await getTaxSettings(storeSlug);
 const next: TaxSettings = {
  enabled: s.enabled ?? current.enabled,
  productTaxCode: s.productTaxCode !== undefined ? s.productTaxCode : current.productTaxCode,
 };
 await db()`
  INSERT INTO store_tax_settings (store_slug, enabled, product_tax_code, updated_at)
  VALUES (${storeSlug}, ${next.enabled}, ${next.productTaxCode}, now())
  ON CONFLICT (store_slug) DO UPDATE
   SET enabled = EXCLUDED.enabled, product_tax_code = EXCLUDED.product_tax_code, updated_at = now()
 `;
 return next;
}

/**
 * Is Stripe Tax actually usable on this connected account?
 *
 * Registrations are NOT the gate — Stripe calculates zero where a seller isn't
 * registered, which is exactly right. The gate is whether the account has
 * completed Stripe Tax setup at all (origin address + default tax code). Asking
 * for automatic_tax on an account that hasn't can fail the Checkout Session, and
 * failing a sale is far worse than not charging tax on it.
 */
export async function stripeTaxReady(stripeAccountId: string): Promise<{ active: boolean; registrations: number }> {
 try {
  const { stripeGet } = await import("./stripe");
  const settings = (await stripeGet("tax/settings", undefined, stripeAccountId)) as { status?: string };
  const active = settings?.status === "active";
  let registrations = 0;
  if (active) {
   const regs = (await stripeGet("tax/registrations?status=active&limit=100", undefined, stripeAccountId)) as { data?: unknown[] };
   registrations = Array.isArray(regs?.data) ? regs.data.length : 0;
  }
  return { active, registrations };
 } catch {
  return { active: false, registrations: 0 };
 }
}
