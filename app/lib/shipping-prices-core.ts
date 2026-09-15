// Her own price for a parcel tier, in her currency. Pure, no I/O.
//
// VYA sets a flat buyer price per tier (shipping-tiers.ts). A store can put its own number on any
// tier in any zone it serves (shipping-zones.ts `rates`), and this is the ONE place that decides
// which number the buyer is quoted: hers when she set one, VYA's when she didn't. Zero is hers too
// free shipping on that tier, which is why "unset" is a missing key, never a zero.
//
// Prices are minor units of the store's currency. A £ store's 450 is £4.50; nothing here or in the
// tier table knows or cares what the currency is, which is exactly why the UI must print it from
// the store's currency and never a hardcoded "$".

import { SHIPPING_TIERS, type TierId } from "./shipping-tiers.ts";
import { regionOf, type ZoneConfig, type ZoneId } from "./shipping-zones.ts";

export type TierDefaults = Record<TierId, number>;

/** VYA's flat prices at HOME, keyed by tier. The base every other region is reckoned from. */
export function vyaTierDefaults(): TierDefaults {
 return Object.fromEntries(SHIPPING_TIERS.map((t) => [t.id, t.priceCents])) as TierDefaults;
}

/**
 * What it costs to reach a region, as a multiple of the store's own domestic price.
 *
 * THE BUG THIS ENDS. Every zone fell back to the SAME three numbers: a small parcel was $8 whether
 * it went to the next town or to Australia, and a large one $24 to either. A flat-priced store
 * offering worldwide postage was quoting a domestic rate on every export and paying the difference
 * out of the sale. shipping-zones.ts exists precisely so that cannot happen, and then the defaults
 * under it didn't vary.
 *
 * MULTIPLES, NOT A PRICE LIST. The tier table is in minor units of the STORE's currency, and
 * nothing in it knows which currency that is: a London shop's small parcel is 800 too, and it means
 * £8. A hardcoded table of dollar export rates would be wrong for every store outside the US, while
 * a multiple of what she already charges at home scales with her own cost base and her currency.
 *
 * NEAR AND FAR, because the zone alone does not say how far anything travelled. "europe" is
 * Paris-from-London and Paris-from-Chicago, which are not the same parcel or remotely the same
 * price, and the old single table charged them identically. `near` applies when the store's own
 * country sits in that region (regionOf in shipping-zones.ts).
 *
 * The multiple RISES with parcel size because international postage does not scale linearly with
 * weight the way domestic does: the gap between a domestic and an export rate is much wider for a
 * coat than for a scarf.
 *
 * These are deliberately generous. A store on flat pricing carries the loss when a real label costs
 * more than it charged, so erring low costs the seller money on every parcel while erring high
 * costs her a sale she can see and price down herself. Any of them can be overridden per zone and
 * per size in Settings, and a store on live pricing (the default) never meets them at all.
 */
const ZONE_REACH: Record<Exclude<ZoneId, "domestic">, { near: Record<TierId, number>; far: Record<TierId, number> }> = {
 north_america: {
  near: { small: 2.2, medium: 2.6, large: 2.8 },
  far: { small: 3.0, medium: 3.4, large: 3.6 },
 },
 europe: {
  near: { small: 1.8, medium: 2.2, large: 2.4 },
  far: { small: 3.0, medium: 3.4, large: 3.6 },
 },
 rest_of_world: {
  near: { small: 2.4, medium: 2.8, large: 3.0 },
  far: { small: 3.6, medium: 4.0, large: 4.2 },
 },
};

/**
 * VYA's prices for one zone, for a store shipping from `homeCountry`.
 *
 * Rounded UP to the whole unit, like every other postage figure VYA quotes: a price ending in 43p
 * reads as a carrier passthrough and invites the question of why it is not exactly the carrier's.
 */
export function zoneTierDefaults(zone: ZoneId, homeCountry?: unknown): TierDefaults {
 const home = vyaTierDefaults();
 if (zone === "domestic") return home;
 const reach = ZONE_REACH[zone];
 // An unknown or unset ship-from is treated as FAR. A store that has not said where it stands
 // cannot be assumed to be next door to the buyer, and the cautious answer is the one that does
 // not sell postage below what it costs.
 const scale = regionOf(homeCountry) === zone ? reach.near : reach.far;
 return Object.fromEntries(
  SHIPPING_TIERS.map((t) => [t.id, Math.ceil((home[t.id] * scale[t.id]) / 100) * 100]),
 ) as TierDefaults;
}

const validCents = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/**
 * The buyer's price for `tier` to `zone`. VYA's, always.
 *
 * A STORE DOES NOT PRICE ITS OWN POSTAGE, and this is where that is true rather than in a form.
 * It used to take the store's saved per-zone rate ahead of VYA's, which was the wrong way round:
 * VYA buys every label and the buyer's postage goes to VYA in the application fee (cart-intent),
 * so a seller typing her own numbers was setting VYA's revenue, and VYA's loss, on a cost she
 * never pays. The settings form that collected them is gone; this is what makes the ones already
 * saved inert rather than a trap nobody can reach. One store had a dollar in that field.
 *
 * `homeCountry` is where the store ships FROM, and it changes the answer: reaching Europe is a
 * neighbour from London and an export from Chicago. Omitting it is safe but pessimistic, every
 * region is then priced as far (zoneTierDefaults).
 *
 * `defaults` is still honoured, and is not the seller's: it is how a caller that has already
 * computed the table passes it back in rather than recomputing per tier.
 */
export function resolveTierPrice(args: { tier: TierId; zone: ZoneId; overrides?: ZoneConfig | null; defaults?: Partial<TierDefaults>; homeCountry?: unknown }): number {
 // `overrides` IS NO LONGER READ FOR PRICE. It stays in the signature because a zone still carries
 // `enabled`, and callers pass the whole config; only `rates` is ignored.
 const d = args.defaults?.[args.tier];
 return validCents(d) ? Math.round(d) : zoneTierDefaults(args.zone, args.homeCountry)[args.tier];
}

// validateZoneRates and tierPriceTable lived here for the settings form that let a store type its
// own postage prices. That form is gone (resolveTierPrice above says why), so a rate has nobody to
// come from, nothing to validate, and no table to be rendered in.
