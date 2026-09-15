// Whether a product page may print shipping and returns under a piece, and whether it may put a
// number on the shipping.
//
// WHAT WENT WRONG. Every hosted storefront ended its product pages with a block reading
// "Ships to · US only · Shipping from $8 · All sales final." Nobody chose that. It appeared the
// moment a store saved a shipping address for its own use. The row in store_shipping exists so
// labels can be bought, not so the shop can make a public promise about postage, and from then on
// the shop's website quoted a price to strangers in the shop's name.
//
// A QUOTE IS A PROMISE, AND IT IS THE SELLER'S TO MAKE. The number itself is real: it is the same
// domestic quote checkout would charge. But "from $8" is the floor, the buyer three states away
// pays more, and the seller never agreed to say any of it on her own site. So it is a switch now,
// and it starts off. A shop that wants it turns it on and knows what it has promised.
//
// AND NOT A NUMBER FOR A PARCEL NOBODY HAS WEIGHED. Tier assignment falls back to Medium for a
// piece with no weight and no dimensions (shipping-tiers.ts). Sensible for charging, because a
// guess has to be made somewhere and the middle is the safe one. Printing that guess on a public
// page is a different act: it reads as measured, and it is not. Unmeasured pieces get the zone line
// and no price.
//
// Pure, no database, no React. The product page composes; this decides.

/** The parcel facts an item carries, any of which may be missing. */
export type Measured = {
 weightOz?: number | null;
 lengthIn?: number | null;
 widthIn?: number | null;
 heightIn?: number | null;
};

/**
 * May this store's product pages carry the shipping and returns block at all?
 *
 * Both halves are required. `enabled` is the seller's explicit yes. `saved` is whether she has
 * shipping settings at all, without them the zones are VYA's defaults rather than her answer, and
 * a switch turned on before the settings exist must not publish our guesses under her name.
 */
export function showsProductNotes(enabled: unknown, saved: unknown): boolean {
 return enabled === true && saved === true;
}

/**
 * Has this piece actually been measured? A single real figure is enough. The tier takes the larger
 * of weight and girth, so one of the two present still assigns honestly.
 */
export function isMeasured(p?: Measured | null): boolean {
 if (!p) return false;
 const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
 return n(p.weightOz) > 0 || n(p.lengthIn) + n(p.widthIn) + n(p.heightIn) > 0;
}
