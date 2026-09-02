import { neon } from "@neondatabase/serverless";
import { ensureSchema } from "./db-setup.ts";
import { normalizeQrCode, isAllowedDestination } from "./qr-codes.ts";

// The printed QR codes themselves. In Neon rather than in code so a card already in someone's
// hand can be repointed — change the row, the next scan goes somewhere else, no deploy.
//
// The scans those codes produce live in qr-scans-db.ts. Kept apart on purpose: this table is
// tiny, hand-edited and read on every scan; that one only ever grows.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

const ensureTable = ensureSchema(() => createSchema(db()));

async function createSchema(sql: ReturnType<typeof db>) {
 await sql`CREATE TABLE IF NOT EXISTS qr_codes (
 code TEXT PRIMARY KEY,
 label TEXT NOT NULL,
 destination TEXT NOT NULL,
 active BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
}

export type QrCodeRow = {
 code: string;
 label: string;
 destination: string;
 active: boolean;
 updatedAt: string;
};

function toRow(r: Record<string, unknown>): QrCodeRow {
 return {
  code: String(r.code),
  label: String(r.label),
  destination: String(r.destination),
  active: r.active === true,
  updatedAt: String(r.updated_at),
 };
}

// A scan is a person standing still waiting for a page. Re-reading a table of two rows on
// every scan is a database round trip in that person's critical path, so each instance holds
// the answer briefly. Short enough that repointing a code takes effect while you are still
// standing at the printer, long enough that a rush of scans is one query.
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { row: QrCodeRow | null; at: number }>();

/** Clear the per-instance cache. Called after a write so the next read is immediate. */
export function forgetCachedQrCodes(): void {
 cache.clear();
}

/**
 * The destination for a scanned code, or null if there is nothing usable to send them to.
 *
 * Null covers every "do not trust this" case — no such code, deactivated, or a destination
 * that is not on the allowlist. The caller falls back to the homepage rather than failing,
 * because a printed code must never dead-end.
 */
export async function getQrCodeDestination(rawCode: string): Promise<string | null> {
 const code = normalizeQrCode(rawCode);
 if (!code) return null;

 const hit = cache.get(code);
 const row = hit && Date.now() - hit.at < CACHE_TTL_MS ? hit.row : await readRow(code);
 if (!hit || Date.now() - hit.at >= CACHE_TTL_MS) cache.set(code, { row, at: Date.now() });

 if (!row || !row.active) return null;
 // Checked on read as well as on write: a row edited directly in the Neon console never
 // passed through setQrCode, and this is the last gate before a redirect.
 return isAllowedDestination(row.destination) ? row.destination : null;
}

async function readRow(code: string): Promise<QrCodeRow | null> {
 await ensureTable();
 const rows = (await db()`SELECT code, label, destination, active, updated_at
  FROM qr_codes WHERE code = ${code} LIMIT 1`) as Record<string, unknown>[];
 return rows.length ? toRow(rows[0]) : null;
}

export async function listQrCodes(): Promise<QrCodeRow[]> {
 await ensureTable();
 const rows = (await db()`SELECT code, label, destination, active, updated_at
  FROM qr_codes ORDER BY code`) as Record<string, unknown>[];
 return rows.map(toRow);
}

/**
 * Create or repoint a code. Rejects a destination outside the allowlist outright — the point
 * of failing here is that a bad destination never reaches the table at all, so nobody has to
 * notice it later.
 */
export async function setQrCode(rawCode: string, destination: string, label: string): Promise<QrCodeRow> {
 const code = normalizeQrCode(rawCode);
 if (!code) throw new Error("A QR code needs a slug: letters, digits, dashes.");
 if (!isAllowedDestination(destination)) {
  throw new Error(
   `Refusing "${destination}": a QR may only point at getvya.ai or vyaplatform.com, over https.`
  );
 }
 await ensureTable();
 const rows = (await db()`INSERT INTO qr_codes (code, label, destination)
  VALUES (${code}, ${label}, ${destination})
  ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, destination = EXCLUDED.destination,
   active = true, updated_at = now()
  RETURNING code, label, destination, active, updated_at`) as Record<string, unknown>[];
 forgetCachedQrCodes();
 return toRow(rows[0]);
}

/**
 * Retire a code without deleting it. The row stays so its scans keep their label and history;
 * scanning it now falls back to the homepage.
 */
export async function deactivateQrCode(rawCode: string): Promise<boolean> {
 const code = normalizeQrCode(rawCode);
 if (!code) return false;
 await ensureTable();
 const rows = (await db()`UPDATE qr_codes SET active = false, updated_at = now()
  WHERE code = ${code} RETURNING code`) as Record<string, unknown>[];
 forgetCachedQrCodes();
 return rows.length > 0;
}
