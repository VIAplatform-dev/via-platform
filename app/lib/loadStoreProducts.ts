import type { StoreProduct } from "./types";
import type { CategorySlug } from "@/app/lib/categoryMap";
import { getProductsByStore, type DBProduct } from "./db";
import { brands as brandDefs } from "./brandData";
import { deriveDisplaySize } from "./inventory";
import { getCategoryOverrideMap } from "./category-overrides-db";

// Maps a coarse override family (written by the AI category sweep / admin) to a
// representative CategorySlug, so a corrected product groups + filters under the
// right top-level chip on store pages and anywhere loadStoreProducts is consumed.
const OVERRIDE_FAMILY_TO_SLUG: Record<string, CategorySlug> = {
 bags: "bags",
 shoes: "shoes",
 accessories: "accessories",
 home: "home",
 clothing: "other-clothing",
};

// Keyword → category mapping, checked in order.
// Rule: specific garment-type keywords (skirt, dress, shorts) are checked
// BEFORE material/fabric keywords (denim, jeans) so that e.g. a "Denim Skirt"
// is classified as a skirt, not jeans. Accessories is checked last.
const categoryKeywords: [CategorySlug, string[]][] = [
 // Compound overrides — checked first to prevent single-word false positives.
 // e.g. "Beaded Dress Pants" should be pants, not dresses.
 ["pants", ["dress pants", "dress pant", "slacks"]],
 ["skirts", ["skirt suit", "mini skirt", "midi skirt", "maxi skirt"]],
 ["jumpsuits", ["shirt dress jumpsuit", "dress jumpsuit"]],
 // Compound shoe overrides — must precede single-word shoe rules
 ["flats", ["ballet flat", "ballerina flat", "ballet flats", "flat shoe"]],
 ["boots", ["flat boot", "ankle boot", "knee-high boot", "thigh-high boot", "chelsea boot", "combat boot", "cowboy boot"]],
 ["sandals", ["wedge sandal", "thong sandal"]],
 ["heels", ["wedge heel", "kitten heel", "block heel", "cone heel"]],
 // Bag styles whose names contain a jewelry word — matched BEFORE the jewelry
 // NOUNS below so "Bracelet Bag" / "Ring Handle Bag" land in bags, not jewelry.
 // (Kept to explicit bag compounds so it can't steal real jewelry.)
 ["bags", [
 "bracelet bag", "ring handle bag", "ring-handle bag", "ring handle", "ring bag",
 "chain handle bag", "charm bag", "necklace bag", "pendant bag", "brooch bag",
 ]],
 // Small leather goods whose names contain a jewelry word ("4 Ring Key Holder",
 // "Key Chain") — matched BEFORE the jewelry NOUNS so "ring"/"chain" can't steal them.
 ["accessories", [
 "key holder", "key case", "key ring", "key chain", "key pouch", "key cles",
 "card holder", "cardholder", "card case", "card wallet", "pochette cles", "cles",
 ]],
 // Jewelry NOUNS checked first — an earring/necklace/ring title should never be
 // misclassified as bags or clothing even if it shares a designer keyword.
 // NOTE: gemstone/material words (ruby, emerald, pearl…) are intentionally NOT
 // here — they double as colors ("ruby red", "pearl white") and are checked
 // later (see "jewelry — gemstone" block below) so they don't steal shoes/bags.
 // Only UNAMBIGUOUS jewelry nouns here (checked before shoes/bags/clothing) — a title with
 // "necklace"/"earring"/"bracelet" is jewelry regardless of designer/other words. The ambiguous
 // detail-words ("ring", "cuff", "pendant") that ALSO describe garments/shoes ("ring-accent dress",
 // "cuff heels") are deliberately NOT here — they're checked in the LATE jewelry pass below, after
 // the garment/shoe/bag nouns, so a real dress/heel/bag wins.
 ["jewelry", [
 "earring", "necklace", "bracelet",
 "brooch", "bangle", "choker", "locket", "cuff bracelet", "d'ancre", "anklet",
 "signet", "lapel pin", "cufflink", "cuff link",
 "charm bracelet",
 "jewelry", "jewellery",
 ]],
 // Shoe subcategories — checked before the generic "shoes" catch-all
 ["boots", ["boot", "bootie"]],
 ["heels", ["heel", "pump", "stiletto", "wedge", "blahnik", "louboutin", "roger vivier"]],
 ["sneakers", ["sneaker", "trainer"]],
 ["sandals", ["sandal", "espadrille", "slide", "slingback", "flip flop", "flip-flop"]],
 ["flats", [
 "flats", "ballet flat", "ballet flats", "ballerina", "ballerina flat",
 "loafer", "mule", "clog", "oxford", "derby", "brogue",
 "mary jane", "moccasin", "slipper",
 ]],
 // "shoes" / "flat" (adj) / designer catch-all for shoes that don't fit above
 ["shoes", ["shoe", "footwear", "stuart weitzman"]],
 // Bag subcategories — checked before the generic "bags" catch-all
 ["totes", ["tote", "shopper", "neverfull", "cabas"]],
 ["clutches", ["clutch", "minaudiere", "minaudière", "wristlet", "evening bag", "envelope"]],
 ["crossbody-bags", ["crossbody", "cross-body", "satchel", "belt bag", "fanny pack"]],
 // "bags" — handbags merged in (bags & handbags are one category). Specific
 // styles above (totes/clutches/crossbody) still win; everything else → bags.
 ["bags", [
 "bag", "pouch", "backpack", "rucksack", "luggage", "suitcase", "duffel", "duffle", "chain wallet",
 "handbag", "purse", "hobo", "baguette", "bucket bag", "top handle", "chain bag", "frame bag",
 // LV / Fendi / Chanel / Gucci / Prada / Balenciaga icon styles — bag-exclusive MODEL names,
 // distinctive enough to be safe here (unlike the hardware/material names below, a brand doesn't
 // reuse "Speedy" or "Birkin" to describe a skirt or a loafer).
 "pochette", "musette", "keepall", "speedy", "alma", "papillon", "noé", "noe", "deauville", "vanity",
 "peekaboo", "kan i", "first bag", "sunshine",
 "flap bag", "boy bag", "2.55", "cambon", "gabrielle",
 "city bag", "le cagole",
 "chanel 22", "lady dior", "classic flap", "wallet on chain", "capucines",
 "petite malle", "metis", "loulou", "cassette", "arco",
 "birkin", "constance", "lindy", "picotin", "bolide", "evelyne",
 ]],
 // Specific garment types first — these take priority over material keywords
 ["dresses", ["dress", "gown", "kaftan", "caftan", "sundress", "slip dress", "maxi", "mini dress", "midi dress"]],
 ["skirts", ["skirt", "sarong"]],
 ["shorts", ["shorts"]],
 ["jumpsuits", ["jumpsuit", "romper", "playsuit", "overall", "matching set", "co-ord"]],
 ["coats-jackets", [
 "coat", "jacket", "blazer", "parka", "windbreaker", "puffer",
 "bomber", "trench", "overcoat", "cape", "poncho", "anorak",
 "kimono", "vest", "waistcoat", "gilet", "suit",
 ]],
 ["sweaters", [
 "sweater", "cardigan", "knit", "knitwear", "pullover", "hoodie",
 "sweatshirt", "turtleneck", "crewneck",
 ]],
 ["pants", [
 "pants", "trousers", "chino", "jogger", "slacks",
 "sweatpant", "wide-leg", "flare", "legging", "culottes",
 ]],
 // Lingerie & intimates — a true-vintage category; checked before tops so a
 // corset/bustier isn't swallowed as a generic top. (Slip DRESSES stay dresses.)
 ["lingerie", [
 "lingerie", "corset", "bustier", "bralette", "negligee", "negligée",
 "chemise", "babydoll", "garter", "girdle", "slip top", "camisole set",
 ]],
 // Swimwear — previously fell through to generic clothing.
 ["swimwear", ["swimsuit", "swimwear", "bikini", "tankini", "bathing suit", "monokini"]],
 ["tops", [
 "top", "blouse", "shirt", "tee", "t-shirt", "tank", "cami",
 "bodysuit", "halter", "polo", "henley",
 "tube top", "crop", "tunic", "wrap top", "sheer top",
 // Button-up/-down shirts — matched here (before the gemstone block) so a
 // "Pearl Accent ... Button Up" reads as a top, not jewelry.
 "button up", "button-up", "button down", "button-down",
 ]],
 // Jeans checked after specific garment types so "Denim Skirt" → skirts,
 // not jeans. "jeans" (plural only) avoids matching designer first names
 // like "Jean Paul Gaultier".
 ["jeans", ["jeans", "denim"]],
 // Home & lifestyle — checked before accessories so "vase", "candle", etc. don't fall through
 ["home", [
 "book", "plate", "dish", "cup", "mug", "bowl", "vase", "candle", "candlestick",
 "pitcher", "jug", "teapot", "tea set", "coffee set", "carafe",
 "tablecloth", "napkin", "placemat", "tray", "serving bowl", "salad bowl",
 "wine glass", "champagne flute", "tumbler", "decanter",
 "ornament", "figurine", "sculpture", "picture frame", "photo frame",
 "lamp", "lantern", "cushion", "throw pillow", "blanket",
 "cutting board", "cheese board", "soap dish", "diffuser",
 "trinket", "trinket dish", "ashtray",
 ]],
 // Jewelry — gemstone/material words. Checked AFTER garment/shoe/bag nouns
 // because they're commonly used as colors ("ruby red mules", "emerald green
 // dress", "pearl white sandals"). A gemstone-only title (e.g. "Art Deco Sapphire
 // Clip") still lands here as jewelry rather than falling through to accessories.
 ["jewelry", [
 "vermeil", "gemstone", "topaz", "sapphire", "diamond",
 "ruby", "emerald", "pearl", "amethyst", "opal", "garnet",
 "turquoise", "onyx",
 // Ambiguous jewelry words that also appear as garment/shoe/bag DETAILS ("ring accents",
 // "cuff heels", "pendant sleeve"). Checked here — after every garment/shoe/bag noun above —
 // so they classify as jewelry ONLY when nothing else matched (a bare "gold ring", "wide cuff").
 // Word-boundary matching keeps them safe (\bring\b never hits "string"/"earring"/"keyring").
 "ring", "cuff", "pendant",
 ]],
 // Accessory subcategories checked before generic "accessories" catch-all
 ["sunglasses", ["sunglasses", "sunglass", "eyewear", "spectacles"]],
 ["belts", ["belt"]],
 ["scarves", ["scarf", "scarves", "stole", "shawl"]],
 ["hats", ["hat", "cap", "beret", "beanie", "headband", "hair clip", "barrette", "hair band", "fascinator"]],
 // "accessories" catch-all for watches, wallets, gloves, neckwear, and everything else
 ["accessories", [
 "watch",
 "wallet", "coin purse", "card holder", "cardholder", "keyring", "keychain",
 "gloves", "mittens",
 "necktie", "bow tie", "pocket square",
 "hair pin", "charm", "signet",
 "accessories",
 ]],
 // Ambiguous bag HARDWARE/LINE and fabric-pattern names — a brand reuses these across its whole
 // product range (Gucci's Horsebit is as much a loafer as a bag; Bamboo and Marmont hardware turns
 // up on wallets and belts; Saffiano and Matelassé are leather/quilting finishes, not bag words at
 // all) — unlike the bag-exclusive MODEL names in the "bags" block above, these can legitimately
 // describe a non-bag item. Checked LAST — after every other category above, garment through
 // accessories — so "Gucci Bamboo Leather Detail Skirt" or "Gucci Horsebit Loafers" classify by
 // what they actually ARE, and these only win as a final fallback (a bare "Gucci Marmont" listing
 // with nothing else in its title to go on).
 ["bags", ["marmont", "dionysus", "bamboo", "ophidia", "horsebit", "galleria", "saffiano", "flap", "puzzle", "matelasse", "matelassé"]],
];

// Pre-compile word-boundary patterns once at module load.
// Single-word keywords use \b…(?:s|es)?\b so that:
// • "top" matches "Silk Top" / "Silk Tops" — but NOT "Topaz"
// • "tote" matches "Leather Tote" / "Canvas Totes" — but NOT "Toteme"
// • "boot" matches "Ankle Boot" / "Black Boots"
// • "watch" matches "Vintage Watch" / "Vintage Watches"
// Multi-word keywords (e.g. "tube top", "mary jane") keep substring matching.
function buildPattern(kw: string): RegExp | string {
 if (kw.includes(" ")) return kw;
 const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
 return new RegExp(`\\b${escaped}(?:s|es)?\\b`, "i");
}

const compiledCategories: [CategorySlug, Array<RegExp | string>][] =
 categoryKeywords.map(([cat, keywords]) => [
 cat,
 keywords.map(buildPattern),
 ]);

// Specific product title overrides — for items whose titles don't contain matchable keywords.
// Uses case-insensitive substring matching (title must contain the phrase).
const TITLE_OVERRIDES: Array<[string, CategorySlug]> = [
 ["coastal charm", "home"],
];

export const inferCategoryFromTitle = (title: string | null | undefined): CategorySlug => {
 if (!title) return "other-clothing";
 const lower = title.toLowerCase();
 for (const [phrase, cat] of TITLE_OVERRIDES) {
 if (lower.includes(phrase)) return cat;
 }
 for (const [category, patterns] of compiledCategories) {
 if (patterns.some((p) =>
 typeof p === "string" ? title.toLowerCase().includes(p) : p.test(title)
 )) {
 return category;
 }
 }
 // Unrecognized items default to clothing (these are vintage fashion stores)
 return "other-clothing";
};

export const inferItemTypeFromTitle = (title: string): string | null => {
 const t = title.toLowerCase();
 const types = [
 // Shoes — checked before generic clothing words
 "ballet flat", "ballet flats", "ballerina flat",
 "loafer", "mule", "clog", "slingback", "mary jane", "moccasin",
 "boot", "bootie", "heel", "pump", "sandal", "sneaker", "trainer",
 "espadrille", "wedge", "oxford", "derby", "brogue", "slide",
 "flat", // generic flat (after "ballet flat")
 // Bags
 "clutch", "tote", "handbag", "crossbody", "satchel", "baguette",
 "bucket bag", "shoulder bag",
 "bag",
 // Clothing
 "jacket", "coat", "blazer", "trench", "puffer", "bomber",
 "dress", "gown",
 "skirt",
 "shorts",
 "jumpsuit", "romper",
 "pants", "trousers", "jeans",
 "blouse", "shirt", "top", "tee",
 "sweater", "cardigan", "knit",
 "vest", "suit",
 "cape", "poncho",
 "scarf", "belt",
 ];
 for (const type of types) {
 if (t.includes(type)) return type;
 }
 return null;
};

export const inferColorFromTitle = (title: string): string | null => {
 const t = title.toLowerCase();
 const colors = [
 "multicolor", "burgundy", "maroon", "navy", "cream", "beige",
 "ivory", "coral", "teal", "khaki", "camel", "olive", "silver",
 "gold", "orange", "yellow", "purple", "brown", "green", "pink",
 "grey", "gray", "black", "white", "red", "blue", "tan",
 ];
 for (const color of colors) {
 if (t.includes(color)) return color;
 }
 return null;
};

export const inferBrandFromTitle = (title: string): string | null => {
 const t = title.toLowerCase();
 for (const brand of brandDefs) {
 for (const keyword of brand.keywords) {
 const matches =
 keyword.length <= 3
 ? new RegExp(`(?<![a-z])${keyword}(?![a-z])`).test(t)
 : t.includes(keyword);
 if (matches) return brand.slug;
 }
 }
 return null;
};

/**
 * Like inferBrandFromTitle but returns the first matched keyword string
 * (e.g. "dolce & gabbana", "chanel") — suitable for SQL ILIKE searches.
 */
export const inferBrandKeywordFromTitle = (title: string): string | null => {
 const t = title.toLowerCase();
 for (const brand of brandDefs) {
 for (const keyword of brand.keywords) {
 const matches =
 keyword.length <= 3
 ? new RegExp(`(?<![a-z])${keyword}(?![a-z])`).test(t)
 : t.includes(keyword);
 if (matches) return keyword;
 }
 }
 return null;
};

/**
 * Returns the primary item-type keyword to use for SQL ILIKE title search.
 * Normalizes compound types to their most searchable single word.
 */
export const inferItemTypeKeyword = (title: string): string | null => {
 const type = inferItemTypeFromTitle(title);
 if (!type) return null;
 // Normalize compound types to the most distinctive word
 const normMap: Record<string, string> = {
 "ballet flat": "ballet flat",
 "ballet flats": "ballet flat",
 "ballerina flat": "ballet flat",
 "bucket bag": "bucket bag",
 "shoulder bag": "shoulder bag",
 };
 return normMap[type] ?? type.split(" ")[0]; // first word is usually searchable
};

// Parse images JSON from DB, falling back to single image
function parseImages(product: DBProduct): string[] {
 if (product.images) {
 try {
 const parsed = JSON.parse(product.images);
 if (Array.isArray(parsed) && parsed.length > 0) return parsed;
 } catch {}
 }
 return product.image ? [product.image] : [];
}

// Transform database product to StoreProduct format
function transformDBProduct(product: DBProduct, overrideMap?: Map<string, string>): StoreProduct {
 const priceString = `$${Math.round(Number(product.price))}`;
 // An AI/admin category override wins over the title inference.
 const override = overrideMap?.get(`${product.store_slug}-${product.id}`);
 const category = (override && OVERRIDE_FAMILY_TO_SLUG[override]) || inferCategoryFromTitle(product.title);

 return {
 id: `${product.store_slug}-${product.id}`,
 name: product.title,
 price: priceString,
 currency: product.currency || "USD",
 category,
 storeSlug: product.store_slug,
 externalUrl: product.external_url ?? undefined,
 image: product.image ?? undefined,
 images: parseImages(product),
 imageColor: product.image_color ?? null,
 size: deriveDisplaySize(product),
 syncedAt: product.synced_at instanceof Date
 ? product.synced_at.toISOString()
 : String(product.synced_at),
 createdAt: product.created_at instanceof Date
 ? product.created_at.toISOString()
 : product.created_at
 ? String(product.created_at)
 : undefined,
 };
}

/**
 * Load products for a specific store from the database
 */
export async function loadStoreProducts(storeSlug: string): Promise<StoreProduct[]> {
 try {
 const products = await getProductsByStore(storeSlug);
 const overrideMap = await getCategoryOverrideMap().catch(() => new Map<string, string>());
 return products.map((p) => transformDBProduct(p, overrideMap));
 } catch (error) {
 console.error(`Failed to load products for store ${storeSlug}:`, error);
 return [];
 }
}
