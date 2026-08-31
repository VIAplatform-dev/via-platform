import { neon } from "@neondatabase/serverless";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { versionsToDrop, worthVersioning, type VersionReason, type VersionRow } from "./capture-versions-core.ts";

/**
 * Previous versions of captured pages — the undo that `site_captures` does not have.
 *
 * STORED GZIPPED, and that is not an optimisation. The captures are 748 MB of a 1.1 GB database:
 * keeping three plain-text copies of each page would have tripled the whole database. Real pages
 * measured at 10.6:1, so three compressed versions cost about 210 MB instead of 2.2 GB.
 */
function sql() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL configured");
 return neon(url);
}

let ready = false;
async function ensure() {
 if (ready) return;
 const q = sql();
 await q`CREATE TABLE IF NOT EXISTS site_capture_versions (
 id BIGSERIAL PRIMARY KEY,
 store_slug TEXT NOT NULL,
 path TEXT NOT NULL,
 html_gz BYTEA NOT NULL,
 html_sha TEXT NOT NULL,
 bytes_raw INTEGER NOT NULL,
 reason TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 // The only access pattern: "every version of this one page, newest first."
 await q`CREATE INDEX IF NOT EXISTS site_capture_versions_page_idx
 ON site_capture_versions (store_slug, path, created_at DESC)`;
 ready = true;
}

export function htmlSha(html: string): string {
 return createHash("sha256").update(html, "utf8").digest("hex").slice(0, 32);
}

/**
 * Keep the CURRENT contents of a page before something overwrites it.
 *
 * Called with what is in `site_captures` right now, BEFORE the write lands — a version is the thing
 * being replaced, never the thing replacing it. Skips content identical to the newest version we
 * already hold, so the rehosting pass rewriting a page to exactly itself does not spend a slot.
 *
 * Never throws. A history table failing must not take down an import: the caller's write is the job,
 * this is the safety net, and a safety net that can break the thing it protects is worse than none.
 * Returns what happened so the caller can report it rather than guess.
 */
export async function keepVersion(
 slug: string,
 path: string,
 html: string,
 reason: VersionReason,
): Promise<{ kept: boolean; pruned: number; error?: string }> {
 if (!html) return { kept: false, pruned: 0 };
 try {
  await ensure();
  const q = sql();
  const sha = htmlSha(html);
  const prev = (await q`SELECT html_sha FROM site_capture_versions
   WHERE store_slug = ${slug} AND path = ${path} ORDER BY created_at DESC, id DESC LIMIT 1`) as { html_sha: string }[];
  if (!worthVersioning(prev[0]?.html_sha ?? null, sha)) return { kept: false, pruned: 0 };

  const raw = Buffer.from(html, "utf8");
  const gz = gzipSync(raw, { level: 9 });
  await q`INSERT INTO site_capture_versions (store_slug, path, html_gz, html_sha, bytes_raw, reason)
   VALUES (${slug}, ${path}, ${gz}, ${sha}, ${raw.length}, ${reason})`;

  const rows = (await q`SELECT id, reason, created_at FROM site_capture_versions
   WHERE store_slug = ${slug} AND path = ${path}`) as Array<{ id: string | number; reason: string; created_at: string }>;
  const drop = versionsToDrop(rows.map((r): VersionRow => ({ id: String(r.id), reason: r.reason as VersionReason, createdAt: r.created_at })));
  if (drop.length) {
   await q`DELETE FROM site_capture_versions WHERE id = ANY(${drop.map((d) => Number(d))})`;
  }
  return { kept: true, pruned: drop.length };
 } catch (e) {
  return { kept: false, pruned: 0, error: e instanceof Error ? e.message : String(e) };
 }
}

export type StoredVersion = {
 id: string;
 reason: VersionReason;
 createdAt: string;
 /** Size of the page as captured, for the admin list — not the compressed size. */
 bytesRaw: number;
};

/** Every version of one page, newest first. Cheap: never reads the HTML itself. */
export async function listVersions(slug: string, path: string): Promise<StoredVersion[]> {
 await ensure();
 const rows = (await sql()`SELECT id, reason, created_at, bytes_raw FROM site_capture_versions
  WHERE store_slug = ${slug} AND path = ${path} ORDER BY created_at DESC, id DESC`) as Array<Record<string, unknown>>;
 return rows.map((r) => ({
  id: String(r.id),
  reason: String(r.reason) as VersionReason,
  createdAt: new Date(String(r.created_at)).toISOString(),
  bytesRaw: Number(r.bytes_raw) || 0,
 }));
}

/** One version's HTML, decompressed. Null when it has been pruned away. */
export async function readVersion(id: string): Promise<{ slug: string; path: string; html: string } | null> {
 await ensure();
 const rows = (await sql()`SELECT store_slug, path, html_gz FROM site_capture_versions WHERE id = ${Number(id)}`) as Array<Record<string, unknown>>;
 const r = rows[0];
 if (!r) return null;
 const buf = r.html_gz as Buffer | Uint8Array;
 return { slug: String(r.store_slug), path: String(r.path), html: gunzipSync(Buffer.from(buf)).toString("utf8") };
}

/** How much history is costing, for the admin. Compressed size is the honest number. */
export async function versionsFootprint(): Promise<{ versions: number; bytes: number }> {
 await ensure();
 const rows = (await sql()`SELECT count(*)::int AS n, coalesce(sum(length(html_gz)), 0)::bigint AS b FROM site_capture_versions`) as Array<Record<string, unknown>>;
 return { versions: Number(rows[0]?.n) || 0, bytes: Number(rows[0]?.b) || 0 };
}

/**
 * The newest version of a page that was kept for a given reason.
 *
 * The seller's undo asks for `edit` and only `edit`: she should step back through HER changes, not
 * through our asset rehosting. "Images re-hosted" is plumbing, and a seller offered it as an undo
 * point would rightly wonder what she had done.
 */
export async function latestVersion(slug: string, path: string, reason: VersionReason): Promise<{ id: string; html: string; createdAt: string } | null> {
 await ensure();
 const rows = (await sql()`SELECT id, html_gz, created_at FROM site_capture_versions
  WHERE store_slug = ${slug} AND path = ${path} AND reason = ${reason}
  ORDER BY created_at DESC, id DESC LIMIT 1`) as Array<Record<string, unknown>>;
 const r = rows[0];
 if (!r) return null;
 return {
  id: String(r.id),
  html: gunzipSync(Buffer.from(r.html_gz as Buffer)).toString("utf8"),
  createdAt: new Date(String(r.created_at)).toISOString(),
 };
}

/** Which of this store's pages the seller can still step back on, newest first. Never reads the
 *  HTML — the portal only needs to know which pages offer the button. */
export async function pagesWithEdits(slug: string): Promise<{ path: string; savedAt: string }[]> {
 await ensure();
 const rows = (await sql()`SELECT DISTINCT ON (path) path, created_at FROM site_capture_versions
  WHERE store_slug = ${slug} AND reason = ${"edit"}
  ORDER BY path, created_at DESC, id DESC`) as Array<Record<string, unknown>>;
 return rows
  .map((r) => ({ path: String(r.path), savedAt: new Date(String(r.created_at)).toISOString() }))
  .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Consume a version. Undo is a stack: the step you just took back is spent, so pressing undo again
 *  goes back further rather than toggling between the same two versions for ever. */
export async function dropVersion(id: string): Promise<void> {
 await ensure();
 await sql()`DELETE FROM site_capture_versions WHERE id = ${Number(id)}`;
}
