// What a piece probably weighs, when nobody has weighed it.
//
// WHY THIS EXISTS. 10,971 of 10,978 live pieces have no weight and no dimensions: almost every one
// arrived in a catalogue import, which carries a title, a price and photographs and never a parcel.
// assignTier answers "unknown" with Medium, which is the right instinct and the wrong outcome at
// this ratio. Medium is a 14x11x4 box up to 48oz. A pair of earrings ships in it, and so does a
// shearling coat, and the buyer is charged the same 1400 for both. On the earrings she is
// overcharged and drifts to a seller who isn't doing that; on the coat the real label runs past
// what she paid and VYA covers the gap. 3,679 of those pieces are coats, jackets, boots, bags or
// leather.
//
// A CATEGORY IS NOT A MEASUREMENT, and this never pretends otherwise. Nothing here is written to
// the database, so `isMeasured` stays honest, the seller is still asked for a tape, and the moment
// she gives one it wins. This is only a better answer than "Medium" for the question the checkout
// has to answer right now.
//
// ROUNDED UP, ALWAYS. The asymmetry is the whole design: over-estimating a parcel over-quotes the
// buyer slightly, under-estimating buys too small a label and the carrier re-weighs it and bills
// the difference. So every figure here is the TOP of its range, and the ranges are the ones the
// intake model is already given for its own estimates, so a drafted piece and an imported one are
// judged the same way.

export type EstimatedParcel = { weightOz: number; lengthIn: number; widthIn: number; heightIn: number };

/** Packed weight and box, by category. Top-of-range. Keyed on the storefront's own taxonomy. */
const BY_CATEGORY: Record<string, EstimatedParcel> = {
 // Flat and folded: a mailer, not a box.
 tops: { weightOz: 10, lengthIn: 12, widthIn: 10, heightIn: 2 },
 lingerie: { weightOz: 8, lengthIn: 12, widthIn: 10, heightIn: 2 },
 swimwear: { weightOz: 8, lengthIn: 12, widthIn: 10, heightIn: 2 },
 skirts: { weightOz: 16, lengthIn: 12, widthIn: 10, heightIn: 2 },
 shorts: { weightOz: 14, lengthIn: 12, widthIn: 10, heightIn: 2 },
 dresses: { weightOz: 18, lengthIn: 14, widthIn: 11, heightIn: 3 },
 jumpsuits: { weightOz: 24, lengthIn: 14, widthIn: 11, heightIn: 3 },
 pants: { weightOz: 24, lengthIn: 14, widthIn: 11, heightIn: 3 },
 jeans: { weightOz: 28, lengthIn: 14, widthIn: 11, heightIn: 3 },
 sweaters: { weightOz: 28, lengthIn: 14, widthIn: 11, heightIn: 4 },
 "coats-jackets": { weightOz: 64, lengthIn: 16, widthIn: 12, heightIn: 6 },
 "other-clothing": { weightOz: 20, lengthIn: 14, widthIn: 11, heightIn: 3 },

 // Shoes travel in their own box, and the box is most of the girth.
 shoes: { weightOz: 32, lengthIn: 13, widthIn: 8, heightIn: 5 },
 sandals: { weightOz: 18, lengthIn: 12, widthIn: 8, heightIn: 4 },
 flats: { weightOz: 18, lengthIn: 12, widthIn: 8, heightIn: 4 },
 heels: { weightOz: 26, lengthIn: 13, widthIn: 8, heightIn: 5 },
 sneakers: { weightOz: 40, lengthIn: 13, widthIn: 8, heightIn: 5 },
 boots: { weightOz: 72, lengthIn: 16, widthIn: 12, heightIn: 6 },

 // Bags: a clutch and a weekender are both "bags", so the title does most of the work below.
 bags: { weightOz: 40, lengthIn: 14, widthIn: 11, heightIn: 6 },
 handbags: { weightOz: 40, lengthIn: 14, widthIn: 11, heightIn: 6 },
 totes: { weightOz: 40, lengthIn: 16, widthIn: 12, heightIn: 6 },
 "crossbody-bags": { weightOz: 24, lengthIn: 12, widthIn: 10, heightIn: 5 },
 clutches: { weightOz: 16, lengthIn: 12, widthIn: 9, heightIn: 3 },
 wallets: { weightOz: 10, lengthIn: 9, widthIn: 7, heightIn: 3 },

 // Small and light.
 jewelry: { weightOz: 6, lengthIn: 9, widthIn: 6, heightIn: 2 },
 sunglasses: { weightOz: 10, lengthIn: 9, widthIn: 7, heightIn: 4 },
 belts: { weightOz: 14, lengthIn: 12, widthIn: 9, heightIn: 3 },
 scarves: { weightOz: 10, lengthIn: 12, widthIn: 9, heightIn: 3 },
 hats: { weightOz: 16, lengthIn: 14, widthIn: 11, heightIn: 6 },
 accessories: { weightOz: 14, lengthIn: 12, widthIn: 9, heightIn: 3 },
 home: { weightOz: 48, lengthIn: 16, widthIn: 12, heightIn: 6 },
};

/**
 * Words in a title that outrank the category.
 *
 * A category is a shelf, and some things on a shelf are nothing like the others: "bags" holds both
 * a coin purse and a leather weekender. These are checked first, longest-intent first, and only
 * where the word genuinely changes the parcel. A "leather jacket" is already in coats-jackets, so
 * it earns nothing here; "shearling" does, because it is twice the weight of the shelf it sits on.
 */
const BY_WORD: Array<[RegExp, EstimatedParcel]> = [
 // Heavy outerwear, heavier than the category's own top-of-range.
 [/\b(shearling|sheepskin|fur coat|puffer|parka|greatcoat|overcoat|trench)\b/i, { weightOz: 88, lengthIn: 18, widthIn: 14, heightIn: 8 }],
 [/\b(knee[- ]high|thigh[- ]high|riding boot|cowboy boot|combat boot)\b/i, { weightOz: 80, lengthIn: 16, widthIn: 12, heightIn: 8 }],
 [/\b(weekender|duffle|duffel|luggage|suitcase|garment bag)\b/i, { weightOz: 96, lengthIn: 20, widthIn: 14, heightIn: 10 }],
 [/\b(leather jacket|biker jacket|moto jacket|blazer)\b/i, { weightOz: 56, lengthIn: 16, widthIn: 12, heightIn: 5 }],
 // Light things that would otherwise inherit a heavy shelf.
 [/\b(coin purse|card holder|cardholder|keyring|key ring|brooch|earring|pendant|necklace|bracelet|ring)\b/i, { weightOz: 6, lengthIn: 9, widthIn: 6, heightIn: 2 }],
 [/\b(clutch|pouch|mini bag|micro bag)\b/i, { weightOz: 16, lengthIn: 12, widthIn: 9, heightIn: 3 }],
 [/\b(silk scarf|pocket square|slip dress|camisole|tank top)\b/i, { weightOz: 8, lengthIn: 12, widthIn: 10, heightIn: 2 }],
];

/** Normalise whatever the import wrote into one of our own category keys. */
function keyFor(category: string | null | undefined): string | null {
 const c = String(category ?? "").toLowerCase().trim().replace(/[\s_]+/g, "-");
 if (!c) return null;
 if (BY_CATEGORY[c]) return c;
 // The shapes an import actually writes: "Coats & Jackets", "jackets", "Shoes / Boots".
 const loose: Array<[RegExp, string]> = [
  [/coat|jacket|outerwear|blazer/, "coats-jackets"],
  [/boot/, "boots"], [/sneaker|trainer/, "sneakers"], [/heel|pump/, "heels"],
  [/sandal/, "sandals"], [/flat|loafer|ballet/, "flats"], [/shoe|footwear/, "shoes"],
  [/tote/, "totes"], [/clutch/, "clutches"], [/crossbody/, "crossbody-bags"],
  [/wallet/, "wallets"], [/bag|purse|handbag/, "bags"],
  [/sweater|knit|cardigan|jumper/, "sweaters"], [/jean|denim/, "jeans"],
  [/trouser|pant/, "pants"], [/dress|gown/, "dresses"], [/skirt/, "skirts"],
  [/short/, "shorts"], [/jumpsuit|romper/, "jumpsuits"],
  [/top|shirt|blouse|tee/, "tops"], [/lingerie|intimate/, "lingerie"],
  [/swim|bikini/, "swimwear"], [/jewel|jewell/, "jewelry"],
  [/scarf|scarve/, "scarves"], [/belt/, "belts"], [/hat|cap|beret/, "hats"],
  [/sunglass|eyewear/, "sunglasses"], [/accessor/, "accessories"],
 ];
 for (const [re, slug] of loose) if (re.test(c)) return slug;
 return null;
}

/**
 * A parcel for a piece nobody has measured, or null when there is nothing to go on.
 *
 * Null matters: it is what keeps this honest. With no category and no telling word in the title
 * there is no estimate to make, and the caller falls back to the safe middle exactly as before.
 */
export function estimateParcel(category?: string | null, title?: string | null): EstimatedParcel | null {
 const t = String(title ?? "");
 for (const [re, parcel] of BY_WORD) if (re.test(t)) return parcel;
 const key = keyFor(category);
 if (key) return BY_CATEGORY[key];
 // No category at all: the title is the last chance, read as though it were one.
 const fromTitle = keyFor(t);
 return fromTitle ? BY_CATEGORY[fromTitle] : null;
}

/**
 * Concrete dimensions for one piece: what was measured, else what it probably is, else a plain
 * default.
 *
 * THE DEFAULTS THIS REPLACES WERE THE EXPENSIVE BUG. Checkout summed each item as
 * `weightOz || 16, lengthIn || 12, widthIn || 9, heightIn || 3`. Those are real numbers, so they
 * never reached assignTier's unknown-parcel branch at all, and they land exactly on the Small
 * boundary: 16oz is its weight limit and 12+9+3 is its girth limit. Every unmeasured piece was
 * therefore sold with 800 of postage, a shearling coat included, whose label runs to 2200.
 *
 * A piece with nothing to go on still gets those numbers, because something has to be sent to the
 * carrier. Everything with a category or a telling title now gets the parcel it actually needs.
 */
export function parcelFor(item: {
 weightOz?: number | null; lengthIn?: number | null; widthIn?: number | null; heightIn?: number | null;
 category?: string | null; title?: string | null;
}): EstimatedParcel {
 const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
 const w = n(item.weightOz);
 const l = n(item.lengthIn), wd = n(item.widthIn), h = n(item.heightIn);
 // Measured wins, and a partly-measured piece keeps every figure it does have.
 if (w || l + wd + h) {
  const est = estimateParcel(item.category, item.title);
  return {
   weightOz: w || est?.weightOz || 16,
   lengthIn: l || est?.lengthIn || 12,
   widthIn: wd || est?.widthIn || 9,
   heightIn: h || est?.heightIn || 3,
  };
 }
 return estimateParcel(item.category, item.title) ?? { weightOz: 16, lengthIn: 12, widthIn: 9, heightIn: 3 };
}
