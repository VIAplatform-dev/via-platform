// Named storefront versions — the storage. Rules and naming live in storefront-versions.ts.
//
// TWO TABLES, because the two kinds of storefront are stored very differently:
//   • a BUILT version is one JSONB blob (the studio design), so it sits on the version row itself;
//   • an IMPORTED version is one row PER PAGE of captured HTML, some of them close to a megabyte,
//     so those go in their own table keyed by version — the same shape as site_captures.
//
// THE INVARIANT: the live storefront is always also a version row. `syncPublished` writes the live
// state back to whichever row is published before anything else moves, so a publish is a swap
// between two rows and there is no moment where a storefront exists only in site_captures or only
// in storefront_settings. That is what makes "I want to start again but keep my old site" safe.
//
// Self-healing DDL (CREATE TABLE IF NOT EXISTS), like the other store_* tables — no migration step.

import { neon } from "@neondatabase/serverless";
import type { StorefrontTheme } from "./store-import";
import { getStorefrontBySlug, setStorefrontTheme, setServeMode } from "./storefront-db";
import { hasCaptures } from "./site-capture-db";
import { defaultVersionName, normalizeVersionName, type VersionKind, type VersionSummary } from "./storefront-versions";

const getDatabaseUrl = () => {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return url;
};
const db = () => neon(getDatabaseUrl());

let ready: Promise<void> | null = null;
function ensureTables(): Promise<void> {
 if (!ready) {
  const sql = db();
  ready = (async () => {
   await sql`
   CREATE TABLE IF NOT EXISTS storefront_versions (
    id TEXT PRIMARY KEY,
    store_slug TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    theme JSONB,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`;
   await sql`CREATE INDEX IF NOT EXISTS storefront_versions_slug_idx ON storefront_versions (store_slug)`;
   // One published version per store. A partial unique index makes that the database's rule rather
   // than something every write has to remember, so a half-finished publish can't leave two live.
   await sql`CREATE UNIQUE INDEX IF NOT EXISTS storefront_versions_one_published_idx
             ON storefront_versions (store_slug) WHERE published`;
   await sql`
   CREATE TABLE IF NOT EXISTS storefront_version_pages (
    version_id TEXT NOT NULL,
    path TEXT NOT NULL,
    html TEXT NOT NULL,
    source_url TEXT,
    PRIMARY KEY (version_id, path)
   )`;
  })().catch((e) => { ready = null; throw e; });
 }
 return ready;
}

const newId = () => `sv_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

/* eslint-disable @typescript-eslint/no-explicit-any */
const rowToSummary = (r: any): VersionSummary => ({
 id: r.id,
 name: r.name,
 kind: (r.kind === "imported" ? "imported" : "built") as VersionKind,
 published: r.published === true,
 pageCount: Number(r.page_count || 0),
 updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
});

/** Every version for a store, newest first, with the published one pinned to the top. */
export async function listVersions(storeSlug: string): Promise<VersionSummary[]> {
 await ensureTables();
 const rows = (await db()`
  SELECT v.id, v.name, v.kind, v.published, v.updated_at,
         (SELECT count(*) FROM storefront_version_pages p WHERE p.version_id = v.id) AS page_count
  FROM storefront_versions v
  WHERE v.store_slug = ${storeSlug}
  ORDER BY v.published DESC, v.updated_at DESC
 `.catch(() => [])) as any[];
 return rows.map(rowToSummary);
}

/** The kind currently published, or null for a store that predates versions. Drives serving. */
export async function publishedKind(storeSlug: string): Promise<VersionKind | null> {
 await ensureTables();
 const rows = (await db()`
  SELECT kind FROM storefront_versions WHERE store_slug = ${storeSlug} AND published LIMIT 1
 `.catch(() => [])) as any[];
 if (!rows.length) return null;
 return rows[0].kind === "imported" ? "imported" : "built";
}

/** What the store's CURRENT live storefront is, read from where it actually lives. */
async function liveKind(storeSlug: string): Promise<VersionKind> {
 return (await hasCaptures(storeSlug).catch(() => false)) ? "imported" : "built";
}

/**
 * Copy the live storefront into a version row (replacing whatever that row held).
 *
 * For an imported version this is an INSERT…SELECT straight across from site_captures, so the HTML
 * never travels through this process — some of these pages are near a megabyte and a store can have
 * a hundred of them.
 */
async function writeLiveInto(storeSlug: string, versionId: string, kind: VersionKind): Promise<void> {
 const sql = db();
 if (kind === "imported") {
  await sql`DELETE FROM storefront_version_pages WHERE version_id = ${versionId}`;
  await sql`
   INSERT INTO storefront_version_pages (version_id, path, html, source_url)
   SELECT ${versionId}, path, html, source_url FROM site_captures WHERE store_slug = ${storeSlug}
   ON CONFLICT (version_id, path) DO NOTHING`;
  await sql`UPDATE storefront_versions SET theme = NULL, kind = 'imported', updated_at = now() WHERE id = ${versionId}`;
 } else {
  const sf = await getStorefrontBySlug(storeSlug).catch(() => null);
  await sql`DELETE FROM storefront_version_pages WHERE version_id = ${versionId}`;
  await sql`UPDATE storefront_versions SET theme = ${JSON.stringify(sf?.theme ?? null)}::jsonb, kind = 'built', updated_at = now() WHERE id = ${versionId}`;
 }
}

/**
 * Make sure the store has a published version representing what is live right now.
 *
 * Called before anything reads or changes the list, so stores that existed before versions get a
 * row for the storefront they already have rather than appearing to have none.
 */
export async function ensureBaseline(storeSlug: string): Promise<string> {
 await ensureTables();
 const sql = db();
 const existing = (await sql`SELECT id FROM storefront_versions WHERE store_slug = ${storeSlug} AND published LIMIT 1`.catch(() => [])) as any[];
 if (existing.length) return existing[0].id;
 const kind = await liveKind(storeSlug);
 const names = (await listVersions(storeSlug)).map((v) => v.name);
 const id = newId();
 await sql`INSERT INTO storefront_versions (id, store_slug, name, kind, published) VALUES (${id}, ${storeSlug}, ${defaultVersionName(kind, names)}, ${kind}, TRUE)`;
 await writeLiveInto(storeSlug, id, kind);
 return id;
}

/** Push the live storefront back into its own row, so the published version is never stale. */
export async function syncPublished(storeSlug: string): Promise<void> {
 const id = await ensureBaseline(storeSlug);
 await writeLiveInto(storeSlug, id, await liveKind(storeSlug));
}

/**
 * Park the current storefront as a draft and hand back a blank built one to start from.
 *
 * This is the "I want to start again without losing what I have" path: the live storefront keeps
 * existing as a named draft, and the store is left on an empty design it can build up.
 */
export async function startFreshDesign(storeSlug: string, keepAs?: string): Promise<VersionSummary[]> {
 await syncPublished(storeSlug);
 const sql = db();
 const versions = await listVersions(storeSlug);
 const current = versions.find((v) => v.published);
 if (current && keepAs) {
  const nm = normalizeVersionName(keepAs);
  if (nm) await sql`UPDATE storefront_versions SET name = ${nm}, updated_at = now() WHERE id = ${current.id} AND store_slug = ${storeSlug}`;
 }
 const id = newId();
 const names = (await listVersions(storeSlug)).map((v) => v.name);
 await sql`INSERT INTO storefront_versions (id, store_slug, name, kind, theme, published) VALUES (${id}, ${storeSlug}, ${defaultVersionName("built", names)}, 'built', NULL, FALSE)`;
 await publishVersion(storeSlug, id);
 return listVersions(storeSlug);
}

/** Rename. Returns false if the version isn't this store's, so a caller can 404 rather than lie. */
export async function renameVersion(storeSlug: string, id: string, name: string): Promise<boolean> {
 await ensureTables();
 const nm = normalizeVersionName(name);
 if (!nm) return false;
 const rows = (await db()`UPDATE storefront_versions SET name = ${nm}, updated_at = now() WHERE id = ${id} AND store_slug = ${storeSlug} RETURNING id`.catch(() => [])) as any[];
 return rows.length > 0;
}

/** Delete a draft. The published one is refused here as well as in the UI — it's the live shop. */
export async function deleteVersion(storeSlug: string, id: string): Promise<boolean> {
 await ensureTables();
 const sql = db();
 const rows = (await sql`DELETE FROM storefront_versions WHERE id = ${id} AND store_slug = ${storeSlug} AND NOT published RETURNING id`.catch(() => [])) as any[];
 if (!rows.length) return false;
 await sql`DELETE FROM storefront_version_pages WHERE version_id = ${id}`.catch(() => {});
 return true;
}

/**
 * Make a version live.
 *
 * Order matters and is the whole safety argument: the outgoing storefront is written back to its
 * own row FIRST, so if anything below fails the seller has lost nothing — the old storefront is
 * still a version she can publish again.
 */
export async function publishVersion(storeSlug: string, id: string): Promise<boolean> {
 await ensureTables();
 const sql = db();
 const rows = (await sql`SELECT id, kind, theme FROM storefront_versions WHERE id = ${id} AND store_slug = ${storeSlug} LIMIT 1`.catch(() => [])) as any[];
 if (!rows.length) return false;
 const target = rows[0];
 const kind: VersionKind = target.kind === "imported" ? "imported" : "built";

 // 1. Preserve what is live today.
 await syncPublished(storeSlug);

 // 2. Restore the target into the live tables.
 if (kind === "imported") {
  await sql`DELETE FROM site_captures WHERE store_slug = ${storeSlug}`;
  await sql`
   INSERT INTO site_captures (store_slug, path, html, source_url)
   SELECT ${storeSlug}, path, html, source_url FROM storefront_version_pages WHERE version_id = ${id}
   ON CONFLICT (store_slug, path) DO UPDATE SET html = EXCLUDED.html, source_url = EXCLUDED.source_url`;
 } else {
  // A built storefront must not be shadowed by leftover captured pages — serving asks the published
  // version now, but /site/{slug} still reads site_captures directly, so clear them here too. They
  // are safe in their own version row, which is the point of doing step 1 first.
  await sql`DELETE FROM site_captures WHERE store_slug = ${storeSlug}`;
  await setStorefrontTheme(storeSlug, (target.theme as StorefrontTheme) ?? null).catch(() => {});
 }

 // 3. Flip the flag last, so a failure above leaves the old version still marked live.
 await sql`UPDATE storefront_versions SET published = FALSE WHERE store_slug = ${storeSlug} AND published`;
 await sql`UPDATE storefront_versions SET published = TRUE, updated_at = now() WHERE id = ${id} AND store_slug = ${storeSlug}`;
 await setServeMode(storeSlug, kind).catch(() => {});
 return true;
}

/**
 * Snapshot the live storefront as a draft WITHOUT changing what is published.
 *
 * The import path calls this before it overwrites anything, which is what stops a re-import from
 * destroying the storefront the seller already had.
 */
export async function snapshotAsDraft(storeSlug: string, name?: string): Promise<VersionSummary | null> {
 await ensureTables();
 await syncPublished(storeSlug);
 const sql = db();
 const kind = await liveKind(storeSlug);
 const names = (await listVersions(storeSlug)).map((v) => v.name);
 const id = newId();
 const nm = normalizeVersionName(name || "") || defaultVersionName(kind, names);
 await sql`INSERT INTO storefront_versions (id, store_slug, name, kind, published) VALUES (${id}, ${storeSlug}, ${nm}, ${kind}, FALSE)`.catch(() => {});
 await writeLiveInto(storeSlug, id, kind);
 const all = await listVersions(storeSlug);
 return all.find((v) => v.id === id) ?? null;
}
