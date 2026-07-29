import { scanCatalogBySegment, type SegmentType } from "./market-metrics-db";
import { priceBenchmark } from "./metrics";

// ── Asking-price benchmark ─────────────────────────────────────────────────────────────────────
// Per-segment 25th / median / 75th ASKING price (dollars), computed from the LIVE catalog — every
// in-stock listing's price, a large current sample. This is what stores charge, not what pieces sold
// for; realized sale prices stay thin at pilot volume, so asking is the honest, populated benchmark.
// Asking prices are PUBLIC (visible on each storefront), so no extra privacy gate is needed beyond
// the segment already being visible (≥5 stores) — the caller gates that first.

export type AskBenchmark = { p25: number | null; median: number | null; p75: number | null };
export type AskLookup = (segmentType: string, segmentValue: string) => AskBenchmark;

// One catalog scan → a lookup the caller can apply to each already-gated segment.
export async function askingPriceLookup(): Promise<AskLookup> {
 const catalog = await scanCatalogBySegment().catch(() => null);
 return (type, value) => {
  const seg = catalog?.[type as SegmentType]?.get(value);
  return seg && seg.prices.length ? priceBenchmark(seg.prices) : { p25: null, median: null, p75: null };
 };
}
