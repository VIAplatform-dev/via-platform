/**
 * What does VYA actually cost to run, and who is spending it?
 *
 * Reads api_costs, which logs every paid call with the provider's own usage numbers. Read-only.
 *
 * Two things to know when reading the output:
 *  • Rows with no store are scripts and cron jobs — evals, backfills, syncs. That is deliberate:
 *    it is what separates "sellers cost us this" from "our own testing cost us this". Before the
 *    request-boundary attribution landed, EVERYTHING was unattributed, so history will look
 *    lopsided until enough seller traffic accumulates.
 *  • The per-item figures divide by valuation calls, which happen exactly once per piece priced.
 *
 * Run: npx tsx --env-file=.env.local scripts/unit-economics.ts [days]
 */
import { neon } from "@neondatabase/serverless";

const DAYS = Math.max(1, Number(process.argv[2] || 30));
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

async function main() {
 const sql = neon(process.env.DATABASE_URL!);
 const since = `${DAYS} days`;

 const totals = (await sql`
  SELECT provider, sum(cost_cents)::int cents, count(*)::int calls
  FROM api_costs WHERE created_at >= now() - ${since}::interval
  GROUP BY 1 ORDER BY 2 DESC
 `) as Array<{ provider: string; cents: number; calls: number }>;
 const all = totals.reduce((s, r) => s + r.cents, 0);

 console.log(`\n════ VYA running costs · last ${DAYS} days ════\n`);
 console.log(`  provider     spend      share   calls`);
 for (const r of totals) {
  console.log(`  ${r.provider.padEnd(11)} ${usd(r.cents).padStart(8)}   ${String(Math.round((100 * r.cents) / all)).padStart(3)}%   ${r.calls}`);
 }
 console.log(`  ${"TOTAL".padEnd(11)} ${usd(all).padStart(8)}`);

 const split = (await sql`
  SELECT store_slug IS NULL AS unattributed, sum(cost_cents)::int cents
  FROM api_costs WHERE created_at >= now() - ${since}::interval GROUP BY 1
 `) as Array<{ unattributed: boolean; cents: number }>;
 console.log(`\n  ── who spent it ──`);
 for (const r of split) {
  console.log(`  ${(r.unattributed ? "scripts, evals & crons" : "seller activity").padEnd(24)} ${usd(r.cents).padStart(8)}   ${Math.round((100 * r.cents) / all)}%`);
 }

 // ── per piece priced ──
 const priced = (await sql`
  SELECT count(*)::int n FROM api_costs
  WHERE provider = 'anthropic' AND operation = 'pricing' AND created_at >= now() - ${since}::interval
 `) as Array<{ n: number }>;
 const n = priced[0]?.n ?? 0;
 if (n > 0) {
  console.log(`\n  ── cost per piece priced (${n} valuations) ──`);
  for (const r of totals) console.log(`  ${r.provider.padEnd(11)} ${("$" + (r.cents / 100 / n).toFixed(3)).padStart(8)}`);
  console.log(`  ${"TOTAL".padEnd(11)} ${("$" + (all / 100 / n).toFixed(3)).padStart(8)}  per piece`);
 }

 // ── per store: the subscription question ──
 const perStore = (await sql`
  SELECT store_slug, sum(cost_cents)::int cents,
         count(*) FILTER (WHERE provider = 'anthropic' AND operation = 'pricing')::int priced
  FROM api_costs
  WHERE created_at >= now() - ${since}::interval AND store_slug IS NOT NULL
  GROUP BY 1 ORDER BY 2 DESC LIMIT 20
 `) as Array<{ store_slug: string; cents: number; priced: number }>;
 console.log(`\n  ── cost to serve one store, per ${DAYS} days ──`);
 if (!perStore.length) {
  console.log(`  Nothing attributed yet. Costs only carry a store from the request-boundary change`);
  console.log(`  onward, so this fills in as sellers use intake — it is not backfillable.`);
 } else {
  const sum = perStore.reduce((s, r) => s + r.cents, 0);
  for (const r of perStore) {
   console.log(`  ${r.store_slug.padEnd(26)} ${usd(r.cents).padStart(8)}   ${String(r.priced).padStart(4)} pieces priced`);
  }
  console.log(`\n  ${perStore.length} active stores · ${usd(Math.round(sum / perStore.length))} average each`);
  console.log(`  Compare that with the subscription price to get gross margin per store.`);
 }
 console.log("");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
