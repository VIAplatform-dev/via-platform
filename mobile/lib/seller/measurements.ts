// Measurements per category — the phone's mirror of app/lib/measurements-core.ts. Pure.
//
// The keys and labels are the server's; the template is matched by a few words because the phone
// has no category taxonomy. The unit is the store's: inches for a US ship-from, cm elsewhere.

export type MeasurementUnit = "cm" | "in";
export type MeasurementKey = "pitToPit" | "shoulder" | "sleeve" | "length" | "waist" | "hip" | "rise" | "inseam" | "insole" | "width" | "height" | "depth" | "strapDrop";
export type Measurement = { key: MeasurementKey; value: number; unit: MeasurementUnit };

export const MEASUREMENT_LABELS: Record<MeasurementKey, string> = {
  pitToPit: "Pit to pit", shoulder: "Shoulder", sleeve: "Sleeve", length: "Length",
  waist: "Waist", hip: "Hip", rise: "Rise", inseam: "Inseam", insole: "Insole",
  width: "Width", height: "Height", depth: "Depth", strapDrop: "Strap drop",
};

const TOP: MeasurementKey[] = ["pitToPit", "shoulder", "sleeve", "length"];
const DRESS: MeasurementKey[] = ["pitToPit", "waist", "hip", "length"];
const TROUSERS: MeasurementKey[] = ["waist", "hip", "rise", "inseam"];
const SKIRT: MeasurementKey[] = ["waist", "hip", "length"];
const SHOE: MeasurementKey[] = ["insole"];
const BAG: MeasurementKey[] = ["width", "height", "depth", "strapDrop"];
const FLAT: MeasurementKey[] = ["length", "width"];

const TEMPLATES: [RegExp, MeasurementKey[]][] = [
  [/jewel|ring|earring|necklace|bracelet|brooch|hat|cap|beret|sunglass/i, []],
  [/coat|jacket|blazer|parka|trench|outerwear|sweater|knit|cardigan|jumper|top|blouse|shirt|tee|vest|cami/i, TOP],
  [/dress|gown|jumpsuit|romper|swim|bikini|lingerie|slip/i, DRESS],
  [/jeans|denim|pant|trouser|short/i, TROUSERS],
  [/skirt/i, SKIRT],
  [/boot|heel|pump|loafer|sneaker|trainer|sandal|flat|shoe/i, SHOE],
  [/bag|tote|clutch|crossbody|purse/i, BAG],
];

export function templateFor(category: string | null | undefined): MeasurementKey[] {
  const c = String(category ?? "");
  const hit = c ? TEMPLATES.find(([re]) => re.test(c)) : undefined;
  return hit ? hit[1] : FLAT;
}

export function unitFor(store: { country?: string | null; currency?: string | null }): MeasurementUnit {
  const c = String(store.country ?? "").trim().toUpperCase();
  if (c) return c === "US" ? "in" : "cm";
  return String(store.currency ?? "").trim().toUpperCase() === "USD" ? "in" : "cm";
}

/** Typed strings → the list the API stores. Blanks and non-numbers are left out. */
export function measurementsFromForm(values: Partial<Record<MeasurementKey, string>>, unit: MeasurementUnit): Measurement[] {
  const out: Measurement[] = [];
  for (const [key, v] of Object.entries(values) as [MeasurementKey, string | undefined][]) {
    const n = v && v.trim() ? Number(v) : NaN;
    if (Number.isFinite(n) && n > 0) out.push({ key, value: Math.round(n * 10) / 10, unit });
  }
  return out;
}

/** "Pit to pit 48 cm · Length 62 cm" — the Review row's one line. */
export function formatMeasurements(list: Measurement[] | null | undefined): string {
  return (list ?? []).map((m) => `${MEASUREMENT_LABELS[m.key]} ${m.value}${m.unit === "cm" ? " cm" : "\""}`).join(" · ");
}

/** The stored list → the strings a form edits. Mirror of the web's measurementsToForm (ListingStructure.tsx). */
export function measurementsToForm(list: Measurement[] | null | undefined): Partial<Record<MeasurementKey, string>> {
  const out: Partial<Record<MeasurementKey, string>> = {};
  for (const m of list ?? []) out[m.key] = String(m.value);
  return out;
}
