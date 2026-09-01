/**
 * Is eBay cross-listing actually working, right now, for a real store?
 *
 *   node --env-file=.env.local --import tsx scripts/ebay-check.mts
 *   …--store tesselizabethvintage      a specific store (default: via-admin)
 *
 * Run with tsx, not --experimental-strip-types: app/lib/ebay.ts imports its siblings without file
 * extensions, which Next resolves and bare Node does not. The same reason scripts/repair-store.mts
 * uses it.
 *
 * WHY THIS EXISTS. "eBay is connected" is four separate things, and any one of them being false
 * means a listing fails at publish with an error eBay words for developers, not for sellers:
 *
 *   1. app keys on the server            — without these nothing can authenticate at all
 *   2. a valid token for THIS store      — expired refresh tokens look identical to "not connected"
 *   3. seller registration completed     — a buyer-only account connects fine and can never list
 *   4. three business policies           — payment, returns, fulfillment; eBay requires all three
 *   5. a ship-from inventory location    — missing one fails at publish with error 25002
 *
 * This runs every check against eBay's LIVE API and prints which one is false, so the answer is
 * "returns policy is missing" rather than "it didn't work".
 *
 * It does NOT create a listing. Publishing a real piece to a real eBay account puts something in
 * front of real buyers, and that is a decision to take deliberately, not a side effect of a check.
 */

import { testEbayConnection } from "../app/lib/ebay.ts";

const argv = process.argv.slice(2);
const at = argv.indexOf("--store");
const SLUG = at >= 0 ? (argv[at + 1] || "").trim() : "via-admin";
if (!SLUG) { console.error("Usage: --store <slug>"); process.exit(1); }

const tick = (ok: boolean) => (ok ? "OK  " : "FAIL");

console.log(`\neBay readiness — store "${SLUG}"\n`);

const r = await testEbayConnection(SLUG);

console.log(`  ${tick(r.configured)}  app keys are set on this server`);
console.log(`  ${tick(r.tokenValid)}  a valid eBay token for this store`);
if (!r.tokenValid) {
 console.log(`\n  ${r.error || "No token."}`);
 console.log(`  Nothing further can be checked without one — connect eBay in Cross-listing → Marketplaces.\n`);
 process.exit(1);
}
console.log(`  ${tick(r.sellerRegistered)}  the connected account is a registered SELLER`);
console.log(`  ${tick(r.policies.payment)}  payment policy`);
console.log(`  ${tick(r.policies.return)}  return policy`);
console.log(`  ${tick(r.policies.fulfillment)}  fulfillment (shipping) policy`);
console.log(`  ${tick(r.hasLocation)}  ship-from inventory location`);
console.log(`\n  marketplace: ${r.marketplace}`);

if (r.debug) {
 console.log(`\n  what eBay actually answered:`);
 for (const [name, d] of Object.entries(r.debug)) {
  console.log(`    ${name.padEnd(12)} HTTP ${d.status}  ${d.count} found${d.error ? `  — ${d.error}` : ""}`);
 }
}

console.log(
 r.readyToList
  ? `\n  READY. This store can list to eBay. The remaining unknown is a real publish, which this\n  script deliberately does not do.\n`
  : `\n  NOT READY: ${r.error}\n`
);
process.exit(r.readyToList ? 0 : 1);
