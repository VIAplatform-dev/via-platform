// The seller's own order for the pages strip.
//
// This is housekeeping, not publishing: it changes which thumbnails sit where in her editor and
// nothing at all about her site. A shop with eighty pages is mostly pages she never opens, and the
// four she lives in — home, a couple of collections, the journal — are scattered through an
// alphabetical list. Letting her drag those to the front costs nothing and saves her the scroll
// every single time.
//
// Kept pure and separate because the merge is where this goes wrong: the saved order is a snapshot
// of pages that existed when she dragged them, and the real list moves underneath it. A page added
// since must appear (or a new collection is invisible to her), and one deleted since must not
// linger as a thumbnail that opens nothing.

/**
 * Her saved order, reconciled against the pages that actually exist now.
 *
 * - pages she ordered, in her order, minus any that have since gone
 * - then everything new, in the order the caller supplied
 *
 * With no saved order the caller's order is returned untouched, so the default (unlinked pages last)
 * still applies until she moves something.
 */
export function applyPageOrder(saved: string[] | null | undefined, actual: string[]): string[] {
 const present = new Set(actual);
 const seen = new Set<string>();
 const out: string[] = [];

 for (const p of saved || []) {
  // Dropped: a page she ordered and has since deleted. Silently, because "this page no longer
  // exists" is not news to the person who deleted it.
  if (!present.has(p) || seen.has(p)) continue;
  out.push(p);
  seen.add(p);
 }
 // Appended, never inserted: a page added since she last dragged anything has no place in her
 // arrangement, and guessing one would shuffle the row she deliberately set.
 for (const p of actual) if (!seen.has(p)) { out.push(p); seen.add(p); }
 return out;
}

/** Move one page to a new index, returning a new array. Out-of-range indices are a no-op. */
export function movePage(order: string[], from: number, to: number): string[] {
 if (from === to) return order;
 if (from < 0 || from >= order.length || to < 0 || to >= order.length) return order;
 const next = order.slice();
 const [moved] = next.splice(from, 1);
 next.splice(to, 0, moved);
 return next;
}

/**
 * What to persist.
 *
 * Only paths that exist, deduplicated, and capped — the order arrives from a browser, so it is not
 * trusted to be a permutation of anything. A cap because this is stored per store and an unbounded
 * array from a client is an unbounded row.
 */
export function sanitizePageOrder(order: unknown, actual: string[], max = 500): string[] {
 if (!Array.isArray(order)) return [];
 const present = new Set(actual);
 const seen = new Set<string>();
 const out: string[] = [];
 for (const raw of order) {
  if (typeof raw !== "string") continue;
  if (!present.has(raw) || seen.has(raw)) continue;
  out.push(raw);
  seen.add(raw);
  if (out.length >= max) break;
 }
 return out;
}
