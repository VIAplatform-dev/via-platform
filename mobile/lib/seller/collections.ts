// Collections, as the seller manages them.
//
// They existed on the phone only as a picker: a piece could be put INTO one from the editor, and
// that was the whole of it. There was no way to see what was in a collection, what it looked like
// on the storefront, or to fix a cover photo, so the one place the grouping actually shows up (the
// shopper's view of her shop) was invisible from the app that built it.
//
// The shaping lives here because two screens read the same rows: Inventory's Collections tab draws
// the tiles, and the collection screen draws its pieces.

export type Collection = {
  id: string;
  title: string;
  slug: string;
  itemCount: number;
  /** The cover a shopper sees. Null until she sets one. */
  imageUrl: string | null;
};

export type CollectionItem = {
  id: string;
  title: string | null;
  priceCents: number | null;
  currency?: string | null;
  image: string | null;
  status: string;
};

/**
 * The order the tiles are drawn in.
 *
 * Collections with pieces first, biggest first, and the empty ones last rather than hidden. An
 * empty collection is usually one she has just made and is about to fill, so hiding it would look
 * like the creation failed; burying it keeps the useful ones at the top on a shop with thirty.
 * Ties break on title so the grid does not reshuffle between visits.
 */
export function orderCollections(cols: Collection[]): Collection[] {
  return cols.slice().sort((a, b) => {
    const ae = a.itemCount === 0;
    const be = b.itemCount === 0;
    if (ae !== be) return ae ? 1 : -1;
    if (a.itemCount !== b.itemCount) return b.itemCount - a.itemCount;
    return a.title.localeCompare(b.title);
  });
}

/**
 * What a tile shows when no cover has been set.
 *
 * Falls back to the first piece in the collection that HAS a photo, which is very close to what
 * the storefront does, so the tile in the app looks like the tile a shopper sees rather than a
 * grey square. Returns null only when the collection is genuinely empty or none of its pieces have
 * a photograph, which is its own useful signal.
 */
export function coverFor(col: Pick<Collection, "imageUrl">, items: CollectionItem[] = []): string | null {
  if (col.imageUrl) return col.imageUrl;
  return items.find((i) => i.image)?.image ?? null;
}

/** "12 pieces" · "1 piece" · "Empty". The line under a tile's title. */
export function itemCountLabel(n: number): string {
  if (n <= 0) return "Empty";
  return `${n} ${n === 1 ? "piece" : "pieces"}`;
}

/** Only pieces with a photograph can become the cover; the rest are not offerable. */
export function coverCandidates(items: CollectionItem[]): CollectionItem[] {
  return items.filter((i) => !!i.image);
}
