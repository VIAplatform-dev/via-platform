// Size parsing, split out of shopifyClient.ts.
//
// These are pure string helpers with no I/O, but they used to live beside the Shopify API client —
// which imports safe-url, which imports node:dns. That dragged `dns/promises` into the browser
// bundle through inventory.ts -> loadStoreProducts.ts -> YouMightLikeClient.tsx and broke the build.
// Same pure/IO split as metrics.ts vs market-metrics-db.ts.

const SIZE_VALUE_PATTERN = `(?:US|UK|EU|IT)?\\s*\\d[\\d.]*|XS|S|M|L|XL|XXL|2XL|3XL|XXXL|OS|OSFM|One\\s+Size`;
// Matches sizes that are ONLY generic clothing letters (not numeric, not EU/UK etc.)
export const GENERIC_CLOTHING_SIZE = /^(XS|S|M|L|XL|XXL|2XL|3XL|XXXL|OS|OSFM|One\s+Size)$/i;
// Full-string size validator — used to reject color/other values stored as size
const SIZE_VALUE_REGEX = new RegExp(`^(${SIZE_VALUE_PATTERN})$`, "i");
// Exported so other modules can validate DB-stored sizes (e.g. reject "Gold", "Black")
export function isValidSizeValue(val: string): boolean {
 return SIZE_VALUE_REGEX.test(val.trim());
}

/**
 * Normalizes compound size values from Shopify variant options.
 * e.g. "EU: 37 / UK: 4" → "EU 37"
 * "EU 37 / UK 4" → "EU 37"
 * "EU: 37" → "EU 37"
 * "M" → "M"
 * Returns null if no recognizable size can be extracted.
 */
export function normalizeCompoundSize(val: string): string | null {
 if (!val || val === "Default Title") return null;
 // Take the first component of compound sizes like "EU: 37 / UK: 4"
 const firstPart = val.split(/\s*\/\s*/)[0].trim();
 // Remove colon between size prefix and number: "EU: 37" → "EU 37"
 const normalized = firstPart.replace(/^(EU|UK|US|IT|FR|DE)\s*:\s*/i, (_, prefix: string) => prefix.toUpperCase() + " ").trim();
 if (SIZE_VALUE_REGEX.test(normalized)) return normalized;
 if (SIZE_VALUE_REGEX.test(firstPart)) return firstPart;
 if (SIZE_VALUE_REGEX.test(val.trim())) return val.trim();
 return null;
}

/**
 * Extracts a size from a product title as a fallback when no variant size option exists.
 * Matches patterns like "Size M", "Size 38", "/ Size 9.5", "- Size US 8", "(Size L)"
 * Also matches bare trailing numbers common in vintage listings: "Dior Heels 35", "Gucci Slides 40.5"
 */
export function extractSizeFromTitle(title: string): string | null {
 const parenMatch = /\(\s*(?:size|sz)\s*:?\s*([^)]+)\)/i.exec(title);
 if (parenMatch) return parenMatch[1].trim();

 // Match bare size in parentheses: "(S)", "(M)", "(38)", "(EU 38)"
 const bareParenRe = new RegExp(`\\(\\s*(${SIZE_VALUE_PATTERN})\\s*\\)`, "i");
 const bareParenMatch = bareParenRe.exec(title);
 if (bareParenMatch && SIZE_VALUE_REGEX.test(bareParenMatch[1].trim())) return bareParenMatch[1].trim();

 const re = new RegExp(`(?:[-–—|\\/,]\\s*|\\s+)(?:size|sz)\\s*:?\\s*(${SIZE_VALUE_PATTERN})`, "i");
 const sepMatch = re.exec(title);
 if (sepMatch) return sepMatch[1].trim();

 // Match size letter(s) after separator at end of title (no "size" keyword).
 // Catches "Dress – XS-S", "Top – S/M", "Blouse - XS" etc.
 const LETTER_SIZE = `XS|XXL|XL|X|S|M|L`;
 const trailingSizeSepRe = new RegExp(
 `[-\u2013\u2014\\/|,]\\s*((?:${LETTER_SIZE})(?:[\\/-](?:${LETTER_SIZE}))?)\\s*$`,
 "i"
 );
 const trailingSizeSepMatch = trailingSizeSepRe.exec(title);
 if (trailingSizeSepMatch) return trailingSizeSepMatch[1].trim().toUpperCase();

 // Match a bare size at the very end of the title (no "size" keyword needed).
 // Handles "Dior Heels 35", "Jimmy Choo Pumps 40.5", "Loafers EU 38".
 // Capped at 50 to exclude years (2024, 2025) and other large numbers.
 const trailingRe = new RegExp(`\\s((?:US|UK|EU|IT)\\s*\\d[\\d.]*|\\d{1,2}(?:\\.\\d)?)$`);
 const trailingMatch = trailingRe.exec(title);
 if (trailingMatch) {
 const val = trailingMatch[1].trim();
 const num = parseFloat(val.replace(/[^\d.]/g, ""));
 if (SIZE_VALUE_REGEX.test(val) && num >= 1 && num <= 50) return val;
 }

 return null;
}

// Map full word sizes to abbreviations
const WORD_SIZE_MAP: Record<string, string> = {
 "extra small": "XS",
 "extrasmall": "XS",
 "small": "S",
 "medium": "M",
 "large": "L",
 "extra large": "XL",
 "extralarge": "XL",
 "x-large": "XL",
 "xlarge": "XL",
 "xx-large": "XXL",
 "xxlarge": "XXL",
 "xxl": "XXL",
 "one size": "One Size",
 "onesize": "One Size",
};

/**
 * Extracts an explicit US fit size the seller calls out as how the item actually
 * wears, e.g. "runs true to a 6", "true to size 6", "fits like a 6",
 * "best fits a 6.5", "best fits US 2-4". This is the seller's real-world fit
 * guidance and is treated as the most authoritative DISPLAY size — it beats a
 * marked EU tag size because it tells a US buyer what to actually order.
 *
 * Handles ranges ("US 2-4", "2 to 4"). An explicit "US" lets it match without an
 * "a"/"size" filler word; without "US" it still requires "a"/"size" so it won't
 * grab measurements like "fits 40 inch". Requires a number (bare "true to size"
 * doesn't match) and ignores years/large numbers. Returns "US N", "US N-M", or null.
 */
export function extractFitSizeFromDescription(description: string | null): string | null {
 if (!description) return null;
 const text = description.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ");
 // Captures a number and an optional second number (range), guarded against
 // being part of a longer number (years, measurements).
 const RANGE = `(\\d{1,2}(?:\\.\\d)?)(?:\\s*(?:[-–—/]|to)\\s*(\\d{1,2}(?:\\.\\d)?))?(?!\\d)`;
 const patterns = [
 // "(runs) true to (a/size)? (us)? N(-M)?"
 new RegExp(`\\btrue\\s+to\\s+(?:(?:a|size)\\s+)*(?:us\\s*)?${RANGE}`, "i"),
 // "(best) fits/runs/wears (like)? (a/size)? US N(-M)?" — explicit US, filler optional
 new RegExp(`\\b(?:best\\s+)?(?:fits?|runs?|wears?)\\s+(?:best\\s+)?(?:like\\s+)?(?:a\\s+|size\\s+)?us\\s*${RANGE}`, "i"),
 // "(best) fits/runs/wears like a N(-M)?"
 new RegExp(`\\b(?:fits?|runs?|wears?)\\s+(?:best\\s+)?like\\s+a\\s+(?:us\\s*)?${RANGE}`, "i"),
 // "(best) fits/runs/wears a/size N(-M)?" — require a/size (1 or 2) when there's no "US"
 new RegExp(`\\b(?:best\\s+)?(?:fits?|runs?|wears?)\\s+(?:like\\s+)?(?:(?:a|size)\\s+){1,2}(?:us\\s*)?${RANGE}`, "i"),
 ];
 const valid = (s: string) => { const n = parseFloat(s); return n >= 1 && n <= 49; };
 for (const re of patterns) {
 const m = re.exec(text);
 if (m && valid(m[1])) {
 if (m[2] != null && valid(m[2])) return `US ${m[1]}-${m[2]}`;
 return `US ${m[1]}`;
 }
 }
 return null;
}

/**
 * Extracts an explicit US size the seller listed in a size-conversion table, e.g.
 * "UK 10 / EU 40 / US 6". The seller's own US number is authoritative for a US buyer
 * and beats formula-converting the EU/UK tag — the generic "EU − 32" rule would turn
 * this designer's EU 40 into US 8, but she states US 6. Only trusted when a UK/EU/IT/
 * FR/DE size sits alongside it, so stray text like "ships from US in 2 days" can't match.
 */
export function extractUSConversionFromDescription(description: string | null): string | null {
 if (!description) return null;
 const text = description.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ");
 const hasUkEu = /\b(?:UK|EU|IT|FR|DE)\s*\d{1,2}\b/i.test(text);
 if (!hasUkEu) return null;
 const m = /\bUS\s*(\d{1,2}(?:\.5)?)\b/i.exec(text);
 if (!m) return null;
 const n = parseFloat(m[1]);
 if (n < 0 || n > 24) return null;
 return `US ${m[1]}`;
}

/**
 * Extracts a LETTER fit the seller explicitly states — "Best Fit M - XL",
 * "fits like a large", "Fit: M-L", "best fits medium to large". Returns a single
 * letter ("L") or a range ("M-XL"), normalized + uppercased. Like the numeric
 * fit note this is the seller's own fit guidance, so it must beat a marked
 * numeric/IT tag (which would otherwise be CONVERTED to a US number the seller
 * never stated, e.g. IT 54 → "US 18"). Conservative on purpose — only clear
 * "best fit / fits like a / fit:" phrasings — so we never guess a size.
 */
export function extractFitLetterFromDescription(description: string | null): string | null {
 if (!description) return null;
 const text = description.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ");
 // Longest tokens first so "medium" wins over "m", "large" over "l", etc.
 const TOK = `extra\\s+small|extra\\s+large|x-?large|xx-?large|small|medium|large|xxxl|xxl|xl|xs|s|m|l`;
 // (?![a-z]) after each token stops a bare letter matching the START of a word —
 // e.g. "Fit: Labeled IT" must not read the "L" of "Labeled" as size Large.
 const re = new RegExp(
 `\\b(?:best\\s+fits?|fits?\\s+like\\s+a|fit\\s*:)\\s+(?:a\\s+|size\\s+)?(${TOK})(?![a-z])(?:\\s*(?:[-\\u2013\\u2014/]|to)\\s*(${TOK})(?![a-z]))?`,
 "i",
 );
 const m = re.exec(text);
 if (!m) return null;
 const norm = (s: string): string | null => {
 const word = s.toLowerCase().replace(/\s+/g, " ").trim();
 if (WORD_SIZE_MAP[word] || WORD_SIZE_MAP[word.replace(/-/g, "")]) return WORD_SIZE_MAP[word] ?? WORD_SIZE_MAP[word.replace(/-/g, "")];
 const up = s.toUpperCase().replace(/[\s-]+/g, "");
 return /^(XS|S|M|L|XL|XXL|XXXL)$/.test(up) ? up : null;
 };
 const a = norm(m[1]);
 if (!a) return null;
 const b = m[2] ? norm(m[2]) : null;
 return b && b !== a ? `${a}-${b}` : a;
}

/**
 * Extracts size using ONLY authoritative label keywords: "tagged size", "labeled size",
 * "marked size", "label". Used as the top-priority source so "Tagged size: XS" always
 * beats "Size: Large [store bucket]" that appears earlier in the description.
 */
export function extractTaggedSizeFromDescription(description: string | null): string | null {
 if (!description) return null;
 const text = description.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ");
 const STRICT = `tagged\\s+size|labeled\\s+size|marked\\s+size|label(?:\\s+size)?`;

 // EU/IT/FR/DE prefix: "Tagged size: EU 37"
 const euRe = new RegExp(`(?:${STRICT})\\s*:?\\s*((?:EU|IT|FR|DE)\\s*:?\\s*\\d[\\d.]*)`, "i");
 const euM = euRe.exec(text);
 if (euM) return euM[1].trim().replace(/:\s*/, " ").replace(/\s+/, " ");

 // Parenthetical abbreviation: "Label: Medium (M)" → "M"
 const parenRe = new RegExp(`(?:${STRICT})\\s*:?[^(\\n]*?\\(\\s*(${SIZE_VALUE_PATTERN})\\s*\\)`, "i");
 const parenM = parenRe.exec(text);
 if (parenM) return parenM[1].trim();

 // Abbreviated size: "Tagged size: XS"
 const abbrRe = new RegExp(`(?:${STRICT})\\s*:?\\s*(${SIZE_VALUE_PATTERN})`, "i");
 const abbrM = abbrRe.exec(text);
 if (abbrM) return abbrM[1].trim();

 // Full word size: "Tagged size: Medium"
 const wordRe = new RegExp(
 `(?:${STRICT})\\s*:?\\s*(extra\\s+small|extra\\s+large|x-?large|xx-?large|small|medium|large)(?:\\s|$|[^a-z])`,
 "i"
 );
 const wordM = wordRe.exec(text);
 if (wordM) {
 const key = wordM[1].toLowerCase().replace(/\s+/g, " ").trim();
 return WORD_SIZE_MAP[key.replace(/-/g, "")] ?? WORD_SIZE_MAP[key] ?? wordM[1];
 }

 return null;
}

/**
 * Extracts a size from product description HTML using all available heuristics.
 * For highest-priority extraction (tagged/labeled/marked keywords), use
 * extractTaggedSizeFromDescription instead — it won't be fooled by an earlier
 * "Size: Large [store bucket]" before "Tagged size: XS [actual tag]".
 */
export function extractSizeFromDescription(description: string | null): string | null {
 if (!description) return null;
 const text = description.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ");

 const STRICT_KW = `tagged\\s+size|labeled\\s+size|marked\\s+size|label(?:\\s+size)?`;

 // 0. EU/IT/FR/DE prefixed size after any label keyword (strict or bare "size:")
 const euLabelRe = new RegExp(
 `(?:(?:${STRICT_KW})\\s*:?|size\\s*:)\\s*((?:EU|IT|FR|DE)\\s*:?\\s*\\d[\\d.]*)`,
 "i"
 );
 const euLabelMatch = euLabelRe.exec(text);
 if (euLabelMatch) return euLabelMatch[1].trim().replace(/:\s*/, " ").replace(/\s+/, " ");

 // 1. Parenthetical abbreviation after any label keyword or "size:"
 const parenKw = `${STRICT_KW}|size`;
 const parenRe = new RegExp(
 `(?:${parenKw})\\s*:?[^(\\n]*?\\(\\s*(${SIZE_VALUE_PATTERN})\\s*\\)`,
 "i"
 );
 const parenMatch = parenRe.exec(text);
 if (parenMatch) return parenMatch[1].trim();

 // 2. Full word size — requires colon after bare "size" to avoid freeform matches
 // ("size large" in narrative text, "I'd recommend size large" etc.)
 const wordRe = new RegExp(
 `(?:(?:${STRICT_KW})\\s*:?|size\\s*:)\\s*(extra\\s+small|extra\\s+large|x-?large|xx-?large|small|medium|large)(?:\\s|$|[^a-z])`,
 "i"
 );
 const wordMatch = wordRe.exec(text);
 if (wordMatch) {
 const key = wordMatch[1].toLowerCase().replace(/\s+/g, " ").trim();
 return WORD_SIZE_MAP[key.replace(/-/g, "")] ?? WORD_SIZE_MAP[key] ?? wordMatch[1];
 }

 // 3. Abbreviated size after strict label or "size:" (with colon). The trailing
 // (?![a-z]) stops a letter size matching the FIRST letter of a word — e.g.
 // "Size: Marked 36" must not return "M" (the M of "Marked"); it falls through
 // so the real "36" is found from the title/elsewhere.
 const re = new RegExp(
 `(?:(?:${STRICT_KW})\\s*:?|size\\s*:)\\s*(${SIZE_VALUE_PATTERN})(?![a-z])`,
 "i"
 );
 const match = re.exec(text);
 if (match) return match[1].trim();

 // 3b. "Size 39." / "Size 38.5" — bare "size" + space + numeric (no colon needed; low false-positive)
 const bareNumericRe = /\bsize\s+((?:US|UK|EU|IT)?\s*\d[\d.]*)\.?(?:\s|$)/i;
 const bareNumericMatch = bareNumericRe.exec(text);
 if (bareNumericMatch) return bareNumericMatch[1].trim();

 // 3c. "Size XS," / "Size M." — bare "size" + space + letter abbreviation (no colon)
 const bareLetterRe = new RegExp(`\\bsize\\s+(${SIZE_VALUE_PATTERN})(?:[,.]|\\s|$)`, "i");
 const bareLetterMatch = bareLetterRe.exec(text);
 if (bareLetterMatch) return bareLetterMatch[1].trim();

 // 4. Standalone EU/IT/FR/DE size anywhere in description (e.g. "• EU 39" as a bullet point)
 const euStandaloneRe = /\b((?:EU|IT|FR|DE)\s*\d[\d.]*)\b/i;
 const euStandaloneMatch = euStandaloneRe.exec(text);
 if (euStandaloneMatch) return euStandaloneMatch[1].trim();

 // 5. Fallback: "fits XS", "best fits M" — (?![a-z]) so "fits Marked"/"fits like"
 // can't match the leading letter of the next word.
 const fitsRe = new RegExp(`(?:best\\s+)?fits?\\s+(${SIZE_VALUE_PATTERN})(?![a-z])`, "i");
 const fitsMatch = fitsRe.exec(text);
 if (fitsMatch) return fitsMatch[1].trim();

 return null;
}
