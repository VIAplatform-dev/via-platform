import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Listing accuracy from SELLER EDITS — the truest ongoing accuracy signal, measured on EVERY real
// AI-assisted listing (no synthetic eval). At publish time training_examples stores the AI's guess,
// the seller's final answer, and a per-field `accepted` map (kept vs changed). We read that back and
// separate edits by what a change actually MEANS:
//   • FACTUAL (brand, category, material, era) — a change is a real correction → this is true accuracy.
//   • PRICE — acceptance = seller's final price within a ±band of the AI's market read.
//   • STYLISTIC (title, description) — edits are often voice/preference, NOT corrections → soft signal,
//     reported separately and never counted as "inaccuracy" on its own.
//   • SELLER-ONLY (condition, measurements/size) — the AI cannot observe these, so an edit is EXPECTED,
//     not a miss → excluded from the accuracy score, shown for context only.
//   /api/admin/listing-accuracy?window=all|30   (&examples=N to see actual AI-vs-seller diffs)
function isAuthorized(request: NextRequest): boolean {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) return false;
 if (request.headers.get("authorization") === `Bearer ${pw}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === crypto.createHash("sha256").update(pw).digest("hex");
}

function db() { const url = process.env.DATABASE_URL || process.env.POSTGRES_URL; if (!url) throw new Error("no db"); return neon(url); }

const pct = (kept: number, total: number) => (total > 0 ? Math.round((kept / total) * 1000) / 10 : null);
const field = (kept: number, total: number) => ({ kept, changed: total - kept, total, keptPct: pct(kept, total) });

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const q = new URL(request.url).searchParams;
 const windowParam = q.get("window") || "all";
 const days = windowParam === "all" ? null : Math.max(1, Number(windowParam) || 30);
 const examples = Math.max(0, Math.min(50, Number(q.get("examples")) || 0));
 const cutoff = days != null ? new Date(Date.now() - days * 86_400_000).toISOString() : "1970-01-01T00:00:00Z";
 const sql = db();

 try {
  const rows = (await sql`
   SELECT
    COUNT(*)::int AS listings,
    COUNT(*) FILTER (WHERE ai_brand IS NOT NULL AND ai_brand <> '')::int AS brand_total,
    COUNT(*) FILTER (WHERE (accepted->>'brand') = 'true')::int AS brand_kept,
    COUNT(*) FILTER (WHERE ai_category IS NOT NULL AND ai_category <> '')::int AS category_total,
    COUNT(*) FILTER (WHERE (accepted->>'category') = 'true')::int AS category_kept,
    COUNT(*) FILTER (WHERE ai_material IS NOT NULL AND ai_material <> '')::int AS material_total,
    COUNT(*) FILTER (WHERE (accepted->>'material') = 'true')::int AS material_kept,
    COUNT(*) FILTER (WHERE ai_era IS NOT NULL AND ai_era <> '')::int AS era_total,
    COUNT(*) FILTER (WHERE (accepted->>'era') = 'true')::int AS era_kept,
    -- Coverage: the seller ENDED UP with a value (filled), and the AI ABSTAINED (returned null) on it.
    -- An abstention on a field the seller then filled is a real miss the old headline hid.
    COUNT(*) FILTER (WHERE brand IS NOT NULL AND brand <> '')::int AS brand_filled,
    COUNT(*) FILTER (WHERE (ai_brand IS NULL OR ai_brand = '') AND brand IS NOT NULL AND brand <> '')::int AS brand_abstained,
    COUNT(*) FILTER (WHERE category IS NOT NULL AND category <> '')::int AS category_filled,
    COUNT(*) FILTER (WHERE (ai_category IS NULL OR ai_category = '') AND category IS NOT NULL AND category <> '')::int AS category_abstained,
    COUNT(*) FILTER (WHERE material IS NOT NULL AND material <> '')::int AS material_filled,
    COUNT(*) FILTER (WHERE (ai_material IS NULL OR ai_material = '') AND material IS NOT NULL AND material <> '')::int AS material_abstained,
    COUNT(*) FILTER (WHERE era IS NOT NULL AND era <> '')::int AS era_filled,
    COUNT(*) FILTER (WHERE (ai_era IS NULL OR ai_era = '') AND era IS NOT NULL AND era <> '')::int AS era_abstained,
    COUNT(*) FILTER (WHERE (market_cents IS NULL OR market_cents = 0) AND price_cents > 0)::int AS price_no_read,
    COUNT(*) FILTER (WHERE ai_title IS NOT NULL AND ai_title <> '')::int AS title_total,
    COUNT(*) FILTER (WHERE (accepted->>'title') = 'true')::int AS title_kept,
    COUNT(*) FILTER (WHERE ai_description IS NOT NULL AND ai_description <> '')::int AS description_total,
    COUNT(*) FILTER (WHERE (accepted->>'description') = 'true')::int AS description_kept,
    COUNT(*) FILTER (WHERE ai_condition IS NOT NULL AND ai_condition <> '')::int AS condition_total,
    COUNT(*) FILTER (WHERE (accepted->>'condition') = 'true')::int AS condition_kept,
    COUNT(*) FILTER (WHERE market_cents > 0 AND price_cents > 0)::int AS price_graded,
    COUNT(*) FILTER (WHERE market_cents > 0 AND price_cents > 0 AND abs(price_cents - market_cents)::float / market_cents <= 0.10)::int AS price_w10,
    COUNT(*) FILTER (WHERE market_cents > 0 AND price_cents > 0 AND abs(price_cents - market_cents)::float / market_cents <= 0.20)::int AS price_w20,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(price_cents - market_cents)::float / NULLIF(market_cents, 0)) FILTER (WHERE market_cents > 0 AND price_cents > 0) AS price_median_delta
   FROM training_examples
   WHERE source = 'intake' AND created_at >= ${cutoff}
  `) as Array<Record<string, number>>;
  const a = rows[0] || ({} as Record<string, number>);

  // Coverage-aware per-field metric. `filled` = listings that ended with a real value (the honest
  // denominator). effectiveKeptPct = kept / filled (an ABSTENTION counts as a miss). precisionWhenGuessed
  // = the old flattering number (kept only among the times it actually guessed). coveragePct = how
  // often it even proposed a value on listings that needed one.
  const factualField = (kept: number, filled: number, abstained: number) => {
   const guessed = filled - abstained; // rows where the AI proposed a value AND the seller had one
   const changed = guessed - kept;
   return {
    effectiveKeptPct: pct(kept, filled),        // the honest number
    precisionWhenGuessed: pct(kept, guessed),   // when it wasn't null, how often right
    coveragePct: pct(guessed, filled),          // how often it even ventured a guess
    kept, changed: Math.max(0, changed), abstained, filled,
   };
  };
  const factualKept = (a.brand_kept || 0) + (a.category_kept || 0) + (a.material_kept || 0) + (a.era_kept || 0);
  const factualFilled = (a.brand_filled || 0) + (a.category_filled || 0) + (a.material_filled || 0) + (a.era_filled || 0);
  const factualAbstained = (a.brand_abstained || 0) + (a.category_abstained || 0) + (a.material_abstained || 0) + (a.era_abstained || 0);

  let missExamples: unknown[] = [];
  if (examples > 0) {
   const ex = (await sql`
    SELECT store_slug, item_ref, ai_brand, brand, ai_category, category, ai_title, title, ai_era, era, market_cents, price_cents, reverse_image
    FROM training_examples
    WHERE source = 'intake' AND created_at >= ${cutoff}
     AND ( (ai_brand IS NULL OR ai_brand = '') AND brand IS NOT NULL AND brand <> ''
        OR (accepted->>'brand') = 'false' OR (accepted->>'category') = 'false' OR (accepted->>'era') = 'false'
        OR (market_cents > 0 AND price_cents > 0 AND abs(price_cents - market_cents)::float / market_cents > 0.15) )
    ORDER BY created_at DESC LIMIT ${examples}
   `) as Array<Record<string, unknown>>;
   missExamples = ex.map((r) => {
    // When brand was null but the seller supplied one, expose WHY: did reverse-image fire, and what
    // did it find? reverse_image = null → Lens never ran (comps disabled / not needed at the time);
    // present but no brand → Lens ran but didn't reach a brand consensus.
    const ri = (typeof r.reverse_image === "string" ? (() => { try { return JSON.parse(r.reverse_image as string); } catch { return null; } })() : r.reverse_image) as { matches?: number; brand?: string | null; hits?: number; sampleTitles?: string[] } | null;
    const brandAbstained = (!r.ai_brand || String(r.ai_brand).trim() === "") && !!r.brand;
    return {
     store: r.store_slug, item: r.item_ref,
     brand: r.ai_brand !== r.brand ? { ai: r.ai_brand, seller: r.brand } : undefined,
     category: r.ai_category !== r.category ? { ai: r.ai_category, seller: r.category } : undefined,
     era: r.ai_era !== r.era ? { ai: r.ai_era, seller: r.era } : undefined,
     title: r.ai_title !== r.title ? { ai: r.ai_title, seller: r.title } : undefined,
     price: r.market_cents && r.price_cents ? { aiMarketUsd: Math.round(Number(r.market_cents) / 100), sellerUsd: Math.round(Number(r.price_cents) / 100) } : undefined,
     brandIdDebug: brandAbstained ? { reverseImageFired: !!ri, lensBrandFound: ri?.brand ?? null, lensHits: ri?.hits ?? 0, lensMatches: ri?.matches ?? 0, sampleTitles: ri?.sampleTitles?.slice(0, 4) ?? [] } : undefined,
    };
   });
  }

  return NextResponse.json({
   window: days == null ? "all-time" : `last ${days} days`,
   totalAiListings: a.listings || 0,
   note: (a.listings || 0) < 30 ? "Small sample — read these as directional, not settled, until more listings accrue." : undefined,

   // THE HEADLINE: factual fields the AI must get right — now counting ABSTENTIONS as misses.
   // A field the AI left null that the seller then filled is a coverage failure, not a free pass.
   accuracy: {
    headlineKeptPct: pct(factualKept, factualFilled), // honest: right answer out of all that needed one
    kept: factualKept, filled: factualFilled, abstained: factualAbstained,
    abstentionRatePct: pct(factualAbstained, factualFilled),
    byField: {
     brand: factualField(a.brand_kept || 0, a.brand_filled || 0, a.brand_abstained || 0),
     category: factualField(a.category_kept || 0, a.category_filled || 0, a.category_abstained || 0),
     material: factualField(a.material_kept || 0, a.material_filled || 0, a.material_abstained || 0),
     era: factualField(a.era_kept || 0, a.era_filled || 0, a.era_abstained || 0),
    },
    meaning: "effectiveKeptPct = the AI gave the right answer, out of all listings that ended with one. An ABSTENTION (AI returned null, seller filled it in) now counts as a miss — that's the coverage gap the old headline hid. precisionWhenGuessed is the flattering 'when it did guess' number.",
   },

   price: {
    graded: a.price_graded || 0,
    keptWithin10Pct: pct(a.price_w10 || 0, a.price_graded || 0),
    keptWithin20Pct: pct(a.price_w20 || 0, a.price_graded || 0),
    medianSellerDeltaPct: a.price_median_delta != null ? Math.round(Number(a.price_median_delta) * 1000) / 10 : null,
    noReadButSellerPriced: a.price_no_read || 0, // AI returned no market read yet the seller priced it — usually a brand-ID miss upstream
    meaning: "How often the seller kept the AI's price within a ±band. Some drift is the store's own markup, not an AI miss. `noReadButSellerPriced` counts listings the AI couldn't price — almost always because brand-ID abstained upstream.",
   },

   stylistic: {
    title: field(a.title_kept || 0, a.title_total || 0),
    description: field(a.description_kept || 0, a.description_total || 0),
    meaning: "SOFT signal — title/description edits are often voice/style (e.g. dropping 'Y2K'), NOT corrections. Do not read a low % here as inaccuracy.",
   },

   sellerCompleted: {
    condition: field(a.condition_kept || 0, a.condition_total || 0),
    meaning: "EXCLUDED from accuracy — the AI can't observe true condition/measurements, so seller edits here are expected, not misses.",
   },

   ...(examples > 0 ? { misses: missExamples } : {}),
  });
 } catch (e) {
  return NextResponse.json({ error: String(e) }, { status: 500 });
 }
}
