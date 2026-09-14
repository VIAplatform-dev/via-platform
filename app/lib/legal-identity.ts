// A store's legal identity, and the two places it is actually owed. Pure.
//
// Settings → Store details collects a legal name, a company number and a VAT number, and tells the
// seller they are "used on receipts, invoices and customs forms". They were used on none of them:
// the only code that touched companyNumber or vatNumber was the route that saved them. A seller
// typed her VAT number because we said it would appear on her invoices, and it went into a column.
//
// That is worse than an unused field. A VAT number missing from a customs declaration is a parcel
// held at a border, and we implied we were handling it.
//
// WHAT GOES WHERE, and why they differ:
//   · A RECEIPT is a document from a business to its customer. The legal name, company number and
//     VAT number belong at the foot of it, as they do on every other invoice anyone receives.
//   · A CUSTOMS FORM is a declaration to a government. It takes a TAX identifier — and a company
//     registration number is not one. Sending a Companies House number in a tax_id field is not a
//     near-miss, it is a wrong answer on a legal document, so only the VAT number travels there.

export type LegalIdentity = {
  legalName?: string | null;
  companyNumber?: string | null;
  vatNumber?: string | null;
};

const clean = (v: string | null | undefined): string => String(v ?? "").trim();

/**
 * Who signs the customs declaration.
 *
 * The registered business where there is one, the shop's trading name otherwise. A declaration is
 * a legal statement, so the name on it should be the name that can be held to it.
 */
export function customsSigner(identity: LegalIdentity, fallbackName: string): string {
  return (clean(identity.legalName) || clean(fallbackName) || "Seller").slice(0, 80);
}

/**
 * The exporter's tax identifier for a customs declaration, or null.
 *
 * VAT only, deliberately — see the note above about company numbers. Spaces are stripped because
 * carriers reject "GB 123 4567 89" while accepting the same number closed up.
 */
export function customsTaxId(identity: LegalIdentity): { number: string; type: "VAT" } | null {
  const vat = clean(identity.vatNumber).replace(/\s+/g, "").toUpperCase();
  if (vat.length < 4) return null;
  return { number: vat.slice(0, 40), type: "VAT" };
}

/**
 * The line at the foot of a receipt — "Blummier Ltd · Company 09123456 · VAT GB123456789".
 *
 * Empty when the store has filled none of it in, so nothing prints a lonely separator or the word
 * "undefined" on a customer's receipt. The trading name is not repeated when it IS the legal name.
 */
export function receiptLegalLine(identity: LegalIdentity, storeName?: string | null): string {
  const parts: string[] = [];
  const legal = clean(identity.legalName);
  if (legal && legal.toLowerCase() !== clean(storeName).toLowerCase()) parts.push(legal);
  const company = clean(identity.companyNumber);
  if (company) parts.push(`Company ${company}`);
  const vat = clean(identity.vatNumber);
  if (vat) parts.push(`VAT ${vat}`);
  return parts.join(" · ");
}
