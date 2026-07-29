import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { gateSegments, type RawSegment } from "@/app/lib/data-layer/privacy";
import { PRIVACY, SOURCING, BLEND } from "@/app/lib/data-layer/config";
import { sourcingVerdict, blendedVerdict, type Trend } from "@/app/lib/data-layer/metrics";
import { isEbayConfigured } from "@/app/lib/data-layer/ebay";
import { getOrFetchEbayComps } from "@/app/lib/data-layer/ebay-history-db";
import { getOrFetchGoogleTrend } from "@/app/lib/market-trends";
import { askingPriceLookup } from "@/app/lib/data-layer/asking-price";
import { resolveStoreSlug } from "@/app/lib/storeAuth";
import { isStorePro } from "@/app/lib/store-plans-db";

export const dynamic = "force-dynamic";

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

// GET /api/store/demand-search?q=cavalli&window=30d — the "Should I buy this?"
// tool. Matches the query against any segment (brand / category / era), gates
// for privacy, and attaches a plain-language sourcing verdict to each result.
export async function GET(request: NextRequest) {
 const storeSlug = await resolveStoreSlug(request);
 if (!storeSlug) return NextResponse.json({ error: "Not a registered store partner" }, { status: 403 });
 if (!(await isStorePro(storeSlug))) return NextResponse.json({ locked: true }); // Pro feature

 const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
 const windowKey = request.nextUrl.searchParams.get("window") === "7d" ? "7d" : "30d";
 if (q.length < 2) return NextResponse.json({ query: q, windowKey, results: [], note: "Type at least 2 characters." });

 const sql = db();
 try {
 // VYA's own demand + external eBay comps in parallel. eBay is the fallback for the long tail —
 // brands with too little VYA engagement to clear the privacy floor (e.g. Escada) still get a call.
 const [rows, ebay, google] = await Promise.all([
  sql`
  SELECT segment_type, segment_value, demand_index, demand_trend, supply_gap_score,
   sell_through_pct, price_p25, price_median, price_p75, active_supply, store_count, txn_count,
   to_char(as_of_date,'YYYY-MM-DD') AS as_of
  FROM market_metrics
  WHERE window_key = ${windowKey}
   AND as_of_date = (SELECT MAX(as_of_date) FROM market_metrics)
   AND LOWER(segment_value) LIKE ${"%" + q.toLowerCase() + "%"}
  ` as Promise<Array<Record<string, unknown>>>,
  isEbayConfigured() ? getOrFetchEbayComps(q) : Promise.resolve(null), // fetch fresh + bank price history
  getOrFetchGoogleTrend(q).catch(() => null), // cache-through: DB first, SerpApi once, saved for next time
 ]);

 const raw: RawSegment[] = rows.map((r) => ({
  segmentType: r.segment_type as string,
  segmentValue: r.segment_value as string,
  demandIndex: Number(r.demand_index),
  demandTrend: r.demand_trend as string,
  supplyGapScore: Number(r.supply_gap_score),
  sellThroughPct: r.sell_through_pct == null ? null : Number(r.sell_through_pct),
  priceP25: r.price_p25 == null ? null : Number(r.price_p25),
  priceMedian: r.price_median == null ? null : Number(r.price_median),
  priceP75: r.price_p75 == null ? null : Number(r.price_p75),
  activeSupply: Number(r.active_supply),
  storeCount: Number(r.store_count),
  txnCount: Number(r.txn_count),
 }));

 // Fill price with the ASKING benchmark from the live catalog (realized sale prices are still thin).
 const ask = await askingPriceLookup();
 const results = gateSegments(raw, PRIVACY)
  .sort((a, b) => b.demandIndex - a.demandIndex)
  .slice(0, 8)
  .map((s) => {
  const a = ask(s.segmentType, s.segmentValue);
  return {
   ...s,
   priceP25: a.p25, priceMedian: a.median, priceP75: a.p75, hasPriceData: a.median != null,
   verdict: sourcingVerdict(
    { demandIndex: s.demandIndex, demandTrend: s.demandTrend as Trend, supplyGapScore: s.supplyGapScore, sellThroughPct: s.sellThroughPct },
    SOURCING,
   ),
  };
  });

 // Headline verdict blends the top VYA match (if any) with eBay — so a query with no VYA signal
 // still gets an eBay-led call ("sells well on eBay ~X/mo") instead of a dead end.
 const primary = results[0] ?? null;
 const primaryVya = primary
  ? { demandIndex: primary.demandIndex, demandTrend: primary.demandTrend as Trend, supplyGapScore: primary.supplyGapScore, sellThroughPct: primary.sellThroughPct }
  : null;
 const ebaySignal = ebay ? { medianPrice: ebay.medianPrice, activeCount: ebay.activeCount, soldPer30d: ebay.soldPer30d ?? null } : null;
 const googleSignal = google ? { momentumPct: google.momentumPct, breakout: google.breakout } : null;
 const verdict = blendedVerdict(primaryVya, ebaySignal, { ...SOURCING, ...BLEND }, googleSignal);
 const ebayOut = ebay ? { medianPrice: ebay.medianPrice, p25: ebay.p25, p75: ebay.p75, activeCount: ebay.activeCount, soldPer30d: ebay.soldPer30d ?? null, priceMomentumPct: ebay.priceMomentumPct } : null;
 const googleOut = google ? { momentumPct: google.momentumPct, avgInterest: google.avgInterest, breakout: google.breakout } : null;

 const asOfDate = rows.length ? (rows[0].as_of as string) : null;
 return NextResponse.json({ query: q, windowKey, asOfDate, results, verdict, ebay: ebayOut, google: googleOut });
 } catch (err) {
 console.error("[store/demand-search] error:", err);
 return NextResponse.json({ query: q, windowKey, results: [], error: "search_failed" });
 }
}
