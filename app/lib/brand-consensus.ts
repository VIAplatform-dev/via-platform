// Whether reverse-image matches actually agree on a brand, or only look like they do. Pure.
//
// THE FAILURE THIS EXISTS TO STOP. A Todd Oldham S/S 1995 runway dress came back branded Chanel.
// Reverse image search returned 31 matches; 26 of them said "Todd Oldham" in the title and 5 were
// loosely-similar Chanel bags, shoes and jewellery. The tally scored Chanel 5 and Todd Oldham 0,
// because the tally can only count brands that exist in the canonical map and Todd Oldham is not in
// it. Five out of thirty-one then overrode the model's correct answer at 0.85 confidence, and the
// wrong brand went on to drive the comp search, which priced a 1,681 dress against 16,013 of Chanel
// handbags.
//
// TWO THINGS WERE WRONG, AND THE SECOND IS THE DANGEROUS ONE.
//
// 1. There was no threshold. The winner was whichever brand had the most hits, so one mention beat
//    zero and 16% was called "consensus". A share and a margin fix that.
//
// 2. The tally is BLIND TO WHAT IT DOES NOT KNOW. A designer missing from the map scores nothing, so
//    the more obscure the real designer, the more likely a passing mention of a famous house wins.
//    The bug is worst exactly where it costs most: archival pieces by designers outside the canon
//    are the ones whose brand a seller cannot look up herself. Adding Todd Oldham to the map fixes
//    this piece and not the next one. So the titles are also read for a REPEATED NAME the map does
//    not know, and when one is there, a minority of a known brand is refused.

export type Consensus = {
 /** The brand the matches agree on, or null when they do not agree. */
 brand: string | null;
 hits: number;
 total: number;
 /** The runner-up, so a 6-vs-5 split is never mistaken for agreement. */
 runnerUp: { brand: string; hits: number } | null;
 /** A name the titles keep repeating that the brand map has never heard of. */
 unknownName: string | null;
 /** Why it refused, when it did. For the log line and the seller-facing note. */
 reason: "agreed" | "too-few" | "too-thin" | "too-close" | "unknown-designer" | "none";
};

/** At least this many matches must name the brand: one mention is not agreement. */
const MIN_HITS = 3;
/** And they must be this much of ALL matches. 5 of 31 is not what "the web agrees" means. */
const MIN_SHARE = 0.3;
/** And the winner must be clear of the runner-up, or it is a split, not a consensus. */
const MIN_MARGIN = 1.5;
/** A name has to recur this often before it counts as the piece's designer rather than noise. */
const MIN_NAME_REPEATS = 3;

// Words that start a title and are capitalised without being anybody's name.
const NOT_A_NAME = new RegExp(
 "^(the|a|an|for|new|used|vintage|rare|authentic|genuine|original|womens|women|mens|men|sale|shop|buy|free|size|nwt|euc|vtg|black|white|red|blue|green|pink|gold|silver|brown|beige|navy|grey|gray|spring|summer|autumn|fall|winter|runway|archival|documented|collection|look|piece|dress|skirt|top|coat|jacket|bag|shoes|boots|made|italy|france|paris|london|milan|york)$",
 "i",
);

/**
 * A capitalised two-or-three word name that keeps coming up across the titles.
 *
 * Deliberately crude: it is not trying to read a designer's name, only to notice that the same
 * proper noun is on most of these pages while the brand map is scoring something else. That is
 * enough to say "do not overwrite the model's answer with a minority", which is all it is used for.
 */
export function repeatedName(titles: string[]): string | null {
 const tally = new Map<string, { label: string; docs: number }>();
 for (const t of titles) {
  const seen = new Set<string>();
  // Runs of capitalised words: "Todd Oldham", "Jean Paul Gaultier".
  for (const m of String(t || "").matchAll(/\b([A-Z][a-z'’]{1,14}(?:\s+[A-Z][a-z'’]{1,14}){1,2})\b/g)) {
   const phrase = m[1].replace(/\s+/g, " ").trim();
   const words = phrase.split(" ");
   // Every word has to be a plausible name word, or "Black Cutout Mini" counts as a designer.
   if (words.some((w) => NOT_A_NAME.test(w))) continue;
   const key = phrase.toLowerCase();
   if (seen.has(key)) continue;
   seen.add(key);
   const e = tally.get(key) ?? { label: phrase, docs: 0 };
   e.docs += 1;
   tally.set(key, e);
  }
 }
 let best: { label: string; docs: number } | null = null;
 for (const v of tally.values()) if (!best || v.docs > best.docs) best = v;
 return best && best.docs >= MIN_NAME_REPEATS ? best.label : null;
}

/**
 * Do these matches agree on a brand?
 *
 * `inferBrand` is passed in rather than imported so this stays testable: the real one reaches the
 * canonical brand map, which reaches the database.
 */
export function brandConsensus(
 titles: string[],
 inferBrand: (title: string) => string | null,
): Consensus {
 const total = titles.length;
 const tally = new Map<string, number>();
 for (const t of titles) {
  const b = inferBrand(t);
  if (b) tally.set(b, (tally.get(b) || 0) + 1);
 }
 const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
 const top = ranked[0] ?? null;
 const runnerUp = ranked[1] ? { brand: ranked[1][0], hits: ranked[1][1] } : null;
 const unknownName = repeatedName(titles);
 const base = { hits: top?.[1] ?? 0, total, runnerUp, unknownName };

 if (!top) return { ...base, brand: null, reason: "none" };
 const [brand, hits] = top;

 // A name the map does not know, on more pages than the brand that scored: the map is the thing
 // that is wrong here, not the model. Refusing costs an occasional correct answer; accepting brands
 // an archival piece as whichever famous house wandered into the results.
 if (unknownName && !brand.toLowerCase().includes(unknownName.toLowerCase().split(" ")[0])) {
  return { ...base, brand: null, reason: "unknown-designer" };
 }
 if (hits < MIN_HITS) return { ...base, brand: null, reason: "too-few" };
 if (hits / Math.max(1, total) < MIN_SHARE) return { ...base, brand: null, reason: "too-thin" };
 if (runnerUp && hits < runnerUp.hits * MIN_MARGIN) return { ...base, brand: null, reason: "too-close" };
 return { ...base, brand, reason: "agreed" };
}

/**
 * How much to trust an agreed brand. Only ever called when the matches actually agreed.
 *
 * It scales with the share rather than sitting at a flat 0.85, so a brand named by half the web
 * outranks one named by a third, and the review screen can gate the weaker one.
 */
export function consensusConfidence(c: Consensus): number {
 if (c.brand === null) return 0;
 const share = c.hits / Math.max(1, c.total);
 return Math.max(0.6, Math.min(0.92, 0.55 + share * 0.5));
}


/**
 * The brand, after everything that has an opinion has had one.
 *
 * WHY THIS EXISTS AND NOT JUST A VETO. Refusing the Chanel minority was only half an answer: it
 * left the field blank on a piece the system had ALREADY identified. The title said "Todd Oldham
 * S/S 1995 Black Cutout Mini Dress" and the runway field said "Todd Oldham S/S 1995". Making a
 * seller retype a name we put on the screen ourselves is not a fix, it is a shrug.
 *
 * So a designer the brand map has never heard of can still become the brand, on one condition: TWO
 * INDEPENDENT SOURCES have to name him. The web titles are one (the repeated name), and the model's
 * own reading of the photograph is the other (its title, or the show it tied the piece to). That
 * pairing is what makes this safe. A name from the web titles alone is not enough, because reverse
 * image results are full of names that are not the designer: the model wearing it, the photographer,
 * the shop reselling it. "Nadia Auermann" appears all over this dress's results and never made it
 * into the brand field, because the drafter never wrote it down as a maker.
 */
export function resolveBrandName(args: {
 consensus: Consensus;
 /** What the drafter wrote from the photograph. */
 draftTitle?: string | null;
 draftRunway?: string | null;
 draftBrand?: string | null;
}): { brand: string | null; confidence: number; source: "consensus" | "corroborated-name" | "draft" | "none" } {
 const { consensus: c } = args;
 if (c.brand) return { brand: c.brand, confidence: consensusConfidence(c), source: "consensus" };

 const name = c.unknownName;
 if (name) {
  const first = name.split(" ")[0].toLowerCase();
  // Named by the drafter too, in the title or in the show it identified. Two sources, one name.
  const alsoSaidBy = [args.draftTitle, args.draftRunway, args.draftBrand]
   .some((v) => String(v ?? "").toLowerCase().includes(first));
  if (alsoSaidBy) {
   // Not as high as a map-backed consensus: this is a name we read, not a brand we know.
   return { brand: name, confidence: 0.8, source: "corroborated-name" };
  }
 }
 // Nothing corroborated: keep whatever the drafter already had rather than blanking a filled field.
 const kept = String(args.draftBrand ?? "").trim();
 return kept ? { brand: kept, confidence: 0.6, source: "draft" } : { brand: null, confidence: 0, source: "none" };
}
