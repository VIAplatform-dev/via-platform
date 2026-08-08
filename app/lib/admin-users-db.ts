import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

// Per-user admin accounts. Each admin signs in with their own email + password they
// set via an invite link, then a 2FA code emailed to THEIR address. Replaces the
// single shared ADMIN_PASSWORD (which stays as a break-glass fallback in the auth
// route). Passwords are scrypt-hashed (salt:hash).

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 await db()`CREATE TABLE IF NOT EXISTS admin_users (
 id SERIAL PRIMARY KEY,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT,
 invite_token TEXT,
 invite_expires TIMESTAMPTZ,
 active BOOLEAN NOT NULL DEFAULT false,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 ensured = true;
}

function normEmail(email: string): string {
 return (email || "").trim().toLowerCase();
}

function hashPw(pw: string): string {
 const salt = crypto.randomBytes(16).toString("hex");
 const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
 return `${salt}:${hash}`;
}
function verifyPw(pw: string, stored: string | null): boolean {
 if (!stored) return false;
 const [salt, hash] = stored.split(":");
 if (!salt || !hash) return false;
 try {
 const h = crypto.scryptSync(pw, salt, 64).toString("hex");
 return crypto.timingSafeEqual(Buffer.from(h, "hex"), Buffer.from(hash, "hex"));
 } catch {
 return false;
 }
}

export type AdminUser = { id: number; email: string; active: boolean; hasPassword: boolean; createdAt: string };
type Row = { id: number; email: string; password_hash: string | null; active: boolean; created_at: string };
const toUser = (r: Row): AdminUser => ({ id: Number(r.id), email: r.email, active: !!r.active, hasPassword: !!r.password_hash, createdAt: String(r.created_at) });

export async function listAdmins(): Promise<AdminUser[]> {
 await ensureTable();
 const rows = await db()`SELECT id, email, password_hash, active, created_at FROM admin_users ORDER BY created_at ASC`;
 return (rows as Row[]).map(toUser);
}

export async function getAdminByEmail(email: string): Promise<{ email: string; active: boolean; passwordHash: string | null } | null> {
 await ensureTable();
 const rows = await db()`SELECT email, password_hash, active FROM admin_users WHERE email = ${normEmail(email)} LIMIT 1`;
 const r = rows[0] as { email: string; password_hash: string | null; active: boolean } | undefined;
 return r ? { email: r.email, active: !!r.active, passwordHash: r.password_hash } : null;
}

/** Create (or re-invite) an admin: stores the email with a fresh invite token. Returns the token. */
export async function inviteAdmin(email: string): Promise<{ token: string } | null> {
 await ensureTable();
 const e = normEmail(email);
 if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return null;
 const token = crypto.randomBytes(32).toString("hex");
 const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7-day invite
 await db()`INSERT INTO admin_users (email, invite_token, invite_expires, active)
 VALUES (${e}, ${token}, ${expires}, false)
 ON CONFLICT (email) DO UPDATE SET invite_token = ${token}, invite_expires = ${expires}`;
 return { token };
}

/** The email for a valid, unexpired invite token (for the set-password page). */
export async function emailForInvite(token: string): Promise<string | null> {
 await ensureTable();
 if (!token) return null;
 const rows = await db()`SELECT email FROM admin_users WHERE invite_token = ${token} AND invite_expires > now() LIMIT 1`;
 return rows[0] ? (rows[0] as { email: string }).email : null;
}

/** Set the password from a valid invite token; activates the account + clears the token. */
export async function setPasswordFromInvite(token: string, password: string): Promise<boolean> {
 await ensureTable();
 if (!token || !password || password.length < 8) return false;
 const email = await emailForInvite(token);
 if (!email) return false;
 await db()`UPDATE admin_users SET password_hash = ${hashPw(password)}, active = true, invite_token = NULL, invite_expires = NULL WHERE email = ${email}`;
 return true;
}

/**
 * Self-service password reset: issue a fresh token for an EXISTING, ACTIVE admin so they can
 * reset from their own inbox. Returns the token + canonical email, or null if the email isn't a
 * known active admin (the caller returns a generic success either way to avoid user enumeration).
 * Deliberately separate from inviteAdmin — this never creates accounts and never touches inactive
 * (never-onboarded) rows, so the public endpoint can't be used to provision or probe admins.
 */
export async function requestPasswordReset(email: string): Promise<{ token: string; email: string } | null> {
 await ensureTable();
 const e = normEmail(email);
 const rows = await db()`SELECT email FROM admin_users WHERE email = ${e} AND active = true AND password_hash IS NOT NULL LIMIT 1`;
 if (!rows[0]) return null;
 const token = crypto.randomBytes(32).toString("hex");
 const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1-hour reset window
 await db()`UPDATE admin_users SET invite_token = ${token}, invite_expires = ${expires} WHERE email = ${e}`;
 return { token, email: e };
}

/** Verify an admin's email + password. Returns the canonical email on success. */
export async function verifyAdminLogin(email: string, password: string): Promise<string | null> {
 const a = await getAdminByEmail(email);
 if (!a || !a.active) return null;
 return verifyPw(password, a.passwordHash) ? a.email : null;
}

export async function removeAdmin(email: string): Promise<void> {
 await ensureTable();
 await db()`DELETE FROM admin_users WHERE email = ${normEmail(email)}`;
}
