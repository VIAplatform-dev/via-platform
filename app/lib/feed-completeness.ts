/**
 * When is a read of a seller's catalogue allowed to mark their pieces sold?
 *
 * The import's most destructive rule is "anything we hold that was not in the feed I just read has
 * been taken down — mark it sold". It is correct only if the read reached the END of the seller's
 * catalogue, and nothing checked that. Three ways it could be wrong, all live today:
 *
 *   • Our own ceiling. The reader stops at a fixed number of products. chill-boutique holds 1,589
 *     pieces and the ceiling was 1,500, so a repair run would have marked ~89 pieces sold that are
 *     on sale right now. shop-vintage-charm and hachi-archive sit on the same line.
 *   • A throttled page. A busy Shopify answers `200 {"products":[]}`, the loop reads it as the end
 *     of the catalogue, and everything past that point looks taken down. Any store, any time.
 *   • A timeout. The fetch wrapper hands back an EMPTY feed on timeout, which under the old rule
 *     meant every piece in the shop was marked sold in a single pass.
 *
 * The collection reader already works this way — it records `incomplete` and refuses to rewrite a
 * collection it could not read. This is the same guard for the product feed.
 *
 * The principle: an incomplete read means "I don't know", and "I don't know" is never "they're all
 * gone."
 */

/** What the feed loop observed about how it finished. */
export type ReadOutcome = {
 pagesRead: number;
 /** The final page came back full — so there was probably more to fetch. */
 lastPageFull: boolean;
 /** The loop stopped because it hit our own maximum, not the catalogue's end. */
 hitCap: boolean;
 /** A page errored, timed out, or came back unusable. */
 failed: boolean;
};

/**
 * Did the read actually reach the end of the seller's catalogue?
 *
 * A catalogue ends with a short page. Anything else — a full last page, our ceiling, an error — is
 * a read that stopped early, whatever the reason.
 */
export function readEndedCleanly(o: ReadOutcome): boolean {
 if (o.failed || o.hitCap) return false;
 return !o.lastPageFull;
}

export type SweepInput = {
 /** readEndedCleanly for the read that produced these products. */
 complete: boolean;
 /** How many products that read returned. */
 productsRead: number;
 /** How many pieces we already hold for this store. */
 held: number;
 /**
  * How many pieces this run is about to mark sold. Required: a caller that cannot say is refused,
  * because the size of the read says nothing about the size of the damage. A throttle two thirds of
  * the way through a catalogue produces a perfectly healthy-LOOKING read and a devastating sweep.
  */
 wouldRemove?: number;
 /**
  * A person has looked at this run and confirmed the retirement is real. Overrides the share cap
  * below — and NOTHING else: no confirmation turns an incomplete read into evidence.
  */
 approvedLargeSweep?: boolean;
};

/**
 * A second line of defence behind `complete`, because the flag is computed by a loop that has been
 * wrong before and the cost of being wrong is a seller's live stock going dark.
 *
 * A read returning a small fraction of what we hold is a broken feed, not a closing-down sale. This
 * catches the read being nearly empty; MAX_SWEEP_SHARE below catches the subtler case where the read
 * looks healthy but the damage would not be.
 */
const IMPLAUSIBLE_SHRINK = 0.1;

/**
 * The share of a catalogue above which one run stops and asks for a person.
 *
 * BE CLEAR ABOUT WHAT THIS IS: a guess. There is no evidence behind the number. Every `sold_at` in
 * the database was written by a single fleet run on 2026-08-29, so we have no history of how fast a
 * real vintage shop retires stock, and this cap cannot honestly claim that losing a quarter of a
 * catalogue is impossible. It plainly is possible — a seasonal clear-out, an unpublished collection,
 * a first repair after a long gap.
 *
 * What justifies it is not the number but the ASYMMETRY either side of it. Refusing wrongly costs a
 * log line and some retired pieces staying visible for another run. Proceeding wrongly hides live
 * stock from shoppers, and the seller finds out only from sales that never happen. So the run stops
 * at the unusual and asks, rather than deciding on its own — and `approvedLargeSweep` is how a
 * person answers. Revisit this constant once a few runs of real retirement counts exist to set it
 * from; it is a placeholder standing in for data we do not have yet.
 */
const MAX_SWEEP_SHARE = 0.25;

/**
 * Below this, proportion stops meaning anything: one piece out of four is 25% and an ordinary day.
 * The cap is here to catch a truncated read, and a truncated read never loses a handful.
 */
const MIN_SWEEP_TO_QUESTION = 10;

export function maySweepMissing(s: SweepInput): boolean {
 return sweepRefusal(s) === null;
}

/** Why the sweep is being refused, phrased for whoever reads the run log. Null means go ahead. */
export function sweepRefusal(s: SweepInput): string | null {
 if (!s.complete) return "the read did not reach the end of the catalogue";
 // Nothing held: there is nothing a sweep could wrongly hide.
 if (s.held === 0) return null;
 if (s.productsRead === 0) return "the read returned no products at all";
 if (s.productsRead < s.held * IMPLAUSIBLE_SHRINK) {
  return `the read returned too few products to believe (${s.productsRead} against ${s.held} held)`;
 }
 // Nothing to remove is always safe; not KNOWING what would be removed is not.
 if (s.wouldRemove === undefined) return "this run did not say how many pieces it would retire";
 if (s.wouldRemove === 0) return null;
 if (s.approvedLargeSweep) return null;
 if (s.wouldRemove >= MIN_SWEEP_TO_QUESTION && s.wouldRemove > s.held * MAX_SWEEP_SHARE) {
  const pct = Math.round((s.wouldRemove / s.held) * 100);
  return `it would retire ${s.wouldRemove} of ${s.held} pieces at once (${pct}%), which is unusual enough to check — re-run with --allow-large-sweep if this really is a clear-out`;
 }
 return null;
}
