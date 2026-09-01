// Reshape a VYA piece to fit eBay's rules, without asking the seller to reshape her listing.
//
// eBay's 2026 fashion update requires a STANDARD size on Apparel and Footwear — its own list, no
// free text. VYA does not have that constraint and should not inherit it: a vintage seller writes
// what is true of the piece ("Leather", "Waist 28", nothing at all), and it is our job to translate
// that for one marketplace rather than make her edit her shop to satisfy it.
//
// Everything here is a translation applied to the OUTGOING eBay payload. Her listing on VYA is
// never modified.
//
// WHAT IT WILL NOT DO. It will not invent a garment size. Guessing Medium on a dress that is a
// Small produces a return, a refund and a hit to her seller rating, and she never knew we chose it.
// Bags, scarves and jewellery are genuinely one-size and are treated as such; clothing that has no
// recoverable size is reported back so she can say, which is the one case worth interrupting her
// for.

export type AdaptInput = {
 size?: string | null;
 material?: string | null;
 title?: string | null;
 description?: string | null;
 measurements?: string | null;
 category?: string | null;
};

export type Adapted = {
 /** The value to send as eBay's Size aspect, or null if none could be found. */
 size: string | null;
 /** The value to send as Material — possibly rescued out of the Size field. */
 material: string | null;
 /** Where the size came from, for the message when there isn't one. */
 sizeSource: "given" | "recovered" | "one-size" | null;
 /** True when the Size field held a fabric and we used it as the material instead. */
 movedSizeToMaterial: boolean;
};

const MATERIAL_WORDS =
 /^(patent ?leather|faux ?leather|vegan ?leather|leather|suede|shearling|sheepskin|cotton|silk|satin|wool|merino|cashmere|linen|denim|velvet|corduroy|tweed|lace|nylon|polyester|rayon|viscose|acrylic|canvas|mesh|fur|mohair|angora|jersey|chiffon|organza|tulle|crepe|flannel|leatherette)\b/i;

/** Categories where "one size" is the truth, not a guess. */
const ONE_SIZE_CATEGORIES =
 /bag|handbag|tote|clutch|purse|wallet|backpack|luggage|scar(f|ves)|shawl|belt|jewel|necklace|bracelet|earring|ring|brooch|hat|cap|beret|sunglass|eyewear|watch|glove|accessor/i;

/** Words that mean the piece genuinely has no size, however it was written. */
const SAYS_ONE_SIZE = /\b(one[\s-]?size|os|osfa|free[\s-]?size|no size|n\/a|unisize)\b/i;

/**
 * A size hiding in text the seller already wrote.
 *
 * Deliberately requires a MARKER — "size", a region prefix, a waist letter, or the measurements
 * field's own label. A bare number in a title is far more likely to be a decade ("1970s wool coat")
 * than a size, and reading it as one would put a wrong size in front of a buyer.
 */
export function recoverSize(input: AdaptInput): string | null {
 const hay = [input.size, input.title, input.description].filter(Boolean).join(" ");

 const labelled = hay.match(/\bsizes?\s*[:\-]?\s*(x{0,3}[sl]|m|xl|\d{1,2}(?:\.\d)?)\b/i);
 if (labelled) return labelled[1].toUpperCase();

 const region = hay.match(/\b(?:us|uk|eu|it|fr)\s*[:\-]?\s*(\d{1,2}(?:\.\d)?)\b/i);
 if (region) return region[1];

 const waist = hay.match(/\bw(?:aist)?\s*[:\-]?\s*(\d{2})\b/i) || (input.measurements || "").match(/\bwaist\s*[:\-]?\s*(\d{2})\b/i);
 if (waist) return waist[1];

 // A letter size standing on its own in the size field only — not loose in a title, where "S" and
 // "M" appear inside ordinary words far more often than they appear as sizes.
 const alone = (input.size || "").trim().match(/^(x{0,3}s|s|m|l|x{0,3}l|\d{1,2}(?:\.\d)?)$/i);
 if (alone) return alone[1].toUpperCase();

 return null;
}

/**
 * Translate the piece for eBay.
 *
 * `standardize` is eBay's own mapping (value + the category's allowed list → an accepted value or
 * null), injected so this stays pure and the decision order can be tested without the network.
 */
export function adaptForEbay(
 input: AdaptInput,
 opts: { standardize: (raw: string) => string | null; allowedSizes?: string[]; sizeRequired?: boolean }
): Adapted {
 const { standardize } = opts;
 const rawSize = (input.size || "").trim();
 let material = (input.material || "").trim() || null;
 let movedSizeToMaterial = false;

 // 1. What she wrote, if eBay takes it. The common case, and it stays first.
 const given = rawSize ? standardize(rawSize) : null;
 if (given) return { size: given, material, sizeSource: "given", movedSizeToMaterial };

 // 2. A fabric in the Size box is still true — it is just filed in the wrong drawer. Use it as the
 //    material rather than discarding it, which is what happened before: rejected AND thrown away.
 if (rawSize && MATERIAL_WORDS.test(rawSize)) {
  if (!material) material = rawSize;
  movedSizeToMaterial = true;
 }

 // 3. A size she has already written somewhere else.
 const recovered = recoverSize(movedSizeToMaterial ? { ...input, size: null } : input);
 if (recovered) {
  const std = standardize(recovered);
  if (std) return { size: std, material, sizeSource: "recovered", movedSizeToMaterial };
 }

 // 4. One size — where that is a fact about the piece, not a guess about a body.
 const saysOneSize = SAYS_ONE_SIZE.test(rawSize) || SAYS_ONE_SIZE.test(input.title || "");
 const oneSizeCategory = ONE_SIZE_CATEGORIES.test(`${input.category || ""} ${input.title || ""}`);
 if (saysOneSize || oneSizeCategory) {
  const std = standardize("One Size");
  if (std) return { size: std, material, sizeSource: "one-size", movedSizeToMaterial };
 }

 // 5. A garment with no size anywhere. Only she knows it.
 return { size: null, material, sizeSource: null, movedSizeToMaterial };
}

/** What to tell her when nothing could be found — naming the field, and what we already tried. */
export function missingSizeMessage(input: AdaptInput, adapted: Adapted): string {
 if (adapted.movedSizeToMaterial) {
  return `“${(input.size || "").trim()}” is in this piece’s Size field — we’ve sent it to eBay as the material instead. eBay still needs a size for this category, and it isn’t anywhere on the listing: add S/M/L or a number.`;
 }
 return `eBay needs a standard size for this category and there isn’t one on this piece — add S/M/L or a number (we check the title, description and measurements too).`;
}
