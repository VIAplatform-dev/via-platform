import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { neon } from "@neondatabase/serverless";
import { computeListingAccuracyMetrics } from "@/app/lib/accuracy-snapshot-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Listing accuracy from SELLER EDITS — the truest ongoing accuracy signal, measured on EVERY real
// AI-assisted listing (no synthetic eval). The metric math lives in accuracy-snapshot-db so the live
// read here and the daily snapshot can't drift. Fields are split by what a change MEANS:
//   • FACTUAL (brand, category, material, era) — a change/abstention is a real miss → true accuracy.
//   • PRICE — seller's final price within a ±band of the AI's market read.
//   • STYLISTIC (title, description) — edits are often voice/preference, NOT corrections → soft signal.
//   • SELLER-ONLY (condition, measurements) — the AI can't observe these → excluded from the score.
//   /api/admin/listing-accuracy?window=all|30   (&examples=N to see AI-vs-seller diffs + brand-ID debug)
function isAuthorized(request: NextRequest): boolean {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) return false;
 if (request.headers.get("authorization") === `Bearer ${pw}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === crypto.createHash("sha256").update(pw).digest("hex");
}

function db() { const url = process.env.DATABASE_URL || process.env.POSTGRES_URL; if (!url) throw new Error("no db"); return neon(url); }

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const q = new URL(request.url).searchParams;
 const windowParam = q.get("window") || "all";
 const days = windowParam === "all" ? null : Math.max(1, Number(windowParam) || 30);
 const examples = Math.max(0, Math.min(50, Number(q.get("examples")) || 0));
 const cutoff = days != null ? new Date(Date.now() - days * 86_400_000).toISOString() : "1970-01-01T00:00:00Z";

 try {
  const metrics = await computeListingAccuracyMetrics(days);

  let missExamples: unknown[] = [];
  if (examples > 0) {
   const ex = (await db()`
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
    // did it find? Caveat: reverse_image is null when the client didn't forward the debug blob to
    // publish, so `reverseImageFired: false` is NOT proof Lens was off — confirm via server logs.
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
   ...metrics,
   note: metrics.totalAiListings < 30 ? "Small sample — read these as directional, not settled, until more listings accrue." : undefined,
   ...(examples > 0 ? { misses: missExamples } : {}),
  });
 } catch (e) {
  return NextResponse.json({ error: String(e) }, { status: 500 });
 }
}
