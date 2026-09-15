// The order photographs go up in, and the arithmetic of dragging one somewhere else.
//
// ORDER IS NOT DECORATION. Photo one is the cover: it is the only image in the marketplace grid,
// in a saved search, in the push notification and in the storefront rail. A seller shoots the
// label and the lining before she shoots the piece hanging properly, so the shot she wants first
// is almost never the shot she took first, and until now the only way to fix that was to delete
// everything and re-shoot in the right order.
//
// TWO ARRAYS MOVE AS ONE. `photos` are local file URIs and `imageUrls` are what those became once
// uploaded (lib/seller/intake.ts). They are positional: imageUrls[2] IS photos[2]. Reordering one
// without the other publishes the piece with its photographs shuffled, which is worse than not
// being able to reorder at all, so nothing in the app moves a photo except through here.

/** `from` out of the list, back in at `to`. Out-of-range indices return the list untouched. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return list;
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (target === from) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

export function removeItem<T>(list: T[], index: number): T[] {
  if (index < 0 || index >= list.length) return list;
  return [...list.slice(0, index), ...list.slice(index + 1)];
}

export type Photos = { photos: string[]; imageUrls: string[] };

/**
 * The uploaded URLs follow the local files ONLY while the two are one-to-one.
 *
 * They aren't always. Capture and Details hold photos with `imageUrls` still empty (the upload
 * happens when she leaves Details), and a re-shoot can leave a stale list of a different length.
 * Moving a 3-long array to match an 8-long one would scramble the piece, so a mismatch is left
 * alone: it gets rebuilt from `photos` on the next upload anyway.
 */
export function movePhoto({ photos, imageUrls }: Photos, from: number, to: number): Photos {
  const paired = imageUrls.length === photos.length;
  return {
    photos: moveItem(photos, from, to),
    imageUrls: paired ? moveItem(imageUrls, from, to) : imageUrls,
  };
}

export function removePhoto({ photos, imageUrls }: Photos, index: number): Photos {
  const paired = imageUrls.length === photos.length;
  return {
    photos: removeItem(photos, index),
    imageUrls: paired ? removeItem(imageUrls, index) : imageUrls,
  };
}

/**
 * Where a dragged thumbnail would land, from how far it has travelled.
 *
 * The grid wraps, so this is two-dimensional: `pitch` is one cell plus its gap, `perRow` is how
 * many fit across at the current width. Rounding rather than flooring is what makes it feel right,
 * a thumbnail swaps when it passes the HALFWAY point of its neighbour, not when it fully clears it.
 *
 * The column is clamped inside the row before the index is worked out, so dragging off the right
 * edge parks it at the end of that row instead of wrapping onto the next one under her finger.
 *
 * Marked as a worklet: the drag runs on the UI thread, sixty times a second, and hopping to JS for
 * this on every frame is exactly the thing that makes a reorder feel like it is lagging behind the
 * finger. The directive is an inert string anywhere else, which is why the test can just call it.
 */
export function dropIndex(
  from: number,
  dx: number,
  dy: number,
  { perRow, pitch, count }: { perRow: number; pitch: number; count: number },
): number {
  "worklet";
  if (perRow < 1 || pitch <= 0 || count < 1) return from;
  const col = Math.max(0, Math.min(perRow - 1, Math.round(((from % perRow) * pitch + dx) / pitch)));
  const row = Math.max(0, Math.round((Math.floor(from / perRow) * pitch + dy) / pitch));
  return Math.max(0, Math.min(count - 1, row * perRow + col));
}

/**
 * How many cells fit across, for a container that has actually been measured.
 *
 * Returns at least 1: a zero would divide by nothing in dropIndex, and a container reports width 0
 * on its first layout pass, before it has been given one.
 */
export function perRowFor(width: number, cell: number, gap: number): number {
  if (width <= 0 || cell <= 0) return 1;
  return Math.max(1, Math.floor((width + gap) / (cell + gap)));
}
