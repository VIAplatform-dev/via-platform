// Objective fiber → resale-value tier. When a piece is UNBRANDED and has no exact comps, material
// is the single strongest intrinsic price signal: for the same garment, natural/luxury fibers
// (silk, leather, cashmere, wool, linen) resell well above synthetics (polyester, acrylic, nylon).
// This is a deterministic, defensible classification (fiber science + resale reality), not a
// hand-curated per-item judgement — so it stays unbiased and explainable.

export type MaterialTier = "premium" | "mid" | "base";

// Order matters: FAUX/synthetic-of-a-natural is checked first so "faux fur" / "vegan leather"
// land in base, not premium.
const FAUX = /\b(faux|vegan|pleather|polyurethane|pu\s?leather|imitation)\b/i;
const PREMIUM = /\b(silk|charmeuse|leather|suede|cashmere|wool|merino|mohair|angora|alpaca|camel\s?hair|shearling|\bfur\b|linen|hemp)\b/i;
const MID = /\b(cotton|viscose|rayon|tencel|lyocell|modal|cupro|denim|ramie|bamboo|jute)\b/i;
const BASE = /\b(polyester|acrylic|nylon|polyamide|spandex|elastane|lycra|acetate|\bpvc\b|polyurethane)\b/i;

/** Classify a stated material into a resale-value tier. Returns null tier when the material is
 *  empty or unrecognized (so callers can fall back to "unknown — price conservatively"). A blend
 *  is scored by the best fiber present (a silk blend still beats pure polyester). */
export function materialTier(material: string | null | undefined): { tier: MaterialTier | null; label: string | null } {
 const m = (material || "").toLowerCase().trim();
 if (!m) return { tier: null, label: null };
 if (FAUX.test(m)) return { tier: "base", label: "synthetic (faux)" };
 if (PREMIUM.test(m)) return { tier: "premium", label: "natural / luxury fiber" };
 if (MID.test(m)) return { tier: "mid", label: "mid-grade natural / semi-synthetic" };
 if (BASE.test(m)) return { tier: "base", label: "synthetic" };
 return { tier: null, label: null };
}
