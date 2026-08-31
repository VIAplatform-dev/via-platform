/**
 * What a collection page on a hosted store is allowed to show — and, just as important, what it is
 * NOT allowed to show when it doesn't know.
 *
 * The cascade used to end like this:
 *
 *   if (!items.length) items = await listStorefrontItems(seller.id);   // "so the page still shows
 *                                                                     //  something rather than nothing"
 *
 * The intention was kind and the result was not. A collection with nothing filed against it served
 * the seller's ENTIRE catalogue: on blummier, clicking "Alaïa" returned all 164 pieces, and so did
 * "Blumarine", and "Fendi", and 44 others. ange-archive did it on 4. Fourteen of twenty-three stores
 * were doing it, and it graded clean because nothing compared the page to the seller's own.
 *
 * Those collections are empty on the sellers' own sites too — alaia, blumarine, fendi-1 and brands
 * all return zero products from blummier's own store. So the honest answer, and the 1:1 one, is an
 * empty collection. "Something rather than nothing" is only kind when the something is true.
 *
 * The one page where "everything" IS the answer is Shopify's catch-all, /collections/all.
 */

export type CollectionSources<T> = {
 /** Pieces filed in this collection (synced membership, plus the seller's own portal listings). */
 assigned: T[];
 /** Pieces named by the captured page's own grid, resolved against live inventory. */
 fromCapturedGrid: T[];
 /** The captured page named products, even if none of them resolved. For clarity at the call site. */
 capturedNamedProducts?: boolean;
 /**
  * We have READ this collection from the seller's own site and know what is in it.
  *
  * The difference between "never read" and "read, and it is empty" is the whole of this module.
  * shop-vintage-charm had fifteen collections showing six pieces each where her site shows none —
  * the six that happened to be in them on the day we photographed the page. Without this flag the
  * cascade answered both situations with the stale snapshot.
  */
 membershipKnown?: boolean;
 /** `/collections/all` — the whole catalogue by definition. */
 isShopAll?: boolean;
};

export type CollectionContents<T> = {
 items: T[];
 /**
  * Clear the captured grid and show an empty collection. Without this the page keeps the frozen
  * cards from capture day, which advertise pieces we may no longer be able to sell — the opposite
  * of rendering grids from live inventory.
  */
 renderEmpty: boolean;
};

export function chooseCollectionItems<T>(s: CollectionSources<T>): CollectionContents<T> {
 if (s.assigned.length) return { items: s.assigned, renderEmpty: false };
 // Read it, and it is empty. Say so. The captured grid is a photograph of what was in this
 // collection months ago, and refilling from it advertises pieces the seller has since taken out.
 if (s.membershipKnown && !s.isShopAll) return { items: [], renderEmpty: true };
 if (s.fromCapturedGrid.length) return { items: s.fromCapturedGrid, renderEmpty: false };
 // Nothing resolved. On a real collection that means it is empty, and we say so. On the catch-all
 // it means we have no live inventory at all — a data problem, not a statement to make to a
 // shopper — so leave the captured page as it is rather than declaring the shop empty.
 return { items: [], renderEmpty: !s.isShopAll };
}
