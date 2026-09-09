// The invite list for getvya.ai. One row per email we've told "yes, you can open a shop".
import { neon } from "@neondatabase/serverless";
import { normaliseEmail, isEmail } from "./seller-access";

const db = () => neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");

let ensured = false;
async function ensure() {
 if (ensured) return;
 await db()`CREATE TABLE IF NOT EXISTS seller_invites (
  email TEXT PRIMARY KEY,
  note TEXT,
  invited_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
 )`;
 // A store we've already imported and are holding for this person.
 //
 // "Planting the seed": her site is scraped into a seller row before she ever signs up, so when she
 // chooses "import my store" the pieces are already there instead of her watching a spinner. Without
 // this the slug she'd naturally get is taken by that very row, and onboarding would hand her
 // "…-2" with an empty shop while 142 pieces sat one row away.
 await db()`ALTER TABLE seller_invites ADD COLUMN IF NOT EXISTS reserve_slug TEXT`;
 ensured = true;
}

export type SellerInvite = { email: string; note: string | null; reserveSlug: string | null; createdAt: string; usedAt: string | null };

export async function isInvited(email: string): Promise<boolean> {
 const e = normaliseEmail(email);
 if (!isEmail(e)) return false;
 try {
  await ensure();
  const rows = await db()`SELECT 1 FROM seller_invites WHERE email = ${e} LIMIT 1`;
  return rows.length > 0;
 } catch {
  // Fail CLOSED. If we can't read the list we don't know who's invited, and guessing "yes" is how
  // a database blip becomes an open front door.
  return false;
 }
}

export async function inviteSeller(email: string, opts?: { note?: string | null; invitedBy?: string | null; reserveSlug?: string | null }): Promise<boolean> {
 const e = normaliseEmail(email);
 if (!isEmail(e)) return false;
 await ensure();
 await db()`INSERT INTO seller_invites (email, note, invited_by, reserve_slug)
  VALUES (${e}, ${opts?.note ?? null}, ${opts?.invitedBy ?? null}, ${opts?.reserveSlug ?? null})
  ON CONFLICT (email) DO UPDATE SET
   note = COALESCE(${opts?.note ?? null}, seller_invites.note),
   reserve_slug = COALESCE(${opts?.reserveSlug ?? null}, seller_invites.reserve_slug)`;
 return true;
}

export async function revokeInvite(email: string): Promise<void> {
 await ensure();
 await db()`DELETE FROM seller_invites WHERE email = ${normaliseEmail(email)}`;
}

/** Stamped when the invite turns into a real store, so the list shows who's actually started. */
export async function markInviteUsed(email: string): Promise<void> {
 try {
  await ensure();
  await db()`UPDATE seller_invites SET used_at = now() WHERE email = ${normaliseEmail(email)} AND used_at IS NULL`;
 } catch { /* never block a store being created over a bookkeeping write */ }
}

export async function listInvites(): Promise<SellerInvite[]> {
 await ensure();
 const rows = await db()`SELECT email, note, reserve_slug, created_at, used_at FROM seller_invites ORDER BY created_at DESC` as Array<Record<string, unknown>>;
 return rows.map((r) => ({
  email: String(r.email),
  note: (r.note as string) ?? null,
  reserveSlug: (r.reserve_slug as string) ?? null,
  createdAt: new Date(r.created_at as string).toISOString(),
  usedAt: r.used_at ? new Date(r.used_at as string).toISOString() : null,
 }));
}

/**
 * The store held for this email, if any — and only while it's genuinely unclaimed.
 *
 * Checked against store_users rather than trusted from the invite, so a slug that someone else has
 * since taken can never be handed over a second time.
 */
export async function reservedStoreFor(email: string): Promise<string | null> {
 const e = normaliseEmail(email);
 if (!isEmail(e)) return null;
 try {
  await ensure();
  const rows = await db()`SELECT reserve_slug FROM seller_invites WHERE email = ${e} AND reserve_slug IS NOT NULL LIMIT 1` as Array<{ reserve_slug: string }>;
  const slug = rows[0]?.reserve_slug;
  if (!slug) return null;
  const taken = await db()`SELECT 1 FROM store_users WHERE store_slug = ${slug} LIMIT 1`;
  return taken.length ? null : slug;
 } catch { return null; }
}
