// Read-only. Answers one question: when Tess types tesselizabethvintage.com into the onboarding
// wizard, will she get her planted site back — or a cold crawl?
//
// The whole flow hinges on the slug coming out as exactly `tesselizabethvintage`, because that is
// where her site is filed. generateUniqueSlug (app/lib/store-accounts-db.ts) takes the domain-derived
// name and appends -2, -3… if that slug is already taken by the curated marketplace or by an
// existing store_account. A collision would silently hand her `tesselizabethvintage-2`, which has no
// captured pages, so the import guard would let a fresh crawl run.
//
//   node --env-file=.env.local scripts/tess-preflight.mjs

import { neon } from "@neondatabase/serverless";

const SLUG = "tesselizabethvintage";
const sql = neon(process.env.DATABASE_URL);
let ok = true;
const say = (pass, line) => { if (!pass) ok = false; console.log(`  ${pass ? "OK  " : "FAIL"}  ${line}`); };

console.log(`\nPreflight for ${SLUG}\n`);

const [pages] = await sql`SELECT count(*)::int AS n FROM site_captures WHERE store_slug = ${SLUG}`;
say(pages.n > 0, `her site is filed here — ${pages.n} captured pages`);

const [items] = await sql`SELECT count(*)::int AS n FROM items i JOIN sellers s ON s.id = i.seller_id WHERE s.slug = ${SLUG}`;
say(items.n > 0, `her inventory is filed here — ${items.n} items`);

// The one that would silently break it: a taken slug pushes her to `${SLUG}-2`.
const acct = await sql`SELECT slug, owner_email FROM store_accounts WHERE slug LIKE ${SLUG + "%"}`;
say(acct.length === 0, acct.length === 0
 ? `no store_account claims "${SLUG}" — the wizard will use it verbatim`
 : `store_account ALREADY claims it: ${acct.map((a) => `${a.slug} (${a.owner_email})`).join(", ")} — she would get "${SLUG}-2" and a cold crawl`);

const users = await sql`SELECT email FROM store_users WHERE store_slug = ${SLUG}`;
say(users.length === 0, users.length === 0
 ? "nobody is attached yet — she will reach the onboarding question"
 : `already attached to ${users.map((u) => u.email).join(", ")} — she would skip onboarding`);

console.log(ok
 ? "\nReady. She types tesselizabethvintage.com and gets her site back, no crawl.\n"
 : "\nNOT ready — fix the FAIL lines above before she signs up.\n");
process.exit(ok ? 0 : 1);
