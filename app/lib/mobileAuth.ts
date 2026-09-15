import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { neon } from "@neondatabase/serverless";

/**
 * Mobile auth helpers. Issues and verifies app session JWTs, and manages
 * one-time magic link tokens. Sessions are 1 year, auto-renewed on every
 * /api/mobile/auth/me call.
 *
 * Uses HS256 with NEXTAUTH_SECRET (reuses the web's existing secret).
 * If NEXTAUTH_SECRET is missing, falls back to MOBILE_AUTH_SECRET.
 */

const SESSION_DAYS = 365;
const SECRET = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || process.env.MOBILE_AUTH_SECRET || "";

function getDbUrl(): string {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return url;
}

function b64url(input: Buffer | string): string {
 const b = typeof input === "string" ? Buffer.from(input) : input;
 return b
 .toString("base64")
 .replace(/\+/g, "-")
 .replace(/\//g, "_")
 .replace(/=+$/, "");
}

function b64urlDecode(input: string): Buffer {
 const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
 const std = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
 return Buffer.from(std, "base64");
}

export type MobileJwtPayload = { sub: string; email: string; iat: number; exp: number };

export function signMobileJwt(userId: string, email: string): string {
 if (!SECRET) throw new Error("Auth secret not configured");
 const header = { alg: "HS256", typ: "JWT" };
 const now = Math.floor(Date.now() / 1000);
 const payload: MobileJwtPayload = {
 sub: userId,
 email,
 iat: now,
 exp: now + SESSION_DAYS * 24 * 60 * 60,
 };
 const headerB64 = b64url(JSON.stringify(header));
 const payloadB64 = b64url(JSON.stringify(payload));
 const data = `${headerB64}.${payloadB64}`;
 const sig = b64url(createHmac("sha256", SECRET).update(data).digest());
 return `${data}.${sig}`;
}

export function verifyMobileJwt(token: string): MobileJwtPayload | null {
 if (!SECRET) return null;
 const parts = token.split(".");
 if (parts.length !== 3) return null;
 const [headerB64, payloadB64, sig] = parts;
 const expected = b64url(createHmac("sha256", SECRET).update(`${headerB64}.${payloadB64}`).digest());
 const a = Buffer.from(sig);
 const b = Buffer.from(expected);
 if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
 try {
 const payload = JSON.parse(b64urlDecode(payloadB64).toString()) as MobileJwtPayload;
 if (payload.exp < Math.floor(Date.now() / 1000)) return null;
 return payload;
 } catch {
 return null;
 }
}

/**
 * Extract userId from Authorization: Bearer <jwt> header.
 * Returns null if missing/invalid/expired.
 */
export function getMobileUserId(request: Request): string | null {
 const auth = request.headers.get("authorization") ?? "";
 const m = /^Bearer\s+(.+)$/i.exec(auth);
 if (!m) return null;
 const payload = verifyMobileJwt(m[1]);
 return payload?.sub ?? null;
}

/**
 * Extract the full verified payload ({ sub, email }) from the Bearer JWT.
 * Returns null if missing/invalid/expired. Use when you need the email (e.g. to
 * resolve whether the logged-in app account is a store).
 */
export function getMobilePayload(request: Request): MobileJwtPayload | null {
 const auth = request.headers.get("authorization") ?? "";
 const m = /^Bearer\s+(.+)$/i.exec(auth);
 if (!m) return null;
 return verifyMobileJwt(m[1]);
}

/**
 * Ensure the magic_link_tokens table exists.
 */
export async function ensureMagicLinkTable() {
 const sql = neon(getDbUrl());
 await sql`
 CREATE TABLE IF NOT EXISTS mobile_magic_link_tokens (
 token TEXT PRIMARY KEY,
 email TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 used_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )
 `;
 await sql`CREATE INDEX IF NOT EXISTS idx_mmlt_email ON mobile_magic_link_tokens(email)`;
}

/**
 * Generate a single-use magic-link token, store it, return it.
 */
export async function createMagicLinkToken(email: string): Promise<string> {
 await ensureMagicLinkTable();
 const token = randomBytes(32).toString("hex");
 const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
 const sql = neon(getDbUrl());
 await sql`
 INSERT INTO mobile_magic_link_tokens (token, email, expires_at)
 VALUES (${token}, ${email}, ${expiresAt}::timestamptz)
 `;
 return token;
}

/**
 * Verify a token. Returns the email if valid + unused + not expired, else null.
 * Marks the token as used.
 */
export async function consumeMagicLinkToken(token: string): Promise<string | null> {
 await ensureMagicLinkTable();
 const sql = neon(getDbUrl());
 const rows = await sql`
 UPDATE mobile_magic_link_tokens
 SET used_at = NOW()
 WHERE token = ${token}
  AND used_at IS NULL
  AND expires_at > NOW()
 RETURNING email
 `;
 if ((rows as { email: string }[]).length === 0) return null;
 return (rows as { email: string }[])[0].email;
}

/**
 * Find or create a user by email. Returns the user id (UUID).
 */
export async function findOrCreateUserByEmail(email: string, name?: string): Promise<string> {
 const sql = neon(getDbUrl());
 // Try fetch
 const existing = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
 if ((existing as { id: string }[]).length > 0) {
 return (existing as { id: string }[])[0].id;
 }
 // Insert
 const inserted = await sql`
 INSERT INTO users (name, email, email_verified)
 VALUES (${name ?? null}, ${email}, NOW())
 RETURNING id
 `;
 return (inserted as { id: string }[])[0].id;
}

/**
 * Look up user by id. Returns { id, email, name, image } or null.
 */
export async function getUserById(userId: string): Promise<{ id: string; email: string; name: string | null; image: string | null } | null> {
 const sql = neon(getDbUrl());
 const rows = await sql`
 SELECT id, email, name, image FROM users WHERE id = ${userId} LIMIT 1
 `;
 const u = (rows as { id: string; email: string; name: string | null; image: string | null }[])[0];
 return u ?? null;
}
