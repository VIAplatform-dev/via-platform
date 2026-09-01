/**
 * Close a hosted store's catalog and collection gaps WITHOUT a re-crawl.
 *
 *   node --env-file=.env.local --import tsx scripts/repair-store.mts <slug> [...] [--allow-large-sweep]
 *   (tsx, not --experimental-strip-types: the import pipeline uses Next-style extensionless and `@/`
 *   imports that plain Node cannot resolve)
 *
 * Runs the import pipeline's own idempotent steps against the live feed — no crawl, no cart
 * side-effects on the seller's store:
 *   1. products    — pull the feed; add what we lack, correct sold/available, mark what the source
 *                    dropped as sold (importProductsAsItems).
 *   2. collections — a VYA collection for EVERY captured /collections/<handle> page.
 *   3. membership  — re-sync from the source's collection listings, with the guard that refuses to
 *                    overwrite a collection it could not read (see capture-commerce.ts).
 *   4. order       — the source's own ordering, taken from the live collection listings step 3
 *                    already read (and only from the captured pages where that came back empty).
 * Prints before/after so a repair that changed nothing says so. Measure with parity-check.mts.
 */
import { neon } from "@neondatabase/serverless";
import { importStoreFromUrl } from "../app/lib/store-import.ts";
import { importProductsAsItems, syncCollectionMembership, syncCollectionOrder } from "../app/lib/capture-commerce.ts";
import { ensureCollection } from "../app/lib/db/collections.ts";
import { getSellerBySlug } from "../app/lib/db/sellers.ts";
import { listCapturePaths, getCaptureOrigin } from "../app/lib/site-capture-db.ts";

const slugs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
// A run that would retire an unusual share of a store stops and asks. Pass this once a person has
// looked and confirmed the clear-out is real — it never overrides an incomplete read.
const allowLargeSweep = process.argv.includes("--allow-large-sweep");
if (!slugs.length) { console.error("usage: repair-store.mts <slug> [...]"); process.exit(2); }
const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL!);
const titleize = (h: string) => h.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

for (const slug of slugs) {
 const seller = await getSellerBySlug(slug);
 const origin = await getCaptureOrigin(slug);
 if (!seller || !origin) { console.log(`${slug}: no seller/capture`); continue; }
 const snap = async () => {
  const [i] = await sql`SELECT count(*)::int items, count(*) FILTER (WHERE status='active')::int active FROM items WHERE seller_id=${seller.id}` as { items: number; active: number }[];
  const [c] = await sql`SELECT count(*)::int collections FROM collections WHERE seller_id=${seller.id}` as { collections: number }[];
  const [m] = await sql`SELECT count(*)::int links FROM item_collections ic JOIN collections c ON c.id=ic.collection_id WHERE c.seller_id=${seller.id}` as { links: number }[];
  return { ...i, ...c, ...m };
 };
 const before = await snap();
 console.log(`\n══ ${slug}  before: ${JSON.stringify(before)}`);
 const pulled = await importStoreFromUrl(origin);
 if (!pulled.ok) { console.log(`   feed: ${pulled.error}`); continue; }
 // feedComplete gates the sold-sweep: an incomplete read never marks a seller's stock sold.
 const stats = await importProductsAsItems(slug, pulled.products, {
  feedComplete: pulled.feedComplete,
  feedSourceIds: pulled.feedSourceIds,
  approvedLargeSweep: allowLargeSweep,
 });
 if (!pulled.feedComplete) console.log(`   feed:      INCOMPLETE read (${pulled.products.length} products) — nothing will be marked sold this run`);
 console.log(`   products   +${stats.added} added · ${stats.updated} updated · ${stats.unchanged} unchanged · ${stats.removed} marked sold${stats.warnings.length ? " · ⚠ " + stats.warnings.join(" | ") : ""}`);
 const paths = await listCapturePaths(slug);
 let made = 0;
 for (const p of paths) { const m = p.match(/^\/collections\/([^/]+)\/?$/); if (m && m[1] !== "all") { await ensureCollection(seller.id, m[1], titleize(m[1])); made++; } }
 console.log(`   collections ensured for ${made} captured collection pages`);
 const mem = await syncCollectionMembership(slug, new URL(origin).host, pulled.products);
 console.log(`   membership  ${mem.links} links across ${mem.collections} collections${mem.warnings?.length ? " · ⚠ " + mem.warnings.join(" | ") : ""}`);
 // mem.order is the seller's order as her feed listed it MINUTES AGO. Without it this falls back
 // to the captured collection pages, which are frozen at crawl day.
 const ord = await syncCollectionOrder(slug, mem.order);
 console.log(`   order       ${ord.ordered} items ordered in ${ord.collections} collections (${ord.live} from the live feed, ${ord.collections - ord.live} from the capture)`);
 const after = await snap();
 console.log(`   after: ${JSON.stringify(after)}`);
}
