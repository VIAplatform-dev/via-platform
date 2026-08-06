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
};

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
 ensured = true;
}

export async function getStoreProfile(storeSlug: string): Promise<StoreProfile> {
 await ensureTable();
 const rows = (await db()`SELECT display_name, legal_name, location, bio FROM store_profiles WHERE store_slug = ${storeSlug} LIMIT 1`.catch(() => [])) as any[];
 const o = rows[0] || {};
 const staticStore = stores.find((s) => s.slug === storeSlug);
 return {
 displayName: o.display_name || staticStore?.name || storeSlug,
 displayNameOverride: o.display_name ?? null,
 legalName: o.legal_name ?? null,
 location: o.location ?? staticStore?.location ?? null,
 bio: o.bio ?? staticStore?.description ?? null,
 };
}

/** Read just the display-name override (raw), null if the seller hasn't set one. Cheap path for sender resolution. */
export async function getDisplayNameOverride(storeSlug: string): Promise<string | null> {
 await ensureTable();
 const rows = (await db()`SELECT display_name FROM store_profiles WHERE store_slug = ${storeSlug} LIMIT 1`.catch(() => [])) as any[];
 return rows[0]?.display_name ?? null;
}

export async function updateStoreProfile(storeSlug: string, patch: { displayName?: string; legalName?: string; location?: string; bio?: string }): Promise<StoreProfile> {
 await ensureTable();
 const cur = (await db()`SELECT display_name, legal_name, location, bio FROM store_profiles WHERE store_slug = ${storeSlug} LIMIT 1`.catch(() => [])) as any[];
 const o = cur[0] || {};
 const next = {
 display_name: patch.displayName != null ? String(patch.displayName).trim().slice(0, 120) || null : (o.display_name ?? null),
 legal_name: patch.legalName != null ? String(patch.legalName).trim().slice(0, 200) || null : (o.legal_name ?? null),
 location: patch.location != null ? String(patch.location).trim().slice(0, 160) || null : (o.location ?? null),
 bio: patch.bio != null ? String(patch.bio).trim().slice(0, 4000) || null : (o.bio ?? null),
 };
 await db()`
 INSERT INTO store_profiles (store_slug, display_name, legal_name, location, bio, updated_at)
 VALUES (${storeSlug}, ${next.display_name}, ${next.legal_name}, ${next.location}, ${next.bio}, now())
 ON CONFLICT (store_slug) DO UPDATE SET display_name = ${next.display_name}, legal_name = ${next.legal_name}, location = ${next.location}, bio = ${next.bio}, updated_at = now()
 `;
 return getStoreProfile(storeSlug);
}
