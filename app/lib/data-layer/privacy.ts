// ───────────────────────────────────────────────────────────────────────────
// Data Layer: privacy guardrail (pure + tested).
//
// Sellers may NEVER see another individual store's numbers, only aggregated,
// anonymized, market-level signal. `market_metrics` is already aggregated across
// stores, but a segment built from too few stores/transactions could effectively
// expose one store. This gate enforces the floor (config PRIVACY, default 5/5):
//   • fewer than N STORES        → the segment is hidden entirely (returns null)
//   • fewer than N TRANSACTIONS  → price + sell-through are blanked to null ("-"),
//                                  while the (engagement-based) demand signal stays
// Per-store identity is never carried into the seller-facing shape at all.
// ───────────────────────────────────────────────────────────────────────────

// The threshold is passed in (the caller imports PRIVACY from config) so this
// stays a pure, dependency-free, unit-testable module.
export type PrivacyFloor = { minStores: number; minTransactions: number };

export type RawSegment = {
 segmentType: string;
 segmentValue: string;
 demandIndex: number;
 demandTrend: string;
 supplyGapScore: number;
 sellThroughPct: number | null;
 priceP25: number | null;
 priceMedian: number | null;
 priceP75: number | null;
 activeSupply: number;
 storeCount: number;
 txnCount: number;
};

export type PublicSegment = {
 segmentType: string;
 segmentValue: string;
 demandIndex: number;
 demandTrend: string;
 supplyGapScore: number;
 sellThroughPct: number | null;
 priceP25: number | null;
 priceMedian: number | null;
 priceP75: number | null;
 activeSupply: number; // aggregate in-stock count across stores (not store-identifying)
 storeCount: number; // always ≥ minStores. Safe to surface as "across N stores"
 hasPriceData: boolean; // false → price/sell-through suppressed for privacy
};

export function gateSegment(m: RawSegment, privacy: PrivacyFloor): PublicSegment | null {
 if (m.storeCount < privacy.minStores) return null;
 const showTxn = m.txnCount >= privacy.minTransactions;
 return {
 segmentType: m.segmentType,
 segmentValue: m.segmentValue,
 demandIndex: m.demandIndex,
 demandTrend: m.demandTrend,
 supplyGapScore: m.supplyGapScore,
 sellThroughPct: showTxn ? m.sellThroughPct : null,
 priceP25: showTxn ? m.priceP25 : null,
 priceMedian: showTxn ? m.priceMedian : null,
 priceP75: showTxn ? m.priceP75 : null,
 activeSupply: m.activeSupply,
 storeCount: m.storeCount,
 hasPriceData: showTxn,
 };
}

export function gateSegments(rows: RawSegment[], privacy: PrivacyFloor): PublicSegment[] {
 return rows
 .map((r) => gateSegment(r, privacy))
 .filter((x): x is PublicSegment => x !== null);
}
