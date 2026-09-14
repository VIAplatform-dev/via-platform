/**
 * Which links on a storefront are pieces, and what to call them. Pure.
 *
 * WHY A REFERENCE AND NOT AN ID. A piece is reachable at two different addresses depending on where
 * it came from: an imported store's links carry the handle it had on Shopify
 * (/products/black-velvet-jacket), while a piece added on VYA carries its own id
 * (/products/2f6d6d68-9b11-…). The storefront cannot know which it is holding, and should not have
 * to — it sends whichever the link had, and the server resolves it against that store.
 *
 * WHY DELEGATION AND NOT MARKUP. The heart is not built into the product card, because on an
 * imported store the card is the seller's own markup, cloned from her theme, filled with live data
 * by a function whose correctness a dozen shops depend on. Reaching into it to add a button would
 * put a wishlist in the blast radius of her grid. Instead the browser finds product links the way a
 * shopper does — by their address — and lays a heart over each one. Her card is not touched.
 */

/** A product URL on a storefront, however that storefront addresses its pieces. */
const PRODUCT_HREF = /\/products\/([^/?#]+)/i;

/** Addresses that look like products but are not one piece. */
const NOT_A_PIECE = /^(all|new|sale|search|gift-card|gift-cards)$/i;

/**
 * The piece a link points at, or null when the link is not a piece.
 *
 * Relative and absolute both work: the storefront is served from the seller's own domain in one
 * place and a VYA path in another, and the same page is used on both.
 */
export function productRef(href: string | null | undefined): string | null {
 if (!href) return null;
 const m = PRODUCT_HREF.exec(String(href));
 if (!m) return null;
 // A handle can be percent-encoded in the markup; the server stores it decoded.
 let ref: string;
 try { ref = decodeURIComponent(m[1]); } catch { ref = m[1]; }
 ref = ref.trim();
 if (!ref || NOT_A_PIECE.test(ref)) return null;
 // Shopify hangs ?variant= and the like off product links; the piece is the path.
 return ref.slice(0, 200);
}

/** Everything on the page that is a link to a piece, deduplicated by the piece. */
export function refsInHrefs(hrefs: Array<string | null | undefined>): string[] {
 const seen = new Set<string>();
 for (const h of hrefs) {
  const r = productRef(h);
  if (r) seen.add(r);
 }
 return [...seen];
}
