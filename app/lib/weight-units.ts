// Weight, in the unit the seller actually thinks in.
//
// Everything is STORED in ounces — one unit through the database, the shipping tiers, the carriers
// and the label. That doesn't change: a second stored unit is how a parcel ends up weighing 500 of
// something nobody recorded.
//
// What changes is the number a seller reads and types. A London shop weighs a coat in grams, and
// asking her for ounces is the same discourtesy as showing her a dollar sign — she converts in her
// head, or guesses, and a guessed weight is a mis-quoted parcel.

export type WeightUnit = "oz" | "g";

const OZ_PER_G = 0.0352739619;

/** Ounces for the wire, from whatever she typed. */
export function toOz(value: number | string | null | undefined, unit: WeightUnit): number {
 const n = Number(value);
 if (!Number.isFinite(n) || n <= 0) return 0;
 return unit === "g" ? Math.max(1, Math.round(n * OZ_PER_G)) : Math.round(n);
}

/** Her unit, from the ounces we hold. */
export function fromOz(oz: number | string | null | undefined, unit: WeightUnit): number {
 const n = Number(oz);
 if (!Number.isFinite(n) || n <= 0) return 0;
 return unit === "g" ? Math.round(n / OZ_PER_G) : Math.round(n);
}

/**
 * Which unit a store weighs in. Same rule the measurements already use (measurements-core.unitFor):
 * the US works in ounces, everywhere else in grams, and the currency decides it when we don't know
 * the country yet.
 */
export function weightUnitFor(store: { country?: string | null; currency?: string | null }): WeightUnit {
 const c = String(store.country ?? "").trim().toUpperCase();
 if (c) return c === "US" ? "oz" : "g";
 return String(store.currency ?? "").trim().toUpperCase() === "USD" ? "oz" : "g";
}
