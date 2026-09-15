// When she corrects the brand, everything the old one touched is now wrong.
//
// MIRRORED at mobile/lib/seller/brand-change.ts: the phone runs the same correction on the
// same fields. Kept identical below this header.
//
// THE FAILURE THIS EXISTS TO STOP. A Roberto Cavalli bustier was drafted as Dolce & Gabbana. The
// seller spots it and fixes the Brand field, which is the one place she was looking. The title
// still reads "Dolce & Gabbana leopard bustier". The description still opens "This Dolce & Gabbana
// piece…". The price was worked out against Dolce & Gabbana comps.
//
// So the listing goes live naming one house in the brand field and a different one in the words
// underneath it. To a shopper that does not read as a typo.
//
// IT REWRITES WITHOUT BEING ASKED, and that is the point. The first version put the correction
// behind a confirm panel (here is what still says the old name, shall I fix it?), which is a
// question with one answer, asked at the moment she has already told us the answer. The brand she
// just typed IS the decision; a field still carrying the old name is stale by definition. What is
// never touched is a field that did not name the brand at all: the patch only covers what matched.

export type BrandFields = {
  title?: string | null;
  description?: string | null;
  conditionNote?: string | null;
};

/** Which fields still name the brand she just corrected. */
export type StaleMentions = {
  fields: (keyof BrandFields)[];
  /** The old brand, as it should be shown to her. */
  from: string;
  to: string;
};

/**
 * A brand can be written several ways and a seller only ever types one of them.
 *
 * "Dolce & Gabbana", "Dolce and Gabbana", "Dolce&Gabbana", "D&G", "dolce gabbana". A plain
 * indexOf on the canonical spelling finds the first and misses the rest, which is the difference
 * between catching a stale mention and shipping one.
 */
function brandPattern(brand: string): RegExp | null {
  const cleaned = brand.trim();
  if (cleaned.length < 2) return null;
  // Split on anything that isn't a letter or digit, so "&", "and", spaces and punctuation all
  // become "whatever sits between these words".
  const words = cleaned.split(/[^A-Za-z0-9]+/).filter((w) => w && w.toLowerCase() !== "and");
  if (!words.length) return null;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // Between the words: optional space, ampersand, "and", hyphen, full stop. One or none.
  const glue = "(?:\\s*(?:&|and|\\+|-|\\.)?\\s*)";
  return new RegExp(`\\b${escaped.join(glue)}\\b`, "gi");
}

/** Does this text still name the old brand? */
export function mentionsBrand(text: string | null | undefined, brand: string): boolean {
  const re = brandPattern(brand);
  if (!re || !text) return false;
  return re.test(String(text));
}

/**
 * What still says the old brand, after she has corrected it.
 *
 * Returns null when there is nothing to fix, which is the common case: most corrections happen
 * before the AI has written anything.
 */
export function staleBrandMentions(
  from: string | null | undefined,
  to: string | null | undefined,
  fields: BrandFields,
): StaleMentions | null {
  const oldBrand = String(from ?? "").trim();
  const newBrand = String(to ?? "").trim();
  if (!oldBrand || !newBrand) return null;
  // Renaming "Dior" to "Christian Dior" is a refinement, not a correction: the words underneath
  // are not wrong, and offering to rewrite them would be noise.
  if (oldBrand.toLowerCase() === newBrand.toLowerCase()) return null;
  if (newBrand.toLowerCase().includes(oldBrand.toLowerCase())) return null;

  const hit = (["title", "description", "conditionNote"] as const).filter((k) => mentionsBrand(fields[k], oldBrand));
  return hit.length ? { fields: [...hit], from: oldBrand, to: newBrand } : null;
}

/** The old name swapped for the new one, everywhere it appears in one field. */
export function rewriteBrand(text: string | null | undefined, from: string, to: string): string {
  const re = brandPattern(from);
  if (!re || !text) return String(text ?? "");
  return String(text).replace(re, to);
}

/**
 * Every stale field corrected, and ONLY those fields.
 *
 * A patch rather than a whole record: the caller spreads it over its own state, so a field this
 * never looked at cannot be flattened to undefined on the way through, and the return type does
 * not have to agree with whatever shape the screen is holding.
 */
export function applyBrandCorrection(fields: BrandFields, stale: StaleMentions): Partial<Record<keyof BrandFields, string>> {
  const out: Partial<Record<keyof BrandFields, string>> = {};
  for (const k of stale.fields) out[k] = rewriteBrand(fields[k], stale.from, stale.to);
  return out;
}

/**
 * What to tell her, naming the fields rather than counting them.
 *
 * "2 fields still say Dolce & Gabbana" makes her hunt for which two. The point of the sentence is
 * that she should not have to look.
 */
export function describeStale(stale: StaleMentions): string {
  const NAMES: Record<keyof BrandFields, string> = {
    title: "the title",
    description: "the description",
    conditionNote: "the condition note",
  };
  const names = stale.fields.map((f) => NAMES[f]);
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} still ${stale.fields.length === 1 ? "says" : "say"} ${stale.from}.`;
}

/**
 * Was the price worked out against the wrong brand?
 *
 * Only when the AI set it. A price she typed is hers, and re-pricing it because the brand moved
 * would overwrite a decision she made deliberately. `compsCount` is the tell: it is only ever set
 * by a pricing run.
 */
export function priceIsStale(args: { compsCount: number | null | undefined; priceTypedByHer: boolean }): boolean {
  return !args.priceTypedByHer && (args.compsCount ?? 0) > 0;
}

/**
 * Does the price need working out again?
 *
 * THE CASE. A shirt goes up with no brand on it, the pricer finds nothing to compare it to and
 * lands on $20. Then she types Dior. The words are fixed by the correction above, and the number
 * is still the number we got for a shirt we thought was nobody's. It is not slightly wrong, it is
 * wrong by a factor, and it is the one field on the screen that costs her money to leave alone.
 *
 * FOUR CONDITIONS, because re-running the pricer is a real call that takes real seconds:
 *   · the brand actually changed, not just lost focus;
 *   · there are photographs, because the pricer reads them;
 *   · a pricing run produced the number on screen (comps is the tell: nothing else sets it);
 *   · she did not type it. A price she typed is a decision, and overruling it is not our place.
 */
export function shouldReprice(args: {
  brandChanged: boolean;
  hasPhotos: boolean;
  compsCount: number | null | undefined;
  priceTypedByHer: boolean;
}): boolean {
  return args.brandChanged && args.hasPhotos && priceIsStale(args);
}

/**
 * What to say afterwards, in one line under the price.
 *
 * Both outcomes are worth saying. A number that moved needs to show what it moved FROM, or she is
 * left wondering whether she mistyped something. A number that did not move needs saying too:
 * she watched it check, and silence reads as a failure.
 *
 * Money arrives formatted, because the store's currency is the screen's business, not this file's.
 */
export function describeReprice(brand: string, from: string | null, to: string): string {
  const house = brand.trim() || "the new brand";
  if (!from || from === to) return `Checked against ${house} sales: ${to} still looks right.`;
  return `Repriced for ${house}: ${from} to ${to}.`;
}
