// The shipping screen's vocabulary and its one piece of arithmetic. Mirrors app/lib/shipping-zones.ts
// and app/lib/customs.ts — the phone must call a zone the same thing the server files it under, or a
// seller turns Europe on here and finds it off on the web.

export type ZoneId = "domestic" | "europe" | "north_america" | "rest_of_world";

export const ZONE_IDS: ZoneId[] = ["domestic", "europe", "north_america", "rest_of_world"];

export const ZONE_LABELS: Record<ZoneId, string> = {
  domestic: "Your own country",
  europe: "Europe",
  north_america: "North America",
  rest_of_world: "Rest of world",
};

export type ZoneRate = { enabled: boolean; rates?: Record<string, number> };
export type Zones = Partial<Record<ZoneId, ZoneRate>>;

/**
 * One zone switched on or off, with everything else left exactly as it was.
 *
 * The `rates` a zone may carry are per-tier prices the seller set on the web. Rebuilding the object
 * from scratch would drop them — she'd turn Europe off and on again on her phone and silently lose
 * the postage prices she worked out for it. So this spreads the existing zone rather than replacing it.
 */
export function zonesWith(zones: Zones | null | undefined, id: ZoneId, enabled: boolean): Zones {
  const base: Zones = { ...(zones ?? {}) };
  base[id] = { ...(base[id] ?? { enabled: false }), enabled };
  return base;
}

/** Whether she ships anywhere beyond her own country — what decides if duty is worth asking about. */
export function shipsAbroad(zones: Zones | null | undefined): boolean {
  return ZONE_IDS.some((z) => z !== "domestic" && Boolean(zones?.[z]?.enabled));
}

// Duty, said as the seller experiences it rather than as an incoterm. "absorbed" and "collected"
// both ship DDP; the difference is whether the buyer sees a separate line for it.
export const DUTY_OPTIONS = [
  { key: "buyer_pays", label: "Buyer pays on delivery" },
  { key: "collected", label: "Charged at checkout" },
  { key: "absorbed", label: "I cover it" },
];
