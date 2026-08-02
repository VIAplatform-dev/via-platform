import { neon } from "@neondatabase/serverless";
import type { NextRequest } from "next/server";
import { classifySource } from "./traffic-source";

// Storefront visits, recorded server-side as pages are served so we capture the
// real entry source (search / social / direct / referral) even with no UTM tag.
// One row per session (cookie-gated), so a row ≈ a visit and COUNT(*) ≈ sessions.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS store_visits (
 id SERIAL PRIMARY KEY,
 store_slug TEXT NOT NULL,
 session_id TEXT,
 source_type TEXT NOT NULL,
 source TEXT NOT NULL,
 referrer_host TEXT,
 utm_source TEXT,
 utm_medium TEXT,
 path TEXT,
 timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_store_visits_store_ts ON store_visits (store_slug, timestamp)`;
 ensured = true;
}

export async function recordStoreVisit(v: {
 storeSlug: string;
 sessionId: string | null;
 sourceType: string;
 source: string;
 referrerHost: string | null;
 utmSource: string | null;
 utmMedium: string | null;
 path: string | null;
}): Promise<void> {
 await ensureTable();
 await db()`INSERT INTO store_visits (store_slug, session_id, source_type, source, referrer_host, utm_source, utm_medium, path)
 VALUES (${v.storeSlug}, ${v.sessionId}, ${v.sourceType}, ${v.source}, ${v.referrerHost}, ${v.utmSource}, ${v.utmMedium}, ${v.path})`;
}

const SESSION_COOKIE = "via_sess";
const SESSION_TTL_SECONDS = 1800; // 30 min — a returning visitor after this counts as a new session

/**
 * Record the entry source for a storefront request, once per session. Returns a
 * Set-Cookie value to attach to the response when a new session is recorded (so the
 * next page view in the same session is skipped), or null if already tracked.
 * Fire-safe: any DB hiccup is swallowed so it never blocks serving the page.
 */
export async function captureStorefrontEntry(req: NextRequest, slug: string): Promise<string | null> {
 try {
 if (req.cookies.get(SESSION_COOKIE)) return null;
 const url = req.nextUrl;
 const utmSource = url.searchParams.get("utm_source");
 const utmMedium = url.searchParams.get("utm_medium");
 const c = classifySource({ referrer: req.headers.get("referer"), utmSource, utmMedium, selfHost: url.host });
 const sessionId = crypto.randomUUID();
 await recordStoreVisit({
 storeSlug: slug,
 sessionId,
 sourceType: c.type,
 source: c.source,
 referrerHost: c.referrerHost || null,
 utmSource,
 utmMedium,
 path: url.pathname,
 });
 return `${SESSION_COOKIE}=${sessionId}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; SameSite=Lax`;
 } catch {
 return null;
 }
}

/**
 * Client-beacon variant of the above. The block-builder storefront is server-rendered, so a small
 * client tracker POSTs the REAL external referrer (document.referrer) — a client beacon's own Referer
 * would just be the storefront page. Records the entry source once per session; returns a fresh
 * sessionId for the caller to set as `via_sess`, or null if the session already exists.
 */
export async function captureStorefrontEntryClient(input: {
 slug: string; hasSession: boolean; referrer: string | null; utmSource: string | null; utmMedium: string | null; path: string; selfHost: string;
}): Promise<string | null> {
 try {
 if (input.hasSession) return null;
 const c = classifySource({ referrer: input.referrer, utmSource: input.utmSource, utmMedium: input.utmMedium, selfHost: input.selfHost });
 const sessionId = crypto.randomUUID();
 await recordStoreVisit({
 storeSlug: input.slug, sessionId, sourceType: c.type, source: c.source,
 referrerHost: c.referrerHost || null, utmSource: input.utmSource, utmMedium: input.utmMedium, path: input.path,
 });
 return sessionId;
 } catch {
 return null;
 }
}

// ── Page-level analytics: every page view per store (NOT session-gated), so a store can see what
// pages/products shoppers actually browse — clean, per-store data across marketplace + storefront.
let pvEnsured = false;
async function ensurePageviews() {
 if (pvEnsured) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS store_pageviews (
 id SERIAL PRIMARY KEY,
 store_slug TEXT NOT NULL,
 path TEXT NOT NULL,
 page_type TEXT NOT NULL,
 title TEXT,
 session_id TEXT,
 surface TEXT NOT NULL DEFAULT 'marketplace',
 timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_store_pageviews_store_ts ON store_pageviews (store_slug, timestamp)`;
 pvEnsured = true;
}

export async function recordStorePageview(v: {
 storeSlug: string; path: string; pageType: string; title?: string | null; sessionId?: string | null; surface?: string;
}): Promise<void> {
 await ensurePageviews();
 await db()`INSERT INTO store_pageviews (store_slug, path, page_type, title, session_id, surface)
 VALUES (${v.storeSlug}, ${v.path.slice(0, 500)}, ${v.pageType}, ${v.title ?? null}, ${v.sessionId ?? null}, ${v.surface || "marketplace"})`;
}

export type TopPages = {
 total: number;
 byType: { type: string; views: number }[];
 pages: { path: string; type: string; title: string | null; views: number; visitors: number }[];
};

export async function getTopPages(storeSlug: string, sinceDays?: number, limit = 12): Promise<TopPages> {
 await ensurePageviews();
 const sql = db();
 const cutoff = sinceDays ? new Date(Date.now() - sinceDays * 86400000).toISOString() : null;
 const byType = (cutoff
 ? await sql`SELECT page_type AS type, COUNT(*)::int AS views FROM store_pageviews WHERE store_slug = ${storeSlug} AND timestamp >= ${cutoff} GROUP BY 1 ORDER BY 2 DESC`
 : await sql`SELECT page_type AS type, COUNT(*)::int AS views FROM store_pageviews WHERE store_slug = ${storeSlug} GROUP BY 1 ORDER BY 2 DESC`) as { type: string; views: number }[];
 const pages = (cutoff
 ? await sql`SELECT path, page_type AS type, MAX(title) AS title, COUNT(*)::int AS views, COUNT(DISTINCT session_id)::int AS visitors
 FROM store_pageviews WHERE store_slug = ${storeSlug} AND timestamp >= ${cutoff} GROUP BY 1, 2 ORDER BY 4 DESC LIMIT ${limit}`
 : await sql`SELECT path, page_type AS type, MAX(title) AS title, COUNT(*)::int AS views, COUNT(DISTINCT session_id)::int AS visitors
 FROM store_pageviews WHERE store_slug = ${storeSlug} GROUP BY 1, 2 ORDER BY 4 DESC LIMIT ${limit}`) as { path: string; type: string; title: string | null; views: number; visitors: number }[];
 const total = byType.reduce((s, r) => s + Number(r.views), 0);
 return {
 total,
 byType: byType.map((r) => ({ type: String(r.type), views: Number(r.views) })),
 pages: pages.map((r) => ({ path: String(r.path), type: String(r.type), title: r.title ? String(r.title) : null, views: Number(r.views), visitors: Number(r.visitors) })),
 };
}

export type TrafficSources = {
 total: number;
 byType: { type: string; sessions: number }[];
 topSources: { source: string; type: string; sessions: number }[];
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function getTrafficSources(storeSlug: string, sinceDays?: number): Promise<TrafficSources> {
 await ensureTable();
 const sql = db();
 const cutoff = sinceDays ? new Date(Date.now() - sinceDays * 86400000).toISOString() : null;

 const byType = (cutoff
 ? await sql`SELECT source_type AS type, COUNT(*)::int AS sessions FROM store_visits WHERE store_slug = ${storeSlug} AND timestamp >= ${cutoff} GROUP BY 1 ORDER BY 2 DESC`
 : await sql`SELECT source_type AS type, COUNT(*)::int AS sessions FROM store_visits WHERE store_slug = ${storeSlug} GROUP BY 1 ORDER BY 2 DESC`) as any[];

 const topSources = (cutoff
 ? await sql`SELECT source, source_type AS type, COUNT(*)::int AS sessions FROM store_visits WHERE store_slug = ${storeSlug} AND timestamp >= ${cutoff} GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 8`
 : await sql`SELECT source, source_type AS type, COUNT(*)::int AS sessions FROM store_visits WHERE store_slug = ${storeSlug} GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 8`) as any[];

 const total = byType.reduce((s, r) => s + Number(r.sessions), 0);
 return {
 total,
 byType: byType.map((r) => ({ type: String(r.type), sessions: Number(r.sessions) })),
 topSources: topSources.map((r) => ({ source: String(r.source), type: String(r.type), sessions: Number(r.sessions) })),
 };
}
