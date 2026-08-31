import { test } from "node:test";
import assert from "node:assert/strict";
import { rankCandidates, classifyMatch, MATCH_THRESHOLDS } from "./match-core.ts";

const unit = (x: number, y: number) => { const n = Math.hypot(x, y); return [x / n, y / n]; };

test("ranks candidates by cosine similarity, highest first, with a small bring-list boost", () => {
 const q = unit(1, 0);
 const ranked = rankCandidates(q, [
 { id: "far", vec: unit(0, 1), onBringList: true },
 { id: "near", vec: unit(1, 0.1), onBringList: false },
 { id: "mid", vec: unit(1, 0.5), onBringList: true },
 ]);
 assert.deepEqual(ranked.map((r) => r.id), ["near", "mid", "far"]);
 assert.ok(ranked[0].score > 0.99);
 assert.ok(ranked[2].score < 0.1);
 // the boost is visible but can't overturn a clearly better match
 const mid = ranked.find((r) => r.id === "mid")!;
 assert.ok(Math.abs(mid.score - mid.raw - MATCH_THRESHOLDS.bringListBoost) < 1e-9);
});

test("high confidence needs a strong top score AND a clear margin over #2", () => {
 assert.equal(classifyMatch([{ id: "a", score: 0.93 }, { id: "b", score: 0.80 }]).level, "high");
 assert.equal(classifyMatch([{ id: "a", score: 0.93 }, { id: "b", score: 0.91 }]).level, "medium"); // two near-identical listings → ask
 assert.equal(classifyMatch([{ id: "a", score: 0.93 }]).level, "high");
});

test("medium confidence returns up to five candidates above the floor", () => {
 const r = classifyMatch([0.85, 0.8, 0.78, 0.76, 0.74, 0.73, 0.5].map((score, i) => ({ id: String(i), score })));
 assert.equal(r.level, "medium");
 assert.equal(r.candidates.length, 5);
 assert.deepEqual(r.candidates.map((c) => c.id), ["0", "1", "2", "3", "4"]);
});

test("below the floor is no match — never guess", () => {
 const r = classifyMatch([{ id: "a", score: 0.6 }, { id: "b", score: 0.55 }]);
 assert.equal(r.level, "none");
 assert.equal(r.candidates.length, 0);
});

test("an empty index is no match", () => {
 assert.equal(classifyMatch([]).level, "none");
});
