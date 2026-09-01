// Does the price a seller typed already include tax?
//
// THIS IS NOT A PREFERENCE, WHICH IS WHY IT ISN'T A TOGGLE. It's a fact about where the store is,
// and getting it wrong is a legal problem rather than a cosmetic one.
//
// The two worlds:
//
//  • US and Canada — sales tax depends on the BUYER's address. The same dress is 0% in Portland
//    and 10.25% in Chicago. There is no single all-in number a seller could print, so prices are
//    shown before tax and it's added at the till. "200" means $200 plus whatever applies.
//
//  • UK, EU, Australia and most of the rest — VAT/GST is one rate for the destination country, so
//    an all-in price is possible, and consumer law REQUIRES that shoppers see it. "200" means
//    £200 total, with the VAT already inside it.
//
// So the same typed number means two different things, and the difference is worth a sixth of the
// sale: £200 including 20% VAT leaves the seller £166.67. A store whose prices are inclusive and
// whose books count the gross is overstating its revenue on every single order.
//
// Everything here is pure, so the country rules and the VAT arithmetic are unit tested on their own.

/** How Stripe should read the amounts we send it. */
export type TaxBehavior = "inclusive" | "exclusive";

/**
 * Countries where consumer prices are shown tax-inclusive.
 *
 * Not exhaustive for the whole world — it covers everywhere VYA's stores actually are, plus the
 * places they sell into. Anything unlisted falls to exclusive, which is the safe direction: a
 * price shown before tax and then taxed is a normal US checkout, whereas wrongly treating an
 * exclusive price as inclusive silently eats the seller's margin.
 */
export const TAX_INCLUSIVE_COUNTRIES: ReadonlySet<string> = new Set([
 // United Kingdom + EEA
 "GB", "IE", "FR", "DE", "IT", "ES", "PT", "NL", "BE", "LU", "AT", "DK", "SE", "FI",
 "PL", "CZ", "SK", "HU", "RO", "BG", "GR", "HR", "SI", "EE", "LV", "LT", "MT", "CY",
 "NO", "IS", "LI", "CH",
 // GST / VAT markets that also display inclusive
 "AU", "NZ", "SG", "JP", "IN", "MY", "ZA", "AE", "SA", "MX", "BR", "CL", "TR", "IL", "KR",
]);

/**
 * Countries that explicitly display prices BEFORE tax.
 *
 * Listed rather than inferred so the two American cases are deliberate: Canada looks European in
 * most respects but shows pre-tax prices like the US, and that catches people out.
 */
export const TAX_EXCLUSIVE_COUNTRIES: ReadonlySet<string> = new Set(["US", "CA"]);

/** Normalise whatever we were handed into a two-letter code, or null. */
export function normalizeCountry(raw: unknown): string | null {
 const c = String(raw ?? "").trim().toUpperCase();
 return /^[A-Z]{2}$/.test(c) ? c : null;
}

/**
 * Whether a store in this country types tax-inclusive prices.
 *
 * Unknown countries default to EXCLUSIVE. That's the conservative direction — see the note on
 * TAX_INCLUSIVE_COUNTRIES.
 */
export function pricesIncludeTaxFor(country: unknown): boolean {
 const c = normalizeCountry(country);
 if (!c) return false;
 if (TAX_EXCLUSIVE_COUNTRIES.has(c)) return false;
 return TAX_INCLUSIVE_COUNTRIES.has(c);
}

/** What to put on a Stripe line item so it reads our amounts the way the seller meant them. */
export function taxBehaviorFor(country: unknown): TaxBehavior {
 return pricesIncludeTaxFor(country) ? "inclusive" : "exclusive";
}

/**
 * The behaviour for one actual sale, which needs BOTH ends of it.
 *
 * The seller's country says what her typed number meant. The buyer's country says which tax is
 * actually owed. Only when both sit in the tax-inclusive world is "inclusive" right.
 *
 * The case this exists for is the export. A UK seller ships to the US: UK VAT is zero-rated on
 * exports, so the only tax that could apply is US sales tax. Marked "inclusive", Stripe would take
 * that US tax OUT of her £200 and she would absorb it silently. Marked "exclusive", it is added on
 * top the way a US buyer expects — and where she has no US registration, nothing is added at all,
 * which is the common case and the correct one.
 *
 * Domestic sales are unaffected: a UK seller to a UK buyer is still inclusive, which UK consumer
 * law requires.
 */
export function taxBehaviorForSale(sellerCountry: unknown, buyerCountry: unknown): TaxBehavior {
 const buyer = normalizeCountry(buyerCountry);
 // No destination yet (the address comes later in some flows) — fall back to the seller's own
 // convention, which is right for the domestic sale that most orders are.
 if (!buyer) return taxBehaviorFor(sellerCountry);
 return pricesIncludeTaxFor(sellerCountry) && pricesIncludeTaxFor(buyer) ? "inclusive" : "exclusive";
}

/**
 * The seller's actual revenue from a gross, tax-inclusive amount.
 *
 * `taxCents` is what was actually collected, which is the only number worth trusting — rates vary
 * by destination and by what the piece is, so a store-level rate would be a guess. When we don't
 * know the tax, the gross is returned unchanged and the caller is expected to SAY so rather than
 * quietly present a number that's up to a fifth too high.
 */
export function netRevenueCents(grossCents: number, taxCents: number | null | undefined): number {
 const gross = Math.round(Number(grossCents) || 0);
 const tax = taxCents == null ? 0 : Math.round(Number(taxCents) || 0);
 if (!Number.isFinite(gross)) return 0;
 if (tax <= 0) return gross;
 return Math.max(0, gross - Math.min(tax, gross));
}

/**
 * Split a tax-inclusive gross into net and tax at a known rate.
 *
 * Used where a rate genuinely is known (a store's own standard VAT rate, for a projection) — never
 * for reporting money that has actually moved, which uses the collected figure instead.
 */
export function splitInclusive(grossCents: number, ratePercent: number): { netCents: number; taxCents: number } {
 const gross = Math.round(Number(grossCents) || 0);
 const rate = Number(ratePercent) || 0;
 if (!Number.isFinite(gross) || gross <= 0 || rate <= 0) return { netCents: Math.max(0, gross), taxCents: 0 };
 // £200 at 20% is £166.67 + £33.33 — divide by 1.20, don't take 20% off.
 const net = Math.round(gross / (1 + rate / 100));
 return { netCents: net, taxCents: gross - net };
}

/** The gross a seller must display so that, after tax, they still net what they wanted. */
export function grossFromNet(netCents: number, ratePercent: number): number {
 const net = Math.round(Number(netCents) || 0);
 const rate = Number(ratePercent) || 0;
 if (!Number.isFinite(net) || net <= 0 || rate <= 0) return Math.max(0, net);
 return Math.round(net * (1 + rate / 100));
}
