/**
 * One-off: record WHY each already-sold piece is unbuyable.
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/backfill-unavailable-reason.mts [--write]
 *
 * Until now the two cases were only separable by accident: the sweep that marks a vanished piece
 * sets `sold_at`, and a piece imported already sold-out does not get one. That is a coincidence of
 * how the code was written, not a record of intent, and the next change to the importer would erase
 * it. This writes the distinction down once, so nothing has to infer it again.
 *
 *   sold_at IS NOT NULL  → `vanished`  (we inferred it: it left the seller's feed, reason unknown)
 *   sold_at IS NULL      → `sold_out`  (the seller's platform reported available:false)
 *
 * Only rows with no reason recorded are touched, so re-running is safe and never overwrites a
 * reason the importer has since set from live data. Dry-run by default.
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL!);
const write = process.argv.includes("--write");

await sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS unavailable_reason text`;

const [before] = await sql`
 SELECT
  count(*) FILTER (WHERE unavailable_reason IS NULL AND sold_at IS NOT NULL)::int AS to_vanished,
  count(*) FILTER (WHERE unavailable_reason IS NULL AND sold_at IS NULL)::int AS to_sold_out,
  count(*) FILTER (WHERE unavailable_reason IS NOT NULL)::int AS already
 FROM items WHERE status = 'sold' AND source = 'captured'` as { to_vanished: number; to_sold_out: number; already: number }[];

console.log(`sold pieces on hosted stores:`);
console.log(`  → "No longer available" (we inferred it vanished) : ${before.to_vanished}`);
console.log(`  → "Sold out" (their platform said so)             : ${before.to_sold_out}`);
console.log(`  already recorded, left alone                      : ${before.already}`);

if (!write) { console.log(`\nDry run. Re-run with --write to apply.`); process.exit(0); }

const v = await sql`UPDATE items SET unavailable_reason = 'vanished', updated_at = now()
 WHERE status = 'sold' AND source = 'captured' AND unavailable_reason IS NULL AND sold_at IS NOT NULL RETURNING id`;
const s = await sql`UPDATE items SET unavailable_reason = 'sold_out', updated_at = now()
 WHERE status = 'sold' AND source = 'captured' AND unavailable_reason IS NULL AND sold_at IS NULL RETURNING id`;
console.log(`\nwrote: ${v.length} vanished · ${s.length} sold_out`);

// Per store, so the change is legible next to what each seller will actually see.
const rows = await sql`
 SELECT sel.slug, count(*) FILTER (WHERE i.unavailable_reason = 'vanished')::int AS vanished,
        count(*) FILTER (WHERE i.unavailable_reason = 'sold_out')::int AS sold_out
 FROM items i JOIN sellers sel ON sel.id = i.seller_id
 WHERE i.status = 'sold' AND i.source = 'captured'
 GROUP BY sel.slug HAVING count(*) FILTER (WHERE i.unavailable_reason = 'vanished') > 0
 ORDER BY 2 DESC` as { slug: string; vanished: number; sold_out: number }[];
console.log(`\nstores where a badge will change wording:`);
for (const r of rows) console.log(`  ${r.slug.padEnd(28)} ${r.vanished} → "No longer available"  (${r.sold_out} stay "Sold out")`);
