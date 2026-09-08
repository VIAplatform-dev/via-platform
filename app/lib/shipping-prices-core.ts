// Her own price for a parcel tier, in her currency. Pure — no I/O.
//
// VYA sets a flat buyer price per tier (shipping-tiers.ts). A store can put its own number on any
// tier in any zone it serves (shipping-zones.ts `rates`), and this is the ONE place that decides
// which number the buyer is quoted: hers when she set one, VYA's when she didn't. Zero is hers too
// — free shipping on that tier — which is why "unset" is a missing key, never a zero.
//
// Prices are minor units of the store's currency. A £ store's 450 is £4.50; nothing here or in the
// tier table knows or cares what the currency is, which is exactly why the UI must print it from
// the store's currency and never a hardcoded "$".

import { SHIPPING_TIERS, type TierId } from "./shipping-tiers.ts";
import { ZONE_IDS, ZONE_LABELS, type ZoneConfig, type ZoneId } from "./shipping-zones.ts";

export type TierDefaults = Record<TierId, number>;

/** VYA's flat prices, keyed by tier. */
export function vyaTierDefaults(): TierDefaults {
 return Object.fromEntries(SHIPPING_TIERS.map((t) => [t.id, t.priceCents])) as TierDefaults;
}

const validCents = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/**
 * The buyer's price for `tier` to `zone`: the store's override when it set a valid one (zero
 * included), else the default. A negative or non-numeric override is treated as unset.
 */
export function resolveTierPrice(args: { tier: TierId; zone: ZoneId; overrides: ZoneConfig | null | undefined; defaults?: Partial<TierDefaults> }): number {
 const own = args.overrides?.[args.zone]?.rates?.[args.tier];
 if (validCents(own)) return Math.round(own);
 const d = args.defaults?.[args.tier];
 return validCents(d) ? Math.round(d) : vyaTierDefaults()[args.tier];
}

/**
 * Refuse what the settings form must not save. normalizeZones would quietly drop a negative; the
 * seller who typed "-5" deserves to be told which box, not to find the default charged.
 */
export function validateZoneRates(raw: unknown): { ok: true } | { ok: false; error: string } {
 const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
 for (const zone of ZONE_IDS) {
  const z = src[zone] as { rates?: unknown } | undefined;
  const rates = z && typeof z === "object" && z.rates && typeof z.rates === "object" ? (z.rates as Record<string, unknown>) : null;
  if (!rates) continue;
  for (const t of SHIPPING_TIERS) {
   const v = rates[t.id];
   if (v === undefined || v === null) continue;
   const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
   if (!Number.isFinite(n) || n < 0 || n >= 1_000_000) {
    return { ok: false, error: `${ZONE_LABELS[zone]} · ${t.label}: a shipping price has to be a number of zero or more.` };
   }
  }
 }
 return { ok: true };
}

export type TierPriceCell = { tier: TierId; label: string; priceCents: number | null; defaultCents: number };
export type TierPriceRow = { zone: ZoneId; label: string; enabled: boolean; cells: TierPriceCell[] };

/** Every zone × tier, for the "Your prices" table: her price (null = unset) beside VYA's. */
export function tierPriceTable(overrides: ZoneConfig | null | undefined, defaults: TierDefaults = vyaTierDefaults()): TierPriceRow[] {
 return ZONE_IDS.map((zone) => {
  const z = overrides?.[zone];
  return {
   zone,
   label: ZONE_LABELS[zone],
   enabled: zone === "domestic" || Boolean(z?.enabled),
   cells: SHIPPING_TIERS.map((t) => {
    const own = z?.rates?.[t.id];
    return { tier: t.id, label: t.label, priceCents: validCents(own) ? Math.round(own) : null, defaultCents: defaults[t.id] };
   }),
  };
 });
}
