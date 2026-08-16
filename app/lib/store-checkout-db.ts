import { neon } from "@neondatabase/serverless";

// Per-store checkout payment methods. `card` is ALWAYS on — and card automatically brings Apple Pay,
// Google Pay, and Link, so wallets need no separate toggle. The extras (Cash App Pay + the buy-now-
// pay-later options) are opt-in per store, OFF by default, so a store that doesn't want Affirm/Klarna
// simply never sees them. Self-healing table (CREATE IF NOT EXISTS) — no migration step needed.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

let ensured = false;
async function ensure(): Promise<void> {
 if (ensured) return;
 await db()`
 CREATE TABLE IF NOT EXISTS store_checkout_settings (
  store_slug TEXT PRIMARY KEY,
  cashapp BOOLEAN NOT NULL DEFAULT false,
  affirm BOOLEAN NOT NULL DEFAULT false,
  klarna BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`;
 ensured = true;
}

export type CheckoutSettings = { cashapp: boolean; affirm: boolean; klarna: boolean };

const DEFAULTS: CheckoutSettings = { cashapp: false, affirm: false, klarna: false };

export async function getCheckoutSettings(storeSlug: string): Promise<CheckoutSettings> {
 try {
 await ensure();
 const rows = (await db()`SELECT cashapp, affirm, klarna FROM store_checkout_settings WHERE store_slug = ${storeSlug}`) as Array<Record<string, unknown>>;
 if (!rows.length) return { ...DEFAULTS };
 return { cashapp: Boolean(rows[0].cashapp), affirm: Boolean(rows[0].affirm), klarna: Boolean(rows[0].klarna) };
 } catch {
 return { ...DEFAULTS };
 }
}

export async function setCheckoutSettings(storeSlug: string, s: CheckoutSettings): Promise<void> {
 await ensure();
 await db()`
 INSERT INTO store_checkout_settings (store_slug, cashapp, affirm, klarna, updated_at)
 VALUES (${storeSlug}, ${s.cashapp}, ${s.affirm}, ${s.klarna}, NOW())
 ON CONFLICT (store_slug) DO UPDATE SET cashapp = ${s.cashapp}, affirm = ${s.affirm}, klarna = ${s.klarna}, updated_at = NOW()`;
}

/** The Stripe `payment_method_types` list for a store's checkout. Always leads with `card` (which
 *  presents Apple Pay / Google Pay / Link automatically); appends the store's opted-in extras. */
export async function getCheckoutMethods(storeSlug: string): Promise<string[]> {
 const s = await getCheckoutSettings(storeSlug);
 const methods = ["card"];
 if (s.cashapp) methods.push("cashapp");
 if (s.affirm) methods.push("affirm");
 if (s.klarna) methods.push("klarna");
 return methods;
}
