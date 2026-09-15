// One place that answers "what does this store price in". Everything else asks it.
//
// It existed in three places and disagreed with itself: /api/store/shipping read the hardcoded
// partner array, /api/store/me returned the literal string "USD" on two of its three branches, and
// intake/publish read the array again. A store absent from that array, which is every store that
// has signed up since it was written, got dollars from all three.

import { getStoreProfile } from "./store-profile-db";
import { getShippingSettings } from "./store-shipping-db";
import { stores } from "./stores";
import { resolveStoreCurrency } from "./store-currency";

/**
 * What this store's prices are in: her choice, else her ship-from country, else the legacy partner
 * list, else USD.
 *
 * Degrades to the legacy answer on any failure rather than throwing. A currency lookup must never
 * be the reason a seller cannot load her own dashboard.
 */
export async function storeCurrency(storeSlug: string): Promise<string> {
 const legacy = stores.find((s) => s.slug === storeSlug)?.currency;
 const [profile, shipping] = await Promise.all([
  getStoreProfile(storeSlug).catch(() => null),
  getShippingSettings(storeSlug).catch(() => null),
 ]);
 return resolveStoreCurrency({
  chosen: profile?.currency,
  shipFromCountry: shipping?.shipFrom?.country,
  legacy,
 });
}
