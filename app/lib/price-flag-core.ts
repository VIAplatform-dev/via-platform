// Is a seller's own price over or under the market? Pure, and kept apart from price-engine.ts.
//
// price-engine imports comps.ts, which imports next/cache, which no test runner can load. The
// comparison itself needs none of that: two numbers and a band. Splitting it is what lets it be
// tested at all. Same reason tax-reversal-core.ts sits outside sales-tax.ts.

export type PriceFlag = { level: "under" | "over" | "at"; pct: number; marketUsd: number; message: string };

/** Compare a seller's own price to a computed market value → an over/under-market flag. Uses
 *  the estimate's low/high band (or a ±band) so small deviations read as "at market" and only
 *  real gaps flag. Kept here so the intake route, the price-check endpoint, and the client UI
 *  all use one definition. */
export function computePriceFlag(sellerCents: number, marketCents: number, lowCents: number | null, highCents: number | null): PriceFlag {
 const low = lowCents ?? Math.round(marketCents * 0.85);
 const high = highCents ?? Math.round(marketCents * 1.2);
 const marketUsd = Math.round(marketCents / 100);
 const pct = Math.round(((sellerCents - marketCents) / marketCents) * 100);
 if (sellerCents < low) return { level: "under", pct, marketUsd, message: `About ${Math.abs(pct)}% below market: comparable pieces sit around $${marketUsd}. You could likely price higher.` };
 if (sellerCents > high) return { level: "over", pct, marketUsd, message: `About ${pct}% above market (~$${marketUsd}): expect a slower sale.` };
 return { level: "at", pct, marketUsd, message: `Right at market (~$${marketUsd}).` };
}
