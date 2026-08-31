/**
 * Parts of a page that are not the same twice, and so cannot be compared.
 *
 * The price check counted every money-shaped string on the page. On product pages most of the
 * "prices differ" findings turned out to be the prices in her "You may also like" strip — picked
 * fresh per visit, from a pool that is hers and not ours. Re-reading one of those pages minutes
 * later, the very prices the check had reported as missing were no longer on her page at all.
 *
 * That difference is already recorded, once, as a COSMETIC finding ("the 'you may also like' picks
 * differ from your site", on 13 stores). Counting it a second time as a blocking price mismatch is
 * double-counting noise — and it is what put eight stores on the blocking list.
 *
 * Deliberately narrow: only regions that are chosen per visit or per shopper. A product's own
 * price, the grid's prices, and anything in the buy box stay in the comparison, because a price we
 * show that she would not honour is exactly what this check exists to catch.
 */
export const VOLATILE_SELECTOR =
 '[class*="recommend" i],[id*="recommend" i],[class*="related" i],[class*="also-like" i],' +
 '[class*="complete-the-look" i],[class*="recently-viewed" i],[class*="recently_viewed" i],' +
 '[class*="pair-with" i],[class*="shop-the-look" i]';
