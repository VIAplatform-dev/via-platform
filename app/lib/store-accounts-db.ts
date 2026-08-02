import { neon } from "@neondatabase/serverless";
import { stores } from "./stores";

// A self-onboarded store's OS identity — the source of truth for stores that sign up on
// getvya.ai (as opposed to the curated marketplace stores hardcoded in stores.ts). Holds
// what the onboarding wizard collects so the workspace can tailor setup. Login lives in
// store_users; subscription/trial in store_plans. Kept intentionally small + additive.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS store_accounts (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  has_website BOOLEAN,
  website_url TEXT,
  sells_category TEXT,
  sells_channel TEXT,
  onboarding JSONB,
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_store_accounts_owner ON store_accounts (owner_email)`;
 // Highest trial-nudge milestone (days) already emailed, so the weekly cron never double-sends.
 await sql`ALTER TABLE store_accounts ADD COLUMN IF NOT EXISTS nudge_stage INT NOT NULL DEFAULT 0`.catch(() => {});
 ensured = true;
}

export type StoreAccount = {
 slug: string;
 name: string;
 ownerEmail: string;
 hasWebsite: boolean | null;
 websiteUrl: string | null;
 sellsCategory: string | null;
 sellsChannel: string | null;
 onboardingCompletedAt: string | null;
 createdAt: string;
};

function slugify(name: string): string {
 return (name || "")
  .toLowerCase()
  .normalize("NFKD") // decompose accents (é → e + mark); the mark is dropped by the filter below
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 48) || "store";
}

const RESERVED = new Set(["admin", "api", "s", "store", "stores", "via-admin", "new", "account", "login", "signup"]);

/** A URL-safe store handle from the store name, unique across BOTH the curated marketplace
 *  (stores.ts) and existing self-onboarded accounts. Appends -2, -3… on collision. */
export async function generateUniqueSlug(name: string): Promise<string> {
 await ensureTable();
 const sql = db();
 const base = slugify(name);
 const staticSlugs = new Set(stores.map((s) => s.slug));
 for (let i = 0; i < 200; i++) {
  const candidate = i === 0 ? base : `${base}-${i + 1}`;
  if (RESERVED.has(candidate) || staticSlugs.has(candidate)) continue;
  const rows = await sql`SELECT 1 FROM store_accounts WHERE slug = ${candidate} LIMIT 1`;
  if (rows.length === 0) return candidate;
 }
 // Extremely unlikely fallback: base + a suffix derived from the name length (deterministic).
 return `${base}-${(base.length % 97) + 3}`;
}

function mapRow(r: Record<string, unknown>): StoreAccount {
 const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
 return {
  slug: r.slug as string,
  name: r.name as string,
  ownerEmail: r.owner_email as string,
  hasWebsite: r.has_website == null ? null : !!r.has_website,
  websiteUrl: (r.website_url as string | null) ?? null,
  sellsCategory: (r.sells_category as string | null) ?? null,
  sellsChannel: (r.sells_channel as string | null) ?? null,
  onboardingCompletedAt: iso(r.onboarding_completed_at),
  createdAt: iso(r.created_at) || new Date(0).toISOString(),
 };
}

export async function getStoreAccount(slug: string): Promise<StoreAccount | null> {
 await ensureTable();
 const rows = await db()`SELECT * FROM store_accounts WHERE slug = ${slug} LIMIT 1` as Array<Record<string, unknown>>;
 return rows[0] ? mapRow(rows[0]) : null;
}

export async function getStoreAccountByOwner(email: string): Promise<StoreAccount | null> {
 await ensureTable();
 const rows = await db()`SELECT * FROM store_accounts WHERE owner_email = ${(email || "").trim().toLowerCase()} ORDER BY created_at ASC LIMIT 1` as Array<Record<string, unknown>>;
 return rows[0] ? mapRow(rows[0]) : null;
}

/** Every self-onboarded store, with the fields the trial-nudge cron needs (created_at =
 *  trial start, nudge_stage = last milestone emailed). The cron filters by age + subscription. */
export async function listAccountsForNudge(): Promise<Array<{ slug: string; name: string; ownerEmail: string; createdAt: string; nudgeStage: number }>> {
 await ensureTable();
 const rows = await db()`SELECT slug, name, owner_email, created_at, nudge_stage FROM store_accounts` as Array<Record<string, unknown>>;
 return rows.map((r) => ({
  slug: r.slug as string,
  name: r.name as string,
  ownerEmail: r.owner_email as string,
  createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  nudgeStage: Number(r.nudge_stage) || 0,
 }));
}

/** Record the highest trial-nudge milestone emailed (idempotency for the weekly cron). */
export async function setNudgeStage(slug: string, stage: number): Promise<void> {
 await ensureTable();
 await db()`UPDATE store_accounts SET nudge_stage = ${stage} WHERE slug = ${slug}`;
}

/** Create the store's OS identity from the onboarding wizard. Caller supplies a slug from
 *  generateUniqueSlug. Idempotent on slug so a retried signup doesn't error. */
export async function createStoreAccount(input: {
 slug: string;
 name: string;
 ownerEmail: string;
 hasWebsite?: boolean | null;
 websiteUrl?: string | null;
 sellsCategory?: string | null;
 sellsChannel?: string | null;
 onboarding?: Record<string, unknown> | null;
}): Promise<StoreAccount> {
 await ensureTable();
 const sql = db();
 const email = (input.ownerEmail || "").trim().toLowerCase();
 const onboardingJson = input.onboarding ? JSON.stringify(input.onboarding) : null;
 const rows = await sql`
  INSERT INTO store_accounts (slug, name, owner_email, has_website, website_url, sells_category, sells_channel, onboarding, onboarding_completed_at)
  VALUES (${input.slug}, ${input.name}, ${email}, ${input.hasWebsite ?? null}, ${input.websiteUrl ?? null}, ${input.sellsCategory ?? null}, ${input.sellsChannel ?? null}, ${onboardingJson}, now())
  ON CONFLICT (slug) DO UPDATE SET
   name = EXCLUDED.name,
   has_website = EXCLUDED.has_website,
   website_url = EXCLUDED.website_url,
   sells_category = EXCLUDED.sells_category,
   sells_channel = EXCLUDED.sells_channel,
   onboarding = EXCLUDED.onboarding,
   onboarding_completed_at = COALESCE(store_accounts.onboarding_completed_at, EXCLUDED.onboarding_completed_at)
  RETURNING *
 ` as Array<Record<string, unknown>>;
 return mapRow(rows[0]);
}
