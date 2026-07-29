import { test } from "node:test";
import assert from "node:assert/strict";
import {
 rawDemand,
 percentileRanks,
 classifyTrend,
 quantile,
 priceBenchmark,
 median,
 sellThroughPct,
 supplyGapScore,
 sourceNowScore,
 sourcingVerdict,
 blendedVerdict,
} from "./metrics.ts";
import { DEMAND_WEIGHTS, TREND_FLAT_BAND, SOURCING, BLEND } from "./config.ts";

const BT = { ...SOURCING, ...BLEND };

const W = DEMAND_WEIGHTS;

test("rawDemand — weighted sum (1/3/2/6)", () => {
 assert.equal(rawDemand({ views: 10, saves: 2, clicks: 5, orders: 1 }, W), 10 + 6 + 10 + 6); // 32
 assert.equal(rawDemand({ views: 0, saves: 0, clicks: 0, orders: 0 }, W), 0);
});

test("percentileRanks — 0 for lowest, 100 for highest, ties share", () => {
 assert.deepEqual(percentileRanks([10, 20, 30, 40, 50]), [0, 25, 50, 75, 100]);
 assert.deepEqual(percentileRanks([5, 5, 5]), [0, 0, 0]); // all tied → all beat nobody
 assert.deepEqual(percentileRanks([42]), [100]); // lone segment is the hottest
 assert.deepEqual(percentileRanks([]), []);
});

test("classifyTrend — dead-band, falling, and zero base", () => {
 assert.equal(classifyTrend(120, 100, TREND_FLAT_BAND), "rising"); // +20%
 assert.equal(classifyTrend(80, 100, TREND_FLAT_BAND), "falling"); // -20%
 assert.equal(classifyTrend(105, 100, TREND_FLAT_BAND), "flat"); // +5% within ±10%
 assert.equal(classifyTrend(95, 100, TREND_FLAT_BAND), "flat"); // -5%
 assert.equal(classifyTrend(7, 0, TREND_FLAT_BAND), "rising"); // new from nothing
 assert.equal(classifyTrend(0, 0, TREND_FLAT_BAND), "flat"); // nothing either way
});

test("quantile — linear interpolation", () => {
 assert.equal(quantile([10, 20, 30, 40], 0.5), 25); // (20+30)/2
 assert.equal(quantile([10, 20, 30, 40, 50], 0.25), 20);
 assert.equal(quantile([100], 0.9), 100);
 assert.equal(quantile([], 0.5), null);
});

test("priceBenchmark — p25 / median / p75, rounded to cents", () => {
 const b = priceBenchmark([20, 40, 60, 80, 100]);
 assert.deepEqual(b, { p25: 40, median: 60, p75: 80 });
 assert.deepEqual(priceBenchmark([]), { p25: null, median: null, p75: null });
});

test("median", () => {
 assert.equal(median([3, 1, 2]), 2);
 assert.equal(median([]), null);
});

test("sellThroughPct — null when no supply, else %", () => {
 assert.equal(sellThroughPct(3, 12), 25); // 3/12
 assert.equal(sellThroughPct(1, 3), 33.3); // rounded 1 dp
 assert.equal(sellThroughPct(5, 0), null); // can't divide by zero supply
 assert.equal(sellThroughPct(0, 10), 0);
});

test("sourceNowScore — rising beats flat beats falling for the same signal", () => {
 // Same demand + gap, different momentum: rising is boosted, falling is discounted.
 const flat = sourceNowScore(80, "flat", 60); // (0.5*80 + 0.5*60) * 1 = 70
 assert.equal(flat, 70);
 assert.ok(sourceNowScore(80, "rising", 60) > flat); // 70 * 1.15 = 80.5 → 81
 assert.ok(sourceNowScore(80, "falling", 60) < flat); // 70 * 0.7 = 49
 // Clamped to 0–100 even when the boost overshoots.
 assert.equal(sourceNowScore(100, "rising", 100), 100);
 assert.equal(sourceNowScore(0, "falling", 0), 0);
});

test("supplyGapScore — clamped demand minus supply percentile", () => {
 assert.equal(supplyGapScore(90, 20), 70); // hot, thin supply
 assert.equal(supplyGapScore(40, 80), 0); // well supplied → no gap (clamped)
 assert.equal(supplyGapScore(100, 0), 100);
});

test("sourcingVerdict — the four ratings", () => {
 const base = { demandTrend: "rising" as const, sellThroughPct: 2 };
 // hot demand + thin supply → source it
 assert.equal(sourcingVerdict({ ...base, demandIndex: 85, supplyGapScore: 30 }, SOURCING).rating, "source");
 // hot demand + well supplied → buy sharp
 assert.equal(sourcingVerdict({ ...base, demandIndex: 85, supplyGapScore: 5 }, SOURCING).rating, "buy-sharp");
 // moderate demand → selective
 assert.equal(sourcingVerdict({ ...base, demandIndex: 55, supplyGapScore: 40 }, SOURCING).rating, "selective");
 // soft demand → pass
 assert.equal(sourcingVerdict({ ...base, demandIndex: 20, supplyGapScore: 0 }, SOURCING).rating, "pass");
});

test("sourcingVerdict — trend colours the wording", () => {
 const v = sourcingVerdict({ demandIndex: 85, demandTrend: "falling", supplyGapScore: 30, sellThroughPct: 1 }, SOURCING);
 assert.match(v.detail, /cooling/);
 const p = sourcingVerdict({ demandIndex: 20, demandTrend: "falling", supplyGapScore: 0, sellThroughPct: 0 }, SOURCING);
 assert.equal(p.headline, "Pass"); // falling + soft → firm pass, not "lean pass"
});

test("sourcingVerdict — soft demand but trustworthy fast sell-through → selective", () => {
 // low demand index, but a real (non-null = ≥5 sales) sell-through above the bar
 const v = sourcingVerdict({ demandIndex: 25, demandTrend: "rising", supplyGapScore: 5, sellThroughPct: 6 }, SOURCING);
 assert.equal(v.rating, "selective");
 // null sell-through (suppressed / too few sales) stays a pass — never trust thin data
 const p = sourcingVerdict({ demandIndex: 25, demandTrend: "rising", supplyGapScore: 5, sellThroughPct: null }, SOURCING);
 assert.equal(p.rating, "pass");
});

test("blendedVerdict — VYA leads when present; eBay saturation can downgrade", () => {
 const vya = { demandIndex: 85, demandTrend: "rising" as const, supplyGapScore: 30, sellThroughPct: 2 };
 // VYA says source, eBay is calm → source (using VYA + eBay)
 assert.equal(blendedVerdict(vya, { medianPrice: 200, activeCount: 50 }, BT).rating, "source");
 // same VYA, but heavily listed on eBay → downgraded to buy-sharp
 const d = blendedVerdict(vya, { medianPrice: 200, activeCount: 600 }, BT);
 assert.equal(d.rating, "buy-sharp");
 assert.equal(d.basis, "vya+ebay");
});

test("blendedVerdict — no VYA, eBay sold velocity carries it", () => {
 assert.equal(blendedVerdict(null, { medianPrice: 200, activeCount: 40, soldPer30d: 35 }, BT).rating, "source");
 assert.equal(blendedVerdict(null, { medianPrice: 200, activeCount: 700, soldPer30d: 35 }, BT).rating, "buy-sharp");
 assert.equal(blendedVerdict(null, { medianPrice: 200, activeCount: 40, soldPer30d: 3 }, BT).rating, "pass");
});

test("blendedVerdict — no VYA, browse-only → price anchor; nothing → not enough data", () => {
 const b = blendedVerdict(null, { medianPrice: 180, activeCount: 60 }, BT);
 assert.equal(b.basis, "ebay-browse");
 assert.match(b.detail, /\$180/);
 const none = blendedVerdict(null, null, BT);
 assert.equal(none.headline, "Not enough data");
 assert.equal(none.basis, "none");
});

test("blendedVerdict — no VYA/eBay, Google carries a leading (soft) call", () => {
 // Falling search → cooling; rising → worth a watch; flat → quiet. All basis "google".
 const down = blendedVerdict(null, null, BT, { momentumPct: -29 });
 assert.equal(down.headline, "Cooling");
 assert.equal(down.basis, "google");
 assert.equal(blendedVerdict(null, null, BT, { momentumPct: 45 }).headline, "Worth a watch");
 assert.equal(blendedVerdict(null, null, BT, { momentumPct: 3 }).headline, "Quiet");
 // eBay still wins over Google when present.
 assert.equal(blendedVerdict(null, { medianPrice: 200, activeCount: 40, soldPer30d: 35 }, BT, { momentumPct: -29 }).basis, "ebay-sold");
});
