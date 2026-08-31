// ───────────────────────────────────────────────────────────────────────────
// Brand LINES and tiers (pure, no I/O, unit-tested).
//
// A fashion house is not one price. "Ralph Lauren" spans a runway Collection
// gown that resells for thousands and a Lauren Ralph Lauren dress from a
// department store that resells for forty dollars. brandData.ts holds one entry
// for the whole house, and titleHasBrand() normalises punctuation away — so
// "Lauren Ralph Lauren" contains "ralphlauren" and passes as the parent brand.
//
// That is how a Ralph Lauren Fall 2008 runway gown got priced at $53: every comp
// the engine found was diffusion, and when EVERY candidate is diffusion, an
// instruction to "discard diffusion comps" leaves nothing to anchor to.
//
// This module is the fix: the specific LINE, its tier, and whether two lines can
// honestly be compared. Matching is longest-keyword-first, so the more specific
// line always wins over its parent.
// ───────────────────────────────────────────────────────────────────────────

/** Ordered cheapest-last. The distance between two tiers is what gates a comp. */
export const TIERS = ["couture", "runway", "mainline", "bridge", "diffusion"] as const;
export type BrandTier = (typeof TIERS)[number];
const TIER_RANK: Record<BrandTier, number> = { couture: 0, runway: 1, mainline: 2, bridge: 3, diffusion: 4 };

export type BrandLine = {
 house: string; // the family: "Ralph Lauren"
 label: string; // how this line reads: "Lauren Ralph Lauren"
 tier: BrandTier;
 keywords: string[]; // strings that identify THIS line in a title or on a tag
};

// Every multi-tier house we can price wrong. Ordered by house for maintenance;
// match order is by keyword length, so listing order here doesn't matter.
export const BRAND_LINES: BrandLine[] = [
 // ── Ralph Lauren ──
 { house: "Ralph Lauren", label: "Ralph Lauren Collection", tier: "runway", keywords: ["ralph lauren collection", "ralph lauren purple label", "purple label"] },
 { house: "Ralph Lauren", label: "Ralph Lauren Black Label", tier: "mainline", keywords: ["ralph lauren black label", "black label ralph lauren"] },
 { house: "Ralph Lauren", label: "RRL", tier: "mainline", keywords: ["rrl", "double rl", "ralph lauren rrl"] },
 { house: "Ralph Lauren", label: "Polo Ralph Lauren", tier: "bridge", keywords: ["polo ralph lauren", "polo by ralph lauren", "ralph lauren blue label", "polo sport", "rlx"] },
 { house: "Ralph Lauren", label: "Lauren Ralph Lauren", tier: "diffusion", keywords: ["lauren ralph lauren", "ralph lauren sport", "denim & supply", "denim and supply", "chaps ralph lauren"] },
 { house: "Ralph Lauren", label: "Ralph Lauren", tier: "mainline", keywords: ["ralph lauren"] },

 // ── Armani ──
 { house: "Armani", label: "Armani Privé", tier: "couture", keywords: ["armani prive", "armani privé"] },
 { house: "Armani", label: "Giorgio Armani", tier: "runway", keywords: ["giorgio armani"] },
 { house: "Armani", label: "Armani Collezioni", tier: "mainline", keywords: ["armani collezioni"] },
 { house: "Armani", label: "Emporio Armani", tier: "bridge", keywords: ["emporio armani"] },
 { house: "Armani", label: "Armani Exchange", tier: "diffusion", keywords: ["armani exchange", "a|x armani", "ax armani", "armani jeans"] },

 // ── Versace ──
 { house: "Versace", label: "Atelier Versace", tier: "couture", keywords: ["atelier versace"] },
 { house: "Versace", label: "Versace", tier: "runway", keywords: ["gianni versace", "versace"] },
 { house: "Versace", label: "Versace Collection", tier: "mainline", keywords: ["versace collection"] },
 { house: "Versace", label: "Versus Versace", tier: "diffusion", keywords: ["versus versace", "versus by versace", "v2 by versace"] },
 { house: "Versace", label: "Versace Jeans Couture", tier: "diffusion", keywords: ["versace jeans couture", "versace jeans", "versace sport"] },

 // ── Dolce & Gabbana ──
 { house: "Dolce & Gabbana", label: "Dolce & Gabbana", tier: "runway", keywords: ["dolce & gabbana", "dolce and gabbana", "dolce gabbana"] },
 { house: "Dolce & Gabbana", label: "D&G", tier: "diffusion", keywords: ["d&g dolce", "d & g dolce", "d&g"] },

 // ── Prada ──
 { house: "Prada", label: "Prada", tier: "runway", keywords: ["prada"] },
 { house: "Prada", label: "Prada Linea Rossa", tier: "mainline", keywords: ["prada linea rossa", "prada sport"] },

 // ── Marc Jacobs ──
 { house: "Marc Jacobs", label: "Marc Jacobs", tier: "runway", keywords: ["marc jacobs collection", "marc jacobs"] },
 { house: "Marc Jacobs", label: "Marc by Marc Jacobs", tier: "diffusion", keywords: ["marc by marc jacobs", "marc by marc"] },

 // ── Valentino ──
 { house: "Valentino", label: "Valentino", tier: "runway", keywords: ["valentino garavani", "valentino"] },
 { house: "Valentino", label: "RED Valentino", tier: "diffusion", keywords: ["red valentino", "redvalentino"] },

 // ── Alexander McQueen ──
 { house: "Alexander McQueen", label: "Alexander McQueen", tier: "runway", keywords: ["alexander mcqueen"] },
 { house: "Alexander McQueen", label: "McQ", tier: "diffusion", keywords: ["mcq alexander mcqueen", "mcq"] },

 // ── Chloé ──
 { house: "Chloé", label: "Chloé", tier: "runway", keywords: ["chloe", "chloé"] },
 { house: "Chloé", label: "See by Chloé", tier: "diffusion", keywords: ["see by chloe", "see by chloé"] },

 // ── Vivienne Westwood ──
 { house: "Vivienne Westwood", label: "Vivienne Westwood", tier: "runway", keywords: ["vivienne westwood gold label", "vivienne westwood couture", "vivienne westwood"] },
 { house: "Vivienne Westwood", label: "Vivienne Westwood Red Label", tier: "mainline", keywords: ["vivienne westwood red label", "westwood red label"] },
 { house: "Vivienne Westwood", label: "Anglomania", tier: "diffusion", keywords: ["vivienne westwood anglomania", "anglomania"] },

 // ── Comme des Garçons ──
 { house: "Comme des Garçons", label: "Comme des Garçons", tier: "runway", keywords: ["comme des garcons", "comme des garçons"] },
 { house: "Comme des Garçons", label: "CDG PLAY", tier: "diffusion", keywords: ["comme des garcons play", "cdg play", "play comme"] },

 // ── Yohji Yamamoto ──
 { house: "Yohji Yamamoto", label: "Yohji Yamamoto", tier: "runway", keywords: ["yohji yamamoto"] },
 { house: "Yohji Yamamoto", label: "Y's", tier: "mainline", keywords: ["y's yohji", "ys yohji"] },
 { house: "Yohji Yamamoto", label: "Y-3", tier: "diffusion", keywords: ["y-3", "y 3 yohji", "adidas y-3"] },

 // ── Issey Miyake ──
 { house: "Issey Miyake", label: "Issey Miyake", tier: "runway", keywords: ["issey miyake"] },
 { house: "Issey Miyake", label: "Pleats Please", tier: "mainline", keywords: ["pleats please", "homme plisse", "homme plissé"] },
 { house: "Issey Miyake", label: "me Issey Miyake", tier: "diffusion", keywords: ["me issey miyake", "haat issey"] },

 // ── Jean Paul Gaultier ──
 { house: "Jean Paul Gaultier", label: "Jean Paul Gaultier", tier: "runway", keywords: ["jean paul gaultier couture", "jean paul gaultier"] },
 { house: "Jean Paul Gaultier", label: "JPG Jeans", tier: "diffusion", keywords: ["jpg jeans", "gaultier jeans", "junior gaultier", "gaultier2", "jean paul gaultier jeans"] },

 // ── Moschino ──
 { house: "Moschino", label: "Moschino Couture", tier: "couture", keywords: ["moschino couture"] },
 { house: "Moschino", label: "Moschino", tier: "runway", keywords: ["moschino"] },
 { house: "Moschino", label: "Moschino Cheap and Chic", tier: "mainline", keywords: ["moschino cheap and chic", "cheap and chic", "boutique moschino"] },
 { house: "Moschino", label: "Love Moschino", tier: "diffusion", keywords: ["love moschino", "moschino jeans"] },

 // ── Burberry ──
 { house: "Burberry", label: "Burberry Prorsum", tier: "runway", keywords: ["burberry prorsum"] },
 { house: "Burberry", label: "Burberry", tier: "mainline", keywords: ["burberry london", "burberry"] },
 { house: "Burberry", label: "Burberry Brit", tier: "diffusion", keywords: ["burberry brit"] },

 // ── Saint Laurent ──
 { house: "Saint Laurent", label: "Saint Laurent", tier: "runway", keywords: ["saint laurent", "yves saint laurent", "ysl rive gauche"] },
 { house: "Saint Laurent", label: "YSL Variation", tier: "diffusion", keywords: ["ysl variation", "saint laurent variation"] },

 // ── Calvin Klein ──
 { house: "Calvin Klein", label: "Calvin Klein Collection", tier: "runway", keywords: ["calvin klein collection", "205w39nyc"] },
 { house: "Calvin Klein", label: "Calvin Klein", tier: "bridge", keywords: ["ck calvin klein", "calvin klein"] },
 { house: "Calvin Klein", label: "Calvin Klein Jeans", tier: "diffusion", keywords: ["calvin klein jeans", "ck jeans"] },

 // ── Donna Karan ──
 { house: "Donna Karan", label: "Donna Karan Collection", tier: "runway", keywords: ["donna karan collection", "donna karan new york", "donna karan"] },
 { house: "Donna Karan", label: "DKNY", tier: "diffusion", keywords: ["dkny"] },

 // ── Michael Kors ──
 { house: "Michael Kors", label: "Michael Kors Collection", tier: "mainline", keywords: ["michael kors collection"] },
 { house: "Michael Kors", label: "MICHAEL Michael Kors", tier: "diffusion", keywords: ["michael michael kors", "michael kors"] },

 // ── Missoni ──
 { house: "Missoni", label: "Missoni", tier: "runway", keywords: ["missoni"] },
 { house: "Missoni", label: "M Missoni", tier: "diffusion", keywords: ["m missoni", "missoni sport"] },

 // ── Max Mara ──
 { house: "Max Mara", label: "Max Mara", tier: "mainline", keywords: ["max mara"] },
 { house: "Max Mara", label: "'S Max Mara", tier: "bridge", keywords: ["s max mara", "max mara studio", "sportmax"] },
 { house: "Max Mara", label: "Weekend Max Mara", tier: "diffusion", keywords: ["weekend max mara", "max & co", "max and co", "marina rinaldi"] },

 // ── Blumarine ──
 { house: "Blumarine", label: "Blumarine", tier: "runway", keywords: ["blumarine"] },
 { house: "Blumarine", label: "Blugirl", tier: "diffusion", keywords: ["blugirl", "anna molinari"] },

 // ── Roberto Cavalli ──
 { house: "Roberto Cavalli", label: "Roberto Cavalli", tier: "runway", keywords: ["roberto cavalli"] },
 { house: "Roberto Cavalli", label: "Just Cavalli", tier: "diffusion", keywords: ["just cavalli", "class roberto cavalli", "class cavalli", "cavalli jeans"] },

 // ── Alexander Wang ──
 { house: "Alexander Wang", label: "Alexander Wang", tier: "runway", keywords: ["alexander wang"] },
 { house: "Alexander Wang", label: "T by Alexander Wang", tier: "diffusion", keywords: ["t by alexander wang", "t alexander wang"] },

 // ── Jil Sander ──
 { house: "Jil Sander", label: "Jil Sander", tier: "runway", keywords: ["jil sander"] },
 { house: "Jil Sander", label: "Jil Sander Navy", tier: "diffusion", keywords: ["jil sander navy", "j+ jil sander"] },

 // ── Paul Smith ──
 { house: "Paul Smith", label: "Paul Smith", tier: "mainline", keywords: ["paul smith"] },
 { house: "Paul Smith", label: "PS by Paul Smith", tier: "diffusion", keywords: ["ps by paul smith", "ps paul smith", "paul smith jeans"] },

 // ── Halston ──
 { house: "Halston", label: "Halston", tier: "runway", keywords: ["halston"] },
 { house: "Halston", label: "Halston Heritage", tier: "diffusion", keywords: ["halston heritage"] },

 // ── Carolina Herrera ──
 { house: "Carolina Herrera", label: "Carolina Herrera", tier: "runway", keywords: ["carolina herrera"] },
 { house: "Carolina Herrera", label: "CH Carolina Herrera", tier: "diffusion", keywords: ["ch carolina herrera"] },

 // ── Oscar de la Renta ──
 { house: "Oscar de la Renta", label: "Oscar de la Renta", tier: "runway", keywords: ["oscar de la renta"] },
 { house: "Oscar de la Renta", label: "O Oscar", tier: "diffusion", keywords: ["o oscar de la renta", "o oscar"] },

 // ── Vera Wang ──
 { house: "Vera Wang", label: "Vera Wang", tier: "runway", keywords: ["vera wang collection", "vera wang"] },
 { house: "Vera Wang", label: "Simply Vera", tier: "diffusion", keywords: ["simply vera", "white by vera wang", "vera wang lavender"] },

 // ── Zac Posen ──
 { house: "Zac Posen", label: "Zac Posen", tier: "runway", keywords: ["zac posen"] },
 { house: "Zac Posen", label: "ZAC Zac Posen", tier: "diffusion", keywords: ["zac zac posen"] },

 // ── Christian Lacroix ──
 { house: "Christian Lacroix", label: "Christian Lacroix", tier: "couture", keywords: ["christian lacroix"] },
 { house: "Christian Lacroix", label: "Bazar de Christian Lacroix", tier: "diffusion", keywords: ["bazar de christian lacroix", "bazar christian lacroix"] },

 // ── Emanuel Ungaro ──
 { house: "Ungaro", label: "Emanuel Ungaro", tier: "runway", keywords: ["emanuel ungaro", "ungaro"] },
 { house: "Ungaro", label: "Emanuel by Ungaro", tier: "diffusion", keywords: ["emanuel by emanuel ungaro", "emanuel by ungaro"] },

 // ── Escada ──
 { house: "Escada", label: "Escada", tier: "mainline", keywords: ["escada"] },
 { house: "Escada", label: "Escada Sport", tier: "diffusion", keywords: ["escada sport"] },

 // ── Tommy Hilfiger ──
 { house: "Tommy Hilfiger", label: "Hilfiger Collection", tier: "mainline", keywords: ["hilfiger collection"] },
 { house: "Tommy Hilfiger", label: "Tommy Hilfiger", tier: "bridge", keywords: ["tommy hilfiger"] },
 { house: "Tommy Hilfiger", label: "Tommy Jeans", tier: "diffusion", keywords: ["tommy jeans"] },

 // ── Kenneth Cole ──
 { house: "Kenneth Cole", label: "Kenneth Cole New York", tier: "bridge", keywords: ["kenneth cole new york"] },
 { house: "Kenneth Cole", label: "Reaction Kenneth Cole", tier: "diffusion", keywords: ["reaction kenneth cole", "kenneth cole reaction"] },

 // ── Coach ──
 { house: "Coach", label: "Coach 1941", tier: "mainline", keywords: ["coach 1941"] },
 { house: "Coach", label: "Coach", tier: "bridge", keywords: ["coach"] },

 // ── Isaac Mizrahi ──
 { house: "Isaac Mizrahi", label: "Isaac Mizrahi", tier: "runway", keywords: ["isaac mizrahi"] },
 { house: "Isaac Mizrahi", label: "Isaac Mizrahi Live", tier: "diffusion", keywords: ["isaac mizrahi live", "isaac mizrahi for target"] },

 // ── BCBG ──
 { house: "BCBG", label: "Hervé Léger", tier: "mainline", keywords: ["herve leger", "hervé léger"] },
 { house: "BCBG", label: "BCBG Max Azria", tier: "bridge", keywords: ["bcbg max azria", "bcbgmaxazria"] },
 { house: "BCBG", label: "BCBGeneration", tier: "diffusion", keywords: ["bcbgeneration"] },

 // ── Nicole Miller ──
 { house: "Nicole Miller", label: "Nicole Miller", tier: "mainline", keywords: ["nicole miller"] },
 { house: "Nicole Miller", label: "Nicole by Nicole Miller", tier: "diffusion", keywords: ["nicole by nicole miller"] },

 // ── Jason Wu ──
 { house: "Jason Wu", label: "Jason Wu Collection", tier: "runway", keywords: ["jason wu collection", "jason wu"] },
 { house: "Jason Wu", label: "Grey Jason Wu", tier: "diffusion", keywords: ["grey jason wu", "grey by jason wu"] },

 // ── Rachel Roy ──
 { house: "Rachel Roy", label: "Rachel Roy", tier: "mainline", keywords: ["rachel roy"] },
 { house: "Rachel Roy", label: "RACHEL Rachel Roy", tier: "diffusion", keywords: ["rachel rachel roy"] },

 // ── Tracy Reese ──
 { house: "Tracy Reese", label: "Tracy Reese", tier: "mainline", keywords: ["tracy reese"] },
 { house: "Tracy Reese", label: "Plenty by Tracy Reese", tier: "diffusion", keywords: ["plenty by tracy reese"] },

 // ── Thakoon ──
 { house: "Thakoon", label: "Thakoon", tier: "runway", keywords: ["thakoon"] },
 { house: "Thakoon", label: "Thakoon Addition", tier: "diffusion", keywords: ["thakoon addition"] },

 // ── Sonia Rykiel ──
 { house: "Sonia Rykiel", label: "Sonia Rykiel", tier: "runway", keywords: ["sonia rykiel"] },
 { house: "Sonia Rykiel", label: "Sonia by Sonia Rykiel", tier: "diffusion", keywords: ["sonia by sonia rykiel"] },

 // ── Anne Klein ──
 { house: "Anne Klein", label: "Anne Klein Collection", tier: "mainline", keywords: ["anne klein collection", "anne klein ii"] },
 { house: "Anne Klein", label: "Anne Klein", tier: "diffusion", keywords: ["anne klein"] },

 // ── Balmain ──
 { house: "Balmain", label: "Balmain", tier: "runway", keywords: ["balmain"] },
 { house: "Balmain", label: "Pierre Balmain", tier: "diffusion", keywords: ["pierre balmain"] },

 // ── Fendi ──
 { house: "Fendi", label: "Fendi", tier: "runway", keywords: ["fendi"] },
 { house: "Fendi", label: "Fendissime", tier: "diffusion", keywords: ["fendissime"] },

 // ── Dior ──
 { house: "Dior", label: "Christian Dior", tier: "runway", keywords: ["christian dior", "dior homme", "dior"] },
 { house: "Dior", label: "Miss Dior", tier: "diffusion", keywords: ["miss dior separates", "baby dior"] },

 // ── Kate Spade ──
 { house: "Kate Spade", label: "Kate Spade New York", tier: "bridge", keywords: ["kate spade new york", "kate spade"] },
 { house: "Kate Spade", label: "Kate Spade Saturday", tier: "diffusion", keywords: ["kate spade saturday"] },

 // ── Guess ──
 { house: "Guess", label: "Marciano", tier: "bridge", keywords: ["marciano"] },
 { house: "Guess", label: "Guess", tier: "diffusion", keywords: ["guess jeans", "guess"] },

 // ── Krizia ──
 { house: "Krizia", label: "Krizia", tier: "runway", keywords: ["krizia"] },
 { house: "Krizia", label: "Krizia Poi", tier: "diffusion", keywords: ["krizia poi", "krizia jeans"] },

 // ── Iceberg ──
 { house: "Iceberg", label: "Iceberg", tier: "mainline", keywords: ["iceberg"] },
 { house: "Iceberg", label: "Ice Iceberg", tier: "diffusion", keywords: ["ice iceberg", "iceberg jeans"] },
];

// Fold accents before stripping, or "Chloé" becomes "chlo" and stops matching
// "Chloe" — which is how most sellers actually type it. Same for Hervé Léger,
// Comme des Garçons, Issey's lines and anything else with a diacritic.
const norm = (s: string) =>
 (s || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

// Longest keyword first, so "lauren ralph lauren" is tested before "ralph lauren"
// and the specific line always beats its parent house.
const MATCHERS: { keyword: string; line: BrandLine }[] = BRAND_LINES
 .flatMap((line) => line.keywords.map((keyword) => ({ keyword: norm(keyword), line })))
 .sort((a, b) => b.keyword.length - a.keyword.length);

/** The most specific line named in a piece of text, or null when no house is named. */
export function resolveBrandLine(text: string | null | undefined): BrandLine | null {
 const t = ` ${norm(text ?? "")} `;
 if (t.trim().length < 2) return null;
 for (const { keyword, line } of MATCHERS) {
  if (t.includes(` ${keyword} `)) return line;
 }
 return null;
}

/** How far apart two tiers sit. Same tier = 0; runway vs diffusion = 3. */
export function tierDistance(a: BrandTier, b: BrandTier): number {
 return Math.abs(TIER_RANK[a] - TIER_RANK[b]);
}

/**
 * Widest tier gap still treated as a fair comparison. One step (Polo against
 * Lauren RL) is a reasonable neighbour; two or more (Collection against Lauren
 * RL) is a different market wearing the same name.
 */
export const MAX_COMP_TIER_GAP = 1;

/**
 * Is this comp title a fair price comparison for a piece of `line`?
 *
 * Only ever rejects on a KNOWN cross-tier conflict within the SAME house. A comp
 * from another house, or one we can't resolve, is left for the existing filters
 * and the model to judge — this narrows a specific, expensive failure rather
 * than becoming a second opinion on everything.
 */
export function isFairComp(line: BrandLine | null, compTitle: string): boolean {
 if (!line) return true;
 const other = resolveBrandLine(compTitle);
 if (!other || other.house !== line.house) return true;

 // A runway or couture piece is held to a stricter rule: the comp must name a
 // top line too. An unqualified house name on a resale listing is not evidence of
 // the Collection — on eBay it is overwhelmingly the cheap line, because runway
 // pieces barely trade there. Measured on a Ralph Lauren Fall 2008 gown: after
 // removing the explicit diffusion titles, the survivors were all bare "Ralph
 // Lauren" listings with a $49.99 median, which is department-store stock.
 // Leaving the pool near-empty is the honest outcome — the price engine already
 // has a branch for "essentially no true comps: price from what this exact piece
 // sells for, at lower confidence", which is the right answer for an archival piece.
 if (line.tier === "couture" || line.tier === "runway") {
  return other.tier === "couture" || other.tier === "runway";
 }
 return tierDistance(line.tier, other.tier) <= MAX_COMP_TIER_GAP;
}

/**
 * Sibling lines of the same house that must be kept out of a comp search,
 * FURTHEST TIER FIRST. The ordering is the point: a search string can only carry
 * so many exclusions, and the cheapest line is both the most damaging comp and
 * the most numerous in results, so it has to be excluded before the near ones.
 */
export function rivalLines(line: BrandLine | null): BrandLine[] {
 if (!line) return [];
 return BRAND_LINES
  .filter((l) => l.house === line.house && l.label !== line.label && tierDistance(l.tier, line.tier) > MAX_COMP_TIER_GAP)
  .sort((a, b) => tierDistance(b.tier, line.tier) - tierDistance(a.tier, line.tier));
}

/**
 * Negative search PHRASES that keep a comp lookup out of the wrong tier.
 *
 * Phrases, not words, because the lines that matter most share every word with
 * their parent: excluding "lauren" while searching Ralph Lauren Collection would
 * return nothing, but excluding the phrase "lauren ralph lauren" removes exactly
 * the department-store line and leaves the Collection results intact. Anything
 * contained within the wanted line's own name is skipped for the same reason.
 */
export function compExclusions(line: BrandLine | null, limit = 4): string[] {
 if (!line) return [];
 const mine = norm(line.label);
 const out: string[] = [];
 // Each rival's own name first, then its aliases — so a tight limit still spends
 // its budget on the line itself rather than on that line's sub-brands.
 const rivals = rivalLines(line);
 const phrases = [...rivals.map((r) => norm(r.label)), ...rivals.flatMap((r) => r.keywords.map(norm))];
 for (const rival of [{ phrases }]) {
  for (const phrase of rival.phrases) {
   if (phrase.length < 3) continue;
   // Skip only a phrase the WANTED line's own name contains — that would exclude
   // the piece itself. The reverse is fine and is the common case: "versus
   // versace" contains "versace", but excluding that phrase removes only the
   // diffusion line and leaves plain Versace results untouched.
   if (mine.includes(phrase)) continue;
   if (!out.includes(phrase)) out.push(phrase);
  }
 }
 return out.slice(0, limit);
}

/**
 * True when the resolved line is just the house name — what a seller types off a
 * tag ("Ralph Lauren") rather than a specific line ("Ralph Lauren Collection").
 * These are the cases worth resolving from the garment, because the same words
 * cover several markets.
 */
export function isAmbiguousHouse(line: BrandLine | null): boolean {
 return Boolean(line && norm(line.label) === norm(line.house) && rivalLines(line).length > 0);
}

/** Every line of a house, most prestigious first — the options to choose between. */
export function linesOfHouse(house: string): BrandLine[] {
 return BRAND_LINES.filter((l) => l.house === house).sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);
}

/** Look a line up by its exact label, for turning a chosen label back into a line. */
export function lineByLabel(label: string): BrandLine | null {
 const target = norm(label);
 return BRAND_LINES.find((l) => norm(l.label) === target) ?? null;
}

/** The phrase to search comps with: the specific line, never the bare house. */
export function compQueryBrand(line: BrandLine | null, fallback: string): string {
 return line ? line.label : fallback;
}
