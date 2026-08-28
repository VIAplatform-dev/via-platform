// ───────────────────────────────────────────────────────────────────────────
// Placeholder photography for templates.
//
// A template with empty image slots reads as broken — a seller can't tell whether a photo belongs
// there or whether the section is meant to be text. So every image slot a template authors is filled,
// and the builder marks the filler as filler so nobody publishes a store full of someone else's
// pictures by accident.
//
// These are VYA's own photographs, which is the whole reason they can be here. Stock libraries
// (Getty, Shutterstock, Adobe) licence per image and per use; putting one into a template that ships
// to every seller is exactly the use they charge for, and hotlinking is both a licence violation and
// technically blocked. Owning the images removes that problem entirely.
//
// Served from /public rather than blob storage: no upload step, no token, no external host to rot,
// and they are part of the deploy, so a template renders identically offline and on a fresh install.
// ───────────────────────────────────────────────────────────────────────────

/** Marks a URL as ours, so the builder can tell a placeholder from a photo the seller uploaded. */
export const PLACEHOLDER_MARK = "/storefront-placeholders/";

/**
 * The set, in the order slots are filled.
 *
 * Portrait originals, resized to 1600px on the long edge — big enough for a full-bleed hero on a
 * retina phone, small enough that a template with a dozen slots isn't a multi-megabyte page. Every
 * layout crops with object-fit, so one portrait source serves a 21:9 banner and a square tile alike.
 */
export const PLACEHOLDER_IMAGES: readonly string[] = [
 `${PLACEHOLDER_MARK}vya-1.jpg`,
 `${PLACEHOLDER_MARK}vya-2.jpg`,
 `${PLACEHOLDER_MARK}vya-3.jpg`,
 `${PLACEHOLDER_MARK}vya-4.jpg`,
 `${PLACEHOLDER_MARK}vya-5.jpg`,
 `${PLACEHOLDER_MARK}vya-6.jpg`,
 `${PLACEHOLDER_MARK}vya-7.jpg`,
 `${PLACEHOLDER_MARK}vya-8.jpg`,
 `${PLACEHOLDER_MARK}vya-9.jpg`,
];

/** The first one, for callers that just need "a placeholder". */
export const PLACEHOLDER_IMAGE = PLACEHOLDER_IMAGES[0];

/**
 * Pick one by position, cycling.
 *
 * Deterministic on purpose: the same slot gets the same photo on every render, so a template doesn't
 * reshuffle between the specimen gallery, the preview and the store a seller actually receives. And
 * cycling rather than repeating means a page of six tiles looks like six products, not one product
 * printed six times.
 */
export function placeholderImage(index: number): string {
 const n = PLACEHOLDER_IMAGES.length;
 return PLACEHOLDER_IMAGES[((index % n) + n) % n];
}

/**
 * Is this image one of ours rather than the seller's?
 *
 * Checked by path, not by equality, so a URL that has been round-tripped through the sanitizer or
 * had a query string appended is still recognised — otherwise the builder would stop offering to
 * replace it and a seller could publish a storefront of our photos without ever being told.
 */
export function isPlaceholderImage(src?: string): boolean {
 return !!src && src.includes(PLACEHOLDER_MARK);
}
