// Where a store ships, and what it charges to get there.
//
// WHAT THIS REPLACES. VYA charged one flat rate by parcel size, wherever the parcel was going —
// $14 for a medium box to the next town and $14 for the same box to Sydney. That is fine while
// every store and buyer is in one country, and it is a loss on every export: a medium parcel from
// London to New York is nearer £25 than £14.
//
// TWO QUESTIONS, ONE ANSWER. A zone says both where a store is WILLING to ship and what it charges
// to ship there. A zone that is off is not a zone priced at zero — it is a destination the store
// doesn't serve, and checkout has to refuse it rather than quietly sell something it can't post.
//
// Zones are PRESETS, not free-form country lists, because "tick the 27 EU member states" is how a
// seller ends up shipping to nowhere. Four buckets cover how these stores actually think: home,
// Europe, North America, everywhere else.
//
// Pure — no database. store-shipping-db persists it, checkout reads it.

import { SHIPPING_TIERS, assignTier, type TierId, type ParcelDims } from "./shipping-tiers.ts";

export type ZoneId = "domestic" | "europe" | "north_america" | "rest_of_world";

export const ZONE_IDS: ZoneId[] = ["domestic", "europe", "north_america", "rest_of_world"];

export const ZONE_LABELS: Record<ZoneId, string> = {
 domestic: "Your own country",
 europe: "Europe",
 north_america: "North America",
 rest_of_world: "Rest of world",
};

/** Europe as a shipping bucket — the EEA plus the near neighbours parcels actually go to. */
const EUROPE = new Set([
 "GB", "IE", "FR", "DE", "IT", "ES", "PT", "NL", "BE", "LU", "AT", "DK", "SE", "FI",
 "PL", "CZ", "SK", "HU", "RO", "BG", "GR", "HR", "SI", "EE", "LV", "LT", "MT", "CY",
 "NO", "IS", "LI", "CH", "UA", "RS", "AL", "BA", "MK", "ME", "MD",
]);

const NORTH_AMERICA = new Set(["US", "CA", "MX"]);

/**
 * Which zone a destination falls in, relative to where the store ships from.
 *
 * Domestic wins over everything: a French store posting to Paris is domestic, not "Europe", and
 * must be priced as such — otherwise the cheapest possible parcel gets the export rate.
 */
export function zoneFor(fromCountry: unknown, toCountry: unknown): ZoneId {
 const from = String(fromCountry ?? "").trim().toUpperCase();
 const to = String(toCountry ?? "").trim().toUpperCase();
 if (!/^[A-Z]{2}$/.test(to)) return "rest_of_world";
 if (/^[A-Z]{2}$/.test(from) && from === to) return "domestic";
 if (EUROPE.has(to)) return "europe";
 if (NORTH_AMERICA.has(to)) return "north_america";
 return "rest_of_world";
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
 * silently selling to Australia at a domestic rate — it should be visibly not offering it, which
 * is a question the seller can answer, rather than a loss she discovers at the post office.
 */
export const DEFAULT_ZONES: ZoneConfig = {
 domestic: { enabled: true },
 europe: { enabled: false },
 north_america: { enabled: false },
 rest_of_world: { enabled: false },
};

/** The standard domestic price for a tier — the fallback when a zone hasn't set its own. */
export function tierPriceCents(tier: TierId): number {
 return SHIPPING_TIERS.find((t) => t.id === tier)?.priceCents ?? SHIPPING_TIERS[SHIPPING_TIERS.length - 1].priceCents;
}

export type ShippingQuote =
 | { ok: true; zone: ZoneId; tier: TierId; amountCents: number }
 | { ok: false; zone: ZoneId; reason: "not-served" };

/**
 * What the buyer pays, and whether the store serves this destination at all.
 *
 * Returns a REFUSAL rather than a price for a zone that's off, because the two are different
 * answers to the shopper and only one of them is honest.
 */
export function quoteShipping(opts: {
 fromCountry: unknown;
 toCountry: unknown;
 parcel?: ParcelDims | null;
 zones?: ZoneConfig | null;
}): ShippingQuote {
 const zone = zoneFor(opts.fromCountry, opts.toCountry);
 const cfg = { ...DEFAULT_ZONES, ...(opts.zones || {}) };
 const z = cfg[zone];
 if (!z?.enabled) return { ok: false, zone, reason: "not-served" };
 const tier = assignTier(opts.parcel).id;
 const own = z.rates?.[tier];
 const amountCents = typeof own === "number" && own >= 0 ? Math.round(own) : tierPriceCents(tier);
 return { ok: true, zone, tier, amountCents };
}

/** Which zones a store actually serves — for the storefront's "we ship to" line. */
export function servedZones(zones?: ZoneConfig | null): ZoneId[] {
 const cfg = { ...DEFAULT_ZONES, ...(zones || {}) };
 return ZONE_IDS.filter((z) => cfg[z]?.enabled);
}

/** Normalise whatever a settings form posted into something safe to store. */
export function normalizeZones(raw: unknown): ZoneConfig {
 const out: ZoneConfig = {};
 const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
 for (const id of ZONE_IDS) {
  const v = src[id] as { enabled?: unknown; rates?: unknown } | undefined;
  if (!v || typeof v !== "object") { out[id] = DEFAULT_ZONES[id]; continue; }
  const rates: Partial<Record<TierId, number>> = {};
  const r = (v.rates && typeof v.rates === "object" ? v.rates : {}) as Record<string, unknown>;
  for (const t of SHIPPING_TIERS) {
   const n = Number(r[t.id]);
   // A zone rate of 0 is legitimate — it's free shipping to that zone, not an empty field.
   if (Number.isFinite(n) && n >= 0 && n < 1_000_000) rates[t.id] = Math.round(n);
  }
  out[id] = { enabled: v.enabled === true, ...(Object.keys(rates).length ? { rates } : {}) };
 }
 // Home is never closed: a store that ships nowhere is not a store.
 if (!out.domestic?.enabled) out.domestic = { enabled: true, ...(out.domestic?.rates ? { rates: out.domestic.rates } : {}) };
 return out;
}
