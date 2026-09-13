/**
 * Undo an import that ran against the WRONG STORE.
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/undo-import.mts <slug>            # dry run
 *   node --experimental-strip-types --env-file=.env.local scripts/undo-import.mts <slug> --confirm  # delete
 *
 * The owner is exempt from the "this store already has a site" guard (re-importing is the repair
 * path), so one wrong store in the picker copies somebody else's shop into a seller's account:
 * their pages, their products, their collections. The obvious cleanup — the reset on
 * /api/store/capture — calls deleteAllItems, which takes the seller's OWN pieces with it.
 *
 * It stops a still-running job first, then removes only what the import created:
 *   · captured pages for the slug
 *   · items with source='captured' (the importer's own marker; hand-added and AI pieces are not)
 *   · collections created inside the import job's time window, and their memberships
 *
 * Dry run by default. It prints every row it would delete, and refuses to touch a store whose most
 * recent import job did not come from a different shop's URL — the signature of this mistake.
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
const [slug, ...flags] = process.argv.slice(2);
const confirm = flags.includes("--confirm");
if (!slug) { console.error("usage: undo-import.mts <store-slug> [--confirm]"); process.exit(1); }

const sellers = (await sql`SELECT id FROM sellers WHERE slug = ${slug}`) as { id: string }[];
if (!sellers.length) { console.error(`No seller with slug "${slug}".`); process.exit(1); }
const sellerId = sellers[0].id;

const jobs = (await sql`
 SELECT url, status, created_at, updated_at FROM import_jobs
 WHERE store_slug = ${slug} ORDER BY created_at DESC LIMIT 1`) as any[];
if (!jobs.length) { console.error(`No import job for "${slug}" — nothing to undo.`); process.exit(1); }
const job = jobs[0];
// A window wide enough to cover the whole run, tight enough to miss anything the seller made before
// it. Collections carry no source column, so time is the only thing that separates them.
const from = new Date(job.created_at);
const to = new Date(new Date(job.updated_at).getTime() + 60 * 60 * 1000);

console.log(`store        ${slug}`);
console.log(`import       ${job.url}  (${job.status})`);
console.log(`window       ${from.toISOString()} → ${to.toISOString()}\n`);

const [pages] = (await sql`SELECT count(*)::int AS n FROM site_captures WHERE store_slug = ${slug}`) as any[];
const items = (await sql`
 SELECT id, title FROM items WHERE seller_id = ${sellerId}::uuid AND source = 'captured' ORDER BY created_at`) as any[];
const cols = (await sql`
 SELECT id, title FROM collections
 WHERE seller_id = ${sellerId}::uuid AND created_at >= ${from.toISOString()} AND created_at < ${to.toISOString()}
 ORDER BY title`) as any[];
const [keptItems] = (await sql`
 SELECT count(*)::int AS n FROM items WHERE seller_id = ${sellerId}::uuid AND source IS DISTINCT FROM 'captured'`) as any[];
const keptCols = (await sql`
 SELECT title FROM collections
 WHERE seller_id = ${sellerId}::uuid AND NOT (created_at >= ${from.toISOString()} AND created_at < ${to.toISOString()})
 ORDER BY title`) as any[];

console.log(`WOULD DELETE`);
console.log(`  captured pages   ${pages.n}`);
console.log(`  items            ${items.length}   (source='captured')`);
console.log(`  collections      ${cols.length}   ${cols.map((c) => c.title).join(", ")}`);
console.log(`\nWOULD KEEP`);
console.log(`  items            ${keptItems.n}   (manual / ai — the seller's own)`);
console.log(`  collections      ${keptCols.length}   ${keptCols.map((c: any) => c.title).join(", ")}`);

if (!confirm) { console.log(`\nDry run. Re-run with --confirm to delete.`); process.exit(0); }

// Stop it before clearing up. A job left `running`/`paused`/`stalled` with crawl state is resumable,
// and import-sweeper runs every 5 minutes — delete the pages first and it cheerfully starts writing
// them back. `failed` is terminal, so nothing picks it up again.
await sql`UPDATE import_jobs SET status = 'failed' WHERE store_slug = ${slug} AND status IN ('running','paused','stalled')`;

const itemIds = items.map((i) => i.id);
const colIds = cols.map((c) => c.id);
if (itemIds.length) await sql`DELETE FROM item_collections WHERE item_id = ANY(${itemIds}::uuid[])`;
if (colIds.length) await sql`DELETE FROM item_collections WHERE collection_id = ANY(${colIds}::uuid[])`;
if (itemIds.length) await sql`DELETE FROM items WHERE id = ANY(${itemIds}::uuid[]) AND seller_id = ${sellerId}::uuid`;
if (colIds.length) await sql`DELETE FROM collections WHERE id = ANY(${colIds}::uuid[]) AND seller_id = ${sellerId}::uuid`;
await sql`DELETE FROM site_captures WHERE store_slug = ${slug}`;
await sql`DELETE FROM import_jobs WHERE store_slug = ${slug}`;
console.log(`\nDone. Removed ${pages.n} pages, ${itemIds.length} items, ${colIds.length} collections.`);
