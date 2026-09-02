import { neon } from "@neondatabase/serverless";
// Explicit .ts extension: scripts/qr-scans.mts imports this module under node's native TS
// stripping, which does not resolve extensionless relative paths the way the bundler does.
import { classifyDevice, geoFromHeaders, type GeoHint } from "./store-visits-db.ts";
import { ensureSchema } from "./db-setup.ts";

// Scans of the printed QR codes in qr-codes.ts. One row per scan (NOT session-gated —
// two people scanning the same booth sign is two scans, and that count is the point).
//
// Location comes from Vercel's edge geo headers, which are present in production and
// absent locally, so every geo column is nullable and every read treats NULL as unknown.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

const ensureTable = ensureSchema(() => createSchema(db()));

async function createSchema(sql: ReturnType<typeof db>) {
 await sql`CREATE TABLE IF NOT EXISTS qr_scans (
 id SERIAL PRIMARY KEY,
 code TEXT NOT NULL,
 country TEXT,
 region TEXT,
 city TEXT,
 latitude TEXT,
 longitude TEXT,
 device_type TEXT,
 referrer_host TEXT,
 user_agent TEXT,
 timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_qr_scans_code_ts ON qr_scans (code, timestamp)`;
}

/**
 * The city centroid Vercel resolves for the request IP. Coarse by design — good enough to
 * pin a scan on a map, never precise enough to identify a person. Stored as TEXT because
 * the headers are strings and nothing here does math on them.
 */
function latLonFromHeaders(h: Headers): { latitude: string | null; longitude: string | null } {
 const get = (k: string) => (h.get(k) || "").trim().slice(0, 24) || null;
 return { latitude: get("x-vercel-ip-latitude"), longitude: get("x-vercel-ip-longitude") };
}

export type ScanLocation = GeoHint & { latitude: string | null; longitude: string | null };

export function scanLocationFromHeaders(h: Headers): ScanLocation {
 return { ...geoFromHeaders(h), ...latLonFromHeaders(h) };
}

export async function recordQrScan(s: {
 code: string;
 location: ScanLocation;
 userAgent: string | null;
 referrerHost: string | null;
}): Promise<void> {
 await ensureTable();
 const { country, region, city, latitude, longitude } = s.location;
 await db()`INSERT INTO qr_scans (code, country, region, city, latitude, longitude, device_type, referrer_host, user_agent)
 VALUES (${s.code}, ${country}, ${region}, ${city}, ${latitude}, ${longitude},
 ${classifyDevice(s.userAgent)}, ${s.referrerHost}, ${s.userAgent ? s.userAgent.slice(0, 400) : null})`;
}

export type QrScanRow = {
 code: string;
 city: string | null;
 region: string | null;
 country: string | null;
 deviceType: string | null;
 timestamp: string;
};

export type QrPlaceRow = {
 code: string;
 city: string | null;
 region: string | null;
 country: string | null;
 scans: number;
 latitude: string | null;
 longitude: string | null;
 lastScan: string;
};

/** Scan counts per code — the headline "did anyone actually scan the card". */
export async function getQrScanTotals(sinceDays?: number): Promise<{ code: string; scans: number; lastScan: string }[]> {
 await ensureTable();
 const sql = db();
 const cutoff = sinceDays ? new Date(Date.now() - sinceDays * 86400000).toISOString() : null;
 const rows = (cutoff
  ? await sql`SELECT code, COUNT(*)::int AS scans, MAX(timestamp) AS last_scan FROM qr_scans WHERE timestamp >= ${cutoff} GROUP BY 1 ORDER BY 2 DESC`
  : await sql`SELECT code, COUNT(*)::int AS scans, MAX(timestamp) AS last_scan FROM qr_scans GROUP BY 1 ORDER BY 2 DESC`) as Record<string, unknown>[];
 return rows.map((r) => ({ code: String(r.code), scans: Number(r.scans), lastScan: String(r.last_scan) }));
}

/** Where the scans happened, grouped by code and place. */
export async function getQrScanPlaces(sinceDays?: number, limit = 100): Promise<QrPlaceRow[]> {
 await ensureTable();
 const sql = db();
 const cutoff = sinceDays ? new Date(Date.now() - sinceDays * 86400000).toISOString() : null;
 const rows = (cutoff
  ? await sql`SELECT code, city, region, country, COUNT(*)::int AS scans,
   MAX(latitude) AS latitude, MAX(longitude) AS longitude, MAX(timestamp) AS last_scan
   FROM qr_scans WHERE timestamp >= ${cutoff} GROUP BY 1, 2, 3, 4 ORDER BY 5 DESC LIMIT ${limit}`
  : await sql`SELECT code, city, region, country, COUNT(*)::int AS scans,
   MAX(latitude) AS latitude, MAX(longitude) AS longitude, MAX(timestamp) AS last_scan
   FROM qr_scans GROUP BY 1, 2, 3, 4 ORDER BY 5 DESC LIMIT ${limit}`) as Record<string, unknown>[];
 return rows.map((r) => ({
  code: String(r.code),
  city: r.city ? String(r.city) : null,
  region: r.region ? String(r.region) : null,
  country: r.country ? String(r.country) : null,
  scans: Number(r.scans),
  latitude: r.latitude ? String(r.latitude) : null,
  longitude: r.longitude ? String(r.longitude) : null,
  lastScan: String(r.last_scan),
 }));
}

/** The raw tail, newest first — for eyeballing what a single scan actually recorded. */
export async function getRecentQrScans(limit = 25): Promise<QrScanRow[]> {
 await ensureTable();
 const rows = (await db()`SELECT code, city, region, country, device_type, timestamp
  FROM qr_scans ORDER BY timestamp DESC LIMIT ${limit}`) as Record<string, unknown>[];
 return rows.map((r) => ({
  code: String(r.code),
  city: r.city ? String(r.city) : null,
  region: r.region ? String(r.region) : null,
  country: r.country ? String(r.country) : null,
  deviceType: r.device_type ? String(r.device_type) : null,
  timestamp: String(r.timestamp),
 }));
}
