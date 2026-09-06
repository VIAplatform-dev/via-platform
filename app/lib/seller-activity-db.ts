// The append-only record. Never blocks anything a seller is doing.
import { neon } from "@neondatabase/serverless";
import type { Activity, ActivityKind } from "./seller-activity";

const db = () => neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");

let ensured = false;
async function ensure() {
 if (ensured) return;
 await db()`CREATE TABLE IF NOT EXISTS seller_activity (
  id BIGSERIAL PRIMARY KEY,
  store_slug TEXT,
  email TEXT,
  kind TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await db()`CREATE INDEX IF NOT EXISTS idx_seller_activity_store ON seller_activity (store_slug, created_at DESC)`;
 ensured = true;
}

/**
 * Record one thing.
 *
 * Fire-and-forget and swallowed on failure, on purpose: a seller publishing a piece must never see
 * an error because a log write failed. A missing line in a diary is a smaller harm than a listing
 * that wouldn't save.
 */
export function logActivity(e: { storeSlug?: string | null; email?: string | null; kind: ActivityKind; detail?: string | null }): void {
 void (async () => {
  try {
   await ensure();
   await db()`INSERT INTO seller_activity (store_slug, email, kind, detail)
    VALUES (${e.storeSlug ?? null}, ${e.email?.toLowerCase() ?? null}, ${e.kind}, ${e.detail ? String(e.detail).slice(0, 300) : null})`;
  } catch { /* a diary is not worth an outage */ }
 })();
}

export async function listActivity(opts: { storeSlug?: string | null; email?: string | null; limit?: number } = {}): Promise<Activity[]> {
 await ensure();
 const limit = Math.min(500, Math.max(1, opts.limit ?? 200));
 const rows = (opts.storeSlug
  ? await db()`SELECT * FROM seller_activity WHERE store_slug = ${opts.storeSlug} ORDER BY created_at DESC LIMIT ${limit}`
  : opts.email
   ? await db()`SELECT * FROM seller_activity WHERE email = ${opts.email.toLowerCase()} ORDER BY created_at DESC LIMIT ${limit}`
   : await db()`SELECT * FROM seller_activity ORDER BY created_at DESC LIMIT ${limit}`) as Array<Record<string, unknown>>;
 return rows.map((r) => ({
  id: Number(r.id),
  storeSlug: (r.store_slug as string) ?? null,
  email: (r.email as string) ?? null,
  kind: r.kind as ActivityKind,
  detail: (r.detail as string) ?? null,
  at: new Date(r.created_at as string).toISOString(),
 }));
}

/** Everyone who's done anything, most recent first — the list to pick from. */
export async function listActiveStores(): Promise<{ storeSlug: string | null; email: string | null; last: string; events: number }[]> {
 await ensure();
 const rows = await db()`SELECT store_slug, max(email) AS email, max(created_at) AS last, count(*)::int AS events
  FROM seller_activity GROUP BY store_slug ORDER BY last DESC LIMIT 50` as Array<Record<string, unknown>>;
 return rows.map((r) => ({
  storeSlug: (r.store_slug as string) ?? null,
  email: (r.email as string) ?? null,
  last: new Date(r.last as string).toISOString(),
  events: Number(r.events),
 }));
}
