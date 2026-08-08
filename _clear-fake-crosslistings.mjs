// Clear the demo/pending cross-listing markers for the owner store (via-admin) so items show in
// the extension queue again. Nothing real has been published, so all via-admin rows are safe to drop.
// Run from the project root:  node --env-file=.env.local _clear-fake-crosslistings.mjs
import { neon } from "@neondatabase/serverless";
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) { console.error("No DATABASE_URL / POSTGRES_URL in env."); process.exit(1); }
const sql = neon(url);
const rows = await sql`DELETE FROM cross_listings WHERE store_slug = 'via-admin' RETURNING platform, status`
  .catch((e) => { console.error("delete failed:", e.message); return []; });
console.log(`Cleared ${rows.length} marker(s):`, rows.map((r) => `${r.platform}/${r.status}`).join(", ") || "(none)");
