// Mapping a VYA piece onto Vestiaire Collective's listing form.
//
// Same shape as the Depop payload, and deliberately NOT a copy of it: Vestiaire's form asks
// different questions, in different words, with different rules. Three differences matter enough to
// change what the seller sees before she ever opens the site.
//
//  1. VESTIAIRE IS CURATED. It only accepts pieces from brands on its own list — an unbranded 90s
//     slip or a Zara dress is rejected, not merely unpopular. Queueing one wastes the seller's
//     afternoon, so eligibility is checked HERE and the board can say so instead of letting her
//     find out at the end of a form.
//
//  2. MATERIAL IS REQUIRED, where Depop treats it as optional. VYA often has no material — the AI
//     is instructed to leave it blank rather than guess a fibre from a photo — so this reads the
//     title and description for one and leaves it blank when there genuinely isn't one, rather
//     than inventing "synthetic" to fill the box.
//
//  3. THE CONDITION SCALE IS ITS OWN. Vestiaire's five tiers are phrases, not adjectives, and its
//     top tier distinguishes "with tag" from merely unworn.
//
// Pure — no network, no database. The route resolves the item; this decides what goes in the boxes.

export type VestiaireEligibility = { ok: true } | { ok: false; reason: string };

/**
 * Vestiaire's exact condition wording.
 *
 * The extension matches loosely, so these only have to name the tier — but they are Vestiaire's
 * phrases rather than Depop's adjectives, because the two sites don't share a scale.
 */
export function vestiaireCondition(c: string | null | undefined): string {
 const s = (c || "").toLowerCase();
 if (/bnwt|new with tag|with tags?\b|nwt|deadstock/.test(s)) return "Never worn, with tag";
 if (/brand ?new|never worn|nwot|new without|unworn/.test(s)) return "Never worn";
 if (/excellent|mint|pristine|very good|vgc/.test(s)) return "Very good condition";
 if (/\bgood\b/.test(s)) return "Good condition";
 if (/fair|worn|wear|distress|flaw|damage/.test(s)) return "Fair condition";
 // Unlabelled vintage is rarely pristine, and overstating condition is what gets a piece returned.
 return "Good condition";
}

/** Vestiaire splits everything by universe first. Menswear cues in the text decide it. */
export function vestiaireUniverse(title: string | null | undefined, category: string | null | undefined): "Women" | "Men" {
 const hay = `${title || ""} ${category || ""}`;
 if (/\bmen'?s\b|\bmenswear\b|\bmens\b|\bblazer for men\b/i.test(hay)) return "Men";
 return "Women";
}

const CATEGORY_MAP: [RegExp, string, string][] = [
 // category slug or title → Vestiaire category, subcategory
 [/handbag|shoulder.?bag|crossbody|tote|clutch|purse|\bbags?\b/i, "Bags", "Handbags"],
 [/backpack/i, "Bags", "Backpacks"],
 [/luggage|suitcase|trunk|weekend/i, "Bags", "Travel bags"],
 [/wallet|card ?holder|coin ?purse/i, "Accessories", "Wallets"],
 [/\bboots?\b/i, "Shoes", "Boots"],
 [/heel|pump|stiletto|sandal|mule|flat|loafer|sneaker|trainer|shoes?\b/i, "Shoes", "Heels"],
 [/dress|gown/i, "Clothing", "Dresses"],
 [/skirt/i, "Clothing", "Skirts"],
 [/trouser|pant|jean|palazzo/i, "Clothing", "Trousers"],
 [/coat|jacket|blazer|parka/i, "Clothing", "Coats"],
 [/knit|jumper|sweater|cardigan/i, "Clothing", "Knitwear"],
 [/top|blouse|shirt|tee|t-shirt|vest/i, "Clothing", "Tops"],
 [/jumpsuit|playsuit/i, "Clothing", "Jumpsuits"],
 [/swim|bikini/i, "Clothing", "Swimwear"],
 [/lingerie|slip\b/i, "Clothing", "Lingerie"],
 [/scarf|shawl|foulard/i, "Accessories", "Scarves"],
 [/belt/i, "Accessories", "Belts"],
 [/hat|cap|beret/i, "Accessories", "Hats"],
 [/sunglass|eyewear/i, "Accessories", "Sunglasses"],
 [/watch/i, "Watches", "Watches"],
 [/necklace|earring|bracelet|ring\b|brooch|jewel/i, "Jewellery", "Jewellery"],
];

/**
 * Things the title names that a VYA category genuinely can't express.
 *
 * A card holder filed under "bags" is a wallet to Vestiaire, and it sits in Accessories with a
 * different fee. Checked BEFORE the category, which is the same order tax-codes.ts and customs.ts
 * use for exactly this reason.
 */
const TITLE_OVERRIDES: [RegExp, string, string][] = [
 [/wallet|card ?holder|coin ?purse/i, "Accessories", "Wallets"],
 [/luggage|suitcase|trunk|weekend/i, "Bags", "Travel bags"],
 [/backpack/i, "Bags", "Backpacks"],
 [/\bwatch(es)?\b/i, "Watches", "Watches"],
 [/sunglass|eyewear/i, "Accessories", "Sunglasses"],
 [/\bbelt\b/i, "Accessories", "Belts"],
 [/scarf|shawl|foulard/i, "Accessories", "Scarves"],
];

/** Vestiaire's category and subcategory. Title overrides first, then VYA's category, then the title. */
export function vestiaireCategory(category: string | null | undefined, title: string | null | undefined): { category: string; subcategory: string } {
 const t = String(title || "");
 for (const [re, cat, sub] of TITLE_OVERRIDES) if (t && re.test(t)) return { category: cat, subcategory: sub };
 for (const src of [String(category || ""), t]) {
  if (!src) continue;
  for (const [re, cat, sub] of CATEGORY_MAP) if (re.test(src)) return { category: cat, subcategory: sub };
 }
 return { category: "Clothing", subcategory: "" };
}

const MATERIALS: [RegExp, string][] = [
 [/patent ?leather/i, "Patent leather"],
 [/suede/i, "Suede"],
 [/shearling|sheepskin/i, "Shearling"],
 [/leather/i, "Leather"],
 [/denim/i, "Denim - Jeans"],
 [/cashmere/i, "Cashmere"],
 [/\bwool\b|merino|tweed/i, "Wool"],
 [/\bsilk\b/i, "Silk"],
 [/\blinen\b/i, "Linen"],
 [/\bcotton\b/i, "Cotton"],
 [/velvet/i, "Velvet"],
 [/\blace\b/i, "Lace"],
 [/viscose|rayon/i, "Viscose"],
 [/polyester|nylon|re-?nylon|polyamide|synthetic/i, "Synthetic"],
 [/\bfur\b(?!niture)|mink|shearling/i, "Fur"],
 [/exotic|crocodile|python|lizard|ostrich/i, "Exotic leathers"],
];

/**
 * A material, or blank.
 *
 * Blank on purpose when nothing is named: the intake prompt tells the AI to leave material null
 * rather than guess a fibre from a photo, and filling "Synthetic" here to satisfy a required field
 * would launder that honest blank into a false claim on a listing a buyer relies on.
 */
export function vestiaireMaterial(material: string | null | undefined, title: string | null | undefined, description: string | null | undefined): string {
 const explicit = String(material || "").trim();
 const hay = explicit || `${title || ""} ${description || ""}`;
 for (const [re, name] of MATERIALS) if (re.test(hay)) return name;
 return "";
}

const COLOURS: [RegExp, string][] = [
 [/black/i, "Black"], [/navy/i, "Navy"], [/\bblue\b|cobalt|teal/i, "Blue"],
 [/brown|chocolate|espresso/i, "Brown"], [/camel|\btan\b|caramel/i, "Camel"],
 [/beige|sand|taupe|nude/i, "Beige"], [/cream|ivory|off.?white|ecru/i, "Ecru"],
 [/\bgreen\b|olive|emerald|khaki/i, "Green"], [/grey|gray|charcoal|anthracite/i, "Grey"],
 [/orange|rust|terracotta/i, "Orange"], [/\bpink\b|blush|fuchsia|rose\b/i, "Pink"],
 [/purple|lilac|lavender|violet/i, "Purple"], [/burgundy|maroon|wine\b/i, "Burgundy"],
 [/\bred\b|crimson|scarlet/i, "Red"], [/white/i, "White"], [/yellow|mustard/i, "Yellow"],
 [/gold/i, "Gold"], [/silver/i, "Silver"],
 [/multi|colou?rful|floral|print|pattern|striped/i, "Multicolour"],
];

export function vestiaireColour(title: string | null | undefined, description: string | null | undefined): string {
 const hay = `${title || ""} ${description || ""}`;
 for (const [re, name] of COLOURS) if (re.test(hay)) return name;
 return "";
}

/**
 * Brands Vestiaire does not accept.
 *
 * Not a complete list — it can't be, Vestiaire's is curated and private. It catches the high-street
 * labels a vintage seller genuinely has in stock, so the obvious rejections are caught here rather
 * than at the end of the form. Anything unrecognised is allowed through: guessing a designer brand
 * is ineligible would block a real listing, which is the worse error.
 */
const NOT_ACCEPTED = /^(zara|h&m|h & m|shein|primark|topshop|topman|asos|boohoo|missguided|forever ?21|george|f&f|matalan|new look|pretty ?little ?thing|urban outfitters|bershka|pull ?& ?bear|stradivarius|mango|gap|old navy|target|walmart|george at asda|next)\b/i;

/**
 * Whether this piece can be listed on Vestiaire at all.
 *
 * Checked before queueing so the board can refuse with a reason. Vestiaire rejects unbranded pieces
 * outright — which is a real constraint for vintage, where a beautiful 70s dress often has no label
 * anyone can name.
 */
export function vestiaireEligibility(brand: string | null | undefined): VestiaireEligibility {
 const b = String(brand || "").trim();
 if (!b) return { ok: false, reason: "Vestiaire only takes pieces with a designer brand — add one first." };
 if (NOT_ACCEPTED.test(b)) return { ok: false, reason: `Vestiaire doesn’t accept ${b}.` };
 return { ok: true };
}

/** Vestiaire's title field is short. Trim on a word boundary rather than mid-word. */
export function vestiaireTitle(title: string | null | undefined, max = 50): string {
 const t = String(title || "").trim().replace(/\s+/g, " ");
 if (t.length <= max) return t;
 const cut = t.slice(0, max);
 const space = cut.lastIndexOf(" ");
 return (space > max * 0.6 ? cut.slice(0, space) : cut).trim();
}
