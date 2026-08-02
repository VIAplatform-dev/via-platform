import { neon } from "@neondatabase/serverless";

// Who can log into a given store's Owner Workspace (getvya.ai/admin). One store can
// have several users (owner + staff); one email normally belongs to a single store —
// stores aren't tied together, so we never merge a person across stores. This table is
// the DYNAMIC, self-serve replacement for the hardcoded `storeContactEmails` map: a store
// that signs up gets a row here, and email→store resolution consults it (see storeAuth).

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS store_users (
  id SERIAL PRIMARY KEY,
  store_slug TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_slug, email)
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_store_users_email ON store_users (email)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_store_users_store ON store_users (store_slug)`;
 ensured = true;
}

function normEmail(email: string): string {
 return (email || "").trim().toLowerCase();
}

export type StoreRole = "owner" | "staff";
export type StoreUser = { storeSlug: string; email: string; role: StoreRole; createdAt: string };

/** Grant an email access to a store (idempotent). First user of a store is its owner. */
export async function addStoreUser(storeSlug: string, email: string, role: StoreRole = "owner"): Promise<void> {
 await ensureTable();
 const e = normEmail(email);
 if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return;
 await db()`INSERT INTO store_users (store_slug, email, role)
  VALUES (${storeSlug}, ${e}, ${role})
  ON CONFLICT (store_slug, email) DO UPDATE SET role = ${role}`;
}

/** Revoke an email's access to a store. */
export async function removeStoreUser(storeSlug: string, email: string): Promise<void> {
 await ensureTable();
 await db()`DELETE FROM store_users WHERE store_slug = ${storeSlug} AND email = ${normEmail(email)}`;
}

/** Everyone with access to a store (owner first, then by join date). */
export async function listStoreUsers(storeSlug: string): Promise<StoreUser[]> {
 await ensureTable();
 const rows = await db()`SELECT store_slug, email, role, created_at FROM store_users
  WHERE store_slug = ${storeSlug}
  ORDER BY (role = 'owner') DESC, created_at ASC` as Array<Record<string, unknown>>;
 return rows.map((r) => ({ storeSlug: r.store_slug as string, email: r.email as string, role: (r.role as StoreRole) || "staff", createdAt: String(r.created_at) }));
}

/**
 * The store an email is signed in as. Returns the store slug for a self-onboarded user, or null.
 * If a person somehow belongs to more than one store, the store they OWN wins, then the oldest —
 * a stable single answer, since the workspace acts as one store at a time.
 */
export async function storeSlugForEmail(email: string): Promise<string | null> {
 const e = normEmail(email);
 if (!e) return null;
 await ensureTable();
 const rows = await db()`SELECT store_slug FROM store_users
  WHERE email = ${e}
  ORDER BY (role = 'owner') DESC, created_at ASC
  LIMIT 1` as Array<{ store_slug: string }>;
 return rows[0]?.store_slug ?? null;
}

/** Does this email have access to this specific store? (authorization check) */
export async function emailBelongsToStore(storeSlug: string, email: string): Promise<boolean> {
 await ensureTable();
 const rows = await db()`SELECT 1 FROM store_users WHERE store_slug = ${storeSlug} AND email = ${normEmail(email)} LIMIT 1`;
 return rows.length > 0;
}
