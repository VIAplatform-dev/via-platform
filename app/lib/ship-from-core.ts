// ───────────────────────────────────────────────────────────────────────────
// What makes a ship-from address usable — one rule, in one place.
//
// It used to be written twice: the Locations screen called an address complete
// on street/city/country, while publishing demanded state and postcode too. A
// seller with no state saw "Set" on the settings page and was then refused at
// publish with "add your ship-from address in Settings" — an address she was
// looking at. Carriers need all five, so the stricter rule is the true one.
//
// Pure and dependency-free so the client form and the server check can share it.
// ───────────────────────────────────────────────────────────────────────────

export type ShipFromAddress = {
 name?: string | null; street1?: string | null; street2?: string | null;
 city?: string | null; state?: string | null; zip?: string | null;
 country?: string | null; phone?: string | null;
};

/** Every field a carrier needs before it will quote or print a label. */
export const SHIP_FROM_REQUIRED = ["street1", "city", "state", "zip", "country"] as const;
export type ShipFromField = (typeof SHIP_FROM_REQUIRED)[number];

const LABELS: Record<ShipFromField, string> = {
 street1: "street address",
 city: "city",
 state: "state or region",
 zip: "postcode",
 country: "country",
};

/** Which required fields are still blank. Empty array means the address is usable. */
export function missingShipFrom(a: ShipFromAddress | null | undefined): ShipFromField[] {
 if (!a) return [...SHIP_FROM_REQUIRED];
 return SHIP_FROM_REQUIRED.filter((k) => !String(a[k] ?? "").trim());
}

export function isShipFromComplete(a: ShipFromAddress | null | undefined): boolean {
 return missingShipFrom(a).length === 0;
}

/** "city and postcode" — for telling a seller exactly what to add, not just that something's wrong. */
export function describeMissing(fields: ShipFromField[]): string {
 const names = fields.map((f) => LABELS[f]);
 if (names.length <= 1) return names[0] ?? "";
 return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
