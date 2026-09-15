// Whether a store's OWN pieces appear on the VYA marketplace. Pure.
//
// TWO PRODUCTS, NOT ONE. getvya.ai is the shop a seller runs. Her storefront, her checkout, her
// orders. vyaplatform.com is VYA's marketplace, where shoppers browse across stores. They are
// deliberately separate, and a store running on getvya.ai is not automatically for sale on the
// marketplace: that is the seller's call, and until she makes it the answer is no.
//
// WHY THE DEFAULT IS OFF. There are 7,400-odd live pieces sitting in stores that list directly on
// VYA. Switching them all on at once would put every demo shop, every half-finished catalogue and
// every store that never agreed to it in front of shoppers. Opting IN is a decision someone made;
// opting out by default is the only version of this that cannot surprise a seller.
//
// NOT A CROSS-LISTING CHANNEL. Depop and eBay are other people's sites, posted to with the seller's
// own account. This is VYA's own marketplace reading the pieces she already has here. Nothing is
// copied, posted or re-listed anywhere.

export type MarketplaceOptIn = {
  /** Off until the store says otherwise. */
  listed: boolean;
  /** When she chose, so support can answer "since when" without reading a log. */
  decidedAt: string | null;
};

export const DEFAULT_OPT_IN: MarketplaceOptIn = { listed: false, decidedAt: null };

/**
 * What the seller is told her setting is doing right now.
 *
 * `livePieces` is her own count of active pieces. On with nothing live is not an error. She has
 * decided, there is simply nothing to show yet, and saying so beats a switch that looks broken.
 */
export function describeOptIn(optIn: MarketplaceOptIn, livePieces: number): string {
  if (!optIn.listed) return "Your pieces stay on your own shop. Nothing of yours appears on the VYA marketplace.";
  if (livePieces <= 0) return "On. Nothing to show yet. Your live pieces will appear on the VYA marketplace as you list them.";
  return `On: your ${livePieces} live ${livePieces === 1 ? "piece is" : "pieces are"} on the VYA marketplace, bought through your VYA checkout.`;
}

/** Whether this store's pieces should be included in a marketplace query. */
export function includesInMarketplace(optIn: MarketplaceOptIn | null | undefined): boolean {
  return optIn?.listed === true;
}
