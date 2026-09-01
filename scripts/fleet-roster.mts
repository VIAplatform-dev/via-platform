/**
 * The stores the fleet checks, one per line.
 *
 *   node --env-file=.env.local --experimental-strip-types scripts/fleet-roster.mts
 *
 * Exists so the shell script and every checker read the SAME roster. Two captures are the same shop
 * imported twice; see app/lib/fleet-roster.ts for which and why.
 */
import { neon } from "@neondatabase/serverless";
import { fleetStores, EXCLUDED_STORES } from "../app/lib/fleet-roster.ts";

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL!);
const all = (await sql`SELECT DISTINCT store_slug s FROM site_captures ORDER BY store_slug`) as { s: string }[];
const keep = fleetStores(all.map((r) => r.s));
if (process.argv.includes("--why")) {
 for (const [slug, why] of EXCLUDED_STORES) console.error(`skipped ${slug}: ${why}`);
 console.error(`${keep.length} of ${all.length} stores`);
}
console.log(keep.join(process.argv.includes("--lines") ? "\n" : " "));
