// Pure size parsing/normalisation/sorting helpers — NO database or server imports, so they are safe
// to bundle into Client Components (ProductCard, FilteredProductGrid). Kept out of inventory.ts (which
// imports db.ts) so a client component never drags the server-only chain into the browser bundle.

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "One Size"];

export const SHOE_RE = /shoe|boot|heel|sneaker|flat|sandal|loafer|pump|mule|slipper|clog/i;

const EU_SHOE_TO_US: Record<string, string> = {
 "34": "4", "34.5": "4.5",
 "35": "5", "35.5": "5",
 "36": "5.5", "36.5": "6",
 "37": "6.5", "37.5": "7",
 "38": "7.5", "38.5": "8",
 "39": "8.5", "39.5": "9",
 "40": "9.5", "40.5": "10",
 "41": "10.5", "41.5": "11",
 "42": "11", "42.5": "11.5",
 "43": "12", "44": "13",
};

function fmtNum(n: number): string {
 return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * Convert a raw size string to a US size label, using category context to
 * distinguish shoe EU/UK sizes from clothing EU/UK sizes.
 * Returns null if no conversion applies (caller should display the raw/normalized value).
 */
export function convertSizeToUS(raw: string, categorySlug: string, title?: string, currency?: string): string | null {
 const s = raw.trim();
 const normalized = normalizeSize(s);
 // Detect footwear from the TITLE as well as the category — category inference misses
 // typo'd/one-word titles ("…LABOOTS"), and getting this wrong applies the CLOTHING scale
 // to a shoe (EU 36 → "US 4" instead of the shoe table's US 5.5).
 const isShoe = SHOE_RE.test(categorySlug) || (!!title && SHOE_RE.test(title));
 // The store's sizing region, inferred from its Shopify base currency — a UK shop's bare
 // shoe number is a UK size (women's US = UK + 2), so "3.5" → US 5.5, not raw "3.5".
 const region = currency === "GBP" ? "UK" : currency === "EUR" ? "EU" : "US";

 // European sizing — read the ACTUAL system off the original string. Italian,
 // French and German women's clothing use DIFFERENT US offsets, so collapsing
 // them all to one "EU − 32" formula is wrong (e.g. Italian houses like Gucci/
 // Prada label "IT 40", which is US 4, not US 8).
 //   Italian (IT):  US = IT − 36   (IT 38→2, 40→4, 42→6…)
 //   French (FR):   US = FR − 32   (FR 36→4, 38→6, 40→8…)
 //   German (DE):   US = DE − 30   (DE 34→4, 36→6, 38→8…)
 //   Generic "EU":  US = EU − 32   (defaults to the French scale)
 // Shoe sizes are unified across the European systems, so they share one table.
 const sysMatch = /^(IT|FR|DE|EU)\s*(\d+(?:\.\d+)?)$/i.exec(s);
 if (sysMatch) {
 const sys = sysMatch[1].toUpperCase();
 const num = sysMatch[2];
 if (isShoe) {
  const us = EU_SHOE_TO_US[num];
  return us ? `US ${us}` : null;
 }
 const offset = sys === "IT" ? 36 : sys === "DE" ? 30 : 32;
 const us = parseFloat(num) - offset;
 if (us >= 0 && us <= 24) return `US ${fmtNum(us)}`;
 return null;
 }

 // UK prefix (normalizeSize strips it, so check original)
 const ukMatch = /^UK\s*(\d+(?:\.\d+)?)$/i.exec(s);
 if (ukMatch) {
 const num = parseFloat(ukMatch[1]);
 if (isShoe) return `US ${fmtNum(num + 2)}`;
 const us = num - 4;
 if (us >= 0) return `US ${fmtNum(us)}`;
 return null;
 }

 // Bare numeric — infer from category
 if (/^\d+(?:\.\d+)?$/.test(normalized)) {
 const num = parseFloat(normalized);
 if (isShoe && num >= 34 && num <= 44) {
  const us = EU_SHOE_TO_US[normalized];
  return us ? `US ${us}` : null;
 }
 // A UK shop's small bare shoe number is a UK size (women's US = UK + 2).
 if (isShoe && region === "UK" && num >= 1 && num <= 12) {
  return `US ${fmtNum(num + 2)}`;
 }
 if (!isShoe && num >= 32 && num <= 52 && num % 2 === 0) {
  return `US ${num - 32}`;
 }
 }

 return null;
}

export function normalizeSize(raw: string): string {
 // Strip leading/trailing whitespace and trailing punctuation
 const s = raw.trim().replace(/[.,]+$/, "").trim();
 const l = s.toLowerCase();

 // Clothing word sizes
 if (/^x{2,}s$/i.test(s) || l === "extra small") return "XS";
 if (/^xs$/i.test(s)) return "XS";
 if (/^s$/i.test(s) || l === "small") return "S";
 if (/^m$/i.test(s) || l === "medium") return "M";
 if (/^l$/i.test(s) || l === "large") return "L";
 if (/^xl$/i.test(s) || l === "extra large") return "XL";
 if (/^(xxl|2xl)$/i.test(s)) return "XXL";
 if (/^(xxxl|3xl)$/i.test(s)) return "XXXL";
 if (/^(os|osfm|one\s*size)$/i.test(s)) return "One Size";

 // Range sizes — collapse to the smaller size
 if (/^(xs)[\/\-](s)$/i.test(s)) return "XS";
 if (/^(s)[\/\-](m)$/i.test(s)) return "S";
 if (/^(m)[\/\-](l)$/i.test(s)) return "M";
 if (/^(l)[\/\-](xl)$/i.test(s)) return "L";
 if (/^(xl)[\/\-](xxl)$/i.test(s)) return "XL";

 // EU / IT / FR / DE are all the same European scale — normalise to "EU XX"
 // e.g. "IT 40", "IT40", "EU 38.", "FR 42" → "EU 40", "EU 38", "EU 42"
 const euMatch = /^(IT|EU|FR|DE)\s*(\d+(?:\.\d+)?)$/i.exec(s);
 if (euMatch) return `EU ${euMatch[2]}`;

 // US/UK sizing: strip prefix, treat as plain number
 const usMatch = /^US\s*(\d+(?:\.\d+)?)$/i.exec(s);
 if (usMatch) return usMatch[1];

 const ukMatch = /^UK\s*(\d+(?:\.\d+)?)$/i.exec(s);
 if (ukMatch) return ukMatch[1];

 // Plain number (already stripped trailing period above)
 if (/^\d+(?:\.\d+)?$/.test(s)) return s;

 return s;
}

// The set of bare, prefix-stripped size tokens a product should match a filter
// on. A size can describe a RANGE of fits — a seller's "best fits US 2-4", a
// variant "S/M" — and such an item must surface under EVERY size in that range,
// not just an exact string match. Single sizes return one token (the same value
// the facet list is keyed on); ranges expand to every size they cover.
//   "US 2-4"  → ["2","4"]          "6-8" → ["6","8"]   (endpoints only — no 3, no 7)
//   "S/M"     → ["S","M"]          "8"   → ["8"]
const SIZE_LETTER_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
function bareSize(s: string): string {
 return s.trim().toUpperCase().replace(/^(US|UK|EU|IT|FR|DE)\s*/, "").trim();
}
export function expandSizeKeys(rawSize: string | null | undefined): string[] {
 if (!rawSize) return [];
 const core = bareSize(rawSize);
 const m = /^([A-Z0-9.]+)\s*(?:[-–—/]|to)\s*([A-Z0-9.]+)$/i.exec(core);
 if (m) {
 const [, a, b] = m;
 // Numeric range → the two ENDPOINTS only. A "2-4" fits a 2 and a 4, never a
 // 3 (women's clothing sizes are even; in-between numbers aren't real sizes).
 if (/^\d{1,2}(?:\.\d)?$/.test(a) && /^\d{1,2}(?:\.\d)?$/.test(b)) {
  return [...new Set([a.replace(/\.0$/, ""), b.replace(/\.0$/, "")])];
 }
 // Letter range → every size between the ends ("S-L" → S, M, L).
 const ai = SIZE_LETTER_ORDER.indexOf(a.toUpperCase());
 const bi = SIZE_LETTER_ORDER.indexOf(b.toUpperCase());
 if (ai !== -1 && bi !== -1 && bi >= ai) return SIZE_LETTER_ORDER.slice(ai, bi + 1);
 }
 // Single size — normalise the same way the facet keys are built.
 return [bareSize(normalizeSize(rawSize))];
}

export function sortSizes(sizes: string[]): string[] {
 return [...sizes].sort((a, b) => {
 const ai = SIZE_ORDER.indexOf(a);
 const bi = SIZE_ORDER.indexOf(b);
 if (ai !== -1 && bi !== -1) return ai - bi;
 if (ai !== -1) return -1;
 if (bi !== -1) return 1;
 const an = parseFloat(a.replace(/[^0-9.]/g, ""));
 const bn = parseFloat(b.replace(/[^0-9.]/g, ""));
 if (!isNaN(an) && !isNaN(bn)) return an - bn;
 return a.localeCompare(b);
 });
}
