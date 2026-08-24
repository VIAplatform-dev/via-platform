/**
 * Replay the new comp selection over comps ALREADY IN THE CACHE. Read-only, zero SerpApi calls.
 *
 * This does not measure accuracy — it measures MECHANISM. The question it answers is the one that
 * has to be true before an accuracy run is worth paying for: on real comp sets, does the filtering
 * actually collapse the 3x disagreement it was built to collapse, and how often does it change the
 * number at all?
 *
 * Run:  node --env-file=.env.local scripts/replay-cohesion.ts [maxQueries]
 */
import { neon } from "@neondatabase/serverless";
import { selectComps } from "../app/lib/comp-cohesion.ts";
import type { Comp } from "../app/lib/comps.ts";

const MAX = Number(process.argv[2] || 400);

type Row = {
 query_norm: string;
 source: string;
 title: string;
 price_cents: number;
 sold: boolean;
 condition: string | null;
 currency: string;
 link: string | null;
 sale_type: string | null;
};

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");
const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);

async function main() {
 const sql = neon(process.env.DATABASE_URL!);

 // Queries with enough comps to be worth clustering, newest first.
 const qs = (await sql`
  SELECT query_norm, COUNT(*)::int AS n
  FROM comp_cache
  WHERE price_cents > 0
  GROUP BY query_norm
  HAVING COUNT(*) >= 4
  ORDER BY MAX(fetched_at) DESC
  LIMIT ${MAX}
 `) as Array<{ query_norm: string; n: number }>;

 console.log(`replaying ${qs.length} cached comp sets (no API calls)\n`);

 const beforeSpread: number[] = [];
 const afterSpread: number[] = [];
 const shiftPct: number[] = [];
 let changed = 0, tightened = 0, basisCount: Record<string, number> = {};
 let droppedGarment = 0, droppedCluster = 0, wouldWithhold = 0;

 for (const q of qs) {
  const rows = (await sql`
   SELECT query_norm, source, title, price_cents, sold, condition, currency, link, sale_type
   FROM comp_cache WHERE query_norm = ${q.query_norm} AND price_cents > 0
  `) as Row[];
  if (rows.length < 4) continue;

  const comps: Comp[] = rows.map((r) => ({
   title: r.title,
   priceCents: r.price_cents,
   currency: r.currency || "USD",
   sold: !!r.sold,
   source: r.source,
   condition: r.condition ?? undefined,
   link: r.link ?? undefined,
  }));

  // BEFORE: the whole pool, which is what the valuation blended.
  const allPrices = comps.map((c) => c.priceCents).sort((a, b) => a - b);
  const bP25 = allPrices[Math.floor((allPrices.length - 1) * 0.25)];
  const bP75 = allPrices[Math.floor((allPrices.length - 1) * 0.75)];
  const bMed = med(allPrices);
  const bSpread = bP25 > 0 ? bP75 / bP25 : 0;

  // AFTER: the selection.
  const sel = selectComps(comps, q.query_norm);
  if (!sel.medianCents) continue;

  basisCount[sel.basis] = (basisCount[sel.basis] || 0) + 1;
  droppedGarment += sel.dropped.garment;
  droppedCluster += sel.dropped.nonCluster;
  if (sel.confidence < 0.5) wouldWithhold++;

  if (bSpread > 0) beforeSpread.push(bSpread);
  if (sel.spreadRatio) afterSpread.push(sel.spreadRatio);
  if (sel.spreadRatio && bSpread && sel.spreadRatio < bSpread * 0.95) tightened++;

  if (bMed > 0) {
   const shift = Math.abs(sel.medianCents - bMed) / bMed;
   shiftPct.push(shift);
   if (shift > 0.05) changed++;
  }
 }

 const n = shiftPct.length;
 console.log(`comp sets replayed: ${n}\n`);
 console.log(`── disagreement among the comps a price is built from ──`);
 console.log(`  median spread BEFORE (whole pool):  ${med(beforeSpread).toFixed(2)}x`);
 console.log(`  median spread AFTER  (selection):   ${med(afterSpread).toFixed(2)}x`);
 console.log(`  sets where the spread tightened:    ${tightened} (${pct(tightened, n)})`);
 console.log(`\n── how often the number actually moves ──`);
 console.log(`  changed by >5%:                     ${changed} (${pct(changed, n)})`);
 console.log(`  median shift in the estimate:       ${(med(shiftPct) * 100).toFixed(1)}%`);
 console.log(`\n── what the filtering did ──`);
 console.log(`  basis:`, basisCount);
 console.log(`  comps dropped as wrong garment:     ${droppedGarment}`);
 console.log(`  comps dropped as outside cluster:   ${droppedCluster}`);
 console.log(`  sets now too weak to price (<0.5):  ${wouldWithhold} (${pct(wouldWithhold, n)})`);
 console.log(`\nNOTE: this measures whether filtering changes the comps, NOT whether prices got more`);
 console.log(`accurate. A large shift with a tighter spread is the signal that an accuracy run is`);
 console.log(`worth paying for; near-zero movement would mean the theory is wrong and we stop here.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
