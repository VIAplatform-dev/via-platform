// Read-only. Which email signs in to which store, and why.
//
// The workspace resolves the acting store in this order (app/lib/storeAuth.ts):
//   1. ?store=<slug>          — only with the owner's admin cookie
//   2. the signed-in SESSION  — store_users first, then the hardcoded storeContactEmails map
//   3. the admin cookie       — falls back to via-admin
//
// Step 2 beating step 3 is the trap: while a browser holds ANY seller session, the owner cannot act
// as via-admin, whichever email they signed in with. Signing out is what makes the owner the owner.
//
//   node --env-file=.env.local scripts/who-owns-what.mjs
//   node --env-file=.env.local scripts/who-owns-what.mjs --forget you@example.com --write

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const forgetAt = argv.indexOf("--forget");
const FORGET = forgetAt >= 0 ? (argv[forgetAt + 1] || "").trim().toLowerCase() : null;

const users = await sql`SELECT store_slug, email, role, created_at FROM store_users ORDER BY created_at`;
console.log(`\nstore_users — every self-onboarded login (${users.length})\n`);
if (!users.length) console.log("   (none)");
for (const u of users) {
 const [pages] = await sql`SELECT count(*)::int AS n FROM site_captures WHERE store_slug = ${u.store_slug}`;
 const [items] = await sql`SELECT count(*)::int AS n FROM items i JOIN sellers s ON s.id = i.seller_id WHERE s.slug = ${u.store_slug}`;
 console.log(`   ${u.email}`);
 console.log(`      -> ${u.store_slug}  (${u.role})   ${pages.n} captured pages, ${items.n} items`);
}

const accounts = await sql`SELECT slug, name, owner_email, created_at FROM store_accounts ORDER BY created_at`;
console.log(`\nstore_accounts — every store created through onboarding (${accounts.length})\n`);
if (!accounts.length) console.log("   (none)");
for (const a of accounts) console.log(`   ${a.slug.padEnd(28)} ${String(a.name).padEnd(24)} ${a.owner_email}`);

if (!FORGET) {
 console.log(`\nTo make a browser act as the OWNER again: sign out of the seller session in it.`);
 console.log(`To drop a test login entirely:  --forget <email> --write\n`);
 process.exit(0);
}

const mine = users.filter((u) => u.email.toLowerCase() === FORGET);
console.log(`\n--forget ${FORGET}: ${mine.length} row(s)`);
for (const m of mine) console.log(`   ${m.email} -> ${m.store_slug}`);
if (!mine.length) process.exit(0);

// Refuse to unhook an email from a store that has a real site behind it. Losing the only login to a
// hosted storefront is not a thing to do by accident while tidying up test data.
for (const m of mine) {
 const [pages] = await sql`SELECT count(*)::int AS n FROM site_captures WHERE store_slug = ${m.store_slug}`;
 if (pages.n > 0) {
  console.error(`\nREFUSING: ${m.store_slug} has ${pages.n} captured pages — that is a real site, not test data.`);
  process.exit(1);
 }
}

if (!WRITE) { console.log("\nDry run. Add --write to remove these logins."); process.exit(0); }
await sql`DELETE FROM store_users WHERE lower(email) = ${FORGET}`;
const left = await sql`SELECT store_slug FROM store_users WHERE lower(email) = ${FORGET}`;
console.log(left.length === 0
 ? `\nRemoved. ${FORGET} no longer signs in to any store — sign out and back in, and that browser is the owner again.`
 : `\nWARNING: ${left.length} row(s) remain.`);
