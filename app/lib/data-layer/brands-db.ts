import { neon } from "@neondatabase/serverless";
import { brands as BRAND_DEFS } from "../brandData";
import type { BrandRef } from "./brands";

// ───────────────────────────────────────────────────────────────────────────
// Data Layer: canonical brand reference table (seeded like era_buckets).
//
// `brand_aliases` is the alias/synonym → canonical map the events ETL resolves
// brands through. Seeded from brandData (the single brand source), but living in
// a table so an alias can be added to fix coverage WITHOUT a code deploy. Driven
// by the unresolved-titles coverage report.
// ───────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

// Canonical seed: each brand's keywords become its aliases (incl. the canonical
// name). Order is preserved as priority (first match wins).
export const BRAND_SEED: BrandRef[] = BRAND_DEFS.map((b) => ({
 slug: b.slug,
 label: b.label,
 aliases: b.keywords,
}));

let _ensured = false;
export async function ensureBrandTable(): Promise<void> {
 if (_ensured) return;
 const sql = db();
 await sql`
 CREATE TABLE IF NOT EXISTS brand_aliases (
  alias TEXT PRIMARY KEY,
  brand_slug TEXT NOT NULL,
  brand_label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
 )
 `;
 const [{ n }] = (await sql`SELECT COUNT(*)::int AS n FROM brand_aliases`) as Array<{ n: number }>;
 if (n === 0) {
 for (let i = 0; i < BRAND_SEED.length; i++) {
  const b = BRAND_SEED[i];
  for (const a of b.aliases) {
  await sql`
   INSERT INTO brand_aliases (alias, brand_slug, brand_label, sort_order)
   VALUES (${a.toLowerCase()}, ${b.slug}, ${b.label}, ${i})
   ON CONFLICT (alias) DO NOTHING
  `;
  }
 }
 }
 _ensured = true;
}

let _refCache: BrandRef[] | null = null;
// Load the canonical reference (cached). Falls back to BRAND_SEED if the table
// isn't readable, so the ETL never loses brand resolution.
export async function loadBrandRef(): Promise<BrandRef[]> {
 if (_refCache) return _refCache;
 const sql = db();
 const rows = (await sql`
 SELECT alias, brand_slug, brand_label, sort_order FROM brand_aliases ORDER BY sort_order
 `.catch(() => [])) as Array<{ alias: string; brand_slug: string; brand_label: string; sort_order: number }>;
 if (!rows.length) {
 _refCache = BRAND_SEED;
 return _refCache;
 }
 const map = new Map<string, BrandRef & { order: number }>();
 for (const r of rows) {
 let b = map.get(r.brand_slug);
 if (!b) {
  b = { slug: r.brand_slug, label: r.brand_label, aliases: [], order: r.sort_order };
  map.set(r.brand_slug, b);
 }
 b.aliases.push(r.alias);
 }
 _refCache = [...map.values()].sort((a, b) => a.order - b.order).map(({ order: _o, ...rest }) => rest);
 return _refCache;
}

// Idempotent re-seed: upsert EVERY alias from BRAND_SEED into brand_aliases. New
// brands/aliases are added and existing rows are refreshed (label/slug/order),
// nothing is wiped. Run after brandData gains brands so the live table catches up.
// Safe to run repeatedly. Returns counts for the response.
export async function reseedBrandAliases(): Promise<{ brands: number; aliases: number }> {
 const sql = db();
 await ensureBrandTable(); // create the table if it doesn't exist yet
 let aliases = 0;
 for (let i = 0; i < BRAND_SEED.length; i++) {
 const b = BRAND_SEED[i];
 for (const a of b.aliases) {
  await sql`
  INSERT INTO brand_aliases (alias, brand_slug, brand_label, sort_order)
  VALUES (${a.toLowerCase()}, ${b.slug}, ${b.label}, ${i})
  ON CONFLICT (alias) DO UPDATE
   SET brand_slug = EXCLUDED.brand_slug,
    brand_label = EXCLUDED.brand_label,
    sort_order = EXCLUDED.sort_order
  `;
  aliases++;
 }
 }
 _refCache = null; // drop the cache so the next load reflects the re-seed
 return { brands: BRAND_SEED.length, aliases };
}

export type BrandCoverage = {
 total: number;
 resolved: number;
 resolvedPct: number;
 unresolved: number;
 unresolvedPct: number;
 distinctBrands: number;
 topUnresolvedTitles: { title: string; events: number }[];
};

// Coverage across ALL events: what % resolve to a known brand, and the
// highest-volume UNRESOLVED titles (to expand the alias map). Requires the
// events.title column (populated by the ETL); rows predating it are ignored for
// the unresolved list.
export async function getBrandCoverage(limit = 50): Promise<BrandCoverage> {
 const sql = db();
 const [agg] = (await sql`
 SELECT COUNT(*)::int AS total,
   COUNT(brand)::int AS resolved,
   COUNT(DISTINCT brand)::int AS distinct_brands
 FROM events
 `) as Array<{ total: number; resolved: number; distinct_brands: number }>;

 const top = (await sql`
 SELECT title, COUNT(*)::int AS cnt
 FROM events
 WHERE brand IS NULL AND title IS NOT NULL AND btrim(title) <> ''
 GROUP BY title
 ORDER BY cnt DESC
 LIMIT ${limit}
 `) as Array<{ title: string; cnt: number }>;

 const total = agg?.total ?? 0;
 const resolved = agg?.resolved ?? 0;
 const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
 return {
 total,
 resolved,
 resolvedPct: pct(resolved),
 unresolved: total - resolved,
 unresolvedPct: pct(total - resolved),
 distinctBrands: agg?.distinct_brands ?? 0,
 topUnresolvedTitles: top.map((t) => ({ title: t.title, events: t.cnt })),
 };
}
