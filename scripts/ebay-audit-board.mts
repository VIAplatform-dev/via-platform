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
const ae = argv.indexOf("--email");

const sql = neon(process.env.DATABASE_URL!);

// --email, because the person asking "did my listing go up" knows their email and has no reason to
// know their store's slug.
let SLUG = at >= 0 ? (argv[at + 1] || "").trim() : "";
if (!SLUG && ae >= 0) {
 const email = (argv[ae + 1] || "").trim().toLowerCase();
 const found = (await sql`SELECT store_slug FROM store_users WHERE lower(email) = ${email} LIMIT 1`) as { store_slug: string }[];
 if (!found.length) { console.error(`\nNo store is attached to ${email}.\n`); process.exit(1); }
 SLUG = found[0].store_slug;
 console.log(`\n${email} → store "${SLUG}"`);
}
if (!SLUG) SLUG = "via-admin";

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

// WHICH eBay account answered. Every check here runs on this store's token, so "eBay says ACTIVE"
// means active on THIS account — which is a different sentence from "active on the account you are
// looking at". When a listing is confirmed live and the seller cannot find it, that gap is usually
// the whole explanation.
let ebayUser: string | null = null;
try {
 const tok = (await sql`SELECT ebay_user FROM ebay_tokens WHERE store_slug = ${SLUG} LIMIT 1`) as { ebay_user: string | null }[];
 ebayUser = tok[0]?.ebay_user ?? null;
} catch { /* the table may not exist on a store that has never connected eBay */ }
console.log(`\neBay account connected to this store: ${ebayUser || "(none recorded)"}`);

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
