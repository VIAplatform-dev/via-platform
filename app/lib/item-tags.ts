// Shared tag vocabularies for the seller-facing item editors and inventory filters.
//
// Categories are the SAME taxonomy the storefront navigates by (`categoryMap`), so a tag
// picked here lines up with the category pages, brand pages and nav mega-menu. Free-text
// category strings (AI intake writes "jackets"/"swimwear"; Shopify imports write whatever
// the seller typed) are folded onto a canonical slug by `toCategorySlug` — that's what makes
// the same tag set usable for both editing and filtering.

// .ts extensions so `node --test` can load this module directly (see item-tags.test.ts).
import { categoryMap, type CategorySlug } from "./categoryMap.ts";
import type { ItemStatus } from "./db/inventory-core.ts";

export type { CategorySlug, ItemStatus };

// ── Status ─────────────────────────────────────────────────────────────────────
export const ITEM_STATUSES: ItemStatus[] = ["draft", "active", "reserved", "sold", "removed"];

/** StatusPill tone per status — keeps the pill colour identical everywhere it's shown. */
export const STATUS_TONE: Record<ItemStatus, "live" | "pending" | "neutral" | "down" | "info"> = {
 draft: "pending", active: "live", reserved: "info", sold: "neutral", removed: "down",
};

/** Statuses are stored lowercase; they're always shown title case. */
export const statusLabel = (s: ItemStatus): string => s.charAt(0).toUpperCase() + s.slice(1);

// ── Categories ─────────────────────────────────────────────────────────────────
// Grouped the way the storefront nav groups them, so the picker reads as a hierarchy.
export const CATEGORY_GROUPS: { label: string; slugs: CategorySlug[] }[] = [
 { label: "Clothing", slugs: ["tops", "sweaters", "coats-jackets", "dresses", "skirts", "pants", "jeans", "shorts", "jumpsuits", "lingerie", "swimwear", "other-clothing"] },
 { label: "Shoes", slugs: ["boots", "heels", "sneakers", "sandals", "flats", "shoes"] },
 { label: "Bags", slugs: ["handbags", "totes", "clutches", "crossbody-bags", "bags"] },
 { label: "Accessories", slugs: ["jewelry", "belts", "scarves", "hats", "sunglasses", "accessories"] },
 { label: "Home", slugs: ["home"] },
];

export const CATEGORY_SLUGS: CategorySlug[] = CATEGORY_GROUPS.flatMap((g) => g.slugs);

export const categoryTagLabel = (slug: CategorySlug): string => categoryMap[slug];

// A stored category is either one of the canonical slugs above, or free text the seller
// typed under "Other". Everything downstream branches on which.
export const OTHER_FAMILY = "Other";
const SLUG_SET = new Set<string>(CATEGORY_SLUGS);
export const isCanonicalCategory = (v: string | null | undefined): v is CategorySlug => !!v && SLUG_SET.has(v);
/** What to print for a stored category — the taxonomy label, or the seller's own words. */
export const categoryValueLabel = (v: string): string => (isCanonicalCategory(v) ? categoryMap[v] : v);

const FAMILY_OF = new Map<CategorySlug, string>(
 CATEGORY_GROUPS.flatMap((g) => g.slugs.map((s) => [s, g.label] as [CategorySlug, string])),
);

/** Which top-level family a category belongs to — the first half of the "Bags › Totes" path. */
export const categoryFamily = (v: string): string => FAMILY_OF.get(v as CategorySlug) || OTHER_FAMILY;

export const familySlugs = (family: string): CategorySlug[] =>
 CATEGORY_GROUPS.find((g) => g.label === family)?.slugs || [];

// Synonyms → slug, checked in order (specific before catch-all), matched as whole words so
// "flat" doesn't swallow "flatform" and "belt" doesn't swallow "belt bag" (which is checked first).
const SYNONYMS: [RegExp, CategorySlug][] = [
 // Bags — before "belts"/"accessories" so "belt bag" and "evening bag" land here.
 [/\b(tote|totes|shopper)\b/, "totes"],
 [/\b(clutch|clutches|minaudiere|wristlet|evening bag)\b/, "clutches"],
 [/\b(crossbody|cross-?body|satchel|belt bag|fanny pack)\b/, "crossbody-bags"],
 [/\b(handbag|handbags|purse|purses|top handle|shoulder bag)\b/, "handbags"],
 [/\b(bag|bags|backpack|backpacks|pouch|luggage|duffel|duffle)\b/, "bags"],
 // Shoes — subcategories before the catch-all.
 [/\b(boot|boots|bootie|booties)\b/, "boots"],
 [/\b(heel|heels|pump|pumps|stiletto|stilettos|wedge|wedges|slingback|slingbacks)\b/, "heels"],
 [/\b(sneaker|sneakers|trainer|trainers)\b/, "sneakers"],
 [/\b(sandal|sandals|espadrille|espadrilles|slide|slides|flip-?flop)\b/, "sandals"],
 [/\b(flat|flats|ballet flat|loafer|loafers|mule|mules|clog|clogs|oxford|oxfords|brogue|brogues|mary jane|moccasin|moccasins)\b/, "flats"],
 [/\b(shoe|shoes|footwear)\b/, "shoes"],
 // Clothing — specific garments before the generic families.
 [/\b(dress|dresses|gown|gowns|sundress|kaftan|caftan)\b/, "dresses"],
 [/\b(skirt|skirts|sarong)\b/, "skirts"],
 [/\b(short|shorts|bermuda|hot pants)\b/, "shorts"],
 [/\b(jumpsuit|jumpsuits|romper|rompers|playsuit|playsuits|overalls?|co-?ord)\b/, "jumpsuits"],
 [/\b(swim|swimwear|swimsuit|swimsuits|bikini|bikinis|tankini|monokini|bathing suit)\b/, "swimwear"],
 [/\b(lingerie|intimates|corset|corsets|bustier|bralette|negligee|chemise|babydoll|girdle)\b/, "lingerie"],
 [/\b(coat|coats|jacket|jackets|blazer|blazers|outerwear|trench|parka|puffer|bomber|bombers|cape|capes|poncho|anorak|vest|vests|gilet)\b/, "coats-jackets"],
 [/\b(sweater|sweaters|cardigan|cardigans|knit|knitwear|knits|pullover|jumper|jumpers|hoodie|hoodies|sweatshirt|sweatshirts|turtleneck|crewneck)\b/, "sweaters"],
 [/\b(jean|jeans|denim)\b/, "jeans"],
 [/\b(pant|pants|trouser|trousers|legging|leggings|chino|chinos|jogger|joggers|slacks|culottes)\b/, "pants"],
 [/\b(top|tops|blouse|blouses|shirt|shirts|tee|tees|t-shirt|tank|tanks|cami|camisole|bodysuit|bodysuits|halter|polo|tunic)\b/, "tops"],
 [/\b(clothing|apparel|ready-?to-?wear|rtw|garment|garments)\b/, "other-clothing"],
 // Accessories — subcategories before the catch-all.
 [/\b(sunglass|sunglasses|eyewear|spectacles)\b/, "sunglasses"],
 [/\b(jewelry|jewellery|necklace|necklaces|earring|earrings|bracelet|bracelets|brooch|brooches|pendant|pendants)\b/, "jewelry"],
 [/\b(belt|belts)\b/, "belts"],
 [/\b(scarf|scarves|stole|shawl|shawls)\b/, "scarves"],
 [/\b(hat|hats|cap|caps|beret|beanie|headband|fascinator)\b/, "hats"],
 [/\b(accessory|accessories|watch|watches|wallet|wallets|glove|gloves|keychain|tie|ties)\b/, "accessories"],
 // Home.
 [/\b(home|homeware|decor|d[eé]cor|candle|candles|vase|vases|ceramic|ceramics|tableware|glassware)\b/, "home"],
];

// ── What a live listing needs ──────────────────────────────────────────────────
// The fields marked with a * in the editors. A draft may be saved without them; an item
// can't go active without them — a listing with no photo, price or category can't be
// browsed, sorted or bought. Kept here so both editors show and enforce the same rule.
export function publishBlockers(
 form: { title: string; price: string; category: string | null },
 images: string[],
): string[] {
 const missing: string[] = [];
 if (!form.title.trim()) missing.push("a title");
 if (!images.length) missing.push("a photo");
 if (!((Number(form.price) || 0) > 0)) missing.push("a price");
 if (!form.category) missing.push("a category");
 return missing;
}

const BY_LABEL = new Map<string, CategorySlug>(
 (Object.keys(categoryMap) as CategorySlug[]).map((s) => [categoryMap[s].toLowerCase(), s]),
);

/**
 * Fold any stored category string onto a canonical slug — the slug itself, its display label,
 * or a synonym. Returns null when there's nothing recognisable (so callers can show "Uncategorised"
 * rather than guessing).
 */
export function toCategorySlug(raw: unknown): CategorySlug | null {
 // Defensive on TYPE, not just on null. This threw "toLowerCase is not a function" in production
 // when `draft.category` changed from a bare string to {value, confidence}: several callers pass
 // API payloads straight in, and one of them cast the array to `string[]`, which hid the mismatch
 // from the compiler entirely. A tag helper should never be the thing that takes a page down.
 const lower = (typeof raw === "string" ? raw : "").toLowerCase().trim();
 if (!lower) return null;
 if (Object.prototype.hasOwnProperty.call(categoryMap, lower)) return lower as CategorySlug;
 const byLabel = BY_LABEL.get(lower);
 if (byLabel) return byLabel;
 for (const [re, slug] of SYNONYMS) if (re.test(lower)) return slug;
 return null;
}
