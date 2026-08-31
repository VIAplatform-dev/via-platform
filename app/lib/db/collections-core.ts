/**
 * What a collection page on a hosted store is allowed to show.
 *
 * A collection page draws on two sources: the pieces actually filed in that collection (synced from
 * the seller's own site at import), and pieces whose inferred category or brand happens to match the
 * collection's handle. Unioning the two turned Sourced by Scottie's 81-piece "Dresses" rail into a
 * 401-piece one — every imported dress in the shop landed there, not just the ones the seller had
 * put in that rail.
 *
 * The category match exists for one reason, stated where it was written: a listing the seller adds
 * in the VYA portal has no filing on their own site to follow, so it needs somewhere to go. That
 * reason only ever applied to the seller's OWN listings. An imported piece already carries the
 * seller's filing — theirs is the answer, and guessing on top of it can only be wrong.
 */

type MergeableItem = { id: string; origin?: string | null };

/** Items imported from the seller's site carry their filing already; only these are guessed for. */
const isSellerOwn = (i: MergeableItem) => i.origin !== "source";

export function mergeStorefrontCollectionItems<T extends MergeableItem>(assigned: T[], matched: T[]): T[] {
 // NOTE there is deliberately no "nothing filed, so take every match" shortcut here. There was one,
 // and it skipped the isSellerOwn rule below — so the guess applied to imported pieces precisely
 // when there was no filing to check it against. blummier served 28 Gucci-branded pieces under a
 // collection she had filed nothing into, and 25 other collections the same way. An unsynced
 // collection is answered by reading the captured page instead (see chooseCollectionItems), which
 // knows what was actually on it; a guess is not a substitute for the seller's own answer.
 const seen = new Set(assigned.map((i) => i.id));
 const out = [...assigned];
 for (const m of matched) {
  if (seen.has(m.id) || !isSellerOwn(m)) continue;
  seen.add(m.id);
  out.push(m);
 }
 return out;
}
