/**
 * One-off: clear the "photos copied" marker from items whose photos were never actually copied.
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/reset-false-photo-markers.mts [--write]
 *
 * Two ways an item got a marker it had not earned. `rehostImage` returns the original URL on every
 * failure path (no storage token, failed download, empty file, exception) and the copier used to set
 * `images_rehosted = TRUE` regardless — a failure recorded as a success. And a re-sync compared the
 * item's stored photos with the feed's, found the two strings identical, and called that "already
 * copied" — when identical is exactly what you get if nothing was ever copied. Either way the job
 * never revisits a finished item, so the store reports its photography as safe while every picture
 * in it still lives on Shopify. Both are fixed; this clears the markers they left behind.
 *
 * This clears the marker on those items ONLY. Items genuinely copied are untouched, so it is safe to
 * re-run. After this, the copier (app/api/cron/rehost-images) works through them, and now only marks
 * an item done when nothing is left behind (see allPhotosMoved).
 *
 * Dry-run by default.
 */
import { neon } from "@neondatabase/serverless";
import { PLATFORM_HOSTED_PATTERN } from "../app/lib/rehost-images-core.ts";

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL!);
const write = process.argv.includes("--write");

// The same list of "platforms whose images go dark when the seller cancels" the copier works from,
// not a hand-copied subset of it. This script had four of the eight, so a store on Etsy or Big Cartel
// would have been left marked "photos copied" for ever — the exact state this script exists to undo.
const PLATFORM = PLATFORM_HOSTED_PATTERN;

const rows = await sql`
 SELECT sel.slug, count(*)::int AS n,
        sum((SELECT count(*) FROM jsonb_array_elements_text(COALESCE(i.images, '[]'::jsonb)) e(url)
             WHERE e.url ~* ${PLATFORM}))::int AS photos
 FROM items i JOIN sellers sel ON sel.id = i.seller_id
 WHERE i.images_rehosted IS TRUE AND i.images::text ~* ${PLATFORM}
 GROUP BY sel.slug ORDER BY 2 DESC` as { slug: string; n: number; photos: number }[];

const totalItems = rows.reduce((a, r) => a + r.n, 0);
const totalPhotos = rows.reduce((a, r) => a + r.photos, 0);
console.log(`items marked "photos copied" whose photos are still on the seller's platform:\n`);
for (const r of rows) console.log(`  ${r.slug.padEnd(28)} ${String(r.n).padStart(5)} items · ${r.photos} photos`);
console.log(`\n  ${totalItems} items · ${totalPhotos} photos to copy`);

if (!write) { console.log(`\nDry run. Re-run with --write to clear the marker so the copier retries them.`); process.exit(0); }

const cleared = await sql`
 UPDATE items SET images_rehosted = FALSE
 WHERE images_rehosted IS TRUE AND images::text ~* ${PLATFORM}
 RETURNING id` as { id: string }[];
console.log(`\ncleared the marker on ${cleared.length} items — the copier will now work through them.`);
