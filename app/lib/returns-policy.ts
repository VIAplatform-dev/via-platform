// ONE returns policy, not two.
//
// WHAT WENT WRONG. A store's returns policy was written in two unrelated places and stored in two
// unrelated records: the rules screen kept a paragraph in `store_policies.policy_text`, and the
// Policies page kept one in `store_profiles.policies.returns`. Neither knew about the other. A
// seller could write "returns within 14 days, unworn" on one screen and "all sales final" on the
// other, both saved, both shown somewhere, and nothing in the product could say which one a buyer
// was owed.
//
// THE RULE NOW. `store_profiles.policies.returns` is the record. It is the page buyers actually
// read, it sits beside shipping, privacy and terms, and every storefront already links to it. The
// old column is legacy: still read as a fallback so no store loses the words it wrote, never
// written to again.
//
// A STORE'S POLICY IS THE STORE'S. Nothing here rewrites, normalises or summarises what a seller
// wrote — the merge picks WHICH of two records to read, and never edits either one's content. The
// only text VYA ever generates is the one-line summary beside the rules (policySummary), which is
// built from the numbers and has never been the seller's prose.
//
// Pure — no database. store-policy-db does the reading.

/**
 * The store's returns text, from the record that holds it.
 *
 * The canonical field wins WHENEVER IT HAS ANYTHING IN IT, including text a store has deliberately
 * shortened. Falling back per-field would resurrect a paragraph she had cut down, which is the same
 * as editing her policy for her.
 */
export function resolveReturnsText(canonical: string | null | undefined, legacy: string | null | undefined): string {
  const now = String(canonical ?? "").trim();
  if (now) return now;
  return String(legacy ?? "").trim();
}

/**
 * Does this store still have its words only in the old place?
 *
 * True means a save should carry them across rather than start from an empty box — the seller opens
 * the Policies page and finds what she wrote on the other screen, instead of a blank she assumes
 * means nothing was ever saved.
 */
export function hasLegacyOnly(canonical: string | null | undefined, legacy: string | null | undefined): boolean {
  return !String(canonical ?? "").trim() && !!String(legacy ?? "").trim();
}
