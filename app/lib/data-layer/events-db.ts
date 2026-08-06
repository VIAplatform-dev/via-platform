import { neon } from "@neondatabase/serverless";
import { inferCategoryFromTitle } from "../loadStoreProducts";
import { normalizeColor } from "../colorNormalize";
import { inferModel } from "./models";
import { storeContactEmails } from "../stores";
import { WHOLE_WORD_ALIASES } from "../brandData";
import { ERA_BUCKETS_SEED, EVENT_FILTERS, type EraBucket } from "./config";
import { inferEra, inferCondition } from "./enrich";
import { resolveBrand, type BrandRef } from "./brands";
import { ensureBrandTable, loadBrandRef } from "./brands-db";
import {
 partitionEvents,
 mergeFilterStats,
 emptyFilterStats,
 type FilterStats,
 type FilterableEvent,
} from "./event-filters";

// ───────────────────────────────────────────────────────────────────────────
// Data Layer — the unified `events` table and its ETL.
//
// The marketplace captures events in four differently-shaped tables
// (product_views, product_favorites, clicks, conversions). This builds ONE
// append-only, enriched event log that every market metric reads from — the
// single source of truth. Built by a daily batch ETL (idempotent): each event
// is keyed by a unique `source` string, so re-runs skip what already exists.
//
// We do NOT touch the existing capture tables or the old metric path here — the
// old analytics keep running until the events-based metrics are validated, then
// we cut over (per the agreed incremental-convergence plan).
// ───────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

export type EventType = "view" | "favorite" | "click" | "order_item";

type EventRow = {
 ts: string; // ISO
 eventType: EventType;
 userId: string | null;
 storeSlug: string | null;
 productId: number | null;
 title: string; // raw title brand/category/era were resolved from (auditability + coverage)
 brand: string | null;
 category: string | null;
 era: string | null;
 color: string | null;
 model: string | null;
 condition: string | null;
 listedPrice: number | null;
 salePrice: number | null;
 currency: string | null;
 qty: number;
 source: string; // unique idempotency key, e.g. "view:123"
};

export async function ensureDataLayerTables(): Promise<void> {
 const sql = db();
 await sql`
 CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL,
  event_type TEXT NOT NULL,
  user_id TEXT,
  store_slug TEXT,
  product_id INT,
  title TEXT,
  brand TEXT,
  category TEXT,
  era TEXT,
  color TEXT,
  model TEXT,
  condition TEXT,
  listed_price NUMERIC(10,2),
  sale_price NUMERIC(10,2),
  currency TEXT,
  qty INT NOT NULL DEFAULT 1,
  source TEXT NOT NULL UNIQUE
 )
 `;
 await sql`CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_events_brand ON events(brand)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_events_category ON events(category)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_events_era ON events(era)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_events_color ON events(color)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_events_store ON events(store_slug)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)`;
 // product_history mirrors the identity of removed products so the views join can resolve
 // sold-out / renamed items. Created here too (not only in the sync) so the ETL never
 // depends on a sync having run first. CREATE IF NOT EXISTS keeps it idempotent with db.ts.
 await sql`
 CREATE TABLE IF NOT EXISTS product_history (
  id INTEGER PRIMARY KEY,
  store_slug TEXT NOT NULL,
  composite_id TEXT NOT NULL,
  title TEXT,
  description TEXT,
  shopify_product_id TEXT,
  price NUMERIC(10,2),
  currency TEXT,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )
 `;
 await sql`CREATE INDEX IF NOT EXISTS idx_product_history_composite ON product_history(composite_id)`;
 // Title is stored so brand attribution is auditable and the coverage report can
 // surface high-volume UNRESOLVED titles. Safe migration for pre-existing tables.
 await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS title TEXT`;
 // Colour dimension — added after the table shipped; self-heals in place.
 await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS color TEXT`;
 await sql`CREATE INDEX IF NOT EXISTS idx_events_color ON events(color)`;
 // Model/line dimension — same self-healing migration.
 await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS model TEXT`;
 await sql`CREATE INDEX IF NOT EXISTS idx_events_model ON events(model)`;

 // Canonical brand alias map (seeded like era_buckets) — brand resolution routes
 // through it so an alias can be added to fix coverage without a code deploy.
 await ensureBrandTable();

 // Era buckets reference table — seeded from config so buckets can be retuned
 // by editing rows (no schema migration), exactly as agreed.
 await sql`
 CREATE TABLE IF NOT EXISTS era_buckets (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  min_year INT NOT NULL,
  max_year INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
 )
 `;
 const [{ n }] = (await sql`SELECT COUNT(*)::int AS n FROM era_buckets`) as Array<{ n: number }>;
 if (n === 0) {
 for (let i = 0; i < ERA_BUCKETS_SEED.length; i++) {
  const b = ERA_BUCKETS_SEED[i];
  await sql`
  INSERT INTO era_buckets (slug, label, min_year, max_year, sort_order)
  VALUES (${b.slug}, ${b.label}, ${b.minYear}, ${b.maxYear}, ${i})
  ON CONFLICT (slug) DO NOTHING
  `;
 }
 }
}

let _eraCache: EraBucket[] | null = null;
export async function loadEraBuckets(): Promise<EraBucket[]> {
 if (_eraCache) return _eraCache;
 const sql = db();
 const rows = (await sql`SELECT slug, label, min_year, max_year FROM era_buckets ORDER BY sort_order`.catch(() => [])) as Array<{ slug: string; label: string; min_year: number; max_year: number }>;
 _eraCache = rows.length
 ? rows.map((r) => ({ slug: r.slug, label: r.label, minYear: r.min_year, maxYear: r.max_year }))
 : ERA_BUCKETS_SEED;
 return _eraCache;
}

// Enrich a listing's text into the dimensions we group/sell on. Brand resolves
// through the CANONICAL reference (alias map) — null when no alias matches.
function enrich(title: string | null, description: string | null, buckets: EraBucket[], brandRef: BrandRef[]) {
 const t = title ?? "";
 const brand = resolveBrand(t, brandRef, WHOLE_WORD_ALIASES);
 return {
 brand,
 category: t ? (inferCategoryFromTitle(t) as string) : null,
 era: inferEra(`${t} ${description ?? ""}`, buckets),
 // Colour of the season is a cross-market signal (retail + resale move together), so it's a
 // first-class trend dimension. Resolved from the title to the site's canonical palette word.
 color: normalizeColor(t),
 // The exact model/line ("Saddle", "Baguette") — the deepest sourcing granularity. Needs the brand.
 model: inferModel(t, brand),
 condition: inferCondition(description),
 };
}

const num = (v: unknown): number | null => {
 if (v == null) return null;
 const n = typeof v === "number" ? v : parseFloat(String(v));
 return Number.isFinite(n) ? n : null;
};
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

// Bulk insert via unnest — one statement per chunk. ON CONFLICT(source) DO
// NOTHING makes the whole ETL idempotent.
async function insertEvents(rows: EventRow[]): Promise<number> {
 if (rows.length === 0) return 0;
 const sql = db();
 const ts = rows.map((r) => r.ts);
 const type = rows.map((r) => r.eventType);
 const uid = rows.map((r) => r.userId);
 const store = rows.map((r) => r.storeSlug);
 const pid = rows.map((r) => r.productId);
 const title = rows.map((r) => r.title);
 const brand = rows.map((r) => r.brand);
 const cat = rows.map((r) => r.category);
 const era = rows.map((r) => r.era);
 const color = rows.map((r) => r.color);
 const model = rows.map((r) => r.model);
 const cond = rows.map((r) => r.condition);
 const listed = rows.map((r) => r.listedPrice);
 const sale = rows.map((r) => r.salePrice);
 const cur = rows.map((r) => r.currency);
 const qty = rows.map((r) => r.qty);
 const src = rows.map((r) => r.source);
 await sql`
 INSERT INTO events (ts, event_type, user_id, store_slug, product_id, title, brand, category, era, color, model, condition, listed_price, sale_price, currency, qty, source)
 SELECT * FROM unnest(
  ${ts}::timestamptz[], ${type}::text[], ${uid}::text[], ${store}::text[], ${pid}::int[],
  ${title}::text[], ${brand}::text[], ${cat}::text[], ${era}::text[], ${color}::text[], ${model}::text[], ${cond}::text[],
  ${listed}::numeric[], ${sale}::numeric[], ${cur}::text[], ${qty}::int[], ${src}::text[]
 )
 ON CONFLICT (source) DO NOTHING
 `;
 return rows.length;
}

// Colour was added to events after rows already existed, so fill it in for older rows from their
// stored title. Incremental (LIMIT) + idempotent; the daily cron chips away at the backlog. Titles
// with no palette colour get '' (a "processed, no colour" sentinel) so they're never re-scanned —
// distinct from NULL (not yet processed). Both '' and NULL are excluded from the demand aggregate.
export async function backfillEventColors(limit = 5000): Promise<{ scanned: number; colored: number; remaining: number }> {
 const sql = db();
 await ensureDataLayerTables();
 const rows = (await sql`
  SELECT id, title FROM events WHERE color IS NULL AND title IS NOT NULL AND title <> '' ORDER BY id DESC LIMIT ${limit}
 `.catch(() => [])) as { id: number; title: string }[];
 const byColor = new Map<string, number[]>();
 const noColor: number[] = [];
 for (const r of rows) {
 const c = normalizeColor(r.title);
 if (c) { const a = byColor.get(c) ?? []; a.push(Number(r.id)); byColor.set(c, a); }
 else noColor.push(Number(r.id));
 }
 let colored = 0;
 for (const [c, ids] of byColor) { await sql`UPDATE events SET color = ${c} WHERE id = ANY(${ids}::bigint[])`.catch(() => {}); colored += ids.length; }
 if (noColor.length) await sql`UPDATE events SET color = '' WHERE id = ANY(${noColor}::bigint[])`.catch(() => {});
 const [{ n }] = (await sql`SELECT COUNT(*)::int AS n FROM events WHERE color IS NULL AND title IS NOT NULL AND title <> ''`.catch(() => [{ n: 0 }])) as { n: number }[];
 return { scanned: rows.length, colored, remaining: n };
}

// Model backfill — same shape as the colour one. Needs the brand (already populated), so it only
// scans branded rows; '' = "processed, no recognized model" so they aren't re-scanned.
export async function backfillEventModels(limit = 5000): Promise<{ scanned: number; filled: number; remaining: number }> {
 const sql = db();
 await ensureDataLayerTables();
 const rows = (await sql`
  SELECT id, title, brand FROM events WHERE model IS NULL AND brand IS NOT NULL AND brand <> '' AND title IS NOT NULL AND title <> '' ORDER BY id DESC LIMIT ${limit}
 `.catch(() => [])) as { id: number; title: string; brand: string }[];
 const byModel = new Map<string, number[]>();
 const noModel: number[] = [];
 for (const r of rows) {
 const m = inferModel(r.title, r.brand);
 if (m) { const a = byModel.get(m) ?? []; a.push(Number(r.id)); byModel.set(m, a); }
 else noModel.push(Number(r.id));
 }
 let filled = 0;
 for (const [m, ids] of byModel) { await sql`UPDATE events SET model = ${m} WHERE id = ANY(${ids}::bigint[])`.catch(() => {}); filled += ids.length; }
 if (noModel.length) await sql`UPDATE events SET model = '' WHERE id = ANY(${noModel}::bigint[])`.catch(() => {});
 const [{ n }] = (await sql`SELECT COUNT(*)::int AS n FROM events WHERE model IS NULL AND brand IS NOT NULL AND brand <> '' AND title IS NOT NULL AND title <> ''`.catch(() => [{ n: 0 }])) as { n: number }[];
 return { scanned: rows.length, filled, remaining: n };
}

export type BuildResult = {
 views: number;
 favorites: number;
 clicks: number;
 orderItems: number;
 // Quality-filter breakdown of every candidate event seen this run.
 filtered: FilterStats;
};

// A candidate event carrying both the row to insert and the transient signals
// (user-agent, email) the quality filter needs — never stored in `events`.
type Item = FilterableEvent & { row: EventRow };

/**
 * ETL the four capture tables into `events`, dropping junk traffic (bots,
 * internal/seller accounts, bursts) via the quality filter first. Default
 * incremental (last `sinceDays`); `full` rebuilds from the entire history.
 * `dryRun` computes the filter breakdown WITHOUT writing — used for the
 * "% would be filtered" report.
 */
export async function buildEvents(
 opts: { sinceDays?: number; full?: boolean; dryRun?: boolean } = {},
): Promise<BuildResult> {
 const sql = db();
 await ensureDataLayerTables();
 const buckets = await loadEraBuckets();
 const brandRef = await loadBrandRef();

 const dryRun = !!opts.dryRun;
 if (opts.full && !dryRun) await sql`TRUNCATE events`;
 // Incremental window: look back to just before the newest event we've already ingested,
 // so a skipped or failed run SELF-HEALS (catches up the whole gap) instead of losing it
 // forever. ON CONFLICT(source) makes re-scanning the ~2-day safety overlap a no-op. Falls
 // back to sinceDays for a fresh/empty log; `full` rebuilds everything.
 let cutoff: string | null = null;
 if (!opts.full) {
 const [{ maxts }] = (await sql`SELECT MAX(ts) AS maxts FROM events`) as Array<{ maxts: string | null }>;
 cutoff = maxts
 ? new Date(Date.parse(maxts) - 2 * 86_400_000).toISOString()
 : new Date(Date.now() - (opts.sinceDays ?? 3) * 86_400_000).toISOString();
 }

 const result: BuildResult = { views: 0, favorites: 0, clicks: 0, orderItems: 0, filtered: emptyFilterStats() };
 const CHUNK = 500;

 // Seller accounts (single source of truth) — their browsing is not consumer demand.
 const sellerEmails = new Set(
 Object.values(storeContactEmails).filter(Boolean).map((e) => (e as string).toLowerCase()),
 );

 // Run candidates through the quality filter, accumulate the reason breakdown,
 // and insert the survivors (unless dryRun). Returns how many were kept.
 const ingest = async (items: Item[], skipBurst = false): Promise<number> => {
 const { kept, stats } = partitionEvents(items, { config: EVENT_FILTERS, sellerEmails, skipBurst });
 result.filtered = mergeFilterStats(result.filtered, stats);
 if (!dryRun) {
  for (let i = 0; i < kept.length; i += CHUNK) {
  await insertEvents(kept.slice(i, i + CHUNK).map((k) => k.row));
  }
 }
 return kept.length;
 };

 // 1. Views (join products on the composite "slug-id" key; users for the email).
 const viewRows = (cutoff
 ? await sql`SELECT v.id, v.timestamp AS ts, v.user_id, COALESCE(p.id, ph.id) AS pid, COALESCE(p.store_slug, ph.store_slug) AS store_slug, COALESCE(p.title, ph.title) AS title, COALESCE(p.description, ph.description) AS description, COALESCE(p.price, ph.price) AS price, COALESCE(p.currency, ph.currency) AS currency, u.email FROM product_views v LEFT JOIN products p ON (p.store_slug || '-' || p.id::text) = v.product_id LEFT JOIN product_history ph ON ph.composite_id = v.product_id LEFT JOIN users u ON u.id::text = v.user_id WHERE v.timestamp >= ${cutoff} AND (p.id IS NOT NULL OR ph.id IS NOT NULL)`
 : await sql`SELECT v.id, v.timestamp AS ts, v.user_id, COALESCE(p.id, ph.id) AS pid, COALESCE(p.store_slug, ph.store_slug) AS store_slug, COALESCE(p.title, ph.title) AS title, COALESCE(p.description, ph.description) AS description, COALESCE(p.price, ph.price) AS price, COALESCE(p.currency, ph.currency) AS currency, u.email FROM product_views v LEFT JOIN products p ON (p.store_slug || '-' || p.id::text) = v.product_id LEFT JOIN product_history ph ON ph.composite_id = v.product_id LEFT JOIN users u ON u.id::text = v.user_id WHERE (p.id IS NOT NULL OR ph.id IS NOT NULL)`) as Array<Record<string, unknown>>;
 result.views = await ingest(viewRows.map((r): Item => {
 const title = (r.title as string) ?? "";
 const e = enrich(title, r.description as string, buckets, brandRef);
 const ts = iso(r.ts);
 const row: EventRow = { ts, eventType: "view", userId: (r.user_id as string) ?? null, storeSlug: r.store_slug as string, productId: r.pid as number, title, ...e, listedPrice: num(r.price), salePrice: null, currency: (r.currency as string) ?? null, qty: 1, source: `view:${r.id}` };
 return { userId: row.userId, productId: row.productId, eventType: "view", tsMs: Date.parse(ts), userAgent: null, email: (r.email as string) ?? null, row };
 }));

 // 2. Favorites (join products on id; prefer snapshot price as listed-at-save).
 const favRows = (cutoff
 ? await sql`SELECT f.id, f.created_at AS ts, f.user_id::text AS user_id, f.product_snapshot, p.id AS pid, p.store_slug, p.title, p.description, p.price, p.currency, u.email FROM product_favorites f LEFT JOIN products p ON p.id = f.product_id LEFT JOIN users u ON u.id::text = f.user_id::text WHERE f.created_at >= ${cutoff}`
 : await sql`SELECT f.id, f.created_at AS ts, f.user_id::text AS user_id, f.product_snapshot, p.id AS pid, p.store_slug, p.title, p.description, p.price, p.currency, u.email FROM product_favorites f LEFT JOIN products p ON p.id = f.product_id LEFT JOIN users u ON u.id::text = f.user_id::text`) as Array<Record<string, unknown>>;
 result.favorites = await ingest(favRows.map((r): Item => {
 // When the live product is gone (sold out / re-synced away), fall back to the snapshot
 // captured at favorite time — otherwise these strong-intent signals for our best-selling
 // pieces get dropped, biasing demand DOWN for exactly the hot items.
 const snap = r.product_snapshot as { title?: string; store_slug?: string; price?: number } | null;
 const title = (r.title as string) ?? snap?.title ?? "";
 const e = enrich(title, (r.description as string) ?? null, buckets, brandRef);
 const ts = iso(r.ts);
 const row: EventRow = { ts, eventType: "favorite", userId: (r.user_id as string) ?? null, storeSlug: (r.store_slug as string) ?? snap?.store_slug ?? "", productId: (r.pid as number) ?? null, title, ...e, listedPrice: num(snap?.price) ?? num(r.price), salePrice: null, currency: (r.currency as string) ?? null, qty: 1, source: `fav:${r.id}` };
 return { userId: row.userId, productId: row.productId, eventType: "favorite", tsMs: Date.parse(ts), userAgent: null, email: (r.email as string) ?? null, row };
 }));

 // 3. Clicks (left join products; carry the user-agent for bot detection).
 const clickRows = (cutoff
 ? await sql`SELECT c.id, c.click_id, c.timestamp AS ts, c.user_id, c.store_slug, c.product_name, c.user_agent, p.id AS pid, p.title, p.description, p.price, p.currency, u.email FROM clicks c LEFT JOIN products p ON (p.store_slug || '-' || p.id::text) = c.product_id LEFT JOIN users u ON u.id::text = c.user_id WHERE c.timestamp >= ${cutoff}`
 : await sql`SELECT c.id, c.click_id, c.timestamp AS ts, c.user_id, c.store_slug, c.product_name, c.user_agent, p.id AS pid, p.title, p.description, p.price, p.currency, u.email FROM clicks c LEFT JOIN products p ON (p.store_slug || '-' || p.id::text) = c.product_id LEFT JOIN users u ON u.id::text = c.user_id`) as Array<Record<string, unknown>>;
 result.clicks = await ingest(clickRows.map((r): Item => {
 const title = (r.title as string) ?? (r.product_name as string) ?? "";
 const e = enrich(title, r.description as string, buckets, brandRef);
 const ts = iso(r.ts);
 const row: EventRow = { ts, eventType: "click", userId: (r.user_id as string) ?? null, storeSlug: r.store_slug as string, productId: (r.pid as number) ?? null, title, ...e, listedPrice: num(r.price), salePrice: null, currency: (r.currency as string) ?? null, qty: 1, source: `click:${r.click_id}` };
 return { userId: row.userId, productId: row.productId, eventType: "click", tsMs: Date.parse(ts), userAgent: (r.user_agent as string) ?? null, email: (r.email as string) ?? null, row };
 }));

 // 4. Orders → one event per line item (sale_price = item price). Real money:
 // skip burst (multi-item orders share a timestamp), but still drop internal/test.
 // Returned/refunded orders must NOT count as sales — the admin market path already
 // excludes them, so filter here too or the two systems disagree on GMV/sell-through.
 // Ensure the column exists first (it's created lazily by admin routes, not everywhere).
 await sql`ALTER TABLE conversions ADD COLUMN IF NOT EXISTS returned BOOLEAN`;
 const convRows = (cutoff
 ? await sql`SELECT c.conversion_id, c.timestamp AS ts, c.user_id, c.store_slug, c.currency, c.items, u.email FROM conversions c LEFT JOIN users u ON u.id::text = c.user_id WHERE c.order_total > 0 AND (c.returned IS NULL OR c.returned = false) AND c.timestamp >= ${cutoff}`
 : await sql`SELECT c.conversion_id, c.timestamp AS ts, c.user_id, c.store_slug, c.currency, c.items, u.email FROM conversions c LEFT JOIN users u ON u.id::text = c.user_id WHERE c.order_total > 0 AND (c.returned IS NULL OR c.returned = false)`) as Array<Record<string, unknown>>;
 const orderItems: Item[] = [];
 for (const c of convRows) {
 const items = Array.isArray(c.items) ? c.items : [];
 const ts = iso(c.ts);
 items.forEach((it: { productName?: string; price?: number; quantity?: number }, idx: number) => {
  const title = it.productName ?? "";
  const e = enrich(title, null, buckets, brandRef);
  const row: EventRow = { ts, eventType: "order_item", userId: (c.user_id as string) ?? null, storeSlug: c.store_slug as string, productId: null, title, ...e, listedPrice: null, salePrice: num(it.price), currency: (c.currency as string) ?? null, qty: Number(it.quantity) || 1, source: `order:${c.conversion_id}:${idx}` };
  orderItems.push({ userId: row.userId, productId: null, eventType: "order_item", tsMs: Date.parse(ts), userAgent: null, email: (c.email as string) ?? null, row });
 });
 }
 result.orderItems = await ingest(orderItems, true);

 return result;
}
