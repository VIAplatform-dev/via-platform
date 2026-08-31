import { neon } from "@neondatabase/serverless";
import { resolveBrandLine, rivalLines } from "../brand-lines";
import { gateSegment } from "./privacy";
import { PRIVACY } from "./config";

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

export type InternalPriceBenchmark = {
 segment: string; // e.g. "Prada" or "dresses"
 segmentType: "brand" | "category";
 windowKey: string;
 p25Cents: number | null;
 medianCents: number;
 p75Cents: number | null;
 storeCount: number;
 txnCount: number;
};

// The platform's OWN realized-price benchmark for a brand and/or category, read from the
// latest `market_metrics` snapshot (built nightly by build-market-metrics) and privacy-gated
// via gateSegment — it only returns price data when >= minStores AND >= minTransactions, so a
// benchmark can never reflect a single store. Prefers a brand match over category, and the 30d
// window over 7d (more sales → sturdier). Returns CENTS (market_metrics stores dollars).
export async function getInternalPriceBenchmark(opts: {
 brand?: string | null;
 category?: string | null;
}): Promise<InternalPriceBenchmark | null> {
 const brand = (opts.brand ?? "").trim();
 const category = (opts.category ?? "").trim();
 if (!brand && !category) return null;

 // market_metrics segments brands by HOUSE (brandData.ts has one entry for all of
 // Ralph Lauren), so for a house whose lines span more than one market the
 // brand-level median is a blend of runway and department-store prices — a
 // confidently wrong anchor. Fall through to the category benchmark instead:
 // better no brand anchor than one built from the wrong tier.
 const line = resolveBrandLine(brand);
 const blended = Boolean(line && rivalLines(line).length > 0);
 const useBrand = brand !== "" && !blended;

 const sql = db();
 const rows = (await sql`
 SELECT segment_type, segment_value, window_key, price_p25, price_median, price_p75, store_count, txn_count
 FROM market_metrics
 WHERE as_of_date = (SELECT MAX(as_of_date) FROM market_metrics)
  AND (
  (segment_type = 'brand' AND ${useBrand} AND lower(segment_value) = lower(${brand}))
  OR (segment_type = 'category' AND ${category} <> '' AND lower(segment_value) = lower(${category}))
  )
 `) as Array<Record<string, unknown>>;
 if (!rows.length) return null;

 // Brand beats category; 30d beats 7d (a sturdier, higher-N benchmark first).
 const rank = (r: Record<string, unknown>) =>
 (r.segment_type === "brand" ? 2 : 0) + (r.window_key === "30d" ? 1 : 0);

 for (const r of rows.sort((a, b) => rank(b) - rank(a))) {
 const gated = gateSegment(
  {
  segmentType: r.segment_type as string,
  segmentValue: r.segment_value as string,
  demandIndex: 0,
  demandTrend: "",
  supplyGapScore: 0,
  sellThroughPct: null,
  priceP25: r.price_p25 == null ? null : Number(r.price_p25),
  priceMedian: r.price_median == null ? null : Number(r.price_median),
  priceP75: r.price_p75 == null ? null : Number(r.price_p75),
  activeSupply: 0,
  storeCount: Number(r.store_count),
  txnCount: Number(r.txn_count),
  },
  PRIVACY,
 );
 if (gated?.hasPriceData && gated.priceMedian != null) {
  return {
  segment: gated.segmentValue,
  segmentType: gated.segmentType as "brand" | "category",
  windowKey: r.window_key as string,
  p25Cents: gated.priceP25 != null ? Math.round(gated.priceP25 * 100) : null,
  medianCents: Math.round(gated.priceMedian * 100),
  p75Cents: gated.priceP75 != null ? Math.round(gated.priceP75 * 100) : null,
  storeCount: gated.storeCount,
  txnCount: Number(r.txn_count),
  };
 }
 }
 return null;
}
