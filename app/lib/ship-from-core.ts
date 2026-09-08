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

/**
 * A country as the carriers want it: ISO 3166-1 alpha-2.
 *
 * Shippo and EasyPost both reject anything else, and the address was being handed to them exactly
 * as it was typed. Two live stores had "United States" saved rather than "US" — the settings form
 * accepts free text — so every rate lookup for them came back empty and the label simply could not
 * be bought. It surfaces as "no rates", which reads like the carrier's fault rather than ours.
 *
 * Only the names sellers actually type. Anything already a two-letter code passes through, and
 * anything unrecognised is returned uppercased rather than swallowed — a wrong code is a legible
 * carrier error, an empty one is a mystery.
 */
const COUNTRY_ALIASES: Record<string, string> = {
 "united states": "US", "united states of america": "US", "usa": "US", "u.s.": "US", "u.s.a.": "US", "america": "US",
 "united kingdom": "GB", "great britain": "GB", "britain": "GB", "england": "GB", "scotland": "GB", "wales": "GB", "uk": "GB",
 "canada": "CA", "australia": "AU", "new zealand": "NZ", "ireland": "IE", "france": "FR", "germany": "DE",
 "spain": "ES", "italy": "IT", "netherlands": "NL", "belgium": "BE", "sweden": "SE", "denmark": "DK",
 "norway": "NO", "japan": "JP", "mexico": "MX",
};

export function isoCountry(input: string | null | undefined): string {
 const raw = String(input ?? "").trim();
 if (!raw) return "US"; // the platform's home market, and what the old code defaulted to
 // Aliases FIRST, because "UK" is two letters and looks like a code — but the United Kingdom is
 // GB, and a carrier rejects UK exactly as it rejects "United Kingdom". A two-letter string is not
 // proof of a valid code.
 const key = raw.toLowerCase().replace(/\s+/g, " ").trim();
 const hit = COUNTRY_ALIASES[key] ?? COUNTRY_ALIASES[key.replace(/\./g, "")];
 if (hit) return hit;
 if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
 return raw.toUpperCase();
}
