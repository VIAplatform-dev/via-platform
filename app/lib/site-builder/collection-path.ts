// Which collection a captured page IS, from its path.
//
// Shopify keeps a collection at `/collections/{handle}`. Squarespace keeps its shop at `/shop` and a
// category at `/shop/{category}`, with products under `/shop/p/{slug}`. The serve route only knew the
// Shopify shape, so a Squarespace store's shop pages were served exactly as crawled — pieces that had
// sold since still for sale, new pieces missing. See the builder spec, finding F5.
//
// The Squarespace shape is only trusted on a Squarespace page: `/shop` on any other platform is
// whatever that store put there.

const SQUARESPACE_MARKERS = /static1\.squarespace\.com|SQUARESPACE_CONTEXT|squarespace-cdn\.com/;

/** Does this captured page come from a Squarespace site? */
export function looksSquarespace(html: string | null | undefined): boolean {
 return !!html && SQUARESPACE_MARKERS.test(html);
}

/** The collection handle this path shows ("all" for everything), or null when it isn't a collection. */
export function collectionHandleForPath(pathname: string, opts: { squarespace?: boolean } = {}): string | null {
 const shopify = pathname.match(/^\/collections\/([^/]+)\/?$/);
 if (shopify) return shopify[1];
 if (!opts.squarespace) return null;
 if (/^\/shop\/?$/.test(pathname)) return "all";
 const cat = pathname.match(/^\/shop\/([^/]+)\/?$/);
 // `/shop/p` on its own is the product folder, not a category.
 if (cat && cat[1] !== "p") return cat[1];
 return null;
}
