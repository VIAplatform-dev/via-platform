import { FX_TO_USD } from "./data-layer/config.ts";

// Currency normalization for comp prices. Two rules, both about honesty:
//  1) resolve a symbol to an ISO code only when it's unambiguous ("kr" could be SEK/DKK/NOK → null);
//  2) convert to USD only at a known config rate — an unknown currency DROPS the comp, because a
//     wrong-currency price is a silent systematic error (the €450-as-$450 bug), not a rounding one.

const SYMBOL_TO_ISO: Record<string, string> = {
 "$": "USD",
 "US$": "USD",
 "€": "EUR",
 "£": "GBP",
 "¥": "JPY", // Lens/US results use ¥ for yen; CNY listings are rare enough to accept the yen read
 "C$": "CAD",
 "CA$": "CAD",
 "A$": "AUD",
 "AU$": "AUD",
 "CHF": "CHF",
 "zł": "PLN",
};

/** Resolve a currency symbol or code ("€", "US$", "eur") to an ISO code, or null if ambiguous/unknown. */
export function symbolToIso(raw: string | null | undefined): string | null {
 const s = (raw || "").trim();
 if (!s) return null;
 if (SYMBOL_TO_ISO[s]) return SYMBOL_TO_ISO[s];
 const upper = s.toUpperCase();
 if (SYMBOL_TO_ISO[upper]) return SYMBOL_TO_ISO[upper];
 if (/^[A-Z]{3}$/.test(upper) && FX_TO_USD[upper]) return upper; // ISO code passthrough, known only
 return null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** SerpApi Lens price object ({extracted_value, currency: "€"}) → USD cents. A missing currency
 *  on a country=us search is assumed USD (overwhelmingly correct); an UNKNOWN/ambiguous symbol
 *  returns null — the match stays unpriced and link-verify can recover the true price+currency
 *  from the product page itself. */
export function lensPriceToUsdCents(p: any): number | null {
 const v = typeof p?.extracted_value === "number" && p.extracted_value > 0 ? p.extracted_value : null;
 if (!v) return null;
 const iso = p?.currency == null || p.currency === "" ? "USD" : symbolToIso(String(p.currency));
 if (!iso) return null;
 return toUsdCents(Math.round(v * 100), iso);
}

/** Convert cents in `iso` to USD cents at the config rate. Unknown currency or non-positive → null. */
export function toUsdCents(cents: number, iso: string | null): number | null {
 if (!Number.isFinite(cents) || cents <= 0 || !iso) return null;
 const rate = FX_TO_USD[iso.toUpperCase()];
 if (!rate) return null;
 return Math.round(cents * rate);
}
