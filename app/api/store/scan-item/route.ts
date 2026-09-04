import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { isStorePro } from "@/app/lib/store-plans-db";
import { gateSegments, type RawSegment } from "@/app/lib/data-layer/privacy";
import { PRIVACY, SOURCING, BLEND } from "@/app/lib/data-layer/config";
import { sourcingVerdict, blendedVerdict, type Trend } from "@/app/lib/data-layer/metrics";
import { isEbayConfigured } from "@/app/lib/data-layer/ebay";
import { getOrFetchEbayComps } from "@/app/lib/data-layer/ebay-history-db";
import { inferBrandFromTitle } from "@/app/lib/market-data-db";
import { inferCategoryFromTitle } from "@/app/lib/loadStoreProducts";
import { inferEra } from "@/app/lib/data-layer/enrich";
import { loadEraBuckets } from "@/app/lib/data-layer/events-db";
import { identifyItem, isVisionConfigured, type VisionImage } from "@/app/lib/data-layer/vision";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}
// "data:image/jpeg;base64,XXXX" → { mediaType, data }
function parseDataUrl(url: string): VisionImage | null {
 const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(url);
 return m ? { mediaType: m[1], data: m[2] } : null;
}

// POST /api/store/scan-item  body: { images: string[] (data URLs), window?: "7d"|"30d" }
// Identifies the item by photo, then returns the same privacy-gated demand
// verdict the text search gives — for the brand, category, and era it detects.
export async function POST(request: NextRequest) {
 // ...Any: the listing flow calls this from the phone with a bearer JWT, not a web session.
 const storeSlug = await resolveStoreSlugAny(request);
 if (!storeSlug) return NextResponse.json({ error: "Not a registered store partner" }, { status: 403 });
 if (!(await isStorePro(storeSlug))) return NextResponse.json({ locked: true }); // Pro feature

 if (!isVisionConfigured()) {
 return NextResponse.json({ notConfigured: true, error: "Photo scanning isn't set up yet (no AI key configured)." }, { status: 503 });
 }

 let body: { images?: string[]; window?: string };
 try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
 const images = (body.images ?? []).map(parseDataUrl).filter((x): x is VisionImage => x !== null).slice(0, 4);
 if (images.length === 0) return NextResponse.json({ error: "No valid images" }, { status: 400 });
 const windowKey = body.window === "7d" ? "7d" : "30d";

 try {
 // 1. Vision identify.
 const id = await identifyItem(images);

 // 2. Normalize to the SAME canonical segments market_metrics is keyed on.
 const buckets = await loadEraBuckets();
 const brand = id.brand ? inferBrandFromTitle(id.brand) : null;
 const category = inferCategoryFromTitle(`${id.itemType ?? ""} ${id.category ?? ""}`) as string | null;
 const era = inferEra(`${id.era ?? ""} ${id.summary ?? ""}`, buckets);
 const wanted = [brand, category, era].filter((x): x is string => !!x);

 // 3. VYA market lookup + eBay comps, in parallel.
 const sql = db();
 const ebayQuery = `${id.brand ?? ""} ${id.itemType ?? id.category ?? ""} ${id.era ?? ""}`.replace(/\s+/g, " ").trim();
 const [rows, ebay] = await Promise.all([
 wanted.length > 0
  ? (sql`
   SELECT segment_type, segment_value, demand_index, demand_trend, supply_gap_score,
    sell_through_pct, price_p25, price_median, price_p75, active_supply, store_count, txn_count
   FROM market_metrics
   WHERE window_key = ${windowKey}
    AND as_of_date = (SELECT MAX(as_of_date) FROM market_metrics)
    AND segment_value = ANY(${wanted})
  ` as Promise<Array<Record<string, unknown>>>)
  : Promise.resolve([] as Array<Record<string, unknown>>),
 isEbayConfigured() && ebayQuery.length >= 2 ? getOrFetchEbayComps(ebayQuery) : Promise.resolve(null),
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
 const order: Record<string, number> = { brand: 0, category: 1, era: 2 };
 const gated = gateSegments(raw, PRIVACY).sort((a, b) => (order[a.segmentType] ?? 9) - (order[b.segmentType] ?? 9));
 const segments = gated.map((s) => ({
 ...s,
 verdict: sourcingVerdict(
  { demandIndex: s.demandIndex, demandTrend: s.demandTrend as Trend, supplyGapScore: s.supplyGapScore, sellThroughPct: s.sellThroughPct },
  SOURCING,
 ),
 }));

 // Headline BLENDED verdict: primary VYA signal (brand > category > era) + eBay.
 const primary = gated[0] ?? null;
 const primaryVya = primary
 ? { demandIndex: primary.demandIndex, demandTrend: primary.demandTrend as Trend, supplyGapScore: primary.supplyGapScore, sellThroughPct: primary.sellThroughPct }
 : null;
 const ebaySignal = ebay ? { medianPrice: ebay.medianPrice, activeCount: ebay.activeCount, soldPer30d: ebay.soldPer30d ?? null } : null;
 const verdict = blendedVerdict(primaryVya, ebaySignal, { ...SOURCING, ...BLEND });

 return NextResponse.json({
 windowKey,
 identification: { ...id, canonicalBrand: brand, canonicalCategory: category, canonicalEra: era },
 verdict,
 ebay,
 segments,
 });
 } catch (err) {
 console.error("[store/scan-item] error:", err);
 return NextResponse.json({ error: "Scan failed. Please try again." }, { status: 500 });
 }
}
