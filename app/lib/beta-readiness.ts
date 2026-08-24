import { neon } from "@neondatabase/serverless";
import { getPriceAccuracy, wilson95, type PriceScore, type PriceAccuracy } from "./eval-price";

// ───────────────────────────────────────────────────────────────────────────
// Beta readiness — the go/no-go scorecard.
//
// The three dimensions that gate rollout (your call): BRAND, PRICE, SPECIFIC PIECE.
// Each must clear 95% in the segments that matter, with enough data behind it to
// believe the number. We use the LOWER bound of a 95% confidence interval vs the gate,
// so we only call "pass" when we're statistically confident the true rate clears 95% —
// not when a lucky small sample happens to. Honest by construction.
//
//   • PRICE      → graded against REAL sold prices (eval-price). Available now.
//   • BRAND      → the golden exam (blind, house-level). Needs the golden set curated.
//   • SPECIFIC   → the golden exam's model-match. Needs the golden set curated.
// ───────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

export const BETA_GATE = 0.95; // 95% bar
export const BETA_MIN_N = 30; // below this, a dimension is "insufficient" — no verdict on noise

export type DimVerdict = {
 dimension: "brand" | "price" | "specific";
 label: string;
 n: number; correct: number; pct: number | null;
 ci95: [number, number] | null;
 verdict: "pass" | "close" | "fail" | "insufficient";
 note: string;
};

function verdictFrom(dimension: DimVerdict["dimension"], label: string, correct: number, n: number, source: string): DimVerdict {
 const ci = wilson95(correct, n);
 const rate = n ? correct / n : null;
 const verdict: DimVerdict["verdict"] = n < BETA_MIN_N ? "insufficient"
 : ci && ci[0] >= BETA_GATE ? "pass"
 : rate != null && rate >= BETA_GATE ? "close"
 : "fail";
 const note = verdict === "insufficient"
 ? `Only ${n} graded — need ≥${BETA_MIN_N} to call it. ${source}`
 : verdict === "pass" ? `Confidently ≥95%. ${source}`
 : verdict === "close" ? `Point estimate clears 95% but the sample's too small to be sure — grade more. ${source}`
 : `Below the 95% bar. ${source}`;
 return { dimension, label, n, correct, pct: n ? Math.round((correct / n) * 100) : null, ci95: ci, verdict, note };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Brand + specific come from the most recent GOLDEN exam (blind run over the hand-verified set).
// One run over the whole set = one honest reading per item (no double-counting across runs).
async function goldenDimVerdicts(): Promise<{ brand: DimVerdict; specific: DimVerdict; ranAt: string | null }> {
 const rows = (await db()`
  SELECT result, ran_at FROM eval_runs
  WHERE (result->>'goldenOnly') = 'true'
  ORDER BY ran_at DESC LIMIT 1
 `.catch(() => [])) as { result: any; ran_at: string }[];
 const latest = rows[0]?.result;
 const ranAt = rows[0]?.ran_at ? new Date(rows[0].ran_at).toISOString() : null;
 const field = (f: string) => (Array.isArray(latest?.fields) ? latest.fields.find((x: any) => x.field === f) : null);
 const src = ranAt ? `From the golden exam (${latest?.sample ?? "?"} items).` : "No golden exam has run yet — curate the golden set and run it.";
 const b = field("brand"), s = field("specific");
 return {
 brand: verdictFrom("brand", "Brand ID", Number(b?.correct || 0), Number(b?.total || 0), src),
 specific: verdictFrom("specific", "Specific piece", Number(s?.correct || 0), Number(s?.total || 0), src),
 ranAt,
 };
}

export type BetaReadiness = {
 gate: number;
 ready: boolean;
 blockers: string[];
 brand: DimVerdict;
 specific: DimVerdict;
 price: { overall: PriceScore; byCategory: PriceScore[]; byTier: PriceScore[]; totalGraded: number };
 goldenRanAt: string | null;
};

export async function getBetaReadiness(): Promise<BetaReadiness> {
 const [priceAcc, golden] = await Promise.all([
 getPriceAccuracy(120).catch(() => null as PriceAccuracy | null),
 goldenDimVerdicts(),
 ]);
 // Price dimension passes only when the OVERALL read clears the gate AND no populated segment fails.
 const price = priceAcc ?? { overall: emptyScore("All sales"), byCategory: [], byTier: [], totalGraded: 0, windowDays: 120 };
 const priceOverall = price.overall;
 const failingSegments = [...price.byCategory, ...price.byTier].filter((s) => s.verdict === "fail").map((s) => s.segment);

 const blockers: string[] = [];
 if (golden.brand.verdict !== "pass") blockers.push(`Brand: ${golden.brand.verdict === "insufficient" ? "not enough golden data" : `${golden.brand.pct ?? "–"}% (need 95%)`}`);
 if (golden.specific.verdict !== "pass") blockers.push(`Specific piece: ${golden.specific.verdict === "insufficient" ? "not enough golden data" : `${golden.specific.pct ?? "–"}% (need 95%)`}`);
 if (priceOverall.verdict !== "pass") blockers.push(`Price: ${priceOverall.verdict === "insufficient" ? `only ${priceOverall.n} sales graded` : `${priceOverall.within10Pct ?? "–"}% within ±10% (need 95%)`}`);
 if (failingSegments.length) blockers.push(`Price weak in: ${failingSegments.slice(0, 6).join(", ")}`);

 const ready = golden.brand.verdict === "pass" && golden.specific.verdict === "pass" && priceOverall.verdict === "pass" && failingSegments.length === 0;

 return {
 gate: BETA_GATE, ready, blockers,
 brand: golden.brand, specific: golden.specific,
 price: { overall: priceOverall, byCategory: price.byCategory, byTier: price.byTier, totalGraded: price.totalGraded },
 goldenRanAt: golden.ranAt,
 };
}

function emptyScore(segment: string): PriceScore {
 return { segment, n: 0, within10: 0, within20: 0, within10Pct: null, within20Pct: null, ci95: null, medianErrorPct: null, medianSignedPct: null, overCount: 0, underCount: 0, inBandPct: null, inBandN: 0, verdict: "insufficient" };
}
