// Buying a domain from the phone: what to ask for, and what to call things.

export type DomainOption = { domain: string; tld: string; available: boolean; priceCents: number | null };

/** The registrant contact ICANN requires. Every one of these is mandatory at the registrar. */
export type Registrant = {
  firstName: string; lastName: string; email: string; phone: string;
  address1: string; city: string; state: string; zip: string; country: string;
};

export const EMPTY_REGISTRANT: Registrant = {
  firstName: "", lastName: "", email: "", phone: "",
  address1: "", city: "", state: "", zip: "", country: "US",
};

export const REGISTRANT_FIELDS: { key: keyof Registrant; label: string; hint?: string }[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address1", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State / county" },
  { key: "zip", label: "Postcode" },
  { key: "country", label: "Country", hint: "Two letters — US, GB, FR." },
];

/**
 * The fields still empty, in the order they are asked for.
 *
 * Used to keep Buy disabled AND to name what is missing. The registrar refuses the whole purchase
 * for one blank box, and finding out which one after a failed charge is the worst version of this.
 */
export function missingRegistrantFields(r: Registrant): string[] {
  return REGISTRANT_FIELDS.filter((f) => !String(r[f.key] ?? "").trim()).map((f) => f.label);
}

/** "Add your first name and postcode." — or null when nothing is missing. */
export function describeMissing(r: Registrant): string | null {
  const missing = missingRegistrantFields(r);
  if (!missing.length) return null;
  const lower = missing.map((m) => m.toLowerCase());
  const list =
    lower.length === 1
      ? lower[0]
      : `${lower.slice(0, -1).join(", ")} and ${lower[lower.length - 1]}`;
  return `Add your ${list}.`;
}

/**
 * What she types, turned into something worth searching.
 *
 * A registrar wants a bare label — she may type "My Brand", "mybrand.com", or a whole URL. All three
 * mean the same thing, and searching the raw string returns nothing for two of them.
 */
export function searchTermFrom(v: string | null | undefined): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split(".")[0]
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

const SYMBOLS: Record<string, string> = { USD: "$", GBP: "£", EUR: "€" };

/** "$12/year", or "Taken" — never a bare number with no unit, which reads as a one-off price. */
export function priceLine(o: DomainOption, currency = "USD"): string {
  if (!o.available) return "Taken";
  if (o.priceCents == null) return "Price unavailable";
  const symbol = SYMBOLS[currency.toUpperCase()] ?? `${currency.toUpperCase()} `;
  return `${symbol}${Math.round(o.priceCents / 100)}/year`;
}
