/**
 * Does this seller keep sold pieces in this collection, or clear them out?
 *
 * We used to answer for her — every hosted store showed sold pieces, because "a vintage store's
 * archive is part of browsing". Six of eight sellers do exactly that. Two do not: ascensio-demo and
 * chill-boutique return NO unavailable products in any of their collections, so their collection
 * pages show only what a shopper can buy. On those two we were putting the archive back, which is
 * the whole of the "31 pieces here, 21 on hers" difference the parity check kept reporting — a
 * discrepancy we created and then flagged ourselves for.
 *
 * She has already made this decision, on her own shop, per collection. It is observable. So read it
 * rather than choosing for her.
 *
 * THE TRAP, and the reason this is a three-state answer: a collection where nothing has sold yet
 * looks exactly like one she clears out. Concluding "drops" from that would start hiding an archive
 * she never asked us to hide. "Unknown" keeps today's behaviour, which is the safe direction.
 */
export type SoldPolicy = "keeps" | "drops" | "unknown";

/** Below this, "no sold pieces in her feed" is a coincidence rather than a policy. */
const ENOUGH_TO_JUDGE = 5;

export function soldPolicy(o: { feedUnavailable: number; feedTotal: number; weHoldSold: number }): SoldPolicy {
 // Could not read her collection at all — a throttle, a 404, a network blip. Never conclude
 // anything from silence.
 if (o.feedTotal <= 0) return "unknown";
 // One sold piece in her own listing settles it: she has not cleared them out.
 if (o.feedUnavailable > 0) return "keeps";
 // Nothing sold in her listing. That only means something if there IS something to have removed —
 // pieces we hold as sold and file in this collection — and if her listing is big enough that their
 // absence is a choice rather than a small sample.
 if (o.weHoldSold > 0 && o.feedTotal >= ENOUGH_TO_JUDGE) return "drops";
 return "unknown";
}
