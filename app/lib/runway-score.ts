// ───────────────────────────────────────────────────────────────────────────
// Runway matching — the decision rules (pure, no I/O, unit-tested).
//
// Kept apart from runway-index.ts on purpose, the same way data-layer/metrics.ts
// sits apart from market-metrics-db.ts. Naming a show raises a piece's asking
// price and is a publicly falsifiable claim, so the logic deciding whether to
// make that claim is the part that most needs testing on its own.
// ───────────────────────────────────────────────────────────────────────────

export type RunwayLook = {
 house: string; // "Tom Ford for Gucci"
 season: string; // "S/S" | "F/W" | "Resort" | "Pre-Fall"
 year: number;
 lookNo: number | null;
 sourceUrl: string | null;
 licenseRef: string | null; // which licence this look is held under
};

export type RunwayCandidate = RunwayLook & { similarity: number };

export type RunwayVerdict = {
 runway: string | null;
 confidence: number;
 /** Why it landed where it did — surfaced in logs and the admin, never invented. */
 reason: "no-index" | "below-threshold" | "no-consensus" | "brand-mismatch" | "matched";
 best?: RunwayCandidate;
 supporting?: number;
};

// ── Tuning ─────────────────────────────────────────────────────────────────
// Deliberately stricter than comps.ts's VISUAL_MATCH_MIN (0.68): that one only
// decides "is this the same product" between two catalogue-ish photos, which is
// an easier comparison than a seller's shelf shot against a moving catwalk shot.
const MIN_SIM = Number(process.env.VYA_RUNWAY_MIN_SIM) || 0.74;
/** A lone look can carry the claim only if it's a genuinely strong match. */
const STRONG_SIM = Number(process.env.VYA_RUNWAY_STRONG_SIM) || 0.82;
/** The winning season must beat the best rival season by this much. */
const SEASON_MARGIN = Number(process.env.VYA_RUNWAY_SEASON_MARGIN) || 0.03;

/** Loose brand key, so "Tom Ford for Gucci" and "GUCCI" can be compared. */
export function houseKey(house: string): string {
 return (house || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** How a season reads on a listing: "Tom Ford for Gucci S/S 2004". */
export function formatRunway(look: Pick<RunwayLook, "house" | "season" | "year">): string {
 return `${look.house} ${look.season} ${look.year}`.replace(/\s+/g, " ").trim();
}

/** Canonical spellings, so "s/s" and "prefall" round-trip through formatRunway unchanged. */
const SEASONS: Record<string, string> = { "s/s": "S/S", "f/w": "F/W", resort: "Resort", "pre-fall": "Pre-Fall", prefall: "Pre-Fall", cruise: "Cruise" };

/**
 * Inverse of formatRunway: "Tom Ford for Gucci S/S 2004" back into its parts, or null when the
 * string isn't a season at all. Deliberately strict — this gates what gets written INTO the index,
 * and a mis-parsed house would quietly poison every future match against it.
 */
export function parseRunway(label: string): Pick<RunwayLook, "house" | "season" | "year"> | null {
 const m = (label || "").trim().match(/^(.+?)\s+(S\/S|F\/W|Resort|Pre-?Fall|Cruise)\s+((?:19|20)\d{2})$/i);
 if (!m) return null;
 const season = SEASONS[m[2].toLowerCase()];
 const house = m[1].trim();
 if (!season || !house) return null;
 return { house, season, year: Number(m[3]) };
}

/**
 * Decide whether a set of nearest neighbours amounts to a documented season.
 *
 * The bar mirrors the caption heuristic this sits beside: a season is asserted
 * only when it is the closest match AND either corroborated by a second look
 * from the same show or strong enough alone — and when it clearly beats the
 * next-best season, so two plausible shows cancel out rather than one winning
 * by a hair.
 */
export function scoreRunwayCandidates(candidates: RunwayCandidate[], brand?: string | null): RunwayVerdict {
 if (!candidates.length) return { runway: null, confidence: 0, reason: "no-index" };

 const usable = candidates.filter((c) => c.similarity >= MIN_SIM);
 if (!usable.length) {
  return { runway: null, confidence: candidates[0].similarity, reason: "below-threshold", best: candidates[0] };
 }

 // A named brand is a hard filter: a lookalike from another house is not provenance.
 const wanted = brand ? houseKey(brand) : null;
 const inHouse = wanted
  ? usable.filter((c) => {
    const k = houseKey(c.house);
    return k === wanted || k.includes(wanted) || wanted.includes(k);
   })
  : usable;
 if (!inHouse.length) {
  return { runway: null, confidence: usable[0].similarity, reason: "brand-mismatch", best: usable[0] };
 }

 const groups = new Map<string, RunwayCandidate[]>();
 for (const c of inHouse) {
  const key = `${houseKey(c.house)}|${c.season}|${c.year}`;
  groups.set(key, [...(groups.get(key) ?? []), c]);
 }

 const ranked = [...groups.values()]
  .map((g) => ({ looks: g, best: Math.max(...g.map((x) => x.similarity)) }))
  .sort((a, b) => b.best - a.best);

 const winner = ranked[0];
 const runnerUp = ranked[1];
 const corroborated = winner.looks.length >= 2 || winner.best >= STRONG_SIM;
 const clear = !runnerUp || winner.best - runnerUp.best >= SEASON_MARGIN;

 if (!corroborated || !clear) {
  return { runway: null, confidence: winner.best, reason: "no-consensus", best: winner.looks[0], supporting: winner.looks.length };
 }

 const top = winner.looks.reduce((a, b) => (a.similarity >= b.similarity ? a : b));
 return { runway: formatRunway(top), confidence: winner.best, reason: "matched", best: top, supporting: winner.looks.length };
}
