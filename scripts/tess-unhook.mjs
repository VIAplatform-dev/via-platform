// Undo the pre-link, so the pilot seller meets the onboarding question like any new seller.
//
// The workspace only asks "build a store, or connect your website?" of someone with no store yet.
// Two things were attaching Tess to one already:
//
//   1. the store_users row added on 1 Sep (hello@tesselizabeth.com -> tesselizabethvintage)
//   2. her entry in storeContactEmails (hello@tesselizabeth.com -> tess-elizabeth-vintage)
//
// This removes (1). (2) is deliberately LEFT ALONE — she is still selling on the marketplace, and
// that map is also the address book for her offer/message emails and the roster the sourcing-alert
// and weekly-digest crons iterate. Removing it to fix a login would quietly change all three.
//
// So she signs up with a DIFFERENT email. Onboarding then derives the slug from her domain
// (tesselizabethvintage.com -> "Tesselizabethvintage" -> tesselizabethvintage), which is exactly
// where her site is already planted, so the import guard hands it straight back instead of
// re-crawling. Her marketplace login under hello@tesselizabeth.com is untouched.
//
//   node --env-file=.env.local scripts/tess-unhook.mjs           # show what would change
//   node --env-file=.env.local scripts/tess-unhook.mjs --write   # do it

import { neon } from "@neondatabase/serverless";

const SLUG = "tesselizabethvintage";
const EMAIL = "hello@tesselizabeth.com";
const WRITE = process.argv.includes("--write");

const sql = neon(process.env.DATABASE_URL);

async function show(label) {
 const rows = await sql`SELECT id, store_slug, email, role FROM store_users
                        WHERE lower(email) = lower(${EMAIL}) OR store_slug = ${SLUG}
                        ORDER BY id`;
 console.log(`\n${label} — store_users rows: ${rows.length}`);
 for (const r of rows) console.log(`   #${r.id}  ${r.store_slug}  ${r.email}  (${r.role})`);
 return rows;
}

// Her site must survive this. Deleting a login must never be able to touch the capture.
const [pages] = await sql`SELECT count(*)::int AS n FROM site_captures WHERE store_slug = ${SLUG}`;
console.log(`${SLUG}: ${pages.n} captured pages (untouched by this script)`);

await show("before");

if (!WRITE) {
 console.log(`\nDry run. Would remove: ${EMAIL} -> ${SLUG}`);
 console.log("Re-run with --write to apply.");
 process.exit(0);
}

await sql`DELETE FROM store_users WHERE store_slug = ${SLUG} AND lower(email) = lower(${EMAIL})`;

const after = await show("after");
const [pagesAfter] = await sql`SELECT count(*)::int AS n FROM site_captures WHERE store_slug = ${SLUG}`;
console.log(`\n${SLUG}: ${pagesAfter.n} captured pages still there`);
console.log(after.length === 0
 ? "\nUnhooked. A signup with an email that isn't hello@tesselizabeth.com now reaches onboarding."
 : "\nWARNING: rows remain — check them above before testing the flow.");
