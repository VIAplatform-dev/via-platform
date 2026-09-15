export type BrandDef = {
 slug: string;
 label: string;
 keywords: string[];
};

export const brands: BrandDef[] = [
 // Mega luxury
 { slug: "chanel", label: "Chanel", keywords: ["chanel"] },
 { slug: "hermes", label: "Hermes", keywords: ["hermes", "hermès", "birkin"] },
 { slug: "louis-vuitton", label: "Louis Vuitton", keywords: ["louis vuitton", "louis vuiton", "louie vuitton", "lv"] },
 { slug: "dior", label: "Dior", keywords: ["dior", "christian dior", "cd"] },
 { slug: "gucci", label: "Gucci", keywords: ["gucci"] },
 { slug: "prada", label: "Prada", keywords: ["prada"] },
 { slug: "bottega-veneta", label: "Bottega Veneta", keywords: ["bottega veneta", "bottega", "bv"] },
 { slug: "saint-laurent", label: "Saint Laurent", keywords: ["saint laurent", "ysl", "yves saint laurent", "st laurent", "yves st laurent", "saint laurant"] },
 { slug: "balenciaga", label: "Balenciaga", keywords: ["balenciaga", "balenciga"] },
 { slug: "celine", label: "Celine", keywords: ["celine", "céline"] },
 { slug: "chloe", label: "Chloé", keywords: ["chloe", "chloé"] },
 { slug: "loewe", label: "Loewe", keywords: ["loewe"] },
 { slug: "fendi", label: "Fendi", keywords: ["fendi"] },
 { slug: "valentino", label: "Valentino", keywords: ["valentino"] },
 { slug: "giuseppe-zanotti", label: "Giuseppe Zanotti", keywords: ["giuseppe zanotti", "zanotti"] },
 { slug: "givenchy", label: "Givenchy", keywords: ["givenchy"] },
 { slug: "versace", label: "Versace", keywords: ["versace", "gianni versace", "versachi"] },
 { slug: "dolce-gabbana", label: "Dolce & Gabbana", keywords: ["dolce & gabbana", "dolce and gabbana", "dolce gabbana", "d&g"] },
 { slug: "burberry", label: "Burberry", keywords: ["burberry", "burbery", "burburry"] },
 { slug: "miu-miu", label: "Miu Miu", keywords: ["miu miu"] },
 { slug: "balmain", label: "Balmain", keywords: ["balmain"] },
 { slug: "lanvin", label: "Lanvin", keywords: ["lanvin"] },
 // Contemporary luxury
 { slug: "alexander-mcqueen", label: "Alexander McQueen", keywords: ["alexander mcqueen", "mcqueen"] },
 { slug: "stella-mccartney", label: "Stella McCartney", keywords: ["stella mccartney"] },
 { slug: "maison-margiela", label: "Maison Margiela", keywords: ["margiela", "maison margiela", "mm6", "martin margiela"] },
 { slug: "marni", label: "Marni", keywords: ["marni"] },
 { slug: "missoni", label: "Missoni", keywords: ["missoni"] },
 { slug: "moschino", label: "Moschino", keywords: ["moschino"] },
 { slug: "tom-ford", label: "Tom Ford", keywords: ["tom ford"] },
 { slug: "proenza-schouler", label: "Proenza Schouler", keywords: ["proenza schouler", "ps1"] },
 { slug: "acne-studios", label: "Acne Studios", keywords: ["acne studios", "acne"] },
 { slug: "rag-bone", label: "Rag & Bone", keywords: ["rag & bone", "rag and bone"] },
 { slug: "alexander-wang", label: "Alexander Wang", keywords: ["alexander wang"] },
 { slug: "kenzo", label: "Kenzo", keywords: ["kenzo"] },
 { slug: "mcm", label: "MCM", keywords: ["mcm"] },
 { slug: "mulberry", label: "Mulberry", keywords: ["mulberry"] },
 { slug: "paul-smith", label: "Paul Smith", keywords: ["paul smith"] },
 // Vintage / archive
 { slug: "helmut-lang", label: "Helmut Lang", keywords: ["helmut lang"] },
 { slug: "thierry-mugler", label: "Thierry Mugler", keywords: ["mugler", "thierry mugler"] },
 { slug: "azzedine-alaia", label: "Azzedine Alaïa", keywords: ["alaia", "alaïa", "azzedine alaia"] },
 { slug: "comme-des-garcons", label: "Comme des Garçons", keywords: ["comme des garçons", "comme des garcons", "cdg", "commes des garcons"] },
 { slug: "issey-miyake", label: "Issey Miyake", keywords: ["issey miyake", "pleats please"] },
 { slug: "yohji-yamamoto", label: "Yohji Yamamoto", keywords: ["yohji yamamoto", "y's yohji", "y-3"] },
 { slug: "jean-paul-gaultier", label: "Jean Paul Gaultier", keywords: ["jean paul gaultier", "jpg", "gaultier"] },
 { slug: "emilio-pucci", label: "Emilio Pucci", keywords: ["pucci", "emilio pucci"] },
 { slug: "halston", label: "Halston", keywords: ["halston"] },
 { slug: "pierre-cardin", label: "Pierre Cardin", keywords: ["pierre cardin"] },
 { slug: "claude-montana", label: "Claude Montana", keywords: ["claude montana", "montana"] },
 { slug: "sonia-rykiel", label: "Sonia Rykiel", keywords: ["sonia rykiel"] },
 { slug: "oscar-de-la-renta", label: "Oscar de la Renta", keywords: ["oscar de la renta"] },
 { slug: "nina-ricci", label: "Nina Ricci", keywords: ["nina ricci"] },
 { slug: "ungaro", label: "Ungaro", keywords: ["ungaro", "emanuel ungaro"] },
 // American designer
 { slug: "ralph-lauren", label: "Ralph Lauren", keywords: ["ralph lauren", "polo ralph lauren", "ralph"] },
 { slug: "calvin-klein", label: "Calvin Klein", keywords: ["calvin klein", "ck"] },
 { slug: "donna-karan", label: "Donna Karan", keywords: ["donna karan", "dkny"] },
 { slug: "diane-von-furstenberg", label: "Diane von Furstenberg", keywords: ["diane von furstenberg", "dvf"] },
 { slug: "michael-kors", label: "Michael Kors", keywords: ["michael kors", "mk"] },
 { slug: "kate-spade", label: "Kate Spade", keywords: ["kate spade"] },
 { slug: "tory-burch", label: "Tory Burch", keywords: ["tory burch"] },
 // Shoes
 { slug: "jimmy-choo", label: "Jimmy Choo", keywords: ["jimmy choo"] },
 { slug: "manolo-blahnik", label: "Manolo Blahnik", keywords: ["manolo blahnik", "blahnik"] },
 { slug: "christian-louboutin", label: "Christian Louboutin", keywords: ["louboutin", "christian louboutin", "loubotin", "red bottoms", "red bottom"] },
 { slug: "ferragamo", label: "Ferragamo", keywords: ["ferragamo", "salvatore ferragamo"] },
 { slug: "coach", label: "Coach", keywords: ["coach"] },
 // Other
 { slug: "giorgio-armani", label: "Giorgio Armani", keywords: ["armani", "giorgio armani", "emporio armani", "ea7"] },
 { slug: "roberto-cavalli", label: "Roberto Cavalli", keywords: ["cavalli", "roberto cavalli", "just cavalli"] },
 { slug: "max-mara", label: "Max Mara", keywords: ["max mara"] },
 { slug: "hugo-boss", label: "Hugo Boss", keywords: ["hugo boss", "boss"] },
 { slug: "vivienne-westwood", label: "Vivienne Westwood", keywords: ["vivienne westwood"] },
 { slug: "marc-jacobs", label: "Marc Jacobs", keywords: ["marc jacobs"] },
 { slug: "etro", label: "Etro", keywords: ["etro"] },
 // ── Added: more luxury houses & maisons ──
 { slug: "goyard", label: "Goyard", keywords: ["goyard"] },
 { slug: "moncler", label: "Moncler", keywords: ["moncler"] },
 { slug: "loro-piana", label: "Loro Piana", keywords: ["loro piana"] },
 { slug: "brunello-cucinelli", label: "Brunello Cucinelli", keywords: ["brunello cucinelli", "cucinelli"] },
 { slug: "jacquemus", label: "Jacquemus", keywords: ["jacquemus"] },
 { slug: "the-row", label: "The Row", keywords: ["the row"] },
 { slug: "khaite", label: "Khaite", keywords: ["khaite"] },
 { slug: "toteme", label: "Totême", keywords: ["toteme", "totême"] },
 { slug: "ganni", label: "Ganni", keywords: ["ganni"] },
 { slug: "isabel-marant", label: "Isabel Marant", keywords: ["isabel marant"] },
 { slug: "zimmermann", label: "Zimmermann", keywords: ["zimmermann"] },
 { slug: "jil-sander", label: "Jil Sander", keywords: ["jil sander"] },
 { slug: "rick-owens", label: "Rick Owens", keywords: ["rick owens"] },
 { slug: "dries-van-noten", label: "Dries Van Noten", keywords: ["dries van noten"] },
 { slug: "thom-browne", label: "Thom Browne", keywords: ["thom browne"] },
 { slug: "schiaparelli", label: "Schiaparelli", keywords: ["schiaparelli"] },
 { slug: "rabanne", label: "Rabanne", keywords: ["paco rabanne", "rabanne"] },
 { slug: "courreges", label: "Courrèges", keywords: ["courreges", "courrèges"] },
 { slug: "longchamp", label: "Longchamp", keywords: ["longchamp", "le pliage"] },
 { slug: "marine-serre", label: "Marine Serre", keywords: ["marine serre"] },
 { slug: "coperni", label: "Coperni", keywords: ["coperni"] },
 { slug: "telfar", label: "Telfar", keywords: ["telfar"] },
 { slug: "staud", label: "Staud", keywords: ["staud"] },
 { slug: "cult-gaia", label: "Cult Gaia", keywords: ["cult gaia"] },
 { slug: "self-portrait", label: "Self-Portrait", keywords: ["self-portrait"] },
 { slug: "reformation", label: "Reformation", keywords: ["reformation"] },
 { slug: "simone-rocha", label: "Simone Rocha", keywords: ["simone rocha"] },
 { slug: "cecilie-bahnsen", label: "Cecilie Bahnsen", keywords: ["cecilie bahnsen"] },
 { slug: "molly-goddard", label: "Molly Goddard", keywords: ["molly goddard"] },
 { slug: "erdem", label: "Erdem", keywords: ["erdem"] },
 { slug: "roksanda", label: "Roksanda", keywords: ["roksanda"] },
 { slug: "sandy-liang", label: "Sandy Liang", keywords: ["sandy liang"] },
 // ── Added: bags & leather goods ──
 { slug: "delvaux", label: "Delvaux", keywords: ["delvaux"] },
 { slug: "moynat", label: "Moynat", keywords: ["moynat"] },
 { slug: "anya-hindmarch", label: "Anya Hindmarch", keywords: ["anya hindmarch"] },
 { slug: "mansur-gavriel", label: "Mansur Gavriel", keywords: ["mansur gavriel"] },
 { slug: "strathberry", label: "Strathberry", keywords: ["strathberry"] },
 { slug: "polene", label: "Polène", keywords: ["polene", "polène"] },
 { slug: "aspinal", label: "Aspinal of London", keywords: ["aspinal"] },
 { slug: "smythson", label: "Smythson", keywords: ["smythson"] },
 { slug: "rimowa", label: "Rimowa", keywords: ["rimowa"] },
 // ── Added: shoes ──
 { slug: "roger-vivier", label: "Roger Vivier", keywords: ["roger vivier"] },
 { slug: "aquazzura", label: "Aquazzura", keywords: ["aquazzura"] },
 { slug: "gianvito-rossi", label: "Gianvito Rossi", keywords: ["gianvito rossi"] },
 { slug: "stuart-weitzman", label: "Stuart Weitzman", keywords: ["stuart weitzman"] },
 { slug: "tods", label: "Tod's", keywords: ["tod's", "tods"] },
 { slug: "golden-goose", label: "Golden Goose", keywords: ["golden goose", "ggdb"] },
 { slug: "repetto", label: "Repetto", keywords: ["repetto"] },
 { slug: "dr-martens", label: "Dr. Martens", keywords: ["dr. martens", "dr martens", "doc martens"] },
 // ── Added: jewelry & watches ──
 { slug: "cartier", label: "Cartier", keywords: ["cartier"] },
 { slug: "bvlgari", label: "Bvlgari", keywords: ["bvlgari", "bulgari"] },
 { slug: "tiffany", label: "Tiffany & Co.", keywords: ["tiffany"] },
 { slug: "van-cleef-arpels", label: "Van Cleef & Arpels", keywords: ["van cleef", "vca"] },
 { slug: "david-yurman", label: "David Yurman", keywords: ["david yurman"] },
 { slug: "chopard", label: "Chopard", keywords: ["chopard"] },
 { slug: "pomellato", label: "Pomellato", keywords: ["pomellato"] },
 { slug: "rolex", label: "Rolex", keywords: ["rolex"] },
 { slug: "chrome-hearts", label: "Chrome Hearts", keywords: ["chrome hearts"] },
 // ── Added: vintage / archive ──
 { slug: "karl-lagerfeld", label: "Karl Lagerfeld", keywords: ["karl lagerfeld"] },
 { slug: "blumarine", label: "Blumarine", keywords: ["blumarine", "blugirl"] },
 { slug: "escada", label: "Escada", keywords: ["escada"] },
 { slug: "la-perla", label: "La Perla", keywords: ["la perla"] },
 { slug: "wolford", label: "Wolford", keywords: ["wolford"] },
 { slug: "fiorucci", label: "Fiorucci", keywords: ["fiorucci"] },
 { slug: "krizia", label: "Krizia", keywords: ["krizia"] },
 { slug: "byblos", label: "Byblos", keywords: ["byblos"] },
 { slug: "trussardi", label: "Trussardi", keywords: ["trussardi"] },
 { slug: "cacharel", label: "Cacharel", keywords: ["cacharel"] },
 { slug: "genny", label: "Genny", keywords: ["genny"] },
 { slug: "anna-sui", label: "Anna Sui", keywords: ["anna sui"] },
 // ── Added: contemporary & French ──
 { slug: "zadig-voltaire", label: "Zadig & Voltaire", keywords: ["zadig & voltaire", "zadig et voltaire", "zadig"] },
 { slug: "the-kooples", label: "The Kooples", keywords: ["the kooples"] },
 { slug: "sezane", label: "Sézane", keywords: ["sezane", "sézane"] },
 { slug: "ami-paris", label: "Ami Paris", keywords: ["ami paris"] },
 { slug: "apc", label: "A.P.C.", keywords: ["a.p.c.", "apc"] },
 { slug: "maison-kitsune", label: "Maison Kitsuné", keywords: ["maison kitsuné", "maison kitsune", "kitsune"] },
 // ── Added: Y2K / vintage streetwear ──
 { slug: "juicy-couture", label: "Juicy Couture", keywords: ["juicy couture"] },
 { slug: "von-dutch", label: "Von Dutch", keywords: ["von dutch"] },
 { slug: "ed-hardy", label: "Ed Hardy", keywords: ["ed hardy"] },
 { slug: "true-religion", label: "True Religion", keywords: ["true religion"] },
 { slug: "stone-island", label: "Stone Island", keywords: ["stone island"] },
 { slug: "bape", label: "BAPE", keywords: ["a bathing ape", "bape"] },
 { slug: "fear-of-god", label: "Fear of God", keywords: ["fear of god"] },
 // ── Added: denim ──
 { slug: "citizens-of-humanity", label: "Citizens of Humanity", keywords: ["citizens of humanity"] },
 { slug: "agolde", label: "AGOLDE", keywords: ["agolde"] },
 { slug: "frame", label: "Frame", keywords: ["frame denim"] },
 { slug: "mother-denim", label: "Mother", keywords: ["mother denim"] },
 { slug: "paige", label: "Paige", keywords: ["paige denim"] },
 { slug: "seven-for-all-mankind", label: "7 For All Mankind", keywords: ["7 for all mankind", "seven for all mankind"] },
];

export const brandMap = Object.fromEntries(
 brands.map((b) => [b.slug, b.label])
) as Record<string, string>;

// Aliases that are substrings of common English / fashion words. These MUST match
// as WHOLE WORDS or they silently inflate the wrong brand's demand:
//   etro  → retro, metro, electro
//   boss  → embossed, embossing
//   coach → stagecoach, coaching, coached, coachella
//   pucci → cappuccino (also a color)
//   marni → marnier ("Grand Marnier")
//   the row → "the rowing", "the rowdy"
// Short aliases (≤3 chars, e.g. lv/cd/ck) are already boundary-matched everywhere,
// so they don't need listing. Every brand matcher (resolveBrand, designerPatterns,
// detectBrand, inferBrandFromTitle) consults this set so they stay consistent.
// NOTE: normal aliases are intentionally NOT here. They must keep matching
// plurals/possessives ("guccis", "gucci's", "gucci-style" → Gucci).
export const WHOLE_WORD_ALIASES: ReadonlySet<string> = new Set([
 "etro",
 "boss",
 "coach",
 "pucci",
 "marni",
 "the row",
]);

// Lowercase title/brand keywords for a set of brand slugs. Used to softly bias
// the personalized feed toward designers a user picked in the taste test.
const _BRAND_BY_SLUG = new Map(brands.map((b) => [b.slug, b]));
export function designerKeywords(slugs: string[] | null | undefined): string[] {
 if (!slugs || slugs.length === 0) return [];
 const out = new Set<string>();
 for (const s of slugs) {
 const b = _BRAND_BY_SLUG.get(s);
 if (b) for (const kw of b.keywords) out.add(kw.toLowerCase());
 }
 return Array.from(out);
}
