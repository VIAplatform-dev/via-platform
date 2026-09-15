// When a store has to register for VAT or GST in its OWN country. Pure, no I/O.
//
// WHY THE PAGE NEEDS THIS. Sales tax settings offered a seller a registration form and said nothing
// about whether she needed one. A UK seller had no way to learn that a threshold exists, what it is,
// or that crossing it is her job and not ours. The honest fix is not advice: it is the number, whose
// number it is, and a link to the page that governs it.
//
// STATED AS FACT, WITH A DATE AND A SOURCE, because these change. A stale figure on a tax page is
// worse than no figure: a seller who reads £85,000 here and acts on it has been misled by us. The
// `asOf` is printed on screen so an out-of-date entry is visible rather than silently trusted, and
// the test below fails once one is more than a year old.
//
// NOT ADVICE, and the copy says so. What VYA can honestly do is point at the rule and get out of
// the way.

export type TaxThreshold = {
 /** What that country calls the tax. */
 tax: string;
 /** The registration threshold, formatted in that country's own money. */
 amount: string;
 /** Over what period it is measured. */
 period: string;
 /** The authority whose rule this is. */
 authority: string;
 /** Where it is written down. */
 url: string;
 /** When this entry was last checked, ISO. Printed, so staleness is visible. */
 asOf: string;
 /** The sentence a seller reads. Their own country only; abroad is a different question. */
 note: string;
};

const EU_NOTE =
 "EU thresholds are set country by country and several are zero, so a business established in the EU " +
 "is often expected to register from its first sale. Check your own country's.";

export const TAX_THRESHOLDS: Readonly<Record<string, TaxThreshold>> = {
 GB: {
  tax: "VAT",
  amount: "£90,000",
  period: "any rolling 12 months",
  authority: "HMRC",
  url: "https://www.gov.uk/register-for-vat",
  asOf: "2026-09-14",
  note: "Under it, registering is optional. Over it, you must register within 30 days of the month you crossed in.",
 },
 CA: {
  tax: "GST/HST",
  amount: "CAD $30,000",
  period: "a single quarter, or four consecutive quarters",
  authority: "the CRA",
  url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html",
  asOf: "2026-09-14",
  note: "Under it you are a small supplier and need not register. Over it you must, and you charge on the sale that took you over.",
 },
 AU: {
  tax: "GST",
  amount: "AUD $75,000",
  period: "any rolling 12 months",
  authority: "the ATO",
  url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst",
  asOf: "2026-09-14",
  note: "Under it, registering is optional. Over it you have 21 days to register.",
 },
};

/** The rule for a store established in this country, or null when we have no confirmed figure. */
export function thresholdFor(country: unknown): TaxThreshold | null {
 const c = String(country ?? "").trim().toUpperCase();
 if (!/^[A-Z]{2}$/.test(c)) return null;
 return TAX_THRESHOLDS[c] ?? null;
}

/** Whether a country is one whose threshold we can state, as opposed to one we would be guessing at. */
export function hasConfirmedThreshold(country: unknown): boolean {
 return thresholdFor(country) !== null;
}

const EU = new Set([
 "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT",
 "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

/** What to say to a store in a country we have not confirmed a figure for. Never a made-up number. */
export function unconfirmedNote(country: unknown): string {
 const c = String(country ?? "").trim().toUpperCase();
 if (EU.has(c)) return EU_NOTE;
 return "Most countries only require registration once you pass a turnover threshold. Your own country's tax authority sets it.";
}

/**
 * Whether shipping abroad changes anything, said honestly.
 *
 * WHOSE REGISTRATION IT IS, STATED. The seller is merchant of record on VYA: a checkout is a direct
 * charge on HER Stripe account (cart-intent) and the order is in her name. So a registration she
 * needs abroad is hers to make, and the page says so rather than leaving her to assume the platform
 * has it covered. Saying it does not by itself decide the legal question, which is why this points
 * at her accountant rather than pretending to settle it.
 *
 * THE INSTINCT IS RIGHT AND HAS ONE HOLE IN IT. A shop that ships internationally is not thereby
 * over its home threshold, and on VYA's default the buyer is the importer: they are billed duty and
 * import VAT at their own door, and the seller registers nothing. That covers almost every parcel a
 * vintage store sends.
 *
 * The hole is LOW-VALUE consignments. Several countries put the tax on the overseas seller below a
 * small figure rather than on the buyer at the border, and for a non-established seller there is no
 * threshold at all: the UK's line is £135, and the EU's is €150 under IOSS. A US shop posting a £90
 * scarf to London is inside it. Whether that lands on the shop or on VYA depends on whether VYA
 * counts as an online marketplace for those rules, which is a question for VYA's accountants and
 * not something a settings page should assert either way.
 */
export function internationalNote(): string {
 return "Shipping abroad doesn't put you over your own country's threshold, and on orders where the buyer pays duty they settle any import tax themselves. Low-value parcels are the exception: some countries tax the seller rather than the buyer below a small amount, with no threshold to sit under. Selling into another country is your registration to make, not VYA's, so have a word with your accountant before you sell much abroad.";
}
