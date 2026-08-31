// What a store is CALLED — the name a shopper sees, as distinct from the slug it is addressed by.
//
// A seller row is created the first time anything is written for a store, and until now it was
// named `stores.ts`'s name if the store was one of the curated ones and its SLUG if it wasn't. Every
// store that arrives through the importer is in the second group, so eight of them are sitting in
// the database called "love-again-vintage", "thenicheshop", "we-thieves" — and that string is what a
// buyer reads. It is on the checkout page ("love-again-vintage" above the bag), in the bag's own
// messages, and in the confirmation email.
//
// The importer already learns the real name: it reads `og:site_name`, falling back to the page
// title with any tagline trimmed off ("Love Again Vintage | Authentic Vintage Designer Bags" →
// "Love Again Vintage"). It just never wrote it to the seller. This is the rule for choosing among
// whatever names we have, and for recognising the placeholder we are replacing.

/** A slug read back as words: `love-again-vintage` → `Love Again Vintage`. The last resort, and
 *  still better than showing a shopper the slug — a hyphenated address is never a shop's name. */
export function titleFromSlug(slug: string): string {
 return (slug || "")
  .split(/[-_]+/)
  .filter(Boolean)
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  .join(" ");
}

/**
 * Is this name just the address, or nothing at all?
 *
 * EXACT, and deliberately so. Two near-misses proved why:
 *   • "The Niche Shop" flattens to the same letters as the slug `thenicheshop` — and it is the
 *     shop's real name, so a flattening rule would have thrown a good name away.
 *   • "Blummier" differs from the slug `blummier` only in case — and it, too, is the real name, so
 *     a case-insensitive rule would have "fixed" a store that was already right.
 * Only the slug itself, character for character, is a placeholder. Being wrong in this direction
 * costs nothing: the name is simply left alone.
 */
export function isPlaceholderName(name: string | null | undefined, slug: string): boolean {
 const n = (name || "").trim();
 return !n || n === (slug || "").trim();
}

/**
 * Names that aren't names — what a page title says when a shop never set one.
 *
 * `vintage-boutique-style`'s captured homepage is titled "Home", and `lamash`'s says "Lamash store".
 * Taking a homepage at its word gave one store the name "Home", which is worse than the slug we
 * were trying to replace. A generic title is refused and the caller falls through to the next
 * candidate.
 */
const GENERIC = new Set(["home", "home page", "homepage", "index", "shop", "shop all", "store", "welcome", "untitled", "main", "products", "all products", "collections"]);

export function isGenericName(name: string | null | undefined): boolean {
 return GENERIC.has((name || "").trim().toLowerCase().replace(/\s+/g, " "));
}

/**
 * The best name we have for a store.
 *
 * Candidates in the caller's order of confidence — the curated name, the store account's, the one
 * the importer read off the shop's own homepage. The first that is a real name wins; a candidate
 * that is only the slug again is skipped, because it is what we are trying to get away from. With
 * nothing usable, the slug is read back as words.
 */
export function storeDisplayName(slug: string, ...candidates: (string | null | undefined)[]): string {
 for (const c of candidates) {
  const name = (c || "").trim();
  if (name && !isPlaceholderName(name, slug) && !isGenericName(name)) return name;
 }
 return titleFromSlug(slug);
}
