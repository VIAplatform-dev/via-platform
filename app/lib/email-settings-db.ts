import { neon } from "@neondatabase/serverless";
import { getSellerBySlug } from "./db/sellers";
import { stores, storeContactEmails } from "./stores";
import type { EmailBrand } from "./email";

// Per-store email sender settings. A store picks the name + reply-to their emails use,
// and (optionally) authenticates their own domain so mail sends FROM their address
// instead of VYA's shared campaigns@ domain.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 await db()`
  CREATE TABLE IF NOT EXISTS store_email_settings (
   store_slug TEXT PRIMARY KEY,
   from_name TEXT,
   reply_to TEXT,
   domain TEXT,
   sending_email TEXT,
   resend_domain_id TEXT,
   verified BOOLEAN NOT NULL DEFAULT false,
   dns_records JSONB,
   brand JSONB,
   updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
 `;
 await db()`ALTER TABLE store_email_settings ADD COLUMN IF NOT EXISTS brand JSONB`.catch(() => {});
 await db()`ALTER TABLE store_email_settings ADD COLUMN IF NOT EXISTS brand_prev JSONB`.catch(() => {});
 await db()`ALTER TABLE store_email_settings ADD COLUMN IF NOT EXISTS brand_prev_set BOOLEAN NOT NULL DEFAULT false`.catch(() => {});
 ensured = true;
}

export type EmailSettings = {
 fromName: string | null;
 replyTo: string | null;
 domain: string | null;
 sendingEmail: string | null;
 resendDomainId: string | null;
 verified: boolean;
 dnsRecords: unknown;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function getEmailSettings(storeSlug: string): Promise<EmailSettings | null> {
 await ensureTable();
 const rows = (await db()`SELECT from_name, reply_to, domain, sending_email, resend_domain_id, verified, dns_records FROM store_email_settings WHERE store_slug = ${storeSlug} LIMIT 1`.catch(() => [])) as any[];
 if (!rows.length) return null;
 const r = rows[0];
 return { fromName: r.from_name ?? null, replyTo: r.reply_to ?? null, domain: r.domain ?? null, sendingEmail: r.sending_email ?? null, resendDomainId: r.resend_domain_id ?? null, verified: r.verified === true, dnsRecords: r.dns_records ?? null };
}

export async function upsertEmailSettings(storeSlug: string, patch: Partial<{ fromName: string | null; replyTo: string | null; domain: string | null; sendingEmail: string | null; resendDomainId: string | null; verified: boolean; dnsRecords: unknown }>): Promise<void> {
 await ensureTable();
 const cur = (await getEmailSettings(storeSlug)) || { fromName: null, replyTo: null, domain: null, sendingEmail: null, resendDomainId: null, verified: false, dnsRecords: null };
 const n = { ...cur, ...patch };
 await db()`
  INSERT INTO store_email_settings (store_slug, from_name, reply_to, domain, sending_email, resend_domain_id, verified, dns_records, updated_at)
  VALUES (${storeSlug}, ${n.fromName}, ${n.replyTo}, ${n.domain}, ${n.sendingEmail}, ${n.resendDomainId}, ${n.verified}, ${n.dnsRecords ? JSON.stringify(n.dnsRecords) : null}, now())
  ON CONFLICT (store_slug) DO UPDATE SET
   from_name = EXCLUDED.from_name, reply_to = EXCLUDED.reply_to, domain = EXCLUDED.domain,
   sending_email = EXCLUDED.sending_email, resend_domain_id = EXCLUDED.resend_domain_id,
   verified = EXCLUDED.verified, dns_records = EXCLUDED.dns_records, updated_at = now()
 `.catch(() => {});
}

export type StoreSender = { fromName: string; fromAddress: string; replyTo: string | null; verified: boolean; website?: string };

const SHARED_FROM = "campaigns@vyaplatform.com";

/**
 * Resolve how a store's mail is sent: the display name, the From address, and the
 * reply-to. From address = the store's OWN verified address when authenticated, else
 * VYA's shared sending domain (with the store's name). Reply-to always routes to the
 * store. Falls through email settings → the seller record → the static store config.
 */
export async function resolveStoreSender(storeSlug: string): Promise<StoreSender> {
 const s = await getEmailSettings(storeSlug).catch(() => null);
 const seller = await getSellerBySlug(storeSlug).catch(() => null);
 const staticStore = stores.find((x) => x.slug === storeSlug);

 const fromName = s?.fromName || seller?.name || staticStore?.name || storeSlug;
 const replyTo = s?.replyTo || seller?.email || storeContactEmails[storeSlug] || null;
 const fromAddress = s?.verified && s?.sendingEmail ? s.sendingEmail : SHARED_FROM;
 return { fromName, fromAddress, replyTo, verified: !!(s?.verified && s?.sendingEmail), website: staticStore?.website || undefined };
}

/**
 * A store's custom email design, if it has saved one. `null` means "inherit the storefront brand"
 * — the default. Stored as JSON so the shape can grow with the renderer.
 */
export async function getEmailBrandOverrides(storeSlug: string): Promise<EmailBrand | null> {
 await ensureTable();
 const rows = (await db()`SELECT brand FROM store_email_settings WHERE store_slug = ${storeSlug} LIMIT 1`.catch(() => [])) as any[];
 const brand = rows[0]?.brand;
 return brand && typeof brand === "object" ? (brand as EmailBrand) : null;
}

/** Save (or, with `null`, clear → revert to the storefront brand) a store's custom email design.
 *  The prior value is stashed in brand_prev so the last change can be undone (revertEmailBrand). */
export async function setEmailBrandOverrides(storeSlug: string, brand: EmailBrand | null): Promise<void> {
 await ensureTable();
 await db()`
  INSERT INTO store_email_settings (store_slug, brand, brand_prev, brand_prev_set, updated_at)
  VALUES (${storeSlug}, ${brand ? JSON.stringify(brand) : null}::jsonb, NULL, true, now())
  ON CONFLICT (store_slug) DO UPDATE SET brand_prev = store_email_settings.brand, brand_prev_set = true, brand = EXCLUDED.brand, updated_at = now()
 `.catch(() => {});
}

/** Undo the last email-design change: swap brand ↔ brand_prev (a second call redoes it).
 *  Returns the restored brand (or null = now inheriting the storefront), and whether it applied. */
export async function revertEmailBrand(storeSlug: string): Promise<{ reverted: boolean; brand: EmailBrand | null }> {
 await ensureTable();
 const rows = (await db()`
  UPDATE store_email_settings SET brand = brand_prev, brand_prev = brand, updated_at = now()
  WHERE store_slug = ${storeSlug} AND brand_prev_set = true
  RETURNING brand
 `.catch(() => [])) as any[];
 if (!rows.length) return { reverted: false, brand: null };
 const b = rows[0].brand;
 return { reverted: true, brand: b && typeof b === "object" ? (b as EmailBrand) : null };
}

/** Whether there's an email-design change available to undo. */
export async function hasEmailBrandUndo(storeSlug: string): Promise<boolean> {
 await ensureTable();
 const rows = (await db()`SELECT brand_prev_set FROM store_email_settings WHERE store_slug = ${storeSlug} LIMIT 1`.catch(() => [])) as any[];
 return rows[0]?.brand_prev_set === true;
}
