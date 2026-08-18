// ───────────────────────────────────────────────────────────────────────────
// Data Layer — enrichment (pure functions, no DB / no imports beyond config types).
//
// These classify a listing's ERA and CONDITION from its text. They are the only
// "computed" pieces of the events foundation, so they're unit-tested. Guiding
// rule: NEVER guess. If the signal isn't clearly present, return null — a wrong
// era/condition would mislead a seller into a bad sourcing decision.
// ───────────────────────────────────────────────────────────────────────────

import type { EraBucket, Condition } from "./config";

// Map a concrete year to its era bucket slug (or null if no bucket covers it).
function yearToBucket(year: number, buckets: EraBucket[]): string | null {
 for (const b of buckets) if (year >= b.minYear && year <= b.maxYear) return b.slug;
 return null;
}

const DECADE_WORDS: Record<string, number> = {
 fifties: 1950, sixties: 1960, seventies: 1970, eighties: 1980,
 nineties: 1990,
};

/**
 * Infer the era of a listing from its title + description. Resolves, in order:
 *  1. an explicit 4-digit year (1900–2029),
 *  2. a decade token ("90s", "1990s", "'90s", "2000s", "00s", "2010s"),
 *  3. "Y2K",
 *  4. a decade word ("nineties").
 * Returns the matching bucket slug, or null when there's no confident signal.
 * Bare "vintage"/"retro" is intentionally NOT enough — too vague to classify.
 */
export function inferEra(text: string | null | undefined, buckets: EraBucket[]): string | null {
 if (!text) return null;
 const t = text.toLowerCase();

 // 1. Explicit 4-digit year, bounded to plausible fashion years.
 const yearMatch = t.match(/\b(19\d{2}|20[0-2]\d)\b/);
 if (yearMatch) {
 const y = parseInt(yearMatch[1], 10);
 if (y >= 1900 && y <= 2029) {
  const slug = yearToBucket(y, buckets);
  if (slug) return slug;
 }
 }

 // 2. Decade token. Optional century prefix + 2-digit decade + "s".
 //    "90s"→1990, "1990s"→1990, "2000s"/"00s"→2000, "2010s"/"10s"→2010.
 //    "20s" is ambiguous (1920s vs 2020s) → skip rather than guess.
 const dec = t.match(/(?:^|[^0-9a-z])'?((?:19|20)?\d0)s\b/);
 if (dec) {
 let d = parseInt(dec[1], 10);
 if (d < 100) {
  // 2-digit decade: 00/10 → 2000s/2010s; 30–90 → 1900s; 20 is ambiguous.
  if (d === 20) d = -1;
  else if (d <= 10) d = 2000 + d;
  else d = 1900 + d;
 }
 if (d > 0) {
  const slug = yearToBucket(d, buckets);
  if (slug) return slug;
 }
 }

 // 3. Y2K.
 if (/\by2k\b/.test(t)) {
 const slug = yearToBucket(2000, buckets);
 if (slug) return slug;
 }

 // 4. Decade words.
 for (const [word, year] of Object.entries(DECADE_WORDS)) {
 if (t.includes(word)) {
  const slug = yearToBucket(year, buckets);
  if (slug) return slug;
 }
 }

 return null;
}

// Condition phrase sets, checked best→worst. First confident match wins. Order
// matters: "very good" must be checked before "good" (substring).
const CONDITION_PATTERNS: { label: Condition; re: RegExp }[] = [
 { label: "Deadstock/NWT", re: /\bdeadstock\b|\bnwt\b|\bbnwt\b|new with tags?|brand[- ]new|\bunworn\b|never (?:been )?worn/ },
 { label: "Excellent", re: /excellent(?:[\w\s]{0,16})?condition|\bmint\b|mint condition|like[- ]new|pristine|immaculate|flawless/ },
 { label: "Very Good", re: /very good(?:[\w\s]{0,16})?condition|\bvgc\b|great condition|barely worn|hardly worn/ },
 { label: "Good", re: /good condition|gently (?:used|worn)|minor wear|light wear|minimal wear|well[- ]maintained/ },
 { label: "Fair", re: /fair condition|well[- ]loved|heavily worn|visible wear|noticeable wear|some (?:flaws|damage|staining|stains|wear)|\bas[- ]is\b/ },
];

/**
 * Infer condition from a listing description — but ONLY when the seller states
 * it clearly. Returns null otherwise (never a guess). Style words like
 * "distressed" are deliberately excluded (they describe a look, not condition).
 */
export function inferCondition(text: string | null | undefined): Condition | null {
 if (!text) return null;
 const t = text.toLowerCase();
 for (const { label, re } of CONDITION_PATTERNS) if (re.test(t)) return label;
 return null;
}

/**
 * Resolve a canonical products.id from the inconsistent product keys used across
 * event tables: a composite "store-slug-123" (views/clicks), a bare integer
 * (favorites), or "unknown". Returns the integer id, or null if unresolvable.
 */
export function parseProductId(key: string | number | null | undefined): number | null {
 if (key == null) return null;
 if (typeof key === "number") return Number.isInteger(key) && key > 0 ? key : null;
 const s = key.trim();
 if (/^\d+$/.test(s)) return parseInt(s, 10);
 const m = s.match(/-(\d+)$/); // trailing id after the (possibly hyphenated) slug
 return m ? parseInt(m[1], 10) : null;
}
