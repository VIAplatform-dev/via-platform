// Where a seller actually goes to get registered.
//
// VYA's tax screen tells Stripe that a store HAS a registration. It cannot get her one — that comes
// from a government, and it is the step sellers get stuck on, because "register for VAT" is not a
// thing anyone finds by guessing. So: name the authority and link straight to its registration page.
//
// Deliberately not exhaustive. It covers the countries VYA's stores are in and sell into, plus the
// US states they realistically hit, and falls back to a sensible starting point rather than
// inventing a URL. A wrong link is worse than no link, because she'll trust it.
//
// Government URLs move. Everything here is a stable, top-level registration page rather than a deep
// link into a form, which is the version most likely to survive.

export type Authority = {
 /** What the seller is getting, in her words. */
 what: string;
 /** Who issues it. */
 authority: string;
 url: string;
 note?: string;
};

export const COUNTRY_AUTHORITIES: Record<string, Authority> = {
 GB: { what: "VAT registration", authority: "HMRC", url: "https://www.gov.uk/register-for-vat" },
 IE: { what: "VAT registration", authority: "Revenue", url: "https://www.revenue.ie/en/vat/vat-registration/index.aspx" },
 DE: { what: "VAT registration", authority: "Bundeszentralamt für Steuern", url: "https://www.bzst.de/EN/Businesses/VAT/vat_node.html" },
 FR: { what: "VAT registration", authority: "impots.gouv.fr", url: "https://www.impots.gouv.fr/professionnel/tva" },
 NL: { what: "VAT registration", authority: "Belastingdienst", url: "https://www.belastingdienst.nl/wps/wcm/connect/en/vat/vat" },
 ES: { what: "VAT registration", authority: "Agencia Tributaria", url: "https://sede.agenciatributaria.gob.es/" },
 IT: { what: "VAT registration", authority: "Agenzia delle Entrate", url: "https://www.agenziaentrate.gov.it/" },
 AU: { what: "GST registration", authority: "ATO", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst" },
 NZ: { what: "GST registration", authority: "Inland Revenue", url: "https://www.ird.govt.nz/gst/registering-for-gst" },
 CA: { what: "GST/HST registration", authority: "Canada Revenue Agency", url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/gst-hst-registration.html" },
 SG: { what: "GST registration", authority: "IRAS", url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/gst-registration-deregistration" },
};

/**
 * Selling into the EU from outside it is usually ONE registration, not twenty-seven.
 *
 * The One Stop Shop lets a seller register in a single member state and account for VAT across the
 * whole bloc. A seller who doesn't know that will either register nowhere or try to register
 * everywhere, and both are worse.
 */
export const EU_OSS: Authority = {
 what: "One Stop Shop (OSS/IOSS)",
 authority: "European Commission",
 url: "https://vat-one-stop-shop.ec.europa.eu/index_en",
 note: "One registration covers VAT for all EU countries — you don't need one per country.",
};

const EU_MEMBERS = new Set([
 "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
 "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

/** US states with no state sales tax — there is nothing to register for, which is worth saying. */
export const NO_SALES_TAX_STATES: Record<string, string> = {
 DE: "Delaware has no sales tax.",
 MT: "Montana has no sales tax.",
 NH: "New Hampshire has no sales tax.",
 OR: "Oregon has no sales tax.",
 AK: "Alaska has no state sales tax, though some boroughs levy a local one.",
};

/** The states these stores realistically cross a threshold in first. */
export const US_STATE_AUTHORITIES: Record<string, Authority> = {
 NY: { what: "Sales tax certificate of authority", authority: "NY Dept of Taxation & Finance", url: "https://www.tax.ny.gov/bus/st/register.htm" },
 CA: { what: "Seller's permit", authority: "CDTFA", url: "https://www.cdtfa.ca.gov/services/permits-licenses.htm" },
 TX: { what: "Sales tax permit", authority: "Texas Comptroller", url: "https://comptroller.texas.gov/taxes/permit/" },
 FL: { what: "Sales tax registration", authority: "Florida Dept of Revenue", url: "https://floridarevenue.com/taxes/registration" },
 IL: { what: "Sales tax registration", authority: "Illinois Dept of Revenue", url: "https://tax.illinois.gov/research/taxinformation/sales/rot.html" },
 PA: { what: "Sales tax licence", authority: "PA Dept of Revenue", url: "https://mypath.pa.gov/" },
 NJ: { what: "Sales tax registration", authority: "NJ Division of Taxation", url: "https://www.nj.gov/treasury/taxation/register.shtml" },
 MA: { what: "Sales tax registration", authority: "MassTaxConnect", url: "https://www.mass.gov/how-to/register-your-business-with-masstaxconnect" },
 WA: { what: "Business licence", authority: "WA Dept of Revenue", url: "https://dor.wa.gov/open-business" },
 GA: { what: "Sales tax registration", authority: "Georgia Dept of Revenue", url: "https://dor.georgia.gov/taxes/business-taxes/sales-use-tax" },
 MD: { what: "Sales & use tax licence", authority: "Comptroller of Maryland", url: "https://www.marylandtaxes.gov/business/sales-use/index.php" },
 VA: { what: "Sales tax registration", authority: "Virginia Tax", url: "https://www.tax.virginia.gov/register-business-virginia" },
 CO: { what: "Sales tax licence", authority: "Colorado Dept of Revenue", url: "https://tax.colorado.gov/sales-tax-account-license" },
 AZ: { what: "Transaction privilege tax licence", authority: "Arizona Dept of Revenue", url: "https://azdor.gov/transaction-privilege-tax-tpt" },
};

/** Where to start for a US state we don't list — 24 states register through one system. */
export const US_FALLBACK: Authority = {
 what: "Sales tax registration",
 authority: "Streamlined Sales Tax",
 url: "https://www.streamlinedsalestax.org/for-businesses/registration",
 note: "One form covers 24 member states. For the rest, search that state's Department of Revenue.",
};

export type AuthorityAnswer =
 | { kind: "authority"; authority: Authority }
 | { kind: "none"; message: string };

/**
 * Where to go to register for one place.
 *
 * A US state with no sales tax gets an answer, not a link — "there is nothing to register for" is
 * the most useful thing we can say, and a link would imply otherwise.
 */
export function authorityFor(country: unknown, state?: unknown): AuthorityAnswer | null {
 const c = String(country ?? "").trim().toUpperCase();
 if (!/^[A-Z]{2}$/.test(c)) return null;

 if (c === "US") {
  const st = String(state ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(st)) return null; // US is per state; without one there's no answer to give
  const none = NO_SALES_TAX_STATES[st];
  if (none) return { kind: "none", message: none };
  return { kind: "authority", authority: US_STATE_AUTHORITIES[st] ?? US_FALLBACK };
 }

 const own = COUNTRY_AUTHORITIES[c];
 if (own) return { kind: "authority", authority: own };
 if (EU_MEMBERS.has(c)) return { kind: "authority", authority: EU_OSS };
 return null;
}
