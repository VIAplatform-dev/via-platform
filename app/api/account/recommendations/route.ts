import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { neon } from "@neondatabase/serverless";
import { inferColorFromTitle, inferCategoryFromTitle } from "@/app/lib/loadStoreProducts";
import type { CategorySlug } from "@/app/lib/categoryMap";

// Category → representative title keywords for SQL matching.
// Kept intentional: broad enough to catch most items in a category,
// narrow enough not to match unrelated things.
const CATEGORY_SQL_KEYWORDS: Record<string, string[]> = {
  shoes:           ["heel", "pump", "sandal", "boot", "bootie", "mule", "loafer", "sneaker", "flat", "slide", "wedge", "slingback", "oxford", "blahnik", "louboutin", "stiletto", "shoe"],
  bags:            ["bag", "clutch", "tote", "handbag", "crossbody", "satchel", "purse", "backpack", "baguette", "wallet", "pochette", "hobo"],
  dresses:         ["dress", "gown", "kaftan", "caftan", "sundress"],
  skirts:          ["skirt"],
  tops:            ["blouse", "shirt", "tee", "t-shirt", "top", "bodysuit", "cami", "tank", "corset", "bustier"],
  pants:           ["pants", "trousers", "chino", "jogger", "legging", "culottes"],
  jeans:           ["jeans", "denim"],
  "coats-jackets": ["jacket", "coat", "blazer", "puffer", "bomber", "trench", "cape", "poncho"],
  sweaters:        ["sweater", "cardigan", "knit", "pullover", "hoodie", "sweatshirt"],
  shorts:          ["shorts"],
  jumpsuits:       ["jumpsuit", "romper", "playsuit"],
  accessories:     ["belt", "scarf", "hat", "watch", "sunglasses", "necklace", "earring", "bracelet", "ring", "brooch", "bangle"],
};

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });

  const sql = neon(dbUrl);
  const userId = session.user.id;

  // 1. Fetch the user's favorited product titles
  const favRows = await sql`
    SELECT p.id, p.title
    FROM product_favorites pf
    JOIN products p ON p.id = pf.product_id
    WHERE pf.user_id = ${userId}
  `;

  if (favRows.length === 0) {
    return NextResponse.json({ products: [] });
  }

  const favProductIds = favRows.map((r) => Number(r.id));

  // 2. Infer colors and categories from favorited titles
  const colors = new Set<string>();
  const categories = new Set<CategorySlug>();

  for (const row of favRows) {
    const title = String(row.title);
    const color = inferColorFromTitle(title);
    if (color) colors.add(color);
    const category = inferCategoryFromTitle(title);
    if (category && category !== "other-clothing") categories.add(category);
  }

  // 3. Build ILIKE pattern arrays for SQL
  // Patterns are lowercase: used with lower(p.title) LIKE ANY(...)
  const colorPatterns = Array.from(colors).map((c) => `%${c}%`);

  const catKeywords = new Set<string>();
  for (const cat of categories) {
    for (const kw of CATEGORY_SQL_KEYWORDS[cat] ?? []) {
      catKeywords.add(kw);
    }
  }
  const categoryPatterns = Array.from(catKeywords).map((k) => `%${k}%`);

  // 4. Fallback: no signals at all. Return globally popular items
  if (colorPatterns.length === 0 && categoryPatterns.length === 0) {
    const rows = await sql`
      SELECT p.id, p.store_slug, p.store_name, p.title, p.price, p.currency,
             p.image, p.images, p.external_url, p.size,
             COUNT(pf2.id)::int AS fav_count
      FROM products p
      LEFT JOIN product_favorites pf2 ON pf2.product_id = p.id
      WHERE p.price > 0 AND p.image IS NOT NULL AND p.image != ''
        AND p.id != ALL(${favProductIds})
      GROUP BY p.id
      ORDER BY fav_count DESC, RANDOM()
      LIMIT 200
    `;
    return NextResponse.json({ products: rows });
  }

  // 5. Scored query: all stores, no store filter.
  //    Score = color_match×3 + category_match×2 + popularity bonus (capped at 1).
  //    A placeholder pattern that never matches is used when an array is empty
  //    so we can always pass both arrays to the same query shape.
  const safeColor = colorPatterns.length > 0 ? colorPatterns : ["%__nomatch__%"];
  const safeCat = categoryPatterns.length > 0 ? categoryPatterns : ["%__nomatch__%"];

  const rows = await sql`
    SELECT
      p.id,
      p.store_slug,
      p.store_name,
      p.title,
      p.price,
      p.currency,
      p.image,
      p.images,
      p.external_url,
      p.size,
      COUNT(pf2.id)::int AS fav_count,
      (
        CASE WHEN lower(p.title) LIKE ANY(${safeColor}::text[]) THEN 3 ELSE 0 END
        + CASE WHEN lower(p.title) LIKE ANY(${safeCat}::text[]) THEN 2 ELSE 0 END
        + LEAST(COUNT(pf2.id)::float / 10.0, 1.0)
      ) AS match_score
    FROM products p
    LEFT JOIN product_favorites pf2 ON pf2.product_id = p.id
    WHERE
      p.price > 0
      AND p.image IS NOT NULL AND p.image != ''
      AND p.id != ALL(${favProductIds})
    GROUP BY p.id
    ORDER BY match_score DESC, RANDOM()
    LIMIT 200
  `;

  return NextResponse.json({ products: rows });
}
