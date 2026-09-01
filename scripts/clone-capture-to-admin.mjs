// Copy a captured site into the OWNER's own store, so the imported-site editor can be driven
// without touching the seller's live storefront.
//
// The workspace already has an owner preview (`?store=<slug>`, see app/lib/storeAuth.ts), but the
// storefront editor makes 30 API calls and not one of them passes it through — so previewing as her
// would render her editor shell reading YOUR empty store. Threading the parameter through all of
// them would also point every Save button at her live site, which is the last thing anyone wants
// days before handing it over.
//
// A copy has neither problem. via-admin gets its own rows, the editor opens in captured mode
// against them, and every button writes to the copy.
//
// What it does NOT copy: inventory. Items belong to a seller row, and duplicating a seller's stock
// under another slug is how you end up with two shops claiming the same one-of-a-kind piece. The
// consequence is visible and worth knowing: product prices and add-to-cart on the copy will be
// empty, because live inventory is injected at serve time and via-admin has none of hers. The
// layout, the theme, the editor rail — the things you're looking at — are faithful.
//
//   node --env-file=.env.local scripts/clone-capture-to-admin.mjs                    # show
//   node --env-file=.env.local scripts/clone-capture-to-admin.mjs --write            # copy
//   node --env-file=.env.local scripts/clone-capture-to-admin.mjs --write --force    # replace
//   node --env-file=.env.local scripts/clone-capture-to-admin.mjs --clean --write    # remove copy

import { neon } from "@neondatabase/serverless";

const FROM = process.env.CLONE_FROM || "tesselizabethvintage";
const TO = "via-admin";
const WRITE = process.argv.includes("--write");
const FORCE = process.argv.includes("--force");
const CLEAN = process.argv.includes("--clean");

const sql = neon(process.env.DATABASE_URL);
const countPages = async (slug) =>
 (await sql`SELECT count(*)::int AS n FROM site_captures WHERE store_slug = ${slug}`)[0].n;

const srcPages = await countPages(FROM);
const dstPages = await countPages(TO);
console.log(`\n${FROM}: ${srcPages} captured pages   (source — never modified)`);
console.log(`${TO}: ${dstPages} captured pages   (destination)\n`);

if (CLEAN) {
 if (!WRITE) {
  console.log(`Dry run. Would delete all ${dstPages} captured pages under ${TO}. Add --write.`);
  process.exit(0);
 }
 await sql`DELETE FROM site_captures WHERE store_slug = ${TO}`;
 console.log(`Removed. ${TO} now has ${await countPages(TO)} captured pages.`);
 console.log(`${FROM}: ${await countPages(FROM)} captured pages (untouched).`);
 process.exit(0);
}

if (srcPages === 0) {
 console.error(`REFUSING: ${FROM} has no captured pages. Wrong slug?`);
 process.exit(1);
}
if (dstPages > 0 && !FORCE) {
 console.error(`REFUSING: ${TO} already has ${dstPages} captured pages; overwriting would lose them.`);
 console.error("Add --force to replace them, or --clean --write to clear them first.");
 process.exit(1);
}

if (!WRITE) {
 console.log(`Dry run. Would copy ${srcPages} pages ${FROM} -> ${TO}${dstPages ? ` (replacing ${dstPages})` : ""}.`);
 console.log("Re-run with --write to apply.");
 process.exit(0);
}

if (dstPages > 0) await sql`DELETE FROM site_captures WHERE store_slug = ${TO}`;

// Columns listed explicitly rather than SELECT *: a column added to site_captures later should make
// this fail loudly here, not quietly copy a half-row into the owner's store.
await sql`INSERT INTO site_captures (store_slug, path, html, source_url, captured_at)
          SELECT ${TO}, path, html, source_url, captured_at
          FROM site_captures WHERE store_slug = ${FROM}
          ON CONFLICT (store_slug, path) DO UPDATE
            SET html = EXCLUDED.html, source_url = EXCLUDED.source_url`;

// The DESIGN columns only, so the editor's Design rail opens on her settings rather than defaults.
//
// Explicitly not the whole row: `handle` and `custom_domain` are both UNIQUE, so copying them would
// either fail on the constraint or — worse, if it somehow didn't — start moving her live address
// onto the owner's store. Her identity stays hers; only the look travels.
const design = await sql`SELECT theme, accent_color, tagline, hero_image, about
                         FROM storefront_settings WHERE store_slug = ${FROM} LIMIT 1`;
if (design.length) {
 const d = design[0];
 await sql`INSERT INTO storefront_settings (store_slug, handle, theme, accent_color, tagline, hero_image, about)
           VALUES (${TO}, ${"via-admin-preview"}, ${d.theme}, ${d.accent_color}, ${d.tagline}, ${d.hero_image}, ${d.about})
           ON CONFLICT (store_slug) DO UPDATE
             SET theme = EXCLUDED.theme, accent_color = EXCLUDED.accent_color,
                 tagline = EXCLUDED.tagline, hero_image = EXCLUDED.hero_image, about = EXCLUDED.about`;
 console.log("copied the design settings (theme, accent, tagline, hero, about) — not handle or domain");
} else {
 console.log("no storefront_settings row on the source — the editor will open on theme defaults");
}

console.log(`\n${TO}: ${await countPages(TO)} captured pages`);
console.log(`${FROM}: ${await countPages(FROM)} captured pages (should still read ${srcPages})`);
console.log(`\nOpen /admin/storefront — it will load the imported-site editor, not the block studio.`);
console.log(`Undo any time with:  --clean --write`);
