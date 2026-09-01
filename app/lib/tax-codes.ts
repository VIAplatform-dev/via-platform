// ───────────────────────────────────────────────────────────────────────────
// Stripe product tax codes, per listing category (pure, no I/O, unit-tested).
//
// "Resale is clothing" is wrong often enough to be expensive. Several states
// treat apparel unlike ordinary goods — New York exempts clothing and footwear
// under $110, Pennsylvania and New Jersey exempt most of it outright — but that
// exemption does NOT extend to handbags, jewelry, watches or sunglasses, which
// stay fully taxable.
//
// So a Gucci bag filed as clothing under-collects in exactly those states, and
// the seller owes tax they never charged. A dress filed as general goods
// over-charges a buyer who owed nothing. Both are real, and they pull opposite
// ways, which is why this maps category by category rather than picking a side.
//
// Codes are Stripe's own (docs.stripe.com/tax/tax-codes) — never constructed.
// ───────────────────────────────────────────────────────────────────────────

/** Clothing AND footwear share one code in Stripe's taxonomy. */
export const TAX_CODE_CLOTHING = "txcd_30011000";
export const TAX_CODE_HANDBAGS = "txcd_30060001";
export const TAX_CODE_JEWELRY = "txcd_30060007";
export const TAX_CODE_WATCHES = "txcd_30060016";
export const TAX_CODE_SUNGLASSES = "txcd_30060017";
export const TAX_CODE_HATS = "txcd_30060006";
export const TAX_CODE_BELTS = "txcd_30011003";
export const TAX_CODE_SCARVES = "txcd_30011034";
export const TAX_CODE_WALLETS = "txcd_30060101";
export const TAX_CODE_LUGGAGE = "txcd_30060015";
/** The honest fallback: taxed as ordinary goods, which is what an unknown thing is. */
export const TAX_CODE_GENERAL = "txcd_99999999";

/** Shipping is taxable in some states and not others; Stripe decides from this. */
export const TAX_CODE_SHIPPING = "txcd_92010001";

// Keyed on the category slugs in item-tags.ts. Anything absent falls back to
// general goods rather than guessing at an exemption.
const BY_CATEGORY: Record<string, string> = {
 // Clothing
 tops: TAX_CODE_CLOTHING, sweaters: TAX_CODE_CLOTHING, "coats-jackets": TAX_CODE_CLOTHING,
 dresses: TAX_CODE_CLOTHING, skirts: TAX_CODE_CLOTHING, pants: TAX_CODE_CLOTHING,
 jeans: TAX_CODE_CLOTHING, shorts: TAX_CODE_CLOTHING, jumpsuits: TAX_CODE_CLOTHING,
 lingerie: TAX_CODE_CLOTHING, swimwear: TAX_CODE_CLOTHING, "other-clothing": TAX_CODE_CLOTHING,

 // Footwear — the same Stripe code as clothing, and exempt alongside it in NY.
 boots: TAX_CODE_CLOTHING, heels: TAX_CODE_CLOTHING, sneakers: TAX_CODE_CLOTHING,
 sandals: TAX_CODE_CLOTHING, flats: TAX_CODE_CLOTHING, shoes: TAX_CODE_CLOTHING,

 // Bags — NOT clothing. Taxable in states that exempt apparel.
 handbags: TAX_CODE_HANDBAGS, totes: TAX_CODE_HANDBAGS, clutches: TAX_CODE_HANDBAGS,
 "crossbody-bags": TAX_CODE_HANDBAGS, bags: TAX_CODE_HANDBAGS,

 // Accessories split several ways: belts and scarves are apparel, jewelry and
 // eyewear are not.
 jewelry: TAX_CODE_JEWELRY,
 belts: TAX_CODE_BELTS,
 scarves: TAX_CODE_SCARVES,
 hats: TAX_CODE_HATS,
 sunglasses: TAX_CODE_SUNGLASSES,
 accessories: TAX_CODE_GENERAL, // a catch-all bucket can hold anything

 home: TAX_CODE_GENERAL,
};

// Some things a reseller lists constantly aren't their own category — a watch is
// filed under jewelry, a wallet under bags — and they're taxed differently.
// Checked against the title only when the category leaves it ambiguous.
const TITLE_HINTS: { test: RegExp; code: string }[] = [
 { test: /\bwatch(es)?\b/i, code: TAX_CODE_WATCHES },
 { test: /\bwallet\b|\bcard\s?holder\b|\bcoin\s?purse\b/i, code: TAX_CODE_WALLETS },
 { test: /\bluggage\b|\bsuitcase\b|\bcarry[- ]?on\b|\bduffel\b/i, code: TAX_CODE_LUGGAGE },
 { test: /\bsunglasses\b|\bshades\b/i, code: TAX_CODE_SUNGLASSES },
];

/**
 * The Stripe tax code for one listing.
 *
 * The category leads; the title only refines within an ambiguous bucket
 * (jewelry → a watch, bags → a wallet). A title never overrides a confident
 * category, or a "Chanel jacket, bag not included" would be taxed as a bag.
 */
export function taxCodeForItem(category: string | null | undefined, title?: string | null): string {
 const slug = (category ?? "").toLowerCase().trim();
 const mapped = BY_CATEGORY[slug];

 // Refine only where the bucket genuinely holds different tax treatments.
 const ambiguous = !mapped || mapped === TAX_CODE_GENERAL || slug === "jewelry" || slug === "bags";
 if (ambiguous && title) {
  for (const h of TITLE_HINTS) if (h.test.test(title)) return h.code;
 }
 return mapped ?? TAX_CODE_GENERAL;
}
