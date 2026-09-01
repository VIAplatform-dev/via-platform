import { neon } from "@neondatabase/serverless";
import { normalizeCountry } from "./tax-inclusive";

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
/**
 * Is this connected account ready to charge tax, and where is it established?
 *
 * The country comes from Stripe's tax HEAD OFFICE rather than a separate account lookup — it's the
 * seller's tax home, it's the right field for the question, and it rides along on a call checkout
 * already makes. It decides whether the seller's typed prices include tax (see tax-inclusive.ts).
 */
export async function stripeTaxReady(stripeAccountId: string): Promise<{ active: boolean; registrations: number; country: string | null }> {
 try {
  const { stripeGet } = await import("./stripe");
  const settings = (await stripeGet("tax/settings", undefined, stripeAccountId)) as {
   status?: string;
   head_office?: { address?: { country?: string } };
  };
  const country = normalizeCountry(settings?.head_office?.address?.country);
  const active = settings?.status === "active";
  let registrations = 0;
  if (active) {
   const regs = (await stripeGet("tax/registrations?status=active&limit=100", undefined, stripeAccountId)) as { data?: unknown[] };
   registrations = Array.isArray(regs?.data) ? regs.data.length : 0;
  }
  return { active, registrations, country };
 } catch {
  return { active: false, registrations: 0, country: null };
 }
}

/* ── registrations ────────────────────────────────────────────────────────
 * Where a store is registered to collect, read from and written to Stripe Tax — which is the
 * source of truth, because it is what actually decides whether tax is calculated on an order.
 * VYA keeps no copy: a second list would drift, and the drifting one would be the one a seller
 * trusted.
 */

export type TaxRegistration = {
 id: string;
 country: string;
 /** US registrations are per state; elsewhere this is null. */
 state: string | null;
 status: string;
 activeFrom: string | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function listTaxRegistrations(stripeAccountId: string): Promise<TaxRegistration[]> {
 try {
  const { stripeGet } = await import("./stripe");
  const res = (await stripeGet("tax/registrations?status=all&limit=100", undefined, stripeAccountId)) as { data?: any[] };
  const rows = Array.isArray(res?.data) ? res.data : [];
  return rows.map((r) => ({
   id: String(r.id),
   country: String(r.country || "").toUpperCase(),
   state: r.country_options?.us?.state ? String(r.country_options.us.state).toUpperCase() : null,
   status: String(r.status || "active"),
   activeFrom: r.active_from ? new Date(Number(r.active_from) * 1000).toISOString().slice(0, 10) : null,
 }));
 } catch {
  return [];
 }
}

/**
 * The Stripe shape for one country's registration.
 *
 * Every country has its own key and its own idea of what a registration is — the US wants a state
 * and a sales-tax type, the EU and UK want "standard", and getting it wrong is rejected outright.
 * Only the countries VYA's stores actually operate in are handled; anything else is refused with a
 * message rather than guessed at, because a wrong registration collects the wrong tax.
 */
export function registrationPayload(country: string, state?: string | null): Record<string, string> | null {
 const c = String(country || "").trim().toUpperCase();
 if (c === "US") {
  const st = String(state || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(st)) return null; // US registrations are per state, never country-wide
  return { country: "US", "country_options[us][state]": st, "country_options[us][type]": "state_sales_tax", active_from: "now" };
 }
 // The standard regime covers the UK, the EEA, Australia, Canada, New Zealand and the rest of the
 // places these stores sell into.
 if (!/^[A-Z]{2}$/.test(c)) return null;
 return { country: c, [`country_options[${c.toLowerCase()}][type]`]: "standard", active_from: "now" };
}

/**
 * Make sure Stripe Tax knows where this store is established.
 *
 * WHY VYA HAS TO DO THIS. Stripe refuses to accept any tax registration until the account has a
 * tax "head office" address — and VYA's stores are Connect EXPRESS accounts, whose dashboard does
 * not include Tax Settings at all. Left to itself the seller sees Stripe's own error telling her to
 * visit a page she has no way to open. So the platform sets it, from the ship-from address she has
 * already given VYA.
 *
 * It also sets the default tax behaviour, so anything created outside our checkout inherits the
 * same inclusive/exclusive rule the checkout applies (see tax-inclusive.ts) rather than defaulting
 * to the US convention on a UK store.
 *
 * Idempotent: Stripe's tax settings endpoint is an upsert, so calling it again is free.
 */
export async function ensureTaxHeadOffice(
 stripeAccountId: string,
 address: { street1?: string | null; city?: string | null; state?: string | null; zip?: string | null; country?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
 const country = normalizeCountry(address?.country);
 if (!country || !address?.street1 || !address?.city) {
  return { ok: false, error: "needs-address" };
 }
 try {
  const { stripePost } = await import("./stripe");
  const { taxBehaviorFor } = await import("./tax-inclusive");
  await stripePost("tax/settings", {
   "head_office[address][line1]": String(address.street1).slice(0, 200),
   "head_office[address][city]": String(address.city).slice(0, 100),
   ...(address.state ? { "head_office[address][state]": String(address.state).slice(0, 40) } : {}),
   ...(address.zip ? { "head_office[address][postal_code]": String(address.zip).slice(0, 20) } : {}),
   "head_office[address][country]": country,
   "defaults[tax_behavior]": taxBehaviorFor(country),
  }, stripeAccountId);
  return { ok: true };
 } catch (e) {
  return { ok: false, error: e instanceof Error ? e.message : "Stripe wouldn’t accept that address." };
 }
}

export async function addTaxRegistration(stripeAccountId: string, country: string, state?: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
 const payload = registrationPayload(country, state);
 if (!payload) return { ok: false, error: "That country needs a state — pick one, or check the country code." };
 try {
  const { stripePost } = await import("./stripe");
  await stripePost("tax/registrations", payload, stripeAccountId);
  return { ok: true };
 } catch (e) {
  return { ok: false, error: e instanceof Error ? e.message : "Stripe wouldn’t accept that registration." };
 }
}

/** Stripe doesn't delete registrations — it expires them, which keeps the historic record intact. */
export async function endTaxRegistration(stripeAccountId: string, id: string): Promise<boolean> {
 try {
  const { stripePost } = await import("./stripe");
  await stripePost(`tax/registrations/${encodeURIComponent(id)}`, { expires_at: "now" }, stripeAccountId);
  return true;
 } catch {
  return false;
 }
}
