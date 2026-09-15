import { inferBrandFromTitle } from "../market-data-db.ts";

// How a brand is classified, apart from the queries that use it.
//
// unbranded-benchmark-db.ts imports next/cache, which no test runner can load, so this one
// decision, which is the one worth testing, was untestable. Same split as price-flag-core.ts.

// Explicit "no brand" markers sellers type; everything else is checked against the canonical map.
const UNBRANDED_RE = /^\s*(unbranded|no[\s-]?brand|no[\s-]?label|none|unknown|n\/?a|unmarked|handmade|vintage|generic)\s*$/i;

export type BrandClass = "unbranded" | "lesser-known" | "known";

/** unbranded (no/marker brand) \u00b7 lesser-known (a real name, but not in the canonical designer map)
 *  \u00b7 known (a curated well-known designer). The golden set is unbranded + lesser-known. The pieces
 *  that lack strong external comps and need an intrinsic anchor. */
export function classifyBrand(brand: string | null | undefined): BrandClass {
 const b = (brand || "").trim();
 if (!b || UNBRANDED_RE.test(b)) return "unbranded";
 return inferBrandFromTitle(b) ? "known" : "lesser-known";
}
