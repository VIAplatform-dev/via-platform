// What a store trades in, and where that answer comes from. Pure, no I/O.
//
// THE BUG THIS ENDS. A store's currency was read from `stores`, the hardcoded array of the original
// partner shops: `stores.find((x) => x.slug === slug)?.currency || "USD"`. Every store that signed
// up after that array was written is absent from it, so every one of them is USD, for ever, whatever
// address they put in. A London seller types a London ship-from, prices a coat at 240, and the whole
// workspace prints $240. Nothing she can reach changes it.
//
// SO IT FOLLOWS THE ADDRESS, WHICH IS THE ONE THING SHE HAS ALREADY TOLD US. A ship-from country is
// required for a carrier rate and a customs declaration, so it is known long before anyone thinks
// about currency, and it is a far better guess than "USD" is. Not a rule, a DEFAULT: a store can
// trade in something other than its own country's money (a Berlin shop pricing in USD for an
// American audience is a real thing), so an explicit choice always wins and is never overwritten.
//
// The list is the currencies VYA's stores actually trade in plus the obvious neighbours. Anything
// else falls to USD, which is the honest answer for a country whose currency we have not thought
// about rather than a guess that would print the wrong symbol on every price.

/** ISO 4217, upper case. The set the rest of the app formats against. */
export type CurrencyCode = string;

const EURO = [
 "AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV",
 "MT", "NL", "PT", "SI", "SK",
];

const BY_COUNTRY: Record<string, CurrencyCode> = {
 US: "USD", GB: "GBP", CA: "CAD", AU: "AUD", NZ: "NZD", CH: "CHF", JP: "JPY",
 SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN",
 IS: "ISK", MX: "MXN", BR: "BRL", IN: "INR", SG: "SGD", HK: "HKD", KR: "KRW", ZA: "ZAR",
 AE: "AED", SA: "SAR", IL: "ILS", TR: "TRY", CN: "CNY",
 ...Object.fromEntries(EURO.map((c) => [c, "EUR"])),
};

/**
 * The currency a store in this country most likely trades in.
 *
 * Returns null for a country we have no answer for, rather than guessing: a caller that gets null
 * should leave the currency alone instead of writing "USD" over a seller's own choice.
 */
export function currencyForCountry(country: unknown): CurrencyCode | null {
 const c = String(country ?? "").trim().toUpperCase();
 if (!/^[A-Z]{2}$/.test(c)) return null;
 return BY_COUNTRY[c] ?? null;
}

/**
 * What this store's prices are in.
 *
 * Order of authority, and the order matters:
 *   1. what she chose, if she chose
 *   2. her ship-from country
 *   3. the legacy partner-list entry, so the original shops keep the currency they have always had
 *   4. USD
 */
export function resolveStoreCurrency(args: {
 chosen?: string | null;
 shipFromCountry?: unknown;
 legacy?: string | null;
}): CurrencyCode {
 const chosen = String(args.chosen ?? "").trim().toUpperCase();
 if (/^[A-Z]{3}$/.test(chosen)) return chosen;
 const fromAddress = currencyForCountry(args.shipFromCountry);
 if (fromAddress) return fromAddress;
 const legacy = String(args.legacy ?? "").trim().toUpperCase();
 if (/^[A-Z]{3}$/.test(legacy)) return legacy;
 return "USD";
}

/**
 * Should saving this address set the store's currency?
 *
 * Only when nothing has been chosen. A seller who picked her currency has answered the question,
 * and a later address edit must not quietly re-answer it: moving a studio across a border is not
 * an instruction to re-price the entire catalogue.
 */
export function currencyToAdoptOnAddress(args: { chosen?: string | null; shipFromCountry?: unknown }): CurrencyCode | null {
 if (String(args.chosen ?? "").trim()) return null;
 return currencyForCountry(args.shipFromCountry);
}
