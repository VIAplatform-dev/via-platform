/**
 * The whole unit-economics picture: what a store pays VYA, what it costs to serve, and where the
 * money actually comes from.
 *
 * The headline it exists to make obvious: subscription is NOT the revenue engine. GMV commission
 * is. Store GMV is read live from sold_items, so this stays honest as the marketplace grows.
 *
 * Costs come in two shapes, and conflating them is how a plan gets mispriced:
 *   VARIABLE  per AI listing — model calls, comp searches, image processing. Scales with usage.
 *   FIXED     LINQ messaging — $289/line/month for 210,000 messages, whether one store uses it or
 *             fifty do. A fixed cost is brutal at low store counts and irrelevant at high ones,
 *             so it is amortised over the stores that can actually use it (Growth and Pro).
 *
 * Run: npx tsx --env-file=.env.local scripts/unit-model.ts [growthPlusProStores]
 */
import { neon } from "@neondatabase/serverless";

// ── Cost inputs ──
const PER_LISTING = 0.1403;      // background removal + model + comps, reductions shipped
const PER_LISTING_GHOST = 0.2203; // if ghost mannequin is switched back on
const LINQ_MONTHLY = 289;         // one line, 210,000 messages
const LINQ_SETUP = 1000;          // one-off
const LINQ_MESSAGES = 210_000;
const MESSAGES_PER_LISTING = 4;   // a text-to-list exchange; adjust once measured

const TIERS = [
 { name: "Starter", cap: 50, txt: 0, list: 49, yearly: 39, founding: 29 },
 { name: "Growth", cap: 150, txt: 150, list: 99, yearly: 79, founding: 49 },
 { name: "Pro", cap: 300, txt: 300, list: 199, yearly: 149, founding: 99 },
];

const usd = (n: number) => `$${n.toFixed(2)}`;

async function main() {
 const sql = neon(process.env.DATABASE_URL!);
 const g = (await sql`
  SELECT count(DISTINCT store_slug)::int stores, round(sum(final_price))::int gmv
  FROM sold_items WHERE sold_at >= now() - interval '30 days'
 `) as Array<{ stores: number; gmv: number }>;
 const gmvPerStore = g[0].gmv / g[0].stores;
 const commission = gmvPerStore * 0.01;
 const payingStores = Math.max(1, Number(process.argv[2] || 20));

 console.log(`\n════ Where the money comes from ════\n`);
 console.log(`  Measured over the last 30 days: ${g[0].stores} stores, ${usd(g[0].gmv)} GMV`);
 console.log(`  Average GMV per store           ${usd(gmvPerStore).padStart(10)} / month`);
 console.log(`  1% commission on that           ${usd(commission).padStart(10)} / month`);
 console.log(`\n  Against a Starter subscription of $49 — or $29 founding — the commission is`);
 console.log(`  ${(commission / 49).toFixed(1)}x the list price and ${(commission / 29).toFixed(1)}x the founding price.`);
 console.log(`  Discounting the subscription to win the contract is cheap. The GMV is the business.`);

 console.log(`\n════ Per store, per month ════`);
 console.log(`  (LINQ amortised across ${payingStores} Growth+Pro stores = ${usd(LINQ_MONTHLY / payingStores)} each)\n`);
 const linqShare = LINQ_MONTHLY / payingStores;
 for (const price of ["list", "founding"] as const) {
  console.log(`  ── at ${price} price, store using its FULL allowance ──`);
  console.log(`  tier      sub   +1% GMV   revenue    AI cost   LINQ    total cost   margin`);
  for (const t of TIERS) {
   const sub = t[price];
   const rev = sub + commission;
   const ai = t.cap * PER_LISTING;
   const linq = t.txt > 0 ? linqShare : 0;
   const cost = ai + linq;
   console.log(
    `  ${t.name.padEnd(8)} ${usd(sub).padStart(6)} ${usd(commission).padStart(8)} ${usd(rev).padStart(9)}  ${usd(ai).padStart(8)} ${usd(linq).padStart(6)} ${usd(cost).padStart(11)}   ${String(Math.round((100 * (rev - cost)) / rev)).padStart(3)}%`,
   );
  }
  console.log("");
 }

 console.log(`════ The fixed cost is the one that bites early ════\n`);
 console.log(`  LINQ is ${usd(LINQ_MONTHLY)}/month regardless of how many stores use it.\n`);
 console.log(`  Growth+Pro stores   cost each   as % of a $49 founding Growth subscription`);
 for (const n of [5, 10, 20, 30, 50, 100]) {
  const each = LINQ_MONTHLY / n;
  console.log(`  ${String(n).padStart(3)}                 ${usd(each).padStart(7)}          ${String(Math.round((100 * each) / 49)).padStart(3)}%`);
 }
 console.log(`\n  Capacity is not the constraint: ${LINQ_MESSAGES.toLocaleString()} messages ÷ ~${MESSAGES_PER_LISTING} per`);
 console.log(`  text-to-list = ~${Math.floor(LINQ_MESSAGES / MESSAGES_PER_LISTING).toLocaleString()} listings a month on one line. Every Growth and Pro`);
 console.log(`  store could max out and you would still be nowhere near it. You are buying access,`);
 console.log(`  not volume — so the only question is how many stores share the ${usd(LINQ_MONTHLY)}.`);
 console.log(`\n  Plus ${usd(LINQ_SETUP)} setup, one-off.`);

 console.log(`\n════ If ghost mannequin comes back ════\n`);
 for (const t of TIERS) {
  const rev = t.founding + commission;
  const extra = t.cap * (PER_LISTING_GHOST - PER_LISTING);
  console.log(`  ${t.name.padEnd(8)} +${usd(extra).padStart(6)}/month at founding price → margin ${Math.round((100 * (rev - t.cap * PER_LISTING_GHOST - (t.txt ? linqShare : 0))) / rev)}%`);
 }
 console.log("");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
