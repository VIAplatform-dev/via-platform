import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { stores } from "@/app/lib/stores";
import { brands, WHOLE_WORD_ALIASES } from "@/app/lib/brandData";
import { aliasMatches } from "@/app/lib/data-layer/brands";
import { categoryMap } from "@/app/lib/categoryMap";
import { DISABLED_STORE_SLUGS } from "@/app/lib/db";
import { formatPrice } from "@/app/lib/formatPrice";

const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
  return url;
};

const STOP_WORDS = new Set([
  "and", "or", "the", "a", "an", "in", "of", "for", "with", "by",
  "de", "et", "le", "la", "von", "van", "&",
]);

// ── Singular ↔ plural pairs for every fashion term ────────────────────────────
// Both directions so "boot" → also search "boots" and vice versa.
const FASHION_STEM_PAIRS: [string, string][] = [
  // Shoes
  ["boots", "boot"],
  ["booties", "bootie"],
  ["heels", "heel"],
  ["pumps", "pump"],
  ["flats", "flat"],
  ["sneakers", "sneaker"],
  ["trainers", "trainer"],
  ["sandals", "sandal"],
  ["mules", "mule"],
  ["clogs", "clog"],
  ["loafers", "loafer"],
  ["wedges", "wedge"],
  ["slippers", "slipper"],
  ["espadrilles", "espadrille"],
  ["oxfords", "oxford"],
  ["derbies", "derby"],
  ["stilettos", "stiletto"],
  ["kitten heels", "kitten heel"],
  ["platforms", "platform"],
  ["brogues", "brogue"],
  ["moccasins", "moccasin"],
  // Clothing — tops
  ["tops", "top"],
  ["shirts", "shirt"],
  ["blouses", "blouse"],
  ["bodysuits", "bodysuit"],
  ["camisoles", "camisole"],
  ["tanks", "tank"],
  ["tees", "tee"],
  ["tunics", "tunic"],
  ["corsets", "corset"],
  // Clothing — bottoms
  ["pants", "pant"],
  ["trousers", "trouser"],
  ["leggings", "legging"],
  ["culottes", "culotte"],
  ["shorts", "short"],
  ["skirts", "skirt"],
  ["jeans", "jean"],
  // Clothing — dresses & suits
  ["dresses", "dress"],
  ["gowns", "gown"],
  ["jumpsuits", "jumpsuit"],
  ["rompers", "romper"],
  ["overalls", "overall"],
  ["playsuits", "playsuit"],
  ["coordinates", "coordinate"],
  // Clothing — outerwear
  ["coats", "coat"],
  ["jackets", "jacket"],
  ["blazers", "blazer"],
  ["cardigans", "cardigan"],
  ["sweaters", "sweater"],
  ["hoodies", "hoodie"],
  ["pullovers", "pullover"],
  ["vests", "vest"],
  ["capes", "cape"],
  ["parkas", "parka"],
  ["bombers", "bomber"],
  ["windbreakers", "windbreaker"],
  ["waistcoats", "waistcoat"],
  // Bags
  ["bags", "bag"],
  ["purses", "purse"],
  ["totes", "tote"],
  ["clutches", "clutch"],
  ["satchels", "satchel"],
  ["backpacks", "backpack"],
  ["wallets", "wallet"],
  ["pouches", "pouch"],
  ["minaudières", "minaudière"],
  ["minaudieres", "minaudiere"],
  ["baguettes", "baguette"],
  ["hobos", "hobo"],
  // Accessories
  ["belts", "belt"],
  ["scarves", "scarf"],
  ["wraps", "wrap"],
  ["stoles", "stole"],
  ["hats", "hat"],
  ["caps", "cap"],
  ["gloves", "glove"],
  ["mittens", "mitten"],
  ["socks", "sock"],
  ["sunglasses", "sunglass"],
  ["watches", "watch"],
  ["bracelets", "bracelet"],
  ["rings", "ring"],
  ["necklaces", "necklace"],
  ["earrings", "earring"],
  ["brooches", "brooch"],
  ["bangles", "bangle"],
  ["pendants", "pendant"],
  ["chokers", "choker"],
  ["anklets", "anklet"],
  ["cuffs", "cuff"],
  ["headbands", "headband"],
  ["fascinators", "fascinator"],
  ["tiaras", "tiara"],
  ["hairpins", "hairpin"],
  ["barrettes", "barrette"],
  // Home
  ["vases", "vase"],
  ["frames", "frame"],
  ["lamps", "lamp"],
  ["cushions", "cushion"],
  ["pillows", "pillow"],
  ["rugs", "rug"],
  ["blankets", "blanket"],
  ["throws", "throw"],
  ["candles", "candle"],
];

// Build lookup maps
const PLURAL_TO_SINGULAR: Record<string, string> = {};
const SINGULAR_TO_PLURAL: Record<string, string> = {};
for (const [plural, singular] of FASHION_STEM_PAIRS) {
  PLURAL_TO_SINGULAR[plural] = singular;
  SINGULAR_TO_PLURAL[singular] = plural;
}

// Returns the word and its stem/plural counterpart
function stemVariants(word: string): string[] {
  const out = new Set([word]);
  if (PLURAL_TO_SINGULAR[word]) out.add(PLURAL_TO_SINGULAR[word]);
  if (SINGULAR_TO_PLURAL[word]) out.add(SINGULAR_TO_PLURAL[word]);
  // Generic fallback: strip trailing 's' for words not in the map
  if (out.size === 1 && word.endsWith("s") && word.length > 4) {
    out.add(word.slice(0, -1));
  }
  if (out.size === 1 && !word.endsWith("s") && word.length > 3) {
    out.add(word + "s");
  }
  return [...out];
}

// Common search terms → internal category slug (used for quick-link chips)
const categoryAliases: Record<string, string> = {
  // Shoes — map to specific sub-slugs where they exist
  boot: "boots", boots: "boots",
  bootie: "boots", booties: "boots",
  shoe: "shoes", shoes: "shoes",
  heel: "heels", heels: "heels",
  pump: "heels", pumps: "heels",
  stiletto: "heels", stilettos: "heels",
  flat: "flats", flats: "flats",
  sneaker: "sneakers", sneakers: "sneakers",
  trainer: "sneakers", trainers: "sneakers",
  sandal: "sandals", sandals: "sandals",
  mule: "shoes", mules: "shoes",
  clog: "shoes", clogs: "shoes",
  loafer: "shoes", loafers: "shoes",
  wedge: "shoes", wedges: "shoes",
  slipper: "shoes", slippers: "shoes",
  espadrille: "shoes", espadrilles: "shoes",
  oxford: "shoes", oxfords: "shoes",
  // Clothing
  clothing: "other-clothing", clothes: "other-clothing",
  top: "tops", tops: "tops",
  shirt: "tops", shirts: "tops",
  blouse: "tops", blouses: "tops",
  bodysuit: "tops", bodysuits: "tops",
  cami: "tops", camisole: "tops",
  halter: "tops", tank: "tops",
  tee: "tops", tees: "tops",
  dress: "dresses", dresses: "dresses",
  gown: "dresses", gowns: "dresses",
  mini: "dresses", midi: "dresses", maxi: "dresses",
  slip: "dresses",
  jacket: "coats-jackets", jackets: "coats-jackets",
  coat: "coats-jackets", coats: "coats-jackets",
  blazer: "coats-jackets", blazers: "coats-jackets",
  trench: "coats-jackets",
  parka: "coats-jackets", parkas: "coats-jackets",
  puffer: "coats-jackets",
  fur: "coats-jackets",
  bomber: "coats-jackets", bombers: "coats-jackets",
  windbreaker: "coats-jackets",
  vest: "coats-jackets", vests: "coats-jackets",
  waistcoat: "coats-jackets",
  pants: "pants", trouser: "pants", trousers: "pants",
  legging: "pants", leggings: "pants",
  culotte: "pants", culottes: "pants",
  jean: "jeans", jeans: "jeans", denim: "jeans",
  skirt: "skirts", skirts: "skirts",
  sweater: "sweaters", sweaters: "sweaters",
  cardigan: "sweaters", cardigans: "sweaters",
  hoodie: "sweaters", hoodies: "sweaters",
  pullover: "sweaters", pullovers: "sweaters",
  knitwear: "sweaters",
  turtleneck: "sweaters", crewneck: "sweaters",
  knit: "sweaters",
  short: "shorts", shorts: "shorts",
  jumpsuit: "jumpsuits", jumpsuits: "jumpsuits",
  romper: "jumpsuits", rompers: "jumpsuits",
  overall: "jumpsuits", overalls: "jumpsuits",
  playsuit: "jumpsuits",
  // Bags
  bag: "bags", bags: "bags",
  pouch: "bags", purse: "bags", purses: "bags",
  backpack: "bags", satchel: "bags",
  tote: "totes", totes: "totes",
  clutch: "clutches", clutches: "clutches",
  crossbody: "crossbody-bags",
  handbag: "handbags", handbags: "handbags",
  // Accessories
  accessory: "accessories", accessories: "accessories",
  hat: "hats", hats: "hats",
  cap: "hats", caps: "hats",
  baseball: "hats",
  jewelry: "jewelry", jewellery: "jewelry",
  ring: "jewelry", rings: "jewelry",
  necklace: "jewelry", necklaces: "jewelry",
  bracelet: "jewelry", bracelets: "jewelry",
  earring: "jewelry", earrings: "jewelry",
  brooch: "jewelry", brooches: "jewelry",
  bangle: "jewelry", bangles: "jewelry",
  pendant: "jewelry", pendants: "jewelry",
  choker: "jewelry", anklet: "jewelry",
  belt: "belts", belts: "belts",
  scarf: "scarves", scarves: "scarves",
  shawl: "scarves", wrap: "scarves", stole: "scarves",
  sunglasses: "sunglasses", sunglass: "sunglasses",
  watch: "accessories", watches: "accessories",
  // Home
  home: "home", decor: "home",
  wallet: "accessories", wallets: "accessories",
  cardholder: "accessories",
};

// Reverse of categoryAliases: a category slug → every term that maps to it. Lets a
// category search ("shirt") pull the WHOLE category ("tops": blouse, tee, tank, …),
// not just titles literally containing "shirt".
const CATEGORY_TERMS: Record<string, string[]> = {};
for (const [term, slug] of Object.entries(categoryAliases)) {
  (CATEGORY_TERMS[slug] ??= []).push(term);
}

// ── Synonym map: searching X also searches Y ──────────────────────────────────
// One-directional entries are fine; both directions listed where bidirectional.
const SYNONYMS: Record<string, string[]> = {
  // Color spelling (most searched)
  grey: ["gray"],
  gray: ["grey"],
  // British/American spelling
  colour: ["color"],
  color: ["colour"],
  jewellery: ["jewelry"],
  jewelry: ["jewellery"],
  // Material equivalents
  pleather: ["faux leather", "vegan leather"],
  "faux leather": ["vegan leather", "pleather"],
  "vegan leather": ["faux leather", "pleather"],
  "faux fur": ["teddy", "sherpa"],
  teddy: ["faux fur", "sherpa"],
  sherpa: ["faux fur", "teddy"],
  // Footwear — UK/US
  trainers: ["sneakers"],
  sneakers: ["trainers"],
  // Footwear — style equivalents
  western: ["cowboy"],
  cowboy: ["western"],
  // Silhouette terms
  bodycon: ["body-con", "bandage"],
  "body-con": ["bodycon"],
  // Trouser cuts
  palazzo: ["wide-leg", "wide leg"],
  flared: ["flare", "flares"],
  flare: ["flared"],
  // Casual bottoms
  sweatpants: ["joggers", "track pants"],
  joggers: ["sweatpants", "sweat pants", "track pants"],
  // Turtleneck
  turtleneck: ["polo neck", "poloneck", "roll neck"],
  rollneck: ["turtleneck", "polo neck"],
  // Outerwear
  gilet: ["vest", "waistcoat", "body warmer"],
  // Bag
  bum: ["fanny pack", "belt bag"],
  "fanny pack": ["belt bag", "bum bag"],
  "belt bag": ["fanny pack", "bum bag"],
  // Shoe closures
  mules: ["slides"],
  slides: ["mules"],
};

// For every hyphenated term, also add the space-separated version (and vice versa).
// e.g. "wide-leg" → "wide leg", "off-shoulder" → "off shoulder"
function hyphenVariants(term: string): string[] {
  const out = new Set([term]);
  if (term.includes("-")) out.add(term.replace(/-/g, " "));
  if (term.includes(" ") && term.split(" ").length === 2) out.add(term.replace(/ /g, "-"));
  return [...out];
}

// Expand a single word/phrase to all its variants (stems + synonyms + hyphen forms)
function expandTerm(term: string): string[] {
  const out = new Set<string>();
  for (const h of hyphenVariants(term)) {
    out.add(h);
    for (const s of stemVariants(h)) out.add(s);
    for (const syn of SYNONYMS[h] ?? []) {
      out.add(syn);
      for (const ss of stemVariants(syn)) out.add(ss);
      for (const sh of hyphenVariants(syn)) out.add(sh);
    }
  }
  return [...out];
}

// Strip accents/diacritics so "chloe" matches "Chloé", "rene" matches "René", etc.
function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Strip stop words and punctuation, return meaningful search tokens
function parseWords(q: string): string[] {
  const all = q
    .split(/[\s&]+/)
    .map(w => w.replace(/[.,!?'"()]/g, "").trim())
    .filter(w => w.length > 1);
  const meaningful = all.filter(w => !STOP_WORDS.has(w));
  return meaningful.length > 0 ? meaningful : all;
}

// Sanitize for plainto_tsquery — strips chars that could cause parse errors
function toSafeTsQuery(q: string): string {
  return q.replace(/[^\w\s'\-]/g, " ").replace(/\s+/g, " ").trim();
}

// Returns the best-matching brand for this query, or null
function detectBrand(q: string, words: string[]): (typeof brands)[0] | null {
  for (const b of brands) {
    if (b.keywords.some(kw => q === kw)) return b;
  }
  for (const b of brands) {
    // Match any alias as a whole word/phrase anywhere in the query. aliasMatches whole-words the
    // short (≤3) and flagged aliases (ysl, lv, cd → never "velvet"/"embossed") and substring-matches
    // the long ones. Dropping the old length>3 guard is what lets "ysl bag" / "black ysl heels"
    // resolve to Saint Laurent, not only a bare "ysl".
    if (b.keywords.some(kw => aliasMatches(q, kw, WHOLE_WORD_ALIASES.has(kw)))) return b;
  }
  if (words.length > 1) {
    for (const b of brands) {
      const bLabel = b.label.toLowerCase();
      if (words.every(w => bLabel.includes(w))) return b;
    }
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawQ = searchParams.get("q")?.trim() ?? "";
  const q = stripAccents(rawQ.toLowerCase());
  // Only log COMMITTED searches (the /search page passes log=1). The header's
  // live autocomplete fires on every keystroke, which would flood the analytics
  // table with prefix fragments ("dr", "dre", "dres") and make Top Searches junk.
  const shouldLog = searchParams.get("log") === "1";

  if (!q || q.length < 2) {
    return NextResponse.json({ products: [], designers: [], categories: [], stores: [] });
  }

  try {
    const sql = neon(getDatabaseUrl());
    sql`CREATE EXTENSION IF NOT EXISTS unaccent`.catch(() => {});

    // ── 1. Parse query ────────────────────────────────────────────────────────
    const words = parseWords(q);

    // Original word patterns — used for "all words present" scoring bonus.
    // Only the exact words typed (no expansion), so "leather jacket" ALL check
    // only fires when BOTH "leather" AND "jacket" are in the title.
    const originalWordPatterns = words.map(w => `%${w}%`);

    // Fully expanded variants per word: stems + synonyms + hyphen forms.
    // e.g. "boots" → ["%boots%", "%boot%"]
    //      "grey"  → ["%grey%", "%gray%"]
    //      "wide-leg" → ["%wide-leg%", "%wide leg%"]
    const allExpandedVariants = [...new Set(words.flatMap(w => expandTerm(w)))];
    const expandedWordPatterns = allExpandedVariants.map(v => `%${v}%`);

    // Phrase patterns: original + stem-swapped + hyphen-swapped variants.
    // This lets "Chelsea Boot" rank well for "boots" and "wide leg" match "wide-leg".
    const phrasePatternSet = new Set<string>();
    phrasePatternSet.add(`%${q}%`);
    // Stem-swapped phrase (e.g. "boots" → "boot")
    const stemmedQ = words.map(w => {
      const variants = stemVariants(w);
      return variants.find(v => v !== w) ?? w;
    }).join(" ");
    phrasePatternSet.add(`%${stemmedQ}%`);
    // Hyphen-swapped phrase
    if (q.includes("-")) phrasePatternSet.add(`%${q.replace(/-/g, " ")}%`);
    if (q.includes(" ") && words.length === 2) phrasePatternSet.add(`%${q.replace(/ /g, "-")}%`);
    // Synonym phrase: if any single word has a synonym, also search the swapped phrase
    for (let i = 0; i < words.length; i++) {
      for (const syn of SYNONYMS[words[i]] ?? []) {
        const swapped = [...words.slice(0, i), syn, ...words.slice(i + 1)].join(" ");
        phrasePatternSet.add(`%${swapped}%`);
      }
    }
    const phrasePatterns = [...phrasePatternSet];
    const phrasePattern = phrasePatterns[0]; // primary (for scoring compat)
    const startPattern = `${q}%`;

    const safeQ = toSafeTsQuery(q) || words.join(" ") || q;

    // ── 2. Brand detection ────────────────────────────────────────────────────
    const detectedBrand = detectBrand(q, words);
    const brandPtPattern = detectedBrand
      ? `%${detectedBrand.keywords[0]}%`
      : phrasePattern;

    // Every alias of the detected brand, as whole-word regexes — so "ysl" ALSO pulls titles that
    // say "Yves Saint Laurent" / "Saint Laurent" (and vice versa), instead of each spelling being
    // its own island. Whole-word \y keeps short aliases safe ("lv" ≠ "velvet").
    const brandAliasRegexes = detectedBrand
      ? detectedBrand.keywords.map((k) => `\\y${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\y`)
      : [];
    const useBrandExpansion = brandAliasRegexes.length > 0;

    // ── Category expansion ──
    // If the query IS a category term ("shirt", "boots"), expand it to the WHOLE
    // category ("tops" → blouse, tee, tank, cami…) so we return all of it, not
    // just titles literally containing "shirt". Matched as whole words via \y so
    // "top" doesn't hit "laptop". Only fires for category-term queries.
    const catSlug = categoryAliases[q] ?? (words.length === 1 ? categoryAliases[words[0]] : undefined);
    const categoryTerms = catSlug ? CATEGORY_TERMS[catSlug] ?? [] : [];
    const categoryRegexes = categoryTerms.map((t) => `\\y${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\y`);
    const useCategoryExpansion = categoryRegexes.length > 0;

    // ── 3. Quick-links: designers, categories, stores ─────────────────────────
    const matchedDesigners = brands
      .filter(b => {
        const bLabel = stripAccents(b.label.toLowerCase());
        if (bLabel.includes(q)) return true;
        if (b.keywords.some(kw => kw.includes(q) || q.includes(kw))) return true;
        if (words.length > 1 && words.every(w => bLabel.includes(w))) return true;
        return false;
      })
      .slice(0, 5)
      .map(b => ({ slug: b.slug, label: b.label }));

    // Category chips — check the full query and each word+variant for matches
    const matchedCategories: { slug: string; label: string }[] = [];
    const seenCatSlugs = new Set<string>();
    const addCatChip = (slug: string) => {
      if (seenCatSlugs.has(slug)) return;
      const label = categoryMap[slug as keyof typeof categoryMap];
      if (label) { matchedCategories.push({ slug, label }); seenCatSlugs.add(slug); }
    };

    // Check full query and every expanded variant against categoryAliases
    const aliasTarget = categoryAliases[q];
    if (aliasTarget) addCatChip(aliasTarget);
    for (const v of allExpandedVariants) {
      const vAlias = categoryAliases[v];
      if (vAlias) addCatChip(vAlias);
    }
    for (const [slug, label] of Object.entries(categoryMap)) {
      if (!seenCatSlugs.has(slug) && (slug.includes(q) || label.toLowerCase().includes(q))) {
        matchedCategories.push({ slug, label });
        seenCatSlugs.add(slug);
      }
    }

    const matchedStores = stores
      .filter(s => s.name.toLowerCase().includes(q) || s.location.toLowerCase().includes(q))
      .slice(0, 5)
      .map(s => ({ slug: s.slug, name: s.name, location: s.location }));

    // ── 4. Main product search ────────────────────────────────────────────────
    //
    // Scoring ladder (additive):
    //  10 000  exact title match ("boots" = title)
    //   5 000  title starts with query
    //   2 000  title contains ANY phrase variant (exact, stem, hyphen-swap, synonym)
    //   0–1000 FTS ts_rank — handles stemming, word forms, partial matches
    //     500  ALL original words present in title (multi-word quality signal)
    //     300  ANY expanded variant present (catches stems/synonyms not in phrase)
    //     800  product_type brand field matches detected brand
    //     200  description contains any phrase variant (description-only matches)
    //    0–30  recency bonus
    //
    const products = await sql`
      WITH scored AS (
        SELECT
          id, store_slug, store_name, title, price, currency, image, images, created_at,
          (
            CASE WHEN unaccent(LOWER(title)) = ${q} THEN 10000 ELSE 0 END
            + CASE WHEN unaccent(LOWER(title)) LIKE ${startPattern} THEN 5000 ELSE 0 END
            + CASE WHEN unaccent(LOWER(title)) LIKE ANY(${phrasePatterns}) THEN 2000 ELSE 0 END
            + FLOOR(
                ts_rank(
                  setweight(to_tsvector('english', unaccent(COALESCE(title, ''))), 'A'),
                  plainto_tsquery('english', unaccent(${safeQ}))
                ) * 1000
              )::int
            + CASE WHEN ${useCategoryExpansion} AND unaccent(LOWER(title)) ~* ANY(${categoryRegexes}::text[]) THEN 1500 ELSE 0 END
            + CASE WHEN unaccent(LOWER(title)) LIKE ALL(${originalWordPatterns}) THEN 500 ELSE 0 END
            + CASE WHEN unaccent(LOWER(title)) LIKE ANY(${expandedWordPatterns}) THEN 300 ELSE 0 END
            + CASE
                WHEN ${useBrandExpansion}
                AND (unaccent(LOWER(title)) ~* ANY(${brandAliasRegexes}::text[])
                     OR (product_type IS NOT NULL AND unaccent(LOWER(product_type)) ~* ANY(${brandAliasRegexes}::text[])))
                THEN 3000 ELSE 0
              END
            + CASE
                WHEN product_type IS NOT NULL
                AND LOWER(product_type) LIKE ${brandPtPattern}
                THEN 800
                ELSE 0
              END
            + CASE
                WHEN description IS NOT NULL
                AND unaccent(LOWER(description)) LIKE ANY(${phrasePatterns})
                THEN 200
              ELSE 0
              END
            + GREATEST(0, 30 - FLOOR(
                EXTRACT(EPOCH FROM (NOW() - COALESCE(created_at, NOW()))) / 86400.0
              ))::int
          ) AS relevance
        FROM products
        WHERE
          (shopify_product_id IS NULL OR collabs_link IS NOT NULL)
          AND (${DISABLED_STORE_SLUGS.length} = 0 OR store_slug != ALL(${DISABLED_STORE_SLUGS}))
          AND (
            -- A phrase variant (exact / stem-swapped / hyphen / synonym phrase)
            unaccent(LOWER(title)) LIKE ANY(${phrasePatterns})
            -- ALL typed words present (any order). This replaces the old "ANY one
            -- expanded word" rule, which let a single common word like "el" in
            -- "el dante" match every title containing "el" (yellow, velvet, …).
            OR unaccent(LOWER(title)) LIKE ALL(${originalWordPatterns})
            -- Full-text (stemmed, ANDs the terms — so it's word-complete too)
            OR to_tsvector('english', unaccent(COALESCE(title, '')))
               @@ plainto_tsquery('english', unaccent(${safeQ}))
            OR (product_type IS NOT NULL
                AND LOWER(product_type) LIKE ${brandPtPattern})
            OR (description IS NOT NULL
                AND unaccent(LOWER(description)) LIKE ANY(${phrasePatterns}))
            -- Detected brand → every product titled/typed with ANY of its alias spellings
            -- (ysl ↔ yves saint laurent ↔ saint laurent), whole-word matched.
            OR (${useBrandExpansion}
                AND (unaccent(LOWER(title)) ~* ANY(${brandAliasRegexes}::text[])
                     OR (product_type IS NOT NULL AND unaccent(LOWER(product_type)) ~* ANY(${brandAliasRegexes}::text[]))))
            -- Category-term query → the whole category (whole-word matched)
            OR (${useCategoryExpansion} AND unaccent(LOWER(title)) ~* ANY(${categoryRegexes}::text[]))
          )
      )
      SELECT * FROM scored WHERE relevance > 0
      ORDER BY relevance DESC, created_at DESC NULLS LAST
      LIMIT 200
    `;

    // ── 5. Fuzzy trigram fallback for typos ───────────────────────────────────
    // Kicks in when main search returns fewer than 5 results. Uses pg_trgm
    // similarity to catch misspellings ("chanell" → Chanel items).
    let allProducts = products as Array<Record<string, unknown>>;
    if (allProducts.length < 5 && words.length > 0) {
      const anchor = words.reduce((a, b) => (a.length >= b.length ? a : b));
      try {
        const fuzzy = await sql`
          SELECT id, store_slug, store_name, title, price, currency, image, images, created_at
          FROM products
          WHERE
            (shopify_product_id IS NULL OR collabs_link IS NOT NULL)
            AND (${DISABLED_STORE_SLUGS.length} = 0 OR store_slug != ALL(${DISABLED_STORE_SLUGS}))
            AND similarity(unaccent(LOWER(title)), ${anchor}) > 0.25
          ORDER BY similarity(unaccent(LOWER(title)), ${anchor}) DESC, created_at DESC NULLS LAST
          LIMIT 50
        `;
        const existingIds = new Set(allProducts.map(p => p.id));
        allProducts = [
          ...allProducts,
          ...fuzzy.filter((p: Record<string, unknown>) => !existingIds.has(p.id)),
        ];
      } catch {
        // pg_trgm not available — graceful no-op
      }
    }

    // Fire-and-forget: log search analytics — committed searches only.
    // brand_slug is the canonical brand the query resolves to (via detectBrand),
    // so search DEMAND rolls up by brand instead of fragmenting across spellings
    // ("ysl", "yves saint laurent", "saint laurent" → all "saint-laurent"). NULL
    // when the query isn't a brand search.
    if (shouldLog) {
      const searchBrandSlug = detectedBrand?.slug ?? null;
      sql`
        CREATE TABLE IF NOT EXISTS searches (
          id SERIAL PRIMARY KEY,
          query TEXT NOT NULL,
          results_count INT NOT NULL DEFAULT 0,
          brand_slug TEXT,
          timestamp TIMESTAMPTZ DEFAULT NOW()
        )
      `.then(() =>
        sql`ALTER TABLE searches ADD COLUMN IF NOT EXISTS brand_slug TEXT`
      ).then(() =>
        sql`INSERT INTO searches (query, results_count, brand_slug) VALUES (${q}, ${allProducts.length}, ${searchBrandSlug})`
      ).catch(() => {});
    }

    return NextResponse.json({
      designers: matchedDesigners,
      categories: matchedCategories,
      stores: matchedStores,
      products: allProducts.map(p => {
        let parsedImages: string[] | undefined;
        try {
          parsedImages = p.images ? JSON.parse(p.images as string) : undefined;
        } catch {
          // malformed JSON — skip
        }
        return {
          id: p.id,
          name: p.title,
          storeSlug: p.store_slug,
          storeName: p.store_name,
          price: formatPrice(Number(p.price), p.currency as string | null),
          image: p.image,
          images: parsedImages,
        };
      }),
    });
  } catch (error) {
    console.error("Search API error:", error);
    return NextResponse.json(
      { products: [], designers: [], categories: [], stores: [] },
      { status: 500 }
    );
  }
}
