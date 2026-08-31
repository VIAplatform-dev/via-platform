// Photo → listing matching, pure part. Scores are cosine similarities between Voyage multimodal
// embeddings (0..1 for these vectors). Thresholds are env-overridable and were set conservatively:
// a wrong "We found it" costs a mis-sold item; a needless "Which one?" costs one tap.

/** Cosine similarity (0..1 for these normalized vectors). Local so this module stays dependency-free
 *  for node --test (embeddings.ts pulls in the cost tracker → Neon). */
export function cosine(a: number[], b: number[]): number {
 let dot = 0, na = 0, nb = 0;
 const n = Math.min(a.length, b.length);
 for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
 return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export const MATCH_THRESHOLDS = {
 high: Number(process.env.MARKET_MATCH_HIGH || 0.88), // top score to claim "We found it"
 highMargin: Number(process.env.MARKET_MATCH_MARGIN || 0.06), // …and how far ahead of #2 it must be
 medium: Number(process.env.MARKET_MATCH_MEDIUM || 0.72), // floor to be offered as a candidate
 bringListBoost: 0.02, // items physically on the table get a nudge
 maxCandidates: 5,
};

export type Candidate = { id: string; vec: number[]; onBringList: boolean };
export type Ranked = { id: string; score: number; raw: number };

export function rankCandidates(query: number[], candidates: Candidate[]): Ranked[] {
 return candidates
 .map((c) => { const raw = cosine(query, c.vec); return { id: c.id, raw, score: raw + (c.onBringList ? MATCH_THRESHOLDS.bringListBoost : 0) }; })
 .sort((a, b) => b.score - a.score);
}

export type MatchLevel = "high" | "medium" | "none";

export function classifyMatch(ranked: { id: string; score: number }[]): { level: MatchLevel; candidates: { id: string; score: number }[] } {
 const above = ranked.filter((r) => r.score >= MATCH_THRESHOLDS.medium).slice(0, MATCH_THRESHOLDS.maxCandidates);
 if (!above.length) return { level: "none", candidates: [] };
 const top = above[0], second = above[1];
 const clear = top.score >= MATCH_THRESHOLDS.high && (!second || top.score - second.score >= MATCH_THRESHOLDS.highMargin);
 return { level: clear ? "high" : "medium", candidates: above };
}
