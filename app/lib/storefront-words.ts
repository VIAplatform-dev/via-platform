// The storefront's own words — the handful of labels the shop UI says for itself, rather than
// anything a seller typed into a section.
//
// "Sold", "Shop all", "View all", "Coming soon" were literals scattered through the renderer, which
// meant every VYA storefront said them identically and a store with a voice of its own — a French
// shop, a lowercase brand, one that says "Gone" rather than "Sold" — had no way to change a single
// one. They are small, and they appear on every page, which is exactly why they are worth owning.

export type StorefrontWords = {
 /** Badge over a piece that has already gone. */
 sold: string;
 /** The link back to the whole catalogue from a category menu. */
 shopAll: string;
 /** The button under a shortened product grid. */
 viewAll: string;
 /** What an empty grid says. */
 empty: string;
};

export const DEFAULT_WORDS: StorefrontWords = {
 sold: "Sold",
 shopAll: "Shop all",
 viewAll: "View all",
 empty: "Coming soon",
};

export const WORD_LABELS: { key: keyof StorefrontWords; label: string; hint: string }[] = [
 { key: "sold", label: "Sold badge", hint: "Shown over a piece that's gone." },
 { key: "shopAll", label: "Shop all link", hint: "Back to everything, from a category menu." },
 { key: "viewAll", label: "View all button", hint: "Under a shortened row of products." },
 { key: "empty", label: "Empty grid", hint: "When there's nothing to show yet." },
];

/**
 * The words this store uses. A blank or missing entry falls back, so a store only overrides what it
 * actually wants to say differently — and a word added here later needs no migration.
 */
export function resolveWords(input: Partial<StorefrontWords> | null | undefined): StorefrontWords {
 const out = { ...DEFAULT_WORDS };
 for (const k of Object.keys(DEFAULT_WORDS) as (keyof StorefrontWords)[]) {
  const v = input?.[k];
  if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 40);
 }
 return out;
}
