// Taste-test options for the new-user quiz. Every dimension maps to lowercase
// title/brand keywords used to SOFTLY bias the personalized feed. They only ever
// ADD to a product's score, never filter it out. So loving Y2K + orange surfaces a
// Y2K orange piece even from a brand you didn't pick. Keys are stable; the mobile
// app references the same keys (see via-app/lib/tasteVibes.ts).

type KeyedOption = { key: string; label: string; keywords: string[] };
export type Vibe = KeyedOption;

export const VIBES: Vibe[] = [
 { key: "minimalist", label: "Minimalist", keywords: ["minimal", "minimalist", "clean", "tailored", "the row", "cos", "toteme", "jil sander", "helmut lang", "everlane", "neutral"] },
 { key: "old-money", label: "Old Money", keywords: ["cashmere", "tweed", "loafer", "polo", "blazer", "ralph lauren", "burberry", "brooks brothers", "hermes", "loro piana", "pendleton", "argyle", "oxford", "trench"] },
 { key: "y2k", label: "Y2K", keywords: ["y2k", "low rise", "low-rise", "rhinestone", "baby tee", "von dutch", "ed hardy", "juicy couture", "mini skirt", "halter", "baguette", "butterfly"] },
 { key: "boho", label: "Boho", keywords: ["boho", "bohemian", "crochet", "fringe", "paisley", "maxi", "suede", "peasant", "embroidered", "free people", "kimono", "tassel"] },
 { key: "grunge", label: "Grunge", keywords: ["grunge", "leather", "moto", "plaid", "flannel", "combat", "distressed", "band tee", "band t-shirt", "ripped", "goth", "studded"] },
 { key: "romantic", label: "Romantic", keywords: ["lace", "floral", "bow", "ruffle", "silk", "pearl", "corset", "mesh", "slip dress", "sheer", "feather", "satin"] },
 { key: "avant-garde", label: "Avant-Garde", keywords: ["asymmetric", "avant", "sculptural", "yohji", "yamamoto", "comme des garcons", "margiela", "issey miyake", "rick owens", "deconstructed", "pleats"] },
 { key: "streetwear", label: "Streetwear", keywords: ["hoodie", "sneaker", "cargo", "supreme", "carhartt", "nike", "adidas", "stussy", "graphic tee", "track", "bomber", "oversized"] },
 { key: "coquette", label: "Coquette", keywords: ["coquette", "bow", "lace", "ribbon", "ballet", "pink", "mary jane", "babydoll", "frill", "sheer", "satin"] },
 { key: "cottagecore", label: "Cottagecore", keywords: ["cottage", "prairie", "gingham", "floral", "milkmaid", "puff sleeve", "eyelet", "gunne sax", "pinafore", "smock", "calico"] },
 { key: "preppy", label: "Preppy", keywords: ["preppy", "polo", "cardigan", "pleated skirt", "varsity", "argyle", "boat shoe", "lacoste", "tommy hilfiger", "vest", "collared"] },
 { key: "western", label: "Western", keywords: ["western", "cowboy", "boot", "fringe", "suede", "denim", "concho", "turquoise", "prairie", "wrangler", "yoke"] },
];

export const COLORS: KeyedOption[] = [
 { key: "black", label: "Black", keywords: ["black", "noir", "jet", "onyx"] },
 { key: "white-cream", label: "White & Cream", keywords: ["white", "cream", "ivory", "off-white", "ecru"] },
 { key: "neutral-brown", label: "Browns & Neutrals", keywords: ["brown", "tan", "beige", "camel", "khaki", "chocolate", "taupe", "nude", "caramel"] },
 { key: "pink", label: "Pink", keywords: ["pink", "rose", "blush", "fuchsia", "magenta", "bubblegum"] },
 { key: "red", label: "Red", keywords: ["red", "crimson", "scarlet", "burgundy", "maroon", "cherry", "wine"] },
 { key: "orange", label: "Orange", keywords: ["orange", "rust", "tangerine", "terracotta", "burnt orange", "amber"] },
 { key: "yellow", label: "Yellow", keywords: ["yellow", "mustard", "gold", "lemon", "butter"] },
 { key: "green", label: "Green", keywords: ["green", "olive", "emerald", "sage", "forest", "lime", "moss"] },
 { key: "blue", label: "Blue", keywords: ["blue", "navy", "denim", "cobalt", "teal", "sky", "powder blue"] },
 { key: "purple", label: "Purple", keywords: ["purple", "lavender", "lilac", "violet", "plum", "mauve"] },
 { key: "metallic", label: "Metallic", keywords: ["metallic", "silver", "gold", "bronze", "sequin", "lamé", "shimmer", "chrome"] },
 { key: "print", label: "Prints & Patterns", keywords: ["print", "leopard", "animal print", "stripe", "polka", "checker", "houndstooth", "tie dye", "zebra", "snake"] },
];

export const ERAS: KeyedOption[] = [
 { key: "2000s", label: "Y2K / 2000s", keywords: ["y2k", "2000s", "early 2000", "00s"] },
 { key: "90s", label: "'90s", keywords: ["90s", "1990s", "nineties"] },
 { key: "80s", label: "'80s", keywords: ["80s", "1980s", "eighties"] },
 { key: "70s", label: "'70s", keywords: ["70s", "1970s", "seventies", "disco"] },
 { key: "vintage-pre70", label: "True Vintage (pre-'70s)", keywords: ["60s", "1960s", "50s", "1950s", "victorian", "edwardian", "antique", "deco"] },
];

// Categories the user shops. Self-contained keywords so they bias the feed too.
export const TASTE_CATEGORIES: KeyedOption[] = [
 { key: "clothing", label: "Clothing", keywords: ["top", "shirt", "blouse", "sweater", "knit", "skirt", "pants", "trousers", "tee"] },
 { key: "dresses", label: "Dresses", keywords: ["dress", "gown", "slip dress", "maxi", "midi"] },
 { key: "denim", label: "Denim", keywords: ["denim", "jeans", "jean", "jorts"] },
 { key: "outerwear", label: "Outerwear", keywords: ["coat", "jacket", "blazer", "trench", "parka", "puffer", "fur"] },
 { key: "bags", label: "Bags", keywords: ["bag", "handbag", "purse", "tote", "clutch", "shoulder bag", "baguette", "satchel"] },
 { key: "shoes", label: "Shoes", keywords: ["shoe", "boot", "heel", "sneaker", "loafer", "flat", "sandal", "mule", "pump"] },
 { key: "accessories", label: "Accessories", keywords: ["scarf", "belt", "sunglasses", "hat", "gloves", "tights", "wallet"] },
 { key: "jewelry", label: "Jewelry", keywords: ["necklace", "earring", "bracelet", "ring", "brooch", "pendant", "jewelry"] },
];

// ── Keyword + sanitizer helpers (one generic builder per dimension) ───────────
function keywordsFor(options: KeyedOption[], keys: string[] | null | undefined): string[] {
 if (!keys || keys.length === 0) return [];
 const byKey = new Map(options.map((o) => [o.key, o]));
 const out = new Set<string>();
 for (const k of keys) { const o = byKey.get(k); if (o) for (const kw of o.keywords) out.add(kw.toLowerCase()); }
 return Array.from(out);
}
function sanitizeKeys(options: { key: string }[], input: unknown, cap = 12): string[] {
 if (!Array.isArray(input)) return [];
 const valid = new Set(options.map((o) => o.key));
 return Array.from(new Set(input.filter((k): k is string => typeof k === "string" && valid.has(k)))).slice(0, cap);
}

export const VIBE_KEYS = VIBES.map((v) => v.key);
export const vibeKeywords = (keys: string[] | null | undefined) => keywordsFor(VIBES, keys);
export const colorKeywords = (keys: string[] | null | undefined) => keywordsFor(COLORS, keys);
export const eraKeywords = (keys: string[] | null | undefined) => keywordsFor(ERAS, keys);

export const categoryTasteKeywords = (keys: string[] | null | undefined) => keywordsFor(TASTE_CATEGORIES, keys);

export const sanitizeVibes = (input: unknown) => sanitizeKeys(VIBES, input, 5);
export const sanitizeColors = (input: unknown) => sanitizeKeys(COLORS, input, 6);
export const sanitizeEras = (input: unknown) => sanitizeKeys(ERAS, input, 5);
export const sanitizeCategories = (input: unknown) => sanitizeKeys(TASTE_CATEGORIES, input, 8);

// Designers are validated against the real brand list at the call site (see the
// taste route) so the quiz only offers brands actually in the catalog.

// ── Taste-test sizes ────────────────────────────────────────────────────────
export const TASTE_SIZE_GROUPS: { label: string; options: string[] }[] = [
 { label: "Clothing", options: ["XS", "S", "M", "L", "XL", "XXL", "One Size"] },
 { label: "Numeric", options: ["0", "2", "4", "6", "8", "10", "12", "14", "16"] },
 { label: "Shoes (US)", options: ["5", "6", "7", "8", "9", "10", "11", "12"] },
];

const VALID_SIZES = new Set(TASTE_SIZE_GROUPS.flatMap((g) => g.options.map((s) => s.toUpperCase())));

export function sanitizeSizes(input: unknown): string[] {
 if (!Array.isArray(input)) return [];
 const out: string[] = [];
 for (const s of input) {
 if (typeof s !== "string") continue;
 const up = s.trim().toUpperCase();
 if (VALID_SIZES.has(up) && !out.includes(up)) out.push(up);
 if (out.length >= 12) break;
 }
 return out;
}
