/**
 * Does the cross-listing board tell the truth about eBay?
 *
 *   npm run ebay:audit
 *   npm run ebay:audit -- --store tesselizabethvintage
 *
 * WHY THIS EXISTS. The board says "Listed" because that is what our publish call returned at the
 * time. That is not the same as the listing being live now, and the gap has three shapes:
 *
 *   · publish answered 200 but gave back no listingId  → recorded listed, no link, nothing live
 *   · the offer exists but was never published         → recorded listed, sits UNPUBLISHED on eBay
 *   · the listing was ended on eBay's side afterwards  → recorded listed, long gone
 *
 * All three read identically to a seller: a green tick against a piece that is not on eBay. She
 * trusts it and stops checking, which is worse than an error would have been.
 *
 * This asks eBay for the real state of every SKU the board claims, and prints the disagreements.
 * Read-only — it publishes nothing, ends nothing and changes no rows.
 */

import { neon } from "@neondatabase/serverless";
import { ebayOfferStatus } from "../app/lib/ebay.ts";

const argv = process.argv.slice(2);
const at = argv.indexOf("--store");
const SLUG = at >= 0 ? (argv[at + 1] || "").trim() : "via-admin";

const sql = neon(process.env.DATABASE_URL!);

// Joined to the item so a failure can be read against what was actually sent. "Why did this one
// work and not that one" is either the piece or the clock, and without the brand and the timestamp
// side by side you cannot tell which.
const rows = (await sql`
 SELECT c.item_id, c.status, c.external_url, c.updated_at,
        i.title, i.brand, i.category
 FROM cross_listings c
 LEFT JOIN items i ON i.id::text = c.item_id
 WHERE c.store_slug = ${SLUG} AND c.platform = 'ebay'
 ORDER BY c.updated_at DESC
`) as { item_id: string; status: string; external_url: string | null; updated_at: string;
        title: string | null; brand: string | null; category: string | null }[];

console.log(`\ncross_listings — store "${SLUG}", platform eBay: ${rows.length} row(s)\n`);
if (!rows.length) {
 console.log("  (none — nothing has been pushed to eBay from this store)\n");
 process.exit(0);
}

let disagreements = 0;

for (const r of rows) {
 const live = await ebayOfferStatus(SLUG, r.item_id);
 const vyaSaysListed = r.status === "listed";

 let verdict: string;
 if (!live.ok) verdict = `could not ask eBay — ${live.error}`;
 else if (!live.found) verdict = "eBay has NO offer for this SKU";
 else verdict = `eBay: offer ${live.status}${live.listingStatus ? ` · listing ${live.listingStatus}` : ""}${live.listingId ? ` · ${live.listingId}` : ""}`;

 // A shopper can buy it only if the LISTING is active. The offer staying PUBLISHED after its
 // listing ended is exactly the false-green this script exists to catch.
 const agrees = live.ok && live.found && live.status === "PUBLISHED" && live.listingStatus === "ACTIVE";
 const bad = vyaSaysListed && !agrees;
 if (bad) disagreements++;

 const when = new Date(r.updated_at).toISOString().replace("T", " ").slice(0, 19);
 console.log(`  ${bad ? "MISMATCH" : "ok      "}  ${when}  ${r.title || r.item_id}`);
 // Distinguish "the item says no brand" from "we never found the item". An empty column that
 // means both is worse than no column: it reads as fact and sends you to fix the wrong thing.
 console.log(r.title === null
  ? `            (no matching row in items for this id — brand/category unknown)`
  : `            brand: ${r.brand || "(none set)"}    category: ${r.category || "(none set)"}`);
 console.log(`            VYA says: ${r.status}${r.external_url ? ` (${r.external_url})` : " (no link stored)"}`);
 console.log(`            ${verdict}`);
}

console.log(
 disagreements
  ? `\n  ${disagreements} row(s) claim "Listed" that eBay does not have live. That is the bug — the board\n  is reporting what our call returned, not what eBay ended up with.\n`
  : `\n  Every "Listed" row is genuinely live on eBay.\n`
);
