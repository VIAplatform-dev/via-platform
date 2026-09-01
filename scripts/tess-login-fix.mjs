// Give the pilot seller a login that lands on her HOSTED store, not her marketplace listing.
//
// Her two identities: the curated marketplace record is `tess-elizabeth-vintage` (app/lib/stores.ts),
// her hosted site is `tesselizabethvintage` (the vyasites.com host label IS the slug). Sign-in used
// to resolve from storeContactEmails, which only knows the first — so she'd land in a store with no
// captured site, and the import screen would offer to crawl one.
//
// Fixed in two halves: resolveStoreSlug now consults store_users BEFORE the hardcoded map
// (app/lib/storeAuth.ts), and this adds her row. storeContactEmails is left alone on purpose — it is
// also the address book for store emails and the roster the sourcing/digest crons iterate, so
// editing it to fix a login would quietly edit all three.
//
// Idempotent: ON CONFLICT DO UPDATE, same as addStoreUser. Safe to run twice.
//
//   node --env-file=.env.local scripts/tess-login-fix.mjs          # show what would change
//   node --env-file=.env.local scripts/tess-login-fix.mjs --write  # do it

import { neon } from "@neondatabase/serverless";

const SLUG = "tesselizabethvintage";
const EMAIL = "hello@tesselizabeth.com";
const WRITE = process.argv.includes("--write");

const sql = neon(process.env.DATABASE_URL);

await sql`CREATE TABLE IF NOT EXISTS store_users (
 id SERIAL PRIMARY KEY,
 store_slug TEXT NOT NULL,
 email TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'owner',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (store_slug, email)
)`;

async function show(label) {
 const rows = await sql`SELECT id, store_slug, email, role FROM store_users
                        WHERE lower(email) = lower(${EMAIL})
                           OR store_slug IN (${SLUG}, ${"tess-elizabeth-vintage"})
                        ORDER BY id`;
 console.log(`\n${label} — store_users rows: ${rows.length}`);
 for (const r of rows) console.log(`   #${r.id}  ${r.store_slug}  ${r.email}  (${r.role})`);
 return rows;
}

// Sanity: the slug we're pointing her at must actually be the one holding her site.
// `site_captures` is the table the overwrite guard itself counts (listCapturePaths in
// app/lib/site-capture-db.ts) — checking any other one would prove nothing about the guard.
const [pages] = await sql`SELECT count(*)::int AS n FROM site_captures WHERE store_slug = ${SLUG}`;
const [items] = await sql`SELECT count(*)::int AS n FROM products WHERE store_slug = ${SLUG}`;
console.log(`${SLUG}: ${pages.n} captured pages, ${items.n} products`);
if (pages.n === 0) {
 console.error(`\nREFUSING: no captured pages under "${SLUG}". Check the slug before writing.`);
 process.exit(1);
}

await show("before");

if (!WRITE) {
 console.log(`\nDry run. Would add: ${EMAIL} -> ${SLUG} (owner)`);
 console.log("Re-run with --write to apply.");
 process.exit(0);
}

await sql`INSERT INTO store_users (store_slug, email, role)
          VALUES (${SLUG}, ${EMAIL.trim().toLowerCase()}, 'owner')
          ON CONFLICT (store_slug, email) DO UPDATE SET role = 'owner'`;

await show("after");
console.log(`\nDone. ${EMAIL} now signs in to ${SLUG}.`);
