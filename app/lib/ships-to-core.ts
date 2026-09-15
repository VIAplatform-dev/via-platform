// "Ships to" on a product page, in words. Pure, no I/O.
//
// A buyer in Lyon looking at a London store wants one line before she reads the measurements: will
// this even come to her? The zones (shipping-zones.ts) already answer it; this turns them into a
// sentence. Null when shipping is off, because then the Buy button is the thing doing the talking.

import { zoneMembers, ZONE_IDS, servedZones, type ZoneConfig, type ZoneId } from "./shipping-zones.ts";

const SHORT: Record<string, string> = { GB: "UK", UK: "UK", US: "US" };

/** "UK", "US", "Germany": the way a person names a country in one breath, never "United Kingdom". */
export function countryShortName(code: string | null | undefined): string {
 const c = String(code ?? "").trim().toUpperCase();
 if (!c) return "";
 if (SHORT[c]) return SHORT[c];
 if (!/^[A-Z]{2}$/.test(c)) return c;
 try {
  // `fallback: "none"` returns undefined for a code the runtime doesn't know, rather than the
  // string "Unknown Region", which is not a country anyone ships to.
  const name = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" }).of(c);
  // CLDR names "ZZ" "Unknown Region", a real entry, not a fallback, and that is not a country
  // anyone ships to, so the code itself is the honest answer.
  return name && !/unknown/i.test(name) ? name : c;
 } catch {
  return c;
 }
}

const ZONE_WORDS: Record<Exclude<ZoneId, "domestic">, string> = {
 europe: "Europe",
 north_america: "North America",
 rest_of_world: "the rest of the world",
};

function joinNames(names: string[]): string {
 if (names.length <= 1) return names.join("");
 return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The value of a "Ships to" fact. `zones` null/undefined = shipping is off → null (say nothing).
 *   home only        → "UK only"
 *   some zones       → "UK, Europe and North America"
 *   every zone       → "Worldwide"
 */
export function shipsToLine(zones: ZoneConfig | null | undefined, storeCountry: string | null | undefined): string | null {
 if (!zones) return null;
 const served = servedZones(zones);
 if (served.length === 0) return null;
 if (served.length === ZONE_IDS.length) return "Worldwide";
 const home = countryShortName(storeCountry) || "Domestic";
 const names = served.map((z) => (z === "domestic" ? home : ZONE_WORDS[z]));
 if (names.length === 1) return `${names[0]} only`;
 return joinNames(names);
}

export type ZoneCoverage = {
 /** How many countries, or null when the zone is the remainder and cannot be counted. */
 count: number | null;
 /** Their names, alphabetical. Empty for the remainder. */
 names: string[];
 /** One line for the row, whether or not the seller opens the list. */
 summary: string;
};

/**
 * What a zone actually covers, in country names, for a store shipping from `homeCountry`.
 *
 * THE QUESTION THIS ANSWERS is "can somebody in Israel buy from me", and before this the page had
 * no way to answer it: Europe said "the EEA and its near neighbours", which does not settle
 * Switzerland or Serbia, and Rest of world said "everywhere else we can reach", which settles
 * nothing at all. A seller could not tell which box covered a customer in front of her.
 */
export function describeZoneCoverage(zone: ZoneId, homeCountry?: unknown): ZoneCoverage {
 const members = zoneMembers(zone, homeCountry);
 if (members === null) {
  return {
   count: null,
   names: [],
   // Named examples spread across the map on purpose. A seller checks this list by looking for
   // somewhere LIKE her customer, and three neighbours in one corner of the world answer nothing.
   summary: "Everywhere not listed above: Israel, Brazil, India, Australia, Japan, South Africa, the Gulf, and the rest.",
  };
 }
 const names = members.map((c) => countryShortName(c) || c).sort((a, b) => a.localeCompare(b));
 if (names.length === 0) return { count: 0, names, summary: "Nowhere else, once your own country is taken out." };
 if (names.length <= 3) return { count: names.length, names, summary: names.join(", ") + "." };
 return { count: names.length, names, summary: `${names.length} countries, from ${names[0]} to ${names[names.length - 1]}.` };
}
