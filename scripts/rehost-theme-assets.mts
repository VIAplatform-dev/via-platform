/**
 * Take ownership of a captured store's theme assets.
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/rehost-theme-assets.mts --dry
 *   node --experimental-strip-types --env-file=.env.local scripts/rehost-theme-assets.mts <slug> [...]
 *   node --experimental-strip-types --env-file=.env.local scripts/rehost-theme-assets.mts --all
 *
 * See app/lib/rehost-theme-assets.ts for why. Short version: product photos already live on our
 * Blob, which is why they survive a seller cancelling Shopify — the theme's JavaScript, fonts and
 * logo do not, and are fetched from the seller's own Shopify on every request. This copies them.
 *
 * Writes to the production database (it rewrites stored capture pages), so it takes an explicit
 * store list or --all, never a silent default.
 */
import { neon } from "@neondatabase/serverless";
import { rehostThemeAssetsForStore } from "../app/lib/rehost-theme-assets.ts";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const all = args.includes("--all");
const slugs = args.filter((a) => !a.startsWith("--"));

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL!);

const targets = all || (dry && !slugs.length)
 ? (await sql`SELECT DISTINCT store_slug s FROM site_captures ORDER BY store_slug` as { s: string }[]).map((r) => r.s)
 : slugs;

if (!targets.length) {
 console.error("usage: rehost-theme-assets.mts [--dry] [--all] [slug ...]");
 process.exit(2);
}
if (!dry && !process.env.BLOB_READ_WRITE_TOKEN) {
 console.error("BLOB_READ_WRITE_TOKEN is not set — nothing would be copied. Refusing to run.");
 process.exit(2);
}

console.log(`${dry ? "DRY RUN — nothing will be written" : "REHOSTING"} · ${targets.length} store(s)\n`);
let totalAssets = 0, totalBytes = 0, totalFailed = 0;

for (const slug of targets) {
 try {
  const r = await rehostThemeAssetsForStore(slug, { dryRun: dry });
  const mb = (r.bytes / 1048576).toFixed(2);
  console.log(
   `${slug.padEnd(28)} pages ${String(r.pages).padStart(4)} · assets ${String(r.candidates).padStart(4)}` +
   (dry ? "" : ` · rehosted ${String(r.rehosted).padStart(4)} · failed ${String(r.failed).padStart(3)} · ${mb} MB${r.incomplete ? "  ⚠ INCOMPLETE (skipped " + r.skipped + ", failed " + r.failed + ")" : ""}`),
  );
  for (const f of r.failures) console.log(`    ! could not take: ${f}`);
  totalAssets += dry ? r.candidates : r.rehosted;
  totalBytes += r.bytes;
  totalFailed += r.failed;
 } catch (e) {
  console.log(`${slug.padEnd(28)} ERROR: ${String((e as Error).message).slice(0, 110)}`);
 }
}

console.log(`\n${dry ? "would take" : "took"} ${totalAssets} assets, ${(totalBytes / 1048576).toFixed(1)} MB${totalFailed ? `, ${totalFailed} failed` : ""}`);
