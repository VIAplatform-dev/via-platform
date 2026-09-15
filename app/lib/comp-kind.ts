// Is this comparable even the same KIND of thing? Pure.
//
// A Todd Oldham dress came back priced against Chanel handbags, shoes and jewellery. The pricer
// noticed, and said so in the note it printed under the price: "the candidate list is dominated by
// Chanel bags, shoes, and jewelry with no true garment peers". It produced a number anyway, and the
// number was 16,013 for a dress that sells for about 1,681.
//
// The brand was wrong, and that has been fixed at the root (brand-consensus.ts). This is the second
// layer, because the brand is not the only way the wrong things get into the candidate list: a
// visual search on a runway photograph returns whatever the model is also wearing, whatever the
// brand also sells, and whatever the site put in its sidebar. A handbag is not a comparable sale for
// a dress at any brand, however similar the photograph looked.
//
// COARSE ON PURPOSE. Four buckets, not a taxonomy. It only has to separate the things whose prices
// live in different worlds; telling a midi skirt from a mini is the pricer's job, not this one's.
// Anything it cannot read is kept, because a filter that guesses is worse than one that abstains.

export type CompKind = "garment" | "bag" | "shoes" | "jewellery" | null;

// ORDER IS PRECEDENCE, and garment comes first on purpose. Jewellery words turn up as DETAILS on
// clothes far more often than clothing words turn up on jewellery: an "O-Ring" mini dress, a "cuff"
// sleeve, a "charm" belt. Reading the list bag-first classified the Oldham dress as jewellery off
// the words "Rhinestone O-Ring". Shoes sit above bags for the same reason in reverse ("boot bag",
// "bootie"): the thing on the foot wins.
const PATTERNS: Array<[CompKind, RegExp]> = [
 ["garment", /\b(dress|dresses|gown|gowns|skirt|skirts|top|tops|blouse|blouses|shirt|shirts|tee|tees|t-shirts?|sweater|sweaters|jumper|jumpers|knit|knits|cardigan|cardigans|coat|coats|jacket|jackets|blazer|blazers|trouser|trousers|pant|pants|jean|jeans|short|shorts|jumpsuit|jumpsuits|romper|rompers|bodysuit|bodysuits|camisole|camisoles|corset|corsets|bustier|bustiers|vest|vests|waistcoat|waistcoats|kaftan|caftan|robe|robes|suit|suits)\b/i],
 ["shoes", /\b(shoe|shoes|boot|boots|bootie|booties|sneaker|sneakers|trainers?|heel|heels|pump|pumps|loafer|loafers|sandal|sandals|mule|mules|flat|flats|slingback|slingbacks|stiletto|stilettos|espadrille|espadrilles|clog|clogs)\b/i],
 ["bag", /\b(bag|bags|handbag|handbags|purse|purses|clutch|clutches|tote|totes|satchel|satchels|crossbody|shoulder bag|backpack|backpacks|pouch|wallet|wallets|briefcase|duffle|duffel|weekender|luggage|suitcase)\b/i],
 // No bare "ring", "cuff" or "charm": those are findings on other things at least as often as they
 // are the thing itself, which is exactly how a dress became jewellery.
 ["jewellery", /\b(necklace|necklaces|bracelet|bracelets|earring|earrings|rings|brooch|brooches|pendant|pendants|choker|chokers|jewel|jewels|jewellery|jewelry|wristwatch|tiara)\b/i],
];

/** What kind of thing a title is about, or null when it does not say. */
export function compKind(title: string | null | undefined): CompKind {
 const t = String(title ?? "");
 for (const [kind, re] of PATTERNS) if (re.test(t)) return kind;
 return null;
}

/**
 * Drop comparables that are a different kind of thing from the piece being priced.
 *
 * Both sides have to be readable for anything to be dropped. A comp that says nothing about what it
 * is stays, and so does everything when the piece itself is unreadable: this is a guard against an
 * obvious mismatch, not an attempt to curate the list.
 */
export function filterKindConflicts<T extends { title?: string | null }>(
 comps: T[],
 pieceTitle: string | null | undefined,
 pieceCategory?: string | null,
): T[] {
 const want = compKind(pieceTitle) ?? compKind(pieceCategory);
 if (!want) return comps;
 return comps.filter((c) => {
  const k = compKind(c.title);
  return k === null || k === want;
 });
}

/**
 * Whether what survived is still worth pricing against.
 *
 * The Oldham dress had NO true garment peers and was priced anyway. When the filter has thrown out
 * most of the list, the honest answer is that there are no comparables, not a number derived from
 * whatever was left. The caller decides what to do with that; this only reports it.
 */
export function comparablesAreThin(kept: number, original: number): boolean {
 if (original === 0) return true;
 return kept < 3 || kept / original < 0.34;
}
