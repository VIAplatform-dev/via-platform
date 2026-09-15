// Where a store ships, and what it charges to get there.
//
// WHAT THIS REPLACES. VYA charged one flat rate by parcel size, wherever the parcel was going,
// $14 for a medium box to the next town and $14 for the same box to Sydney. That is fine while
// every store and buyer is in one country, and it is a loss on every export: a medium parcel from
// London to New York is nearer £25 than £14.
//
// TWO QUESTIONS, ONE ANSWER. A zone says both where a store is WILLING to ship and what it charges
// to ship there. A zone that is off is not a zone priced at zero. It is a destination the store
// doesn't serve, and checkout has to refuse it rather than quietly sell something it can't post.
//
// Zones are PRESETS, not free-form country lists, because "tick the 27 EU member states" is how a
// seller ends up shipping to nowhere. Four buckets cover how these stores actually think: home,
// Europe, North America, everywhere else.
//
// Pure, no database. store-shipping-db persists it, checkout reads it.

import { SHIPPING_TIERS, assignTier, type TierId, type ParcelDims } from "./shipping-tiers.ts";
// A cycle by design: shipping-prices-core needs the zone ids and labels for its table, and this
// module needs its resolver for a quote. Both use the other only inside function bodies, never at
// module load, so the live bindings are always there when they're read.
import { resolveTierPrice } from "./shipping-prices-core.ts";
import { destinationBar } from "./shipping-embargo.ts";

export type ZoneId = "domestic" | "europe" | "north_america" | "rest_of_world";

export const ZONE_IDS: ZoneId[] = ["domestic", "europe", "north_america", "rest_of_world"];

export const ZONE_LABELS: Record<ZoneId, string> = {
 domestic: "Your own country",
 europe: "Europe",
 north_america: "North America",
 rest_of_world: "Rest of world",
};

/** Europe as a shipping bucket. The EEA plus the near neighbours parcels actually go to. */
const EUROPE = new Set([
 "GB", "IE", "FR", "DE", "IT", "ES", "PT", "NL", "BE", "LU", "AT", "DK", "SE", "FI",
 "PL", "CZ", "SK", "HU", "RO", "BG", "GR", "HR", "SI", "EE", "LV", "LT", "MT", "CY",
 "NO", "IS", "LI", "CH", "UA", "RS", "AL", "BA", "MK", "ME", "MD",
]);

const NORTH_AMERICA = new Set(["US", "CA", "MX"]);

/**
 * Who is actually in a zone, for a store standing in `homeCountry`.
 *
 * WHY IT TAKES THE HOME COUNTRY. Domestic wins in zoneFor, so a zone's membership is not fixed: for
 * a US store "North America" means Canada and Mexico, and the blurb saying "United States, Canada,
 * Mexico" was naming a country that is in a different zone on that very page. Same for a London
 * shop looking at Europe.
 *
 * `rest_of_world` returns null rather than a list, and that is the honest answer: it is the
 * REMAINDER, every country not named in the other two, which is roughly 150 of them and not a list
 * anyone reads. What a seller needs there is whether one particular place is in it, which is why
 * the settings page names examples rather than pretending to enumerate.
 */
export function zoneMembers(zone: ZoneId, homeCountry?: unknown): string[] | null {
 const home = String(homeCountry ?? "").trim().toUpperCase();
 const without = (codes: Iterable<string>) => [...codes].filter((c) => c !== home);
 if (zone === "domestic") return /^[A-Z]{2}$/.test(home) ? [home] : [];
 if (zone === "europe") return without(EUROPE);
 if (zone === "north_america") return without(NORTH_AMERICA);
 return null; // the remainder
}

/**
 * The region a country sits in, on its own, with no store to be relative to.
 *
 * Separate from zoneFor because two different questions get asked. "Where am I sending this?" is
 * relative to the store (zoneFor, where domestic wins). "Is the store ITSELF in Europe?" is not,
 * and it is what decides whether reaching Europe is a neighbour or an export: a London shop
 * posting to Paris and a Chicago shop posting to Paris are both the "europe" zone and are nothing
 * like the same parcel. See zoneTierDefaults in shipping-prices-core.ts.
 */
export function regionOf(country: unknown): Exclude<ZoneId, "domestic"> {
 const c = String(country ?? "").trim().toUpperCase();
 if (EUROPE.has(c)) return "europe";
 if (NORTH_AMERICA.has(c)) return "north_america";
 return "rest_of_world";
}

/**
 * Which zone a destination falls in, relative to where the store ships from.
 *
 * Domestic wins over everything: a French store posting to Paris is domestic, not "Europe", and
 * must be priced as such. Otherwise the cheapest possible parcel gets the export rate.
 */
export function zoneFor(fromCountry: unknown, toCountry: unknown): ZoneId {
 const from = String(fromCountry ?? "").trim().toUpperCase();
 const to = String(toCountry ?? "").trim().toUpperCase();
 if (!/^[A-Z]{2}$/.test(to)) return "rest_of_world";
 if (/^[A-Z]{2}$/.test(from) && from === to) return "domestic";
 return regionOf(to);
}

/** What a store charges for one zone. `enabled: false` means it doesn't ship there at all. */
export type ZoneRate = {
 enabled: boolean;
 /** Buyer price per parcel tier, in cents. Missing tiers fall back to the domestic tier price. */
 rates?: Partial<Record<TierId, number>>;
};

export type ZoneConfig = Partial<Record<ZoneId, ZoneRate>>;

/**
 * The default: ship at home only, at the standard tier prices.
 *
 * Deliberately closed rather than open. A store that has never seen this screen should not be
 * silently selling to Australia at a domestic rate. It should be visibly not offering it, which
 * is a question the seller can answer, rather than a loss she discovers at the post office.
 */
export const DEFAULT_ZONES: ZoneConfig = {
 domestic: { enabled: true },
 europe: { enabled: false },
 north_america: { enabled: false },
 rest_of_world: { enabled: false },
};

/** The standard domestic price for a tier. The fallback when a zone hasn't set its own. */
export function tierPriceCents(tier: TierId): number {
 return SHIPPING_TIERS.find((t) => t.id === tier)?.priceCents ?? SHIPPING_TIERS[SHIPPING_TIERS.length - 1].priceCents;
}

export type ShippingQuote =
 | { ok: true; zone: ZoneId; tier: TierId; amountCents: number }
 // "not-served": the store chose not to post there. "restricted": nobody on VYA may, whatever the
 // store chose (shipping-embargo.ts). Two different answers, and only one of them is the shop's.
 | { ok: false; zone: ZoneId; reason: "not-served" | "restricted"; message?: string };

/**
 * What the buyer pays, and whether the store serves this destination at all.
 *
 * Returns a REFUSAL rather than a price for a zone that's off, because the two are different
 * answers to the shopper and only one of them is honest.
 */
export function quoteShipping(opts: {
 fromCountry: unknown;
 toCountry: unknown;
 /** The destination's state or province, when an address has been typed. See shipping-embargo.ts. */
 toRegion?: unknown;
 parcel?: ParcelDims | null;
 zones?: ZoneConfig | null;
}): ShippingQuote {
 const zone = zoneFor(opts.fromCountry, opts.toCountry);
 // BEFORE the store's own zones, because this one is not hers to answer. A seller who has ticked
 // "Rest of world" has said where she is willing to post, not where VYA is able to.
 const bar = destinationBar(opts.toCountry, opts.toRegion);
 if (bar.barred) return { ok: false, zone, reason: "restricted", message: bar.message };
 const cfg = { ...DEFAULT_ZONES, ...(opts.zones || {}) };
 const z = cfg[zone];
 if (!z?.enabled) return { ok: false, zone, reason: "not-served" };
 const tier = assignTier(opts.parcel).id;
 // Her price for this tier here, or VYA's. One resolver, so the checkout, the bag and the product
 // page can never disagree about what she charges (shipping-prices-core.ts).
 // homeCountry, because VYA's default for a zone depends on where the store is standing:
 // reaching Europe from London is a neighbour, and from Chicago it is an export.
 const amountCents = resolveTierPrice({ tier, zone, overrides: cfg, homeCountry: opts.fromCountry });
 return { ok: true, zone, tier, amountCents };
}

/** Which zones a store actually serves, for the storefront's "we ship to" line. */
export function servedZones(zones?: ZoneConfig | null): ZoneId[] {
 const cfg = { ...DEFAULT_ZONES, ...(zones || {}) };
 return ZONE_IDS.filter((z) => cfg[z]?.enabled);
}

/**
 * Does this store post to that country?
 *
 * THE QUESTION A SHOPPER ASKS FIRST AND WAS ANSWERED LAST. A store that doesn't serve a region was
 * refused at CHECKOUT, after choosing a piece, filling in a name, a street and a postcode, and
 * reaching the card. Everything above this line already knew; nothing told her. So the same rule is
 * available to a product page, in one call, with no address typed.
 */
export function shipsTo(zones: ZoneConfig | null | undefined, fromCountry: unknown, toCountry: unknown, toRegion?: unknown): boolean {
 if (destinationBar(toCountry, toRegion).barred) return false;
 const cfg = { ...DEFAULT_ZONES, ...(zones || {}) };
 return cfg[zoneFor(fromCountry, toCountry)]?.enabled === true;
}

/** "the UK, Europe and North America". The places a store posts to, as a phrase. */
export function describeServedZones(zones: ZoneConfig | null | undefined, fromCountry?: unknown): string {
 const served = servedZones(zones);
 if (served.length === 0) return "nowhere yet";
 if (served.length === ZONE_IDS.length) return "worldwide";
 const home = String(fromCountry ?? "").trim().toUpperCase();
 const names = served.map((z) => (z === "domestic" ? (/^[A-Z]{2}$/.test(home) ? home : ZONE_LABELS.domestic.toLowerCase()) : ZONE_LABELS[z]));
 if (names.length === 1) return names[0];
 return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * What to tell a shopper about postage before she has typed anything.
 *
 * `toCountry` is wherever we think she is. A geo header, a saved address, or nothing at all. With
 * nothing, it says where the store ships and makes no claim about her; a guess dressed as a fact
 * ("we don't ship to you") would be worse than silence when the guess is wrong.
 */
export function shippingReach(
 zones: ZoneConfig | null | undefined,
 fromCountry: unknown,
 toCountry?: unknown,
): { ships: boolean | null; line: string } {
 const where = describeServedZones(zones, fromCountry);
 const to = String(toCountry ?? "").trim().toUpperCase();
 if (!/^[A-Z]{2}$/.test(to)) return { ships: null, line: `Ships to ${where}.` };
 // Before the shop's own zones, and in the shop's defence. A store serving "worldwide" that cannot
 // reach one country would otherwise say "this shop doesn't post to IR: it ships to worldwide",
 // which blames the seller for a sanction and contradicts itself in the same breath.
 const bar = destinationBar(to);
 if (bar.barred) return { ships: false, line: bar.message };
 if (shipsTo(zones, fromCountry, to)) return { ships: true, line: `Ships to ${to}.` };
 return { ships: false, line: `This shop doesn't post to ${to}: it ships to ${where}.` };
}

/** Normalise whatever a settings form posted into something safe to store. */
export function normalizeZones(raw: unknown): ZoneConfig {
 const out: ZoneConfig = {};
 const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
 for (const id of ZONE_IDS) {
  const v = src[id] as { enabled?: unknown; rates?: unknown } | undefined;
  if (!v || typeof v !== "object") { out[id] = DEFAULT_ZONES[id]; continue; }
  // A zone is now just ON or OFF. `rates` used to be kept here too, and is deliberately dropped:
  // postage is VYA's to price (resolveTierPrice), so a rate arriving in a request body has nobody
  // legitimate behind it. Dropping rather than rejecting means the rows that already hold one
  // clear themselves the next time the store saves anything.
  out[id] = { enabled: v.enabled === true };
 }
 // Home is never closed: a store that ships nowhere is not a store.
 if (!out.domestic?.enabled) out.domestic = { enabled: true };
 return out;
}
