// The categories a piece can be — the phone's mirror of the web's taxonomy. Pure.
//
// WHY THIS EXISTS. The phone had no category list at all. Every screen that wanted one asked for
// free text ("Category: Bags"), which is three separate problems wearing one coat:
//
//   1. MEASUREMENTS ARE CHOSEN BY CATEGORY (measurements.ts). A piece with no category, or with a
//      word the templates don't recognise, gets the generic length/width pair — so the buyer of a
//      dress never sees a waist. Market Mode's quick list is where this bites hardest: it creates
//      a piece from a price and a photo, and everything it made arrived in Drafts uncategorised.
//   2. The storefront navigates by these slugs (categoryMap on the web). "bag", "Bags" and
//      "handbag" are three different category pages, two of which are empty.
//   3. The AI intake writes slugs. A piece typed on the phone and a piece drafted by the model
//      were therefore filed differently, and only one of them could be found again.
//
// The slugs and their grouping are copied from app/lib/item-tags.ts (CATEGORY_GROUPS) and the
// labels from app/lib/categoryMap.ts. A copy can go stale — the phone cannot import across the two
// packages — so categories.test.ts asserts the one thing that actually breaks when it does: that
// every slug offered here still has a measurement template matching the web's.

export type CategoryGroup = { label: string; slugs: string[] };

/** Grouped the way the storefront's nav groups them, so a picker reads as a hierarchy. */
export const CATEGORY_GROUPS: CategoryGroup[] = [
  { label: "Clothing", slugs: ["tops", "sweaters", "coats-jackets", "dresses", "skirts", "pants", "jeans", "shorts", "jumpsuits", "lingerie", "swimwear", "other-clothing"] },
  { label: "Shoes", slugs: ["boots", "heels", "sneakers", "sandals", "flats", "shoes"] },
  { label: "Bags", slugs: ["handbags", "totes", "clutches", "crossbody-bags", "wallets", "bags"] },
  { label: "Accessories", slugs: ["jewelry", "belts", "scarves", "hats", "sunglasses", "accessories"] },
  { label: "Home", slugs: ["home"] },
];

/** Slug → what a person reads. Verbatim from the web's categoryMap. */
export const CATEGORY_LABELS: Record<string, string> = {
  tops: "Tops", sweaters: "Sweaters", "coats-jackets": "Coats & Jackets", pants: "Pants",
  jeans: "Jeans", dresses: "Dresses", skirts: "Skirts", shorts: "Shorts", jumpsuits: "Jumpsuits",
  lingerie: "Lingerie", swimwear: "Swimwear", "other-clothing": "Clothing",
  shoes: "Shoes", boots: "Boots", heels: "Heels", sneakers: "Sneakers", sandals: "Sandals", flats: "Flats",
  bags: "Bags", totes: "Totes", clutches: "Clutches", "crossbody-bags": "Crossbody", handbags: "Handbags", wallets: "Wallets",
  accessories: "Accessories", jewelry: "Jewelry", belts: "Belts", scarves: "Scarves", hats: "Hats", sunglasses: "Sunglasses",
  home: "Home",
};

export const CATEGORY_SLUGS: string[] = CATEGORY_GROUPS.flatMap((g) => g.slugs);

const SLUG_SET = new Set(CATEGORY_SLUGS);

export const isCanonicalCategory = (v: string | null | undefined): boolean => !!v && SLUG_SET.has(v);

/**
 * What to print for a stored category.
 *
 * A stored value is either one of the slugs above or whatever the seller typed before there was a
 * list — so an unrecognised value is shown as she wrote it rather than replaced or hidden.
 */
export function categoryLabel(value: string | null | undefined): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  return CATEGORY_LABELS[v] ?? v;
}
