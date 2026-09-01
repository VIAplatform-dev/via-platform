/**
 * Copy sellers' product photos onto our storage, so a listing keeps its pictures when the seller
 * leaves their old platform.
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/copy-product-photos.mts <slug|--all> [--write] [--limit N]
 *
 * The cron route (app/api/cron/rehost-images) does this 20 items at a time in the background. This
 * is the same work as a foreground job that can be watched and stopped, for clearing a backlog.
 *
 * An item is marked done ONLY when nothing is left behind — see allPhotosMoved. The old behaviour
 * marked every item done regardless, so 643 items across the fleet reported their photography as
 * safe while every picture in them still lived on Shopify.
 *
 * Dry-run by default: says what it would do and copies nothing.
 */
import { neon } from "@neondatabase/serverless";
import { rehostImage } from "../app/lib/rehost-images.ts";
import { allPhotosMoved } from "../app/lib/rehost-images-core.ts";

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL!);
const args = process.argv.slice(2);
const all = args.includes("--all");
const target = args.find((a) => !a.startsWith("--")) ?? (all ? "--all" : undefined);
const write = args.includes("--write");
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : 0;
if (!target) { console.error("usage: copy-product-photos.mts <slug|--all> [--write] [--limit N]"); process.exit(2); }
if (!process.env.BLOB_READ_WRITE_TOKEN) { console.error("No storage token configured — every copy would silently no-op. Stopping."); process.exit(2); }

const rows = await sql`
 SELECT i.id, i.title, i.images, sel.slug
 FROM items i JOIN sellers sel ON sel.id = i.seller_id
 WHERE i.images_rehosted IS NOT TRUE
   AND jsonb_array_length(COALESCE(i.images, '[]'::jsonb)) > 0
   AND (${all} OR sel.slug = ${target})
 ORDER BY sel.slug, i.created_at DESC` as { id: string; title: string; images: string[]; slug: string }[];

const work = limit ? rows.slice(0, limit) : rows;
const photos = work.reduce((a, r) => a + (Array.isArray(r.images) ? r.images.length : 0), 0);
console.log(`${work.length} items · ${photos} photos${all ? " (whole fleet)" : ` on ${target}`}`);
if (!write) { console.log(`\nDry run. Re-run with --write to copy.`); process.exit(0); }

let done = 0, leftBehind = 0, moved = 0, failedPhotos = 0;
const t0 = Date.now();
for (const [i, r] of work.entries()) {
 const imgs = Array.isArray(r.images) ? r.images : [];
 const out: string[] = [];
 for (const u of imgs) {
  const rehosted = await rehostImage(u, r.slug);
  if (rehosted !== u) moved++; else if (!/blob\.vercel-storage/.test(u)) failedPhotos++;
  out.push(rehosted);
 }
 const ok = allPhotosMoved(out);
 await sql`UPDATE items SET images = ${JSON.stringify(out)}::jsonb, images_rehosted = ${ok}, updated_at = now() WHERE id = ${r.id}`;
 if (ok) done++; else leftBehind++;
 if ((i + 1) % 10 === 0 || i === work.length - 1) {
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`  ${i + 1}/${work.length} items · ${moved} photos copied · ${done} finished · ${leftBehind} still incomplete · ${secs}s`);
 }
}
console.log(`\ndone: ${done} items complete · ${leftBehind} left incomplete · ${moved} photos copied · ${failedPhotos} photos could not be fetched`);
