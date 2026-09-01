import { neon } from "@neondatabase/serverless";
import { stores } from "./stores";

// Editable store identity. The marketplace's curated `stores.ts` is the default, but a
// seller running their own OS needs to change their DISPLAY name, set a LEGAL name (for
// receipts/policies), location, and bio without a code change. Those overrides live here,
// merged over the static defaults. Kept in its own table so the hot `sellers` select path
// is never touched.
function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

export type StoreProfile = {
 displayName: string; // resolved (override → static name → slug)
 displayNameOverride: string | null; // the raw override, null if unset
 legalName: string | null;
 location: string | null;
 bio: string | null;
 // Business facts nothing collected before, yet customs declarations want a real legal name and
 // Stripe asks for a support contact — both were quietly falling back to the display name.
 supportEmail: string | null;
 supportPhone: string | null;
 /** Companies House number, EIN, ABN — whatever the store's country calls it. */
 companyNumber: string | null;
 /** VAT/GST number as it appears on invoices. Not the same thing as a Stripe Tax registration,
  *  which is about collecting; this is about identifying the business. */
 vatNumber: string | null;
 policies: StorePolicies;
};

/**
 * What a store promises its buyers.
 *
 * Every hosted storefront already links to Returns, Shipping, Privacy and Terms. Until now only a
 * returns paragraph existed, buried in a settings tab, so the other three linked to nothing.
 */
export type StorePolicies = { returns: string; shipping: string; privacy: string; terms: string };

export const EMPTY_POLICIES: StorePolicies = { returns: "", shipping: "", privacy: "", terms: "" };

/* eslint-disable @typescript-eslint/no-explicit-any */
function coercePolicies(raw: any): StorePolicies {
 const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
 return {
  returns: str(raw?.returns, 20_000),
  shipping: str(raw?.shipping, 20_000),
  privacy: str(raw?.privacy, 40_000),
  terms: str(raw?.terms, 40_000),
 };
}

/** Which policies a store has actually written — the storefront shouldn't link to a blank page. */
export function publishedPolicies(p: StorePolicies): (keyof StorePolicies)[] {
 return (Object.keys(p) as (keyof StorePolicies)[]).filter((k) => (p[k] || "").trim().length > 0);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 await db()`CREATE TABLE IF NOT EXISTS store_profiles (
 store_slug TEXT PRIMARY KEY,
 display_name TEXT,
 legal_name TEXT,
 location TEXT,
 bio TEXT,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 // Additive, lazily — same convention as the other store_* tables, so a deploy never lands code
 // that reads a column the database hasn't got yet.
 await db()`ALTER TABLE store_profiles ADD COLUMN IF NOT EXISTS support_email TEXT`.catch(() => {});
 await db()`ALTER TABLE store_profiles ADD COLUMN IF NOT EXISTS support_phone TEXT`.catch(() => {});
 await db()`ALTER TABLE store_profiles ADD COLUMN IF NOT EXISTS company_number TEXT`.catch(() => {});
 await db()`ALTER TABLE store_profiles ADD COLUMN IF NOT EXISTS vat_number TEXT`.catch(() => {});
 await db()`ALTER TABLE store_profiles ADD COLUMN IF NOT EXISTS policies JSONB`.catch(() => {});
 ensured = true;
}

export async function getStoreProfile(storeSlug: string): Promise<StoreProfile> {
 await ensureTable();
 const rows = (await db()`SELECT display_name, legal_name, location, bio, support_email, support_phone, company_number, vat_number, policies FROM store_profiles WHERE store_slug = ${storeSlug} LIMIT 1`.catch(() => [])) as any[];
 const o = rows[0] || {};
 const staticStore = stores.find((s) => s.slug === storeSlug);
 return {
 displayName: o.display_name || staticStore?.name || storeSlug,
 displayNameOverride: o.display_name ?? null,
 legalName: o.legal_name ?? null,
 location: o.location ?? staticStore?.location ?? null,
 bio: o.bio ?? staticStore?.description ?? null,
 supportEmail: o.support_email ?? null,
 supportPhone: o.support_phone ?? null,
 companyNumber: o.company_number ?? null,
 vatNumber: o.vat_number ?? null,
 policies: coercePolicies(typeof o.policies === "string" ? JSON.parse(o.policies) : o.policies),
 };
}

/** Read just the display-name override (raw), null if the seller hasn't set one. Cheap path for sender resolution. */
export async function getDisplayNameOverride(storeSlug: string): Promise<string | null> {
 await ensureTable();
 const rows = (await db()`SELECT display_name FROM store_profiles WHERE store_slug = ${storeSlug} LIMIT 1`.catch(() => [])) as any[];
 return rows[0]?.display_name ?? null;
}

export async function updateStoreProfile(storeSlug: string, patch: { displayName?: string; legalName?: string; location?: string; bio?: string; supportEmail?: string; supportPhone?: string; companyNumber?: string; vatNumber?: string; policies?: Partial<StorePolicies> }): Promise<StoreProfile> {
 await ensureTable();
 const cur = (await db()`SELECT display_name, legal_name, location, bio, support_email, support_phone, company_number, vat_number, policies FROM store_profiles WHERE store_slug = ${storeSlug} LIMIT 1`.catch(() => [])) as any[];
 const o = cur[0] || {};
 const next = {
 display_name: patch.displayName != null ? String(patch.displayName).trim().slice(0, 120) || null : (o.display_name ?? null),
 legal_name: patch.legalName != null ? String(patch.legalName).trim().slice(0, 200) || null : (o.legal_name ?? null),
 location: patch.location != null ? String(patch.location).trim().slice(0, 160) || null : (o.location ?? null),
 bio: patch.bio != null ? String(patch.bio).trim().slice(0, 4000) || null : (o.bio ?? null),
 support_email: patch.supportEmail != null ? String(patch.supportEmail).trim().toLowerCase().slice(0, 200) || null : (o.support_email ?? null),
 support_phone: patch.supportPhone != null ? String(patch.supportPhone).trim().slice(0, 40) || null : (o.support_phone ?? null),
 company_number: patch.companyNumber != null ? String(patch.companyNumber).trim().slice(0, 60) || null : (o.company_number ?? null),
 vat_number: patch.vatNumber != null ? String(patch.vatNumber).trim().slice(0, 60) || null : (o.vat_number ?? null),
 // Merged per key: the policies page saves one at a time, and a full replace would blank the rest.
 policies: JSON.stringify(coercePolicies({
  ...coercePolicies(typeof o.policies === "string" ? JSON.parse(o.policies) : o.policies),
  ...(patch.policies ?? {}),
 })),
 };
 await db()`
 INSERT INTO store_profiles (store_slug, display_name, legal_name, location, bio, support_email, support_phone, company_number, vat_number, policies, updated_at)
 VALUES (${storeSlug}, ${next.display_name}, ${next.legal_name}, ${next.location}, ${next.bio}, ${next.support_email}, ${next.support_phone}, ${next.company_number}, ${next.vat_number}, ${next.policies}::jsonb, now())
 ON CONFLICT (store_slug) DO UPDATE SET display_name = ${next.display_name}, legal_name = ${next.legal_name}, location = ${next.location}, bio = ${next.bio}, support_email = ${next.support_email}, support_phone = ${next.support_phone}, company_number = ${next.company_number}, vat_number = ${next.vat_number}, policies = ${next.policies}::jsonb, updated_at = now()
 `;
 return getStoreProfile(storeSlug);
}
