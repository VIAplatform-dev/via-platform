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

// Vestiaire's OWN item-type list, read straight off their form's <select> (id=preductAddCategory):
//   Handbags · Clutch bags · Backpacks · Travel bags · Boots · Trainers · Flats · Ballet flats ·
//   Sandals · Mules & Clogs · Lace ups · Heels · Ankle boots · Espadrilles · Knitwear · Tops ·
//   Dresses · Skirts · Trousers · Shorts · Jumpsuits · Jeans · Jackets · Coats
//
// Every subcategory below has to be a string from that list verbatim, or the extension picks
// nothing and the seller is left on a step that won't advance. Checked by a test.
const CATEGORY_MAP: [RegExp, string, string][] = [
 // category slug or title → Vestiaire category, subcategory
 [/clutch/i, "Bags", "Clutch bags"],
 [/handbag|shoulder.?bag|crossbody|tote|purse|\bbags?\b/i, "Bags", "Handbags"],
 [/backpack/i, "Bags", "Backpacks"],
 [/luggage|suitcase|trunk|weekend/i, "Bags", "Travel bags"],
 [/wallet|card ?holder|coin ?purse/i, "Accessories", "Wallets"],
 [/ankle ?boot/i, "Shoes", "Ankle boots"],
 [/\bboots?\b/i, "Shoes", "Boots"],
 [/sneaker|trainer/i, "Shoes", "Trainers"],
 [/sandal/i, "Shoes", "Sandals"],
 [/mule|clog/i, "Shoes", "Mules & Clogs"],
 [/espadrille/i, "Shoes", "Espadrilles"],
 [/ballet/i, "Shoes", "Ballet flats"],
 [/loafer|lace.?up|oxford|brogue/i, "Shoes", "Lace ups"],
 [/\bflats?\b/i, "Shoes", "Flats"],
 [/heel|pump|stiletto|shoes?\b/i, "Shoes", "Heels"],
 [/dress|gown/i, "Clothing", "Dresses"],
 [/skirt/i, "Clothing", "Skirts"],
 [/jean|denim ?pant/i, "Clothing", "Jeans"],
 [/\bshorts?\b/i, "Clothing", "Shorts"],
 [/trouser|pant|palazzo/i, "Clothing", "Trousers"],
 [/jacket|blazer|bomber/i, "Clothing", "Jackets"],
 [/coat|parka|trench/i, "Clothing", "Coats"],
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

export function vestiaireColour(title: string | null | undefined, description: string | null | undefined, colour?: string | null): string {
 // A colour the seller typed is the truth; the words are only a fallback for pieces listed before
 // there was a field for it. "Dress" / "Silk dress" name no colour, and Vestiaire requires one.
 const typed = String(colour || "").trim();
 if (typed) return typed;
 const hay = `${title || ""} ${description || ""}`;
 for (const [re, name] of COLOURS) if (re.test(hay)) return name;
 return "";
}

/**
 * Their Details step asks for three more things VYA has no field for: a dress LENGTH (they label it
 * Category), a PATTERN, and a size in a named system. Each is a required field, so a listing that
 * skips them can't be published — the seller gets sent back to Details from the publish button,
 * which is the worst possible moment to learn it.
 *
 * All three are read from what the piece already says about itself. Where the words don't say,
 * these return "" and the seller fills it in — the same rule material follows. Never guess a fact
 * a buyer could hold against her.
 */
// Their pattern list, verbatim from the form's Pattern box:
// Plain · Zebra · Snakeskin · Leopard · Tartan · Houndstooth · Floral · Polkadot · Abstract ·
// Gingham · Striped · Crocodile · Other
// Anything we invent outside this list matches nothing in their dropdown and silently leaves the
// field empty, which is a required field — so every value here is one of theirs.
const PATTERNS: [RegExp, string][] = [
 [/leopard|cheetah/i, "Leopard"], [/zebra/i, "Zebra"],
 [/snake ?skin|snake|python/i, "Snakeskin"], [/crocodile|croc\b|alligator/i, "Crocodile"],
 [/floral|flower|rose print|poppy/i, "Floral"], [/houndstooth/i, "Houndstooth"],
 [/gingham/i, "Gingham"], [/tartan|plaid/i, "Tartan"],
 [/polka|polkadot|spot(ted)? print|dotted/i, "Polkadot"],
 [/stripe/i, "Striped"],
 // Their catch-all, for a print we can name but they don't list — paisley, tie dye, camouflage.
 [/paisley|tie ?dye|camo(uflage)?|abstract|geometric|graphic print/i, "Abstract"],
];

export function vestiairePattern(
 title: string | null | undefined, description: string | null | undefined, colour?: string | null,
): string {
 const hay = `${title || ""} ${description || ""}`;
 for (const [re, name] of PATTERNS) if (re.test(hay)) return name;
 // Nothing named a pattern AND the piece is one colour → it's plain. That inference is safe in a
 // way guessing a fibre never is: a solid navy dress is not a claim anyone can be misled by.
 const c = String(colour || "").trim();
 if (c && !/multi/i.test(c) && !/print|pattern/i.test(hay)) return "Plain";
 return "";
}

/** Mini / Midi / Maxi — only for the pieces that have a length. */
export function vestiaireLength(
 category: string | null | undefined, title: string | null | undefined, description: string | null | undefined,
): string {
 const cat = String(category || "").toLowerCase();
 if (!/dress|skirt|gown/.test(cat)) return "";
 const hay = `${title || ""} ${description || ""}`;
 if (/\bmaxi\b|floor.?length|full.?length|ankle.?length|gown/i.test(hay)) return "Maxi";
 if (/\bmidi\b|tea.?length|below.?the.?knee|knee.?length/i.test(hay)) return "Midi";
 if (/\bmini\b|above.?the.?knee|short dress|micro/i.test(hay)) return "Mini";
 return "";
}

/**
 * Their size box is two controls: the SYSTEM (FR / UK / US / IT / International) and the value.
 * VYA stores one free-text size — "M", "US 8", "EU 40" — so the system is read off the text where
 * it names one, and defaults to International for letter sizes and US for bare numbers.
 */
export function vestiaireSize(size: string | null | undefined): { system: string; value: string } {
 const raw = String(size || "").trim();
 if (!raw) return { system: "", value: "" };
 const t = raw.toUpperCase();
 const num = (t.match(/\d+(?:\.\d+)?/) || [""])[0];
 if (/\b(EU|EUR|IT|ITALIAN)\b/.test(t)) return { system: "IT", value: num };
 if (/\bUK\b|\bBRITISH\b/.test(t)) return { system: "UK", value: num };
 if (/\bFR\b|\bFRENCH\b/.test(t)) return { system: "FR", value: num };
 if (/\bUS\b|\bUSA\b/.test(t)) return { system: "US", value: num };
 // "M", "XS", "One size" — a letter size is what they call International.
 if (/^(XXS|XS|S|M|L|XL|XXL|XXXL)$/.test(t.replace(/[^A-Z]/g, ""))) {
  return { system: "International", value: t.replace(/[^A-Z]/g, "") };
 }
 if (num) return { system: "US", value: num };
 return { system: "", value: "" };
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

// ── is this piece ready for Vestiaire? ─────────────────────────────────────

/** The minimum Vestiaire's own form enforces. Taken from their manual flow, step by step. */
export const VESTIAIRE_MIN_PHOTOS = 3;
export const VESTIAIRE_MIN_PHOTO_PX = 900;

export type VestiaireCheck = {
 ready: boolean;
 /** Vestiaire's form will not let the seller finish without these. */
 blocking: string[];
 /** Allowed through, but a listing missing them is the kind their reviewers reject. */
 advisory: string[];
};

export type VestiaireCandidate = {
 title?: string | null;
 brand?: string | null;
 category?: string | null;
 condition?: string | null;
 material?: string | null;
 colour?: string | null;
 size?: string | null;
 description?: string | null;
 priceCents?: number | null;
 images?: string[] | null;
};

/**
 * What Vestiaire will refuse, said BEFORE the seller opens their site.
 *
 * Their manual flow is five steps and each one gates the next: Details (category, condition,
 * material, colour), Photos (at least three, 900×900 minimum), Description with measurements, then
 * price. A seller who queues a piece with one photo doesn't discover it until she's four screens in
 * and has retyped everything — so the board says it up front instead.
 *
 * `blocking` is what their form itself enforces. `advisory` is what gets a listing rejected by a
 * human reviewer afterwards, which is worse: it's already live in the seller's head by then.
 */
export function vestiaireReadiness(item: VestiaireCandidate): VestiaireCheck {
 const blocking: string[] = [];
 const advisory: string[] = [];

 const eligible = vestiaireEligibility(item.brand);
 if (!eligible.ok) blocking.push(eligible.reason);

 const photos = (item.images || []).filter((u) => typeof u === "string" && /^https?:\/\//.test(u));
 if (photos.length === 0) {
  blocking.push("No photos. Vestiaire needs at least 3.");
 } else if (photos.length < VESTIAIRE_MIN_PHOTOS) {
  // Said as a count rather than "not enough photos" — the seller should know how far off she is.
  blocking.push(`Only ${photos.length} photo${photos.length === 1 ? "" : "s"}. Vestiaire needs at least ${VESTIAIRE_MIN_PHOTOS}.`);
 }

 if (!String(item.category || "").trim()) blocking.push("No category — Vestiaire asks for one before anything else.");
 if (!String(item.condition || "").trim()) blocking.push("No condition set.");
 // vestiaireMaterial infers from the title and description; blank means nothing named a fibre
 // anywhere, and Vestiaire won't take a listing without one.
 if (!vestiaireMaterial(item.material ?? null, item.title, item.description)) {
  blocking.push("No material. Vestiaire requires one and won't accept a guess.");
 }
 // Colour is required on their Details step exactly like material is, and it was the one field
 // that got all the way to the form before failing — the extension can only report "nothing in
 // VYA" there, which is a late and useless place to learn it.
 if (!vestiaireColour(item.title, item.description, item.colour ?? null)) {
  blocking.push("No colour. Vestiaire requires one and won't accept a guess.");
 }
 if (!item.priceCents || item.priceCents <= 0) blocking.push("No price.");

 // Not enforced by the form, but their reviewers are strict about them.
 if (!String(item.size || "").trim()) advisory.push("No size — buyers filter by it, and bags still need measurements.");
 if (!String(item.description || "").trim()) advisory.push("No description. Vestiaire asks for flaws and alterations in detail.");
 if (photos.length >= VESTIAIRE_MIN_PHOTOS && photos.length < 5) {
  advisory.push("Vestiaire wants the brand label and hardware shown close up — add those shots if you have them.");
 }

 return { ready: blocking.length === 0, blocking, advisory };
}
