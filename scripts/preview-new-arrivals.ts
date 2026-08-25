/**
 * Send yourself the New Arrivals email exactly as the cron would build it — using the code in THIS
 * working tree, before anything is deployed.
 *
 * The admin test-send endpoint can only ever show you what production is already running. This
 * runs the local code, so a layout change can be seen in a real inbox before it ships.
 *
 * Reads products and the stored subject from the database; writes nothing. Sends one email.
 *
 * Run: npx tsx --env-file=.env.local scripts/preview-new-arrivals.ts you@example.com
 */
import { neon } from "@neondatabase/serverless";
import { sendNewArrivalsEmail, NEW_ARRIVALS_SUBJECT_KEY, NEW_ARRIVALS_ITEM_COUNT } from "../app/lib/email";
import { getEmailPickProducts } from "../app/lib/editors-picks-db";
import { getSetting } from "../app/lib/settings-db";
import type { DBProduct } from "../app/lib/db";

async function main() {
 const to = process.argv[2];
 if (!to || !to.includes("@")) throw new Error("Pass the recipient address: scripts/preview-new-arrivals.ts you@example.com");

 const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");

 // Mirror the real send: hand-curated picks when they exist, otherwise the newest pieces.
 const picks = await getEmailPickProducts();
 const usingPicks = picks.length > 0;
 const products = usingPicks
  ? picks
  : ((await sql`
   SELECT id, store_slug, store_name, title, price, currency, image, images,
    external_url, description, variant_id, shopify_product_id,
    collabs_link, size, compare_at_price, insider_notified, synced_at, created_at
   FROM products
   WHERE image IS NOT NULL
   ORDER BY created_at DESC NULLS LAST
   LIMIT 12
  `) as unknown as DBProduct[]);

 const subject = await getSetting(NEW_ARRIVALS_SUBJECT_KEY).catch(() => null);

 console.log(`source:  ${usingPicks ? `curated picks (${picks.length})` : "newest 12 (nothing curated yet)"}`);
 console.log(`showing: the first ${Math.min(NEW_ARRIVALS_ITEM_COUNT, products.length)} of them, two across`);
 console.log(`subject: ${subject ? `"${subject}"` : '(not set — falls back to "Just in")'}`);

 const { sent, failed } = await sendNewArrivalsEmail([to], products, usingPicks, subject);
 console.log(`\nsent ${sent}, failed ${failed} → ${to}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(String(e)); process.exit(1); });
