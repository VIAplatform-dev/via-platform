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
 /**
  * The brand the unknown-name veto refused, kept so the veto can be UNDONE.
  *
  * The veto is a bet: that a name the map does not know, repeating across the titles, is the real
  * designer and the house that scored is a stray. When nothing corroborates that name, the bet was
  * wrong in both directions at once, and a brand the map DID recognise was thrown away for it.
  */
 vetoed?: string | null;
};

/** At least this many matches must name the brand: one mention is not agreement. */
const MIN_HITS = 3;
/** And they must be this much of ALL matches. 5 of 31 is not what "the web agrees" means. */
const MIN_SHARE = 0.3;
/** And the winner must be clear of the runner-up, or it is a split, not a consensus. */
const MIN_MARGIN = 1.5;
/** A name has to recur this often before it counts as the piece's designer rather than noise. */
const MIN_NAME_REPEATS = 3;

/**
 * POSITION IS EVIDENCE, and the tally was throwing it away.
 *
 * Google Lens returns visual_matches ordered by how well they match: the first few ARE the piece,
 * the tail is "something else that also has leopard on it". Counting every title equally lets a
 * long tail of loosely-similar garments outvote the two listings that are the same garment.
 *
 * A Roberto Cavalli bustier came back branded Dolce & Gabbana on exactly this: positions 1, 2 and 3
 * all said Roberto Cavalli, and a dozen vaguely-similar leopard tops further down said something
 * else more often. The seller read it off the search herself: "the first two are perfect matches,
 * the rest aren't, and that threw off the whole grade."
 *
 * A gentle decay rather than a cliff: position 1 counts 1.00, position 4 about 0.49, position 12
 * about 0.23, position 25 about 0.10. The tail still speaks, it just no longer shouts.
 */
const RANK_DECAY = 0.35;
export function rankWeight(index: number): number {
 return 1 / (1 + Math.max(0, index) * RANK_DECAY);
}

/**
 * The first few matches are a different KIND of evidence from the rest.
 *
 * When the near-exact matches agree on a brand, that is the answer: they are the same garment on
 * someone else's site, not a lookalike. Two of the top three is deliberately a low bar, because
 * three exact matches is already more than most archival pieces ever get, and the alternative is
 * letting the tail decide.
 */
const TOP_BLOCK = 3;
const TOP_BLOCK_MIN = 2;

// Words that start a title and are capitalised without being anybody's name.
// A PATTERN IS NOT A DESIGNER, AND NEITHER IS A CUT.
// "Leopard Print" recurs on every title of a leopard-print top and
// was eligible to win as the piece's "unknown designer", which both vetoes the real brand and
// corroborates nothing. Garment and material words are here for the same reason: "Bustier Cami"
// appears on more of these pages than the house that made it.
const NOT_A_NAME = new RegExp(
 "^(the|a|an|for|new|used|vintage|rare|authentic|genuine|original|womens|women|mens|men|sale|shop|buy|free|size|nwt|euc|vtg" +
 "|black|white|red|blue|green|pink|gold|silver|brown|beige|navy|grey|gray|cream|ivory|tan|olive" +
 "|spring|summer|autumn|fall|winter|runway|archival|documented|collection|look|piece" +
 "|dress|skirt|top|coat|jacket|bag|shoes|boots|bustier|cami|camisole|corset|bodysuit|blouse|shirt|trousers|jeans|knit|cardigan|blazer|gown|slip|lingerie|underwear" +
 "|leopard|animal|zebra|snake|python|floral|paisley|houndstooth|tartan|plaid|stripe|striped|print|printed|feather|lace|mesh|satin|silk|velvet|denim|leather|suede|cashmere|wool|cotton|linen" +
 "|pixel|graphic|photo|photographic|abstract|geometric|baroque|damask|brocade|gingham|check|checked|polka|dot|dots|camo|camouflage|patchwork|crochet|tulle|chiffon|jersey|tweed|corduroy|sequins|rhinestone|metallic|glitter|logo|monogram|embroidered|embroidery|applique" +
 "|cutout|cut|mini|midi|maxi|micro|crop|cropped|oversized|fitted|sleeveless|strapless|halter|wrap|pleated|ruched|beaded|sequin|sequined|embellished|quilted|padded|sheer|button|buttoned|zip|zipped|high|low|long|short|tie|off|shoulder|neck|scoop|square|waist|rise|line|sleeve|sleeved" +
 "|made|italy|france|paris|london|milan|york|japan|usa)$",
 "i",
);

/**
 * Could this be a maker's name at all?
 *
 * A BRANDED PIECE WAS LISTED AS "VENUS PIXEL SILK". The photograph was a Dolce & Gabbana Botticelli
 * print shirt, forty-two web matches said so, and the brand field said Venus Pixel Silk: three
 * capitalised words lifted out of the garment's own description. It then drove the comp search, so
 * the price was worked out for a house that does not exist.
 *
 * One fabric, cut, colour or garment word anywhere in the phrase is enough to refuse it. No house
 * is called Venus Pixel Silk, and the cost of being wrong here is asymmetric: refusing a real name
 * asks the seller to type it, accepting a false one prices her piece against nothing.
 */
export function plausibleBrandName(name: string | null | undefined): boolean {
 const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
 if (!words.length || words.length > 4) return false;
 return !words.some((w) => NOT_A_NAME.test(w.replace(/[^A-Za-z0-9'\u2019]/g, "")));
}

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
  // Runs of capitalised words: "Todd Oldham", "Vintage Todd Oldham", "Jean Paul Gaultier".
  for (const m of String(t || "").matchAll(/\b([A-Z][a-z'’]{1,14}(?:\s+[A-Z][a-z'’]{1,14}){1,3})\b/g)) {
   // A NON-NAME WORD TRIMS THE RUN, IT DOES NOT DISCARD IT.
   //
   // This used to skip the whole phrase the moment one word failed, so "Vintage Todd Oldham"
   // contributed nothing and the designer went uncounted on any title that happened to open with
   // "Vintage" or "Rare". Three titles naming him could score two. Splitting on the failing words
   // keeps the name and drops only the noise around it.
   const run = m[1].split(/\s+/);
   let segment: string[] = [];
   const segments: string[][] = [];
   for (const w of run) {
    if (NOT_A_NAME.test(w)) { if (segment.length) segments.push(segment); segment = []; }
    else segment.push(w);
   }
   if (segment.length) segments.push(segment);

   for (const seg of segments) {
    // Two or three words. One capitalised word is a word, not a designer.
    if (seg.length < 2) continue;
    const phrase = seg.slice(0, 3).join(" ");
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const e = tally.get(key) ?? { label: phrase, docs: 0 };
    e.docs += 1;
    tally.set(key, e);
   }
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
 // Two tallies in one pass: the weighted score decides the winner, the raw count is what the "at
 // least three said so" floor is measured against, so a brand can never win on one lucky position.
 const score = new Map<string, number>();
 const count = new Map<string, number>();
 const topBlock = new Map<string, number>();
 titles.forEach((t, i) => {
  const b = inferBrand(t);
  if (!b) return;
  score.set(b, (score.get(b) || 0) + rankWeight(i));
  count.set(b, (count.get(b) || 0) + 1);
  if (i < TOP_BLOCK) topBlock.set(b, (topBlock.get(b) || 0) + 1);
 });
 const ranked = [...score.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
 const top = ranked[0] ?? null;
 const runnerUp = ranked[1] ? { brand: ranked[1][0], hits: count.get(ranked[1][0]) ?? 0 } : null;
 // ONLY FROM THE TITLES THE MAP CANNOT NAME.
 //
 // The unknown-name rule is for a designer missing from the map. A title that already names a house
 // the map knows is not evidence of one: its capitalised words are describing the garment. Read
 // over all forty-two "1990s Dolce & Gabbana Birth of Venus Botticelli Pixel Print Silk Shirt"
 // titles, this found "Venus Pixel Silk", vetoed Dolce & Gabbana with it, and then handed the same
 // phrase back as the brand.
 const unknownName = repeatedName(titles.filter((t) => !inferBrand(t)));
 const base = { hits: top ? (count.get(top[0]) ?? 0) : 0, total, runnerUp, unknownName, vetoed: null as string | null };

 if (!top) return { ...base, brand: null, reason: "none" };
 const brand = top[0];
 const hits = count.get(brand) ?? 0;



 // WOULD THIS BRAND HAVE WON ON ITS OWN? Asked here, before the veto, because the veto is the one
 // refusal that can be taken back later (see resolveBrandName), and a brand that also failed the
 // floors must never come back through that door. Five stray Chanel bags among thirty-one Todd
 // Oldham dresses fail on share, and they have to keep failing on share after the veto is undone.
 const contested = [...topBlock.keys()].some((b) => b !== brand);
 const nearExact = !contested && (topBlock.get(brand) ?? 0) >= TOP_BLOCK_MIN;
 const wouldAgree =
  hits >= MIN_HITS &&
  hits / Math.max(1, total) >= MIN_SHARE &&
  (nearExact || !runnerUp || hits >= runnerUp.hits * MIN_MARGIN);

 // A name the map does not know, on more pages than the brand that scored: the map is the thing
 // that is wrong here, not the model. Refusing costs an occasional correct answer; accepting brands
 // an archival piece as whichever famous house wandered into the results.
 if (unknownName && !brand.toLowerCase().includes(unknownName.toLowerCase().split(" ")[0])) {
  return { ...base, brand: null, reason: "unknown-designer", vetoed: wouldAgree ? brand : null };
 }
 if (hits < MIN_HITS) return { ...base, brand: null, reason: "too-few" };
 if (hits / Math.max(1, total) < MIN_SHARE) return { ...base, brand: null, reason: "too-thin" };

 // THE MARGIN RULE, AND THE ONE THING THAT OVERRIDES IT.
 //
 // The margin exists so a 6-vs-5 split is never called agreement, and it is still counted on RAW
 // hits: a brand that wins only because its mentions sit high should not also get to claim the web
 // agrees with it. But when the near-exact matches agree, a bare count is the wrong question. The
 // Cavalli bustier had three Roberto Cavalli listings at positions 1-3 and five loosely-similar
 // Dolce & Gabbana tops below them: 3 against 5 on the count, and the three were the garment.
 //
 // So two of the top three naming the same house waives the margin, and ONLY the margin. The
 // floors above still apply: three mentions minimum, and a real share of all the matches. Three
 // Gucci bags among twenty unbranded results still fails on share, exactly as before.
 // UNANIMOUS, not merely ahead. Two of the top three is not enough on its own: brands alternating
 // through the results (Dior, Gucci, Dior…) hand the leader two of the first three by accident,
 // and that is the split the margin rule exists to catch. A competing house anywhere in the near-
 // exact block means these are lookalikes, not the same garment, so the margin stands.
 if (!nearExact && runnerUp && hits < runnerUp.hits * MIN_MARGIN) {
  return { ...base, brand: null, reason: "too-close" };
 }
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
 if (name && plausibleBrandName(name)) {
  // THE WHOLE NAME, NOT ITS FIRST WORD.
  //
  // Matching on the first word alone let a phrase corroborate itself: "Venus Pixel Silk" was
  // harvested out of the web titles, and the drafter's title, which is a rewrite of those same
  // titles, contains the word "Venus". Two sources that are the same source. The full phrase is
  // the test, and "Todd Oldham" passes it in every title that ever named him.
  const needle = name.toLowerCase();
  const alsoSaidBy = [args.draftTitle, args.draftRunway, args.draftBrand]
   .some((v) => String(v ?? "").toLowerCase().includes(needle));
  if (alsoSaidBy) {
   // Not as high as a map-backed consensus: this is a name we read, not a brand we know.
   return { brand: name, confidence: 0.8, source: "corroborated-name" };
  }
 }
 // The repeated name was noise. If it vetoed a brand the map recognised, that veto goes with it:
 // refusing the known house was only ever justified by the unknown name being real.
 if (c.vetoed) {
  const restored = { ...c, brand: c.vetoed };
  return { brand: c.vetoed, confidence: consensusConfidence(restored), source: "consensus" };
 }
 // Nothing corroborated: keep whatever the drafter already had rather than blanking a filled field,
 // unless what it had cannot be anybody's name. A brand is not a free-text field to a pricer: it is
 // the search term the comps are drawn from, so junk in it is worse than nothing in it.
 const kept = String(args.draftBrand ?? "").trim();
 if (kept && plausibleBrandName(kept)) return { brand: kept, confidence: 0.6, source: "draft" };
 return { brand: null, confidence: 0, source: "none" };
}
