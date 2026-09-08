// Measurements as structure. Pure — no I/O.
//
// A buyer can't try it on, so the measurements are the size. They used to be one free-text field
// ("Bust 34 · Waist 28"), which reads fine and filters on nothing. This gives every category a short
// template — the four numbers a buyer of THAT kind of piece actually checks — and a stored shape
// `{ key, value, unit }[]` that the product page, the phone and the edit form all agree on.
//
// The unit is the store's, chosen once (unitFor) and stamped on every entry so a row never has to
// remember which. `in` for US stores, `cm` everywhere else — a London seller measures in cm and a
// New York one in inches, and mixing them is how a 19" chest becomes a 19 cm one.

import { toCategorySlug } from "./item-tags.ts";

export type MeasurementUnit = "cm" | "in";
export type Measurement = { key: MeasurementKey; value: number; unit: MeasurementUnit };

export const MEASUREMENT_LABELS = {
 pitToPit: "Pit to pit",
 shoulder: "Shoulder",
 sleeve: "Sleeve",
 length: "Length",
 waist: "Waist",
 hip: "Hip",
 rise: "Rise",
 inseam: "Inseam",
 insole: "Insole",
 width: "Width",
 height: "Height",
 depth: "Depth",
 strapDrop: "Strap drop",
} as const;

export type MeasurementKey = keyof typeof MEASUREMENT_LABELS;
export const MEASUREMENT_KEYS = Object.keys(MEASUREMENT_LABELS) as MeasurementKey[];
export const isMeasurementKey = (k: unknown): k is MeasurementKey => typeof k === "string" && Object.prototype.hasOwnProperty.call(MEASUREMENT_LABELS, k);
export const measurementLabel = (k: MeasurementKey): string => MEASUREMENT_LABELS[k];

const TOP: MeasurementKey[] = ["pitToPit", "shoulder", "sleeve", "length"];
const DRESS: MeasurementKey[] = ["pitToPit", "waist", "hip", "length"];
const TROUSERS: MeasurementKey[] = ["waist", "hip", "rise", "inseam"];
const SKIRT: MeasurementKey[] = ["waist", "hip", "length"];
const SHOE: MeasurementKey[] = ["insole"];
const BAG: MeasurementKey[] = ["width", "height", "depth", "strapDrop"];
const FLAT: MeasurementKey[] = ["length", "width"];

const BY_SLUG: Record<string, MeasurementKey[]> = {
 tops: TOP, sweaters: TOP, "coats-jackets": TOP, "other-clothing": TOP, lingerie: DRESS, swimwear: DRESS,
 dresses: DRESS, jumpsuits: DRESS,
 pants: TROUSERS, jeans: TROUSERS, shorts: TROUSERS,
 skirts: SKIRT,
 boots: SHOE, heels: SHOE, sneakers: SHOE, sandals: SHOE, flats: SHOE, shoes: SHOE,
 handbags: BAG, totes: BAG, clutches: BAG, "crossbody-bags": BAG, bags: BAG,
 scarves: FLAT, belts: FLAT, home: FLAT,
 jewelry: [], hats: [], sunglasses: [], accessories: FLAT,
};

/** The measurement keys a piece of this category should offer. Unknown → the generic pair. */
export function templateFor(category: string | null | undefined): MeasurementKey[] {
 const slug = toCategorySlug(category);
 if (slug && BY_SLUG[slug]) return BY_SLUG[slug];
 return FLAT;
}

/**
 * Which unit this store measures in. Ship-from country decides when we have it (that's where the
 * tape measure lives); the store's currency stands in when we don't. Only the US gets inches.
 */
export function unitFor(store: { country?: string | null; currency?: string | null }): MeasurementUnit {
 const c = String(store.country ?? "").trim().toUpperCase();
 if (c) return c === "US" ? "in" : "cm";
 return String(store.currency ?? "").trim().toUpperCase() === "USD" ? "in" : "cm";
}

const MAX: Record<MeasurementUnit, number> = { cm: 300, in: 118 };

/**
 * Whatever a form posted → the stored list. Unknown keys, blanks, non-numbers, zero and negatives
 * are dropped (an empty field is omitted on save, never stored as 0). First entry per key wins.
 */
export function normalizeMeasurements(raw: unknown, unit: MeasurementUnit): Measurement[] {
 if (!Array.isArray(raw)) return [];
 const out: Measurement[] = [];
 const seen = new Set<string>();
 for (const entry of raw) {
  if (!entry || typeof entry !== "object") continue;
  const { key, value, unit: own } = entry as { key?: unknown; value?: unknown; unit?: unknown };
  if (!isMeasurementKey(key) || seen.has(key)) continue;
  const u: MeasurementUnit = own === "in" || own === "cm" ? own : unit;
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) continue;
  const v = Math.round(n * 10) / 10;
  if (v > MAX[u]) continue;
  seen.add(key);
  out.push({ key, value: v, unit: u });
 }
 return out;
}

/** "Pit to pit 48 cm" · 'Insole 10.5"'. */
export function formatMeasurement(m: Measurement): string {
 return `${measurementLabel(m.key)} ${m.value}${m.unit === "cm" ? " cm" : "\""}`;
}

export function formatMeasurements(list: Measurement[] | null | undefined): string {
 return (list ?? []).map(formatMeasurement).join(" · ");
}
