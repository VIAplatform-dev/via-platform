/**
 * Does every captured store have a SELLER record under the same slug?
 *
 *   node --env-file=.env.local --experimental-strip-types scripts/audit-store-slugs.mts
 *
 * Plan B resolves the store from the HOST: `loved-again.vyasites.test` → slug `loved-again` →
 * getSellerBySlug('loved-again'). If no seller row carries that exact slug, every cart call on that
 * store's domain answers "Unknown store." — Add to cart, the drawer, the lot. The capture renders
 * perfectly, so the storefront looks completely fine right up until someone tries to buy.
 *
 * site_captures.store_slug and sellers.slug are set by different code paths, so they can drift. This
 * reports every captured store, whether a seller matches, and the nearest slugs when one doesn't.
 *
 * READ-ONLY: SELECTs only, no network.
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
 console.error("DATABASE_URL (or POSTGRES_URL) is not set. Run with: node --env-file=.env.local …");
 process.exit(1);
}
const sql = neon(url);


/** Crude closeness, only good enough to suggest "did you mean" — shared prefix, then shared words. */
function nearest(target: string, pool: string[]): string[] {
 const words = new Set(target.split("-").filter(Boolean));
 return pool
  .map((s) => {
   let score = 0;
   for (const w of s.split("-")) if (words.has(w)) score += 2;
   let i = 0;
   while (i < Math.min(s.length, target.length) && s[i] === target[i]) i++;
   return { s, score: score + i / 10 };
  })
  .filter((x) => x.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 3)
  .map((x) => x.s);
}

async function main() {
 const captured = (await sql`
  SELECT store_slug, COUNT(*)::int AS pages FROM site_captures GROUP BY store_slug ORDER BY store_slug
 `) as { store_slug: string; pages: number }[];
 const sellerRows = (await sql`SELECT slug, name FROM sellers ORDER BY slug`) as { slug: string; name: string | null }[];

 const sellerSlugs = new Set(sellerRows.map((s) => s.slug));
 const pool = sellerRows.map((s) => s.slug);

 console.log(`\n${captured.length} captured stores, ${sellerRows.length} seller records.\n`);
 console.log("CAPTURE SLUG".padEnd(30), "PAGES", " SELLER?", " NOTES");
 console.log("-".repeat(110));

 const broken: string[] = [];
 for (const c of captured) {
  const ok = sellerSlugs.has(c.store_slug);
  if (!ok) broken.push(c.store_slug);
  const note = ok
   ? (sellerRows.find((s) => s.slug === c.store_slug)?.name || "")
   : `NO SELLER — nearest: ${nearest(c.store_slug, pool).join(", ") || "(nothing close)"}`;
  console.log(c.store_slug.padEnd(30), String(c.pages).padStart(5), ok ? "   yes  " : "   NO   ", " " + note);
 }

 console.log(`\n${"-".repeat(110)}`);
 if (broken.length) {
  console.log(`\n${broken.length} captured store(s) have NO matching seller record.`);
  console.log(`On these, every Plan B cart call answers "Unknown store." — the storefront renders, but nothing can be bought:\n`);
  for (const b of broken) console.log(`  • ${b}`);
 } else {
  console.log("\nEvery captured store has a matching seller record.");
 }

 // The reverse direction is worth knowing too: a seller with no capture has no storefront to sell from.
 const capturedSet = new Set(captured.map((c) => c.store_slug));
 const noCapture = sellerRows.filter((s) => !capturedSet.has(s.slug));
 console.log(`\n\nSELLERS WITH NO CAPTURED STOREFRONT: ${noCapture.length} of ${sellerRows.length}`);
 if (noCapture.length) console.log(noCapture.map((s) => `  • ${s.slug}${s.name ? ` (${s.name})` : ""}`).join("\n"));

 console.log("\nDone. Read-only — nothing was written.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
