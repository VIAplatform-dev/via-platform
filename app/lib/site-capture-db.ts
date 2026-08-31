import { neon } from "@neondatabase/serverless";

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
 await sql()`INSERT INTO site_captures (store_slug, path, html, source_url) VALUES (${slug}, ${path}, ${html}, ${sourceUrl})
 ON CONFLICT (store_slug, path) DO UPDATE SET html = ${html}, source_url = ${sourceUrl}, captured_at = now()`;
}

/** Rewrite a stored page's HTML WITHOUT claiming it was re-crawled. For post-processing passes
 *  (asset rehosting) that change where a page's references point, not what was captured — resetting
 *  `captured_at` there would make every touched page look freshly crawled. */
export async function rewriteCapturePage(slug: string, path: string, html: string): Promise<void> {
 await ensure();
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

// ONE STEP BACK. This table keeps one row per page and overwrites it, so before this every seller
// edit destroyed the version it replaced with nothing to fall back to. `previous_html` carries the
// html the row held immediately before its last save — a single step, not a history (these rows
// hold whole pages; half a megabyte each is normal). See app/lib/capture-history.ts for the rules.
//
// Additive and self-healing, in the shape of ensurePublishAtColumn in app/lib/db/inventory.ts: the
// column appears the first time this code runs against a database that lacks it, and if the ALTER
// is refused the writes below fall back to the historyless UPDATE rather than failing the save.
let historyReady: boolean | null = null;
async function ensurePreviousHtmlColumn(): Promise<boolean> {
 if (historyReady !== null) return historyReady;
 try {
  await sql()`ALTER TABLE site_captures ADD COLUMN IF NOT EXISTS previous_html TEXT`;
  await sql()`ALTER TABLE site_captures ADD COLUMN IF NOT EXISTS previous_html_at TIMESTAMPTZ`;
  historyReady = true;
 } catch { historyReady = false; /* no DDL rights — saves still work, undo simply isn't offered */ }
 return historyReady;
}

export async function updateCapturePageHtml(slug: string, path: string, html: string): Promise<boolean> {
 await ensure();
 // `previous_html = html` reads the row's OLD html (Postgres evaluates the right-hand side against
 // the pre-update row), so the snapshot is taken in the same statement as the overwrite — atomic,
 // and without shipping half a megabyte of page back and forth to take it.
 if (await ensurePreviousHtmlColumn()) {
  try {
   const r = (await sql()`UPDATE site_captures SET previous_html = html, previous_html_at = now(), html = ${html}, captured_at = now()
   WHERE store_slug = ${slug} AND path = ${path} RETURNING store_slug`) as unknown[];
   return r.length > 0;
  } catch { historyReady = false; /* fall through: a save must never fail for want of an undo point */ }
 }
 const r = (await sql()`UPDATE site_captures SET html = ${html}, captured_at = now() WHERE store_slug = ${slug} AND path = ${path} RETURNING store_slug`) as unknown[];
 return r.length > 0;
}

/** Pages of this store whose last save can still be undone, newest first. Deliberately does NOT
 *  select `previous_html` — the portal only needs to know which pages offer the button. */
export async function listUndoablePages(slug: string): Promise<{ path: string; savedAt: string | null }[]> {
 await ensure();
 if (!(await ensurePreviousHtmlColumn())) return [];
 try {
  const r = (await sql()`SELECT path, previous_html_at FROM site_captures
  WHERE store_slug = ${slug} AND previous_html IS NOT NULL AND previous_html <> ''
  ORDER BY previous_html_at DESC NULLS LAST`) as { path: string; previous_html_at: string | null }[];
  return r.map((x) => ({ path: x.path, savedAt: x.previous_html_at }));
 } catch { return []; }
}

/** Put one page back to the version stored before its last save, and clear the slot — undo is one
 *  step, so the button disappears once used. Returns false when there is nothing to undo. */
export async function undoCapturePageEdit(slug: string, path: string): Promise<boolean> {
 await ensure();
 if (!(await ensurePreviousHtmlColumn())) return false;
 const r = (await sql()`UPDATE site_captures
 SET html = previous_html, previous_html = NULL, previous_html_at = NULL, captured_at = now()
 WHERE store_slug = ${slug} AND path = ${path} AND previous_html IS NOT NULL AND previous_html <> ''
 RETURNING store_slug`) as unknown[];
 return r.length > 0;
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
