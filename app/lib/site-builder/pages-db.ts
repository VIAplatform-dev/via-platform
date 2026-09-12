// WHERE HER PAGE SETTINGS AND HER MENU ORDER LIVE.
//
// Two sparse tables: a row exists only once she has renamed, hidden or added something. A store
// nobody has touched has no rows at all, and every read below answers "as captured".
//
// NOTHING HERE CREATES A TABLE. The rest of the schema is self-healing DDL on first use, and that is
// exactly wrong for this one: the dev server points at the PRODUCTION database, so the first request
// from a developer's laptop would run DDL against the live store. The owner runs
// `POST /api/admin/site-builder/migrate` once, and until then every read here answers empty and every
// write answers `false` — the panel says the feature is not switched on yet, and no shopper's page
// changes in any way.
//
// Reads are cached for a few seconds per store because the serve path asks on every hosted page
// request (the hidden-page gate). Every write drops that store's entry, so her own next page load is
// never stale.
import { neon } from "@neondatabase/serverless";
import type { PageRow, PageKind } from "./pages.ts";
import { sanitizeMenuItems, type MenuItem, type StoredMenu } from "./menus.ts";

export type MenuName = "main" | "footer";
export type StoreBuilderRows = { pages: Map<string, PageRow>; menus: Map<MenuName, StoredMenu>; ready: boolean };

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

/** Postgres for "that table does not exist" — i.e. the owner has not run the migration yet. */
function notMigrated(e: unknown): boolean {
 const code = e && typeof e === "object" ? String((e as { code?: unknown }).code ?? "") : "";
 if (code === "42P01") return true;
 return /relation "?site_(pages|menus)"? does not exist/i.test(String((e as Error)?.message ?? ""));
}

// Remembered so a store's every page request does not re-ask a question whose answer is "the table
// isn't there". Short, so the feature comes alive within a minute of the owner running the migration.
let missingUntil = 0;
const MISSING_TTL_MS = 60_000;

const EMPTY: StoreBuilderRows = { pages: new Map(), menus: new Map(), ready: false };
const cache = new Map<string, { at: number; rows: StoreBuilderRows }>();
const CACHE_TTL_MS = 5_000;

export function invalidateStoreBuilderRows(slug: string): void {
 cache.delete(slug);
 missingUntil = 0; // a successful write proves the tables are there
}

export async function siteBuilderTablesReady(): Promise<boolean> {
 if (Date.now() < missingUntil) return false;
 try {
  await db()`SELECT 1 FROM site_pages LIMIT 1`;
  await db()`SELECT 1 FROM site_menus LIMIT 1`;
  return true;
 } catch (e) {
  if (notMigrated(e)) { missingUntil = Date.now() + MISSING_TTL_MS; return false; }
  return false; /* allow-swallow: a database blip must read as "not available", never as a page that fails */
 }
}

/** ONLY the admin migrate endpoint calls this. Idempotent. */
export async function createSiteBuilderTables(): Promise<void> {
 const q = db();
 await q`CREATE TABLE IF NOT EXISTS site_pages (
  store_slug TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT,
  nav_label TEXT,
  hidden BOOLEAN NOT NULL DEFAULT false,
  kind TEXT NOT NULL DEFAULT 'captured',
  chrome TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_slug, path)
 )`;
 // `chrome` is unread until Step 4 (a page that keeps its own header). It is created now so adopting
 // a shared header later needs no second migration run.
 await q`CREATE TABLE IF NOT EXISTS site_menus (
  store_slug TEXT NOT NULL,
  menu TEXT NOT NULL,
  items JSONB NOT NULL,
  signature TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_slug, menu)
 )`;
 missingUntil = 0;
 cache.clear();
}

type RawPage = { path: string; title: string | null; nav_label: string | null; hidden: boolean; kind: string };
type RawMenu = { menu: string; items: unknown; signature: string };

/** Every setting this store has, in two small queries. Sparse, so this is usually two empty results. */
export async function loadStoreBuilderRows(slug: string): Promise<StoreBuilderRows> {
 const hit = cache.get(slug);
 if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;
 if (Date.now() < missingUntil) return EMPTY;
 try {
  const q = db();
  const [pageRows, menuRows] = await Promise.all([
   q`SELECT path, title, nav_label, hidden, kind FROM site_pages WHERE store_slug = ${slug}` as Promise<RawPage[]>,
   q`SELECT menu, items, signature FROM site_menus WHERE store_slug = ${slug}` as Promise<RawMenu[]>,
  ]);
  const rows: StoreBuilderRows = { pages: new Map(), menus: new Map(), ready: true };
  for (const r of pageRows) {
   rows.pages.set(r.path, { path: r.path, title: r.title, navLabel: r.nav_label, hidden: !!r.hidden, kind: r.kind === "added" ? "added" : "captured" });
  }
  for (const r of menuRows) {
   if (r.menu !== "main" && r.menu !== "footer") continue;
   // Re-validated on the way OUT as well as in: these values end up in href attributes on her pages.
   rows.menus.set(r.menu, { items: sanitizeMenuItems(r.items), signature: String(r.signature || "") });
  }
  cache.set(slug, { at: Date.now(), rows });
  return rows;
 } catch (e) {
  if (notMigrated(e)) missingUntil = Date.now() + MISSING_TTL_MS;
  return EMPTY; /* allow-swallow: her pages serve exactly as captured when this can't be read */
 }
}

/** The paths she has hidden — what the serve path gates on, and what the menu drops links to. */
export function hiddenPathsOf(rows: StoreBuilderRows): Set<string> {
 const out = new Set<string>();
 for (const [path, row] of rows.pages) if (row.hidden) out.add(path.length > 1 ? path.replace(/\/+$/, "") : path);
 return out;
}

/**
 * Write one page's settings. `undefined` leaves a field as it is; an empty string clears a title or
 * label back to whatever the capture says. Returns false when the tables are not there yet.
 */
export async function savePageRow(
 slug: string,
 path: string,
 patch: { title?: string | null; navLabel?: string | null; hidden?: boolean; kind?: PageKind },
): Promise<boolean> {
 // "Leave this field alone" and "clear it back to the capture" are decided HERE, against the row as
 // it stands, rather than in a CASE expression per column: one seller in one panel is writing, and a
 // statement whose correctness you have to squint at is the wrong thing to point at her live site.
 const cur = (await loadStoreBuilderRows(slug)).pages.get(path) ?? null;
 const title = patch.title === undefined ? cur?.title ?? null : patch.title?.trim() || null;
 const navLabel = patch.navLabel === undefined ? cur?.navLabel ?? null : patch.navLabel?.trim() || null;
 const hidden = patch.hidden ?? cur?.hidden ?? false;
 const kind = patch.kind ?? cur?.kind ?? "captured";
 try {
  await db()`INSERT INTO site_pages (store_slug, path, title, nav_label, hidden, kind, updated_at)
   VALUES (${slug}, ${path}, ${title}, ${navLabel}, ${hidden}, ${kind}, now())
   ON CONFLICT (store_slug, path) DO UPDATE SET
    title = EXCLUDED.title, nav_label = EXCLUDED.nav_label, hidden = EXCLUDED.hidden, kind = EXCLUDED.kind, updated_at = now()`;
  invalidateStoreBuilderRows(slug);
  return true;
 } catch (e) {
  if (notMigrated(e)) missingUntil = Date.now() + MISSING_TTL_MS;
  return false;
 }
}

export async function deletePageRow(slug: string, path: string): Promise<boolean> {
 try {
  await db()`DELETE FROM site_pages WHERE store_slug = ${slug} AND path = ${path}`;
  invalidateStoreBuilderRows(slug);
  return true;
 } catch { return false; /* allow-swallow: nothing to clean up is not a failure the seller can act on */ }
}

/** Pages she added here rather than imported — the rows a re-import must spare. */
export async function listAddedPaths(slug: string): Promise<string[]> {
 if (Date.now() < missingUntil) return [];
 try {
  const rows = (await db()`SELECT path FROM site_pages WHERE store_slug = ${slug} AND kind = 'added'`) as { path: string }[];
  return rows.map((r) => r.path);
 } catch (e) {
  if (notMigrated(e)) missingUntil = Date.now() + MISSING_TTL_MS;
  return []; /* allow-swallow: a read that fails must not make a re-import keep pages it cannot name */
 }
}

export async function saveMenuRow(slug: string, menu: MenuName, items: MenuItem[], signature: string): Promise<boolean> {
 try {
  await db()`INSERT INTO site_menus (store_slug, menu, items, signature, updated_at)
   VALUES (${slug}, ${menu}, ${JSON.stringify(items)}::jsonb, ${signature}, now())
   ON CONFLICT (store_slug, menu) DO UPDATE SET items = EXCLUDED.items, signature = EXCLUDED.signature, updated_at = now()`;
  invalidateStoreBuilderRows(slug);
  return true;
 } catch (e) {
  if (notMigrated(e)) missingUntil = Date.now() + MISSING_TTL_MS;
  return false;
 }
}

export async function clearStoreBuilderRows(slug: string): Promise<void> {
 try {
  await db()`DELETE FROM site_pages WHERE store_slug = ${slug}`;
  await db()`DELETE FROM site_menus WHERE store_slug = ${slug}`;
 } catch { /* allow-swallow: a reset that cannot clear these still reset the capture */ }
 invalidateStoreBuilderRows(slug);
}
