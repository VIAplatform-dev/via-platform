/**
 * What one AI listing costs, and whether each subscription tier makes money.
 *
 * Per-call prices are read LIVE from api_costs, so this stays true as providers change their
 * rates. The per-listing call COUNTS are stated as assumptions below, because they vary by item
 * and the honest thing is to show them rather than bury them.
 *
 * Run: npx tsx --env-file=.env.local scripts/unit-economics.ts   (spend so far)
 *      npx tsx --env-file=.env.local scripts/tier-economics.ts   (this: the forward model)
 *      npx tsx --env-file=.env.local scripts/tier-economics.ts 7.4   (sensitivity on searches/item)
 */
import { neon } from "@neondatabase/serverless";
import { TIERS } from "../app/lib/data-layer/config.ts";

// ── Assumptions, all measured, all adjustable ──
//
// searchesPerListing is the one that moves the answer. 7.4 was measured on a 100-item cold-cache
// run before the cost reductions; 5.1 on a 57-item run after. Production intake may run slightly
// higher than either, because it escalates reverse-image through up to three tiers where the eval
// takes one — so treat 5.1 as the optimistic end of a real range.
const SEARCHES_PER_LISTING = Number(process.argv[2] || 5.1);
// Voyage embeds: the upload's own photo plus each candidate match's thumbnail, scored for
// same-piece confirmation. Derived from the ratio of embed calls to valuations in api_costs.
const EMBEDS_PER_LISTING = 12;
// The vision draft (title + description + attributes) and the valuation run once per listing.
// SEO polish and provenance lookups run only when there's something to work with — measured at
// roughly 1 in 200 and 1 in 30 listings respectively.
const SEO_RATE = 1 / 200;
const PROVENANCE_RATE = 1 / 30;

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const usd4 = (cents: number) => `$${(cents / 100).toFixed(4)}`;

async function rate(sql: ReturnType<typeof neon>, provider: string, operation: string, fallback: number): Promise<number> {
 const r = (await sql`
  SELECT avg(cost_cents)::float c FROM api_costs
  WHERE provider = ${provider} AND operation = ${operation} AND created_at >= now() - interval '90 days'
 `) as Array<{ c: number | null }>;
 return r[0]?.c ?? fallback;
}

async function main() {
 const sql = neon(process.env.DATABASE_URL!);

 const draft = await rate(sql, "anthropic", "draft", 2.0);
 const pricing = await rate(sql, "anthropic", "pricing", 2.07);
 const seo = await rate(sql, "anthropic", "polish_seo", 0.45);
 const provenance = await rate(sql, "anthropic", "celebrity", 0.32);
 const search = await rate(sql, "serpapi", "google_shopping", 1.5);
 const embed = await rate(sql, "voyage", "embed", 0.03);
 // Ghost mannequin: one processed image per intake call, on the main photo. Runs whether or not
 // the draft runs, so a bulk item that skips the draft still pays for it.
 const ghost = await rate(sql, "photoroom", "ghost_mannequin", 10);

 const lines: Array<[string, number]> = [
  ["Ghost mannequin — PhotoRoom, 1 image", ghost],
  ["Vision draft — title, description, attributes", draft],
  ["Valuation — the price", pricing],
  [`Comp searches — ${SEARCHES_PER_LISTING} × ${usd4(search)}`, SEARCHES_PER_LISTING * search],
  [`Image embeds — ${EMBEDS_PER_LISTING} × ${usd4(embed)}`, EMBEDS_PER_LISTING * embed],
  ["SEO polish (1 in 200 listings)", seo * SEO_RATE],
  ["Runway / celebrity (1 in 30)", provenance * PROVENANCE_RATE],
 ];
 const perListing = lines.reduce((s, [, c]) => s + c, 0);

 console.log(`\n════ Cost of ONE AI-generated listing ════\n`);
 for (const [label, cents] of lines) console.log(`  ${label.padEnd(46)} ${usd4(cents).padStart(9)}`);
 console.log(`  ${"".padEnd(46)} ${"─────────".padStart(9)}`);
 console.log(`  ${"TOTAL".padEnd(46)} ${usd4(perListing).padStart(9)}   per listing`);
 console.log(`\n  Comp searches are ${Math.round((100 * SEARCHES_PER_LISTING * search) / perListing)}% of it. The description is ${Math.round((100 * draft) / perListing)}%.`);

 console.log(`\n════ Tier economics ════\n`);
 console.log(`  tier      price    cap    AI cost at cap   margin at cap   break-even`);
 for (const t of TIERS) {
  const atCap = t.aiListingsPerPeriod * perListing;
  const marginAtCap = t.priceCents - atCap;
  const pctAtCap = Math.round((100 * marginAtCap) / t.priceCents);
  // How many listings before the subscription stops covering the AI alone.
  const breakEven = Math.floor(t.priceCents / perListing);
  console.log(
   `  ${t.name.padEnd(9)} ${usd(t.priceCents).padStart(6)}  ${String(t.aiListingsPerPeriod).padStart(4)}   ${usd(atCap).padStart(9)}        ${(pctAtCap + "%").padStart(6)}       ${String(breakEven).padStart(5)} listings`,
  );
 }

 console.log(`\n  ── margin by how much of the allowance a store actually uses ──`);
 console.log(`  tier      ${[25, 50, 75, 100].map((u) => `${u}%`.padStart(9)).join("")}`);
 for (const t of TIERS) {
  const cells = [25, 50, 75, 100].map((u) => {
   const cost = t.aiListingsPerPeriod * (u / 100) * perListing;
   return `${Math.round((100 * (t.priceCents - cost)) / t.priceCents)}%`.padStart(9);
  });
  console.log(`  ${t.name.padEnd(9)} ${cells.join("")}`);
 }

 console.log(`\n  ── cost per listing INCLUDED in each tier ──`);
 for (const t of TIERS) {
  console.log(`  ${t.name.padEnd(9)} ${usd(Math.round(t.priceCents / t.aiListingsPerPeriod)).padStart(6)} of subscription per included listing (AI costs ${usd4(perListing)})`);
 }
 console.log("");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
