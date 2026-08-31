import { neon } from "@neondatabase/serverless";
import { keepVersion, latestVersion, pagesWithEdits, dropVersion } from "./capture-versions-db.ts";

// Storage for high-fidelity site captures — one row per page of a seller's real
// site, hosted on VYA. (store_slug, path) → the self-contained HTML.
function sql() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL configured");
 return neon(url);
}

let ready = false;
async function ensure() {
 if (ready) return;
 const q = sql();
 await q`CREATE TABLE IF NOT EXISTS site_captures (
 store_slug TEXT NOT NULL,
 path TEXT NOT NULL,
 html TEXT NOT NULL,
 source_url TEXT,
 captured_at TIMESTAMPTZ DEFAULT now(),
 PRIMARY KEY (store_slug, path)
 )`;
 ready = true;
}

export async function saveCapturePage(slug: string, path: string, html: string, sourceUrl: string): Promise<void> {
 await ensure();
 // Keep what is about to be destroyed. A re-crawl of a seller mid-redesign, or of a server handing
 // back a cookie wall, used to overwrite the good page with no way back at all.
 await keepCurrent(slug, path, "crawl");
 await sql()`INSERT INTO site_captures (store_slug, path, html, source_url) VALUES (${slug}, ${path}, ${html}, ${sourceUrl})
 ON CONFLICT (store_slug, path) DO UPDATE SET html = ${html}, source_url = ${sourceUrl}, captured_at = now()`;
}

/** Snapshot a page's CURRENT html before a caller overwrites it. Silent on failure by design — the
 *  save is the job and the history is the safety net; a net that can break the thing it protects is
 *  worse than no net. `keepVersion` already swallows its own errors and reports them in its result. */
async function keepCurrent(slug: string, path: string, reason: "crawl" | "edit" | "rewrite"): Promise<void> {
 const rows = (await sql()`SELECT html FROM site_captures WHERE store_slug = ${slug} AND path = ${path} LIMIT 1`) as { html: string }[];
 const current = rows[0]?.html;
 if (current) await keepVersion(slug, path, current, reason);
}

/** Rewrite a stored page's HTML WITHOUT claiming it was re-crawled. For post-processing passes
 *  (asset rehosting) that change where a page's references point, not what was captured — resetting
 *  `captured_at` there would make every touched page look freshly crawled. */
export async function rewriteCapturePage(slug: string, path: string, html: string): Promise<void> {
 await ensure();
 await keepCurrent(slug, path, "rewrite");
 await sql()`UPDATE site_captures SET html = ${html} WHERE store_slug = ${slug} AND path = ${path}`;
}

export async function getCapturePage(slug: string, path: string): Promise<string | null> {
 await ensure();
 const r = (await sql()`SELECT html FROM site_captures WHERE store_slug = ${slug} AND path = ${path} LIMIT 1`) as { html: string }[];
 return r[0]?.html ?? null;
}

export async function listCapturePaths(slug: string): Promise<string[]> {
 await ensure();
 const r = (await sql()`SELECT path FROM site_captures WHERE store_slug = ${slug} ORDER BY path`) as { path: string }[];
 // Hide reserved rows: the legacy `__`-prefixed ones (custom CSS, quickshop) and everything under
 // `/__vya/` (the derived cart and recommendation templates). They are markup we keep ABOUT the
 // capture, not pages of it — listed, they show up as pages of the site in the editor.
 return r.map((x) => x.path).filter((p) => !p.startsWith("__") && !p.toLowerCase().startsWith("/__vya/"));
}

export async function hasCaptures(slug: string): Promise<boolean> {
 await ensure();
 const r = (await sql()`SELECT path FROM site_captures WHERE store_slug = ${slug}`) as { path: string }[];
 return r.some((x) => !x.path.startsWith("__"));
}

// ── Editing a captured site over time ────────────────────────────────────────
// Captured pages stay editable: update one page's HTML in place, or store a blob
// of custom CSS that's injected into every served page (site-wide restyling).

// HISTORY. This table keeps one row per page and overwrites it, so every write — a seller's edit, a
// re-crawl, or the asset-rehosting pass — used to destroy the version it replaced. The three writers
// below now snapshot the page first; capture-versions-db.ts holds the versions, gzipped, three deep.
//
// The seller's undo reads only her own edits out of that history. The operator's recovery view reads
// all of it, because a re-import that went wrong is exactly what it exists to undo.

export async function updateCapturePageHtml(slug: string, path: string, html: string): Promise<boolean> {
 await ensure();
 await keepCurrent(slug, path, "edit");
 const r = (await sql()`UPDATE site_captures SET html = ${html}, captured_at = now() WHERE store_slug = ${slug} AND path = ${path} RETURNING store_slug`) as unknown[];
 return r.length > 0;
}

/** Put a page back to a specific stored version. Used by the operator's recovery view, and itself a
 *  write — so it keeps a version of what it replaces. Undoing a bad restore is the same operation
 *  again; there is no state this can strand a page in. */
export async function restoreCapturePageVersion(slug: string, path: string, html: string): Promise<boolean> {
 await ensure();
 await keepCurrent(slug, path, "crawl");
 const r = (await sql()`UPDATE site_captures SET html = ${html}, captured_at = now() WHERE store_slug = ${slug} AND path = ${path} RETURNING store_slug`) as unknown[];
 return r.length > 0;
}

/** Pages of this store whose last save can still be undone, newest first. Deliberately does NOT
 *  read any page's html — the portal only needs to know which pages offer the button. */
export async function listUndoablePages(slug: string): Promise<{ path: string; savedAt: string | null }[]> {
 await ensure();
 // Only her OWN edits. The history also holds re-imports and asset rehosting, but offering those as
 // undo points would ask a seller to reason about our plumbing.
 try {
  return (await pagesWithEdits(slug)).map((p) => ({ path: p.path, savedAt: p.savedAt }));
 } catch { return []; /* allow-swallow: no undo offered beats a broken tab */ }
}

/** Put one page back to the version stored before its last save, and clear the slot — undo is one
 *  step, so the button disappears once used. Returns false when there is nothing to undo. */
export async function undoCapturePageEdit(slug: string, path: string): Promise<boolean> {
 await ensure();
 const v = await latestVersion(slug, path, "edit");
 if (!v?.html) return false; // restoring "" would blank the page, which is worse than refusing
 const r = (await sql()`UPDATE site_captures SET html = ${v.html}, captured_at = now()
 WHERE store_slug = ${slug} AND path = ${path} RETURNING store_slug`) as unknown[];
 if (!r.length) return false;
 // The step just taken back is spent, so pressing undo again goes back FURTHER rather than toggling
 // between the same two versions for ever.
 await dropVersion(v.id);
 return true;
}

const CSS_PATH = "__vya_custom_css__";
export async function getSiteCss(slug: string): Promise<string> {
 return (await getCapturePage(slug, CSS_PATH).catch(() => null)) || "";
}
export async function setSiteCss(slug: string, css: string): Promise<void> {
 await saveCapturePage(slug, CSS_PATH, css, "");
}

export async function deleteCaptures(slug: string): Promise<void> {
 await ensure();
 await sql()`DELETE FROM site_captures WHERE store_slug = ${slug}`;
}

/** The original site origin for a captured store (from any stored page's source_url). */
export async function getCaptureOrigin(slug: string): Promise<string | null> {
 await ensure();
 // `<> ''` matters: reserved rows (custom CSS, cart/recommendation templates) are stored with an
 // empty source_url, and an unordered LIMIT 1 is free to hand back one of those — which parses to
 // no origin at all and tells the caller the store has no source, mid-import.
 const r = (await sql()`SELECT source_url FROM site_captures WHERE store_slug = ${slug} AND source_url IS NOT NULL AND source_url <> '' LIMIT 1`) as { source_url: string }[];
 try { return r[0]?.source_url ? new URL(r[0].source_url).origin : null; } catch { return null; }
}
