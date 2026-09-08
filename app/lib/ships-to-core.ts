// "Ships to" on a product page, in words. Pure — no I/O.
//
// A buyer in Lyon looking at a London store wants one line before she reads the measurements: will
// this even come to her? The zones (shipping-zones.ts) already answer it; this turns them into a
// sentence. Null when shipping is off, because then the Buy button is the thing doing the talking.

import { ZONE_IDS, servedZones, type ZoneConfig, type ZoneId } from "./shipping-zones.ts";

const SHORT: Record<string, string> = { GB: "UK", UK: "UK", US: "US" };

/** "UK", "US", "Germany" — the way a person names a country in one breath, never "United Kingdom". */
export function countryShortName(code: string | null | undefined): string {
 const c = String(code ?? "").trim().toUpperCase();
 if (!c) return "";
 if (SHORT[c]) return SHORT[c];
 if (!/^[A-Z]{2}$/.test(c)) return c;
 try {
  // `fallback: "none"` returns undefined for a code the runtime doesn't know, rather than the
  // string "Unknown Region", which is not a country anyone ships to.
  const name = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" }).of(c);
  // CLDR names "ZZ" "Unknown Region" — a real entry, not a fallback — and that is not a country
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
