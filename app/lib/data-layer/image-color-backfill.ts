import { neon } from "@neondatabase/serverless";
import { identifyColor } from "./vision";
import { normalizeColor } from "../colorNormalize";

// ───────────────────────────────────────────────────────────────────────────
// Read the dominant colour off product images (vision) and store it normalized
// to the filter palette, so colour filtering works for items whose TITLE has no
// colour word. Incremental: only unprocessed products (image_color_at IS NULL);
// failures stay unprocessed and are retried next run. Shared by the admin
// backfill endpoint and the daily cron.
// ───────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

export type BackfillResult = { processed: number; colored: number; failed: number; remaining: number };

// Colour words that, when present in a title, make the TITLE authoritative for
// colour (see colorOf in FilteredProductGrid). Kept in sync with COLOR_KEYWORDS.
const TITLE_COLOR_WORDS = [
 "black", "white", "cream", "ivory", "beige", "off-white", "grey", "gray", "silver",
 "charcoal", "brown", "tan", "camel", "chocolate", "cognac", "navy", "blue", "cobalt",
 "teal", "turquoise", "red", "burgundy", "wine", "crimson", "pink", "blush", "rose",
 "fuchsia", "green", "olive", "sage", "forest", "emerald", "mint", "yellow", "mustard",
 "gold", "orange", "coral", "rust", "purple", "lilac", "lavender", "violet", "nude", "multicolor",
];

// One-time: clear the stored vision colour for products whose TITLE has no colour
// word, so the next backfill re-reads them with the hint-aware prompt (the old
// prompt coloured the whole image and could pick a model's other garment). Items
// WITH a colour word in the title are left alone. ColorOf ignores their vision
// value anyway. Returns how many were queued for re-colouring.
export async function resetTitlelessImageColors(): Promise<{ reset: number }> {
 const sql = db();
 const colorRegex = `\\y(${TITLE_COLOR_WORDS.join("|")})\\y`;
 const [{ reset }] = (await sql`
 WITH cleared AS (
 UPDATE products SET image_color = NULL, image_color_at = NULL
 WHERE image_color_at IS NOT NULL AND (title IS NULL OR title !~* ${colorRegex})
 RETURNING id
 )
 SELECT COUNT(*)::int AS reset FROM cleared
 `) as Array<{ reset: number }>;
 return { reset };
}

export async function backfillImageColors(limit: number): Promise<BackfillResult> {
 const sql = db();
 // Safe on first run. Columns may not exist yet.
 await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS image_color TEXT`;
 await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS image_color_at TIMESTAMPTZ`;

 const rows = (await sql`
 SELECT id, image, title FROM products
 WHERE image_color_at IS NULL
  AND image IS NOT NULL AND image <> '' AND image NOT ILIKE '%placeholder%'
 ORDER BY id DESC
 LIMIT ${limit}
 `) as Array<{ id: number; image: string; title: string | null }>;

 let processed = 0;
 let colored = 0;
 let failed = 0;
 // Small concurrent chunks, paced to stay under Tier-1 Anthropic rate limits
 // (a full backfill in tight bursts trips the per-minute cap). The title is passed
 // as a hint so vision colours the item being sold, not a model's other garments.
 const CONCURRENCY = 2;
 const PACE_MS = 1200; // ~100 calls/min ceiling across chunks
 for (let i = 0; i < rows.length; i += CONCURRENCY) {
 const chunk = rows.slice(i, i + CONCURRENCY);
 const results = await Promise.allSettled(
 chunk.map(async (r) => {
  const raw = await identifyColor(r.image, r.title);
  const color = normalizeColor(raw);
  await sql`UPDATE products SET image_color = ${color}, image_color_at = NOW() WHERE id = ${r.id}`;
  return color;
 }),
 );
 for (const res of results) {
 if (res.status === "fulfilled") {
  processed++;
  if (res.value) colored++;
 } else {
  failed++;
  console.error("[image-color-backfill] failed:", res.reason);
 }
 }
 if (i + CONCURRENCY < rows.length) await new Promise((r) => setTimeout(r, PACE_MS));
 }

 const [{ remaining }] = (await sql`
 SELECT COUNT(*)::int AS remaining FROM products
 WHERE image_color_at IS NULL AND image IS NOT NULL AND image <> ''
 `) as Array<{ remaining: number }>;

 return { processed, colored, failed, remaining };
}
