// Cleaning a seller's listing title into something a marketplace can actually match.
//
// A listing title is written for a shopper browsing THIS store. It carries things that are useful
// there and actively harmful in a search engine:
//
//   "Kontatto 2000s Black Crinkle Pleated Halter Mini Dress - S/M"
//   "To Us Vintage Orange and red flamenco dress with bias cut - sku TUV #62314"
//   "Emilio Pucci Pink blue and green silk shirt TUV #265468"
//
// The SKU is an internal reference no marketplace has ever seen. The store's own name is the
// seller, not the maker. Both were being sent to Google verbatim — real searches from comp_cache,
// including `to us vintage stuart weiztman brown heels sku tuv 7896`. A query carrying two tokens
// nothing can match returns loosely-related results across every price point, which is how a $265
// dress was priced from a pool whose median was $36.
//
// `compactQuery` in comps.ts already does related work, but only on the eBay-sold path; the Google
// Shopping and Lens paths get the raw title. This is the shared pre-step for all of them.

/**
 * Internal reference codes. Deliberately anchored to a token boundary and to the shapes actually
 * seen in the data — `sku tuv #62314`, `TUV #17`, `#512345`, `sku 987689` — rather than "any number",
 * because real identifying numbers must survive: a year (1998), a model (Chanel 2.55), a size (W26),
 * and a measurement all carry meaning a marketplace can match on.
 */
const SKU_PATTERNS: RegExp[] = [
 /\bsku\s*[:#-]?\s*[a-z]{0,4}\s*#?\s*\d{2,}\b/gi, // "sku TUV #62314", "sku 987689", "SKU: 17"
 // "TUV #17", "tuv #265468", "TUV #2" — a letter prefix plus # is unambiguous, so a single digit
 // counts. Words that legitimately precede a # are excluded: "size #8", "US #7", "lot #3".
 /\b(?!size|no|lot|qty|us|uk|eu|fr|it\b)[a-z]{2,4}\s*#\s*\d+\b/gi,
 /\s#\s*\d{3,}\b/g, // a bare "#512345"
 /\bitem\s*[:#-]?\s*\d{3,}\b/gi,
 /\bref\s*[:#-]?\s*\d{3,}\b/gi,
];

/** Trailing junk left behind once a code is removed: " - ", " — ", doubled spaces, dangling dashes. */
function tidy(s: string): string {
 return s
  .replace(/\s*[-–—]\s*(?=[-–—]|$)/g, " ")
  .replace(/\s*[-–—]\s*$/g, "")
  .replace(/^\s*[-–—]\s*/g, "")
  .replace(/\s{2,}/g, " ")
  .trim();
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Remove the STORE's own name from the front of a title.
 *
 * Shopify defaults a product's `vendor` to the shop name, so store names leak into both the brand
 * field and the title. `sanitizeStoredBrand` already guards the brand column; nothing guarded the
 * text that becomes the search. Matched on normalized tokens so punctuation and casing differences
 * ("To Us Vintage", "to-us-vintage") don't let it through.
 */
export function stripStoreName(title: string, storeName?: string | null): string {
 const t = (title || "").trim();
 const s = (storeName || "").trim();
 if (!t || !s || norm(s).length < 3) return t;
 const nt = norm(t), ns = norm(s);
 if (!nt.startsWith(ns + " ") && nt !== ns) return t;
 // Drop the same number of tokens from the ORIGINAL string, preserving its casing and punctuation.
 const drop = ns.split(" ").length;
 const kept = t.split(/\s+/).slice(drop).join(" ");
 return tidy(kept) || t; // never return empty — a title that is only the store name stays as-is
}

/** Remove internal SKUs and reference codes. */
export function stripSkus(title: string): string {
 let out = title || "";
 for (const re of SKU_PATTERNS) out = out.replace(re, " ");
 return tidy(out);
}

/**
 * The search-ready form of a listing title.
 *
 * Conservative on purpose: it removes only what is provably unmatchable (internal codes, the seller's
 * own name). It does NOT drop sizes, eras, colours or materials — those are exactly what a
 * marketplace matches on, and stripping them is how a specific query becomes a generic one.
 */
export function cleanQuery(title: string, storeName?: string | null): string {
 const stripped = stripSkus(stripStoreName(title || "", storeName));
 return stripped || tidy(title || "");
}

/** What cleaning removed, for logging and for the admin view — so a bad search is diagnosable. */
export function explainClean(title: string, storeName?: string | null): { before: string; after: string; removed: string[] } {
 const before = (title || "").trim();
 const noStore = stripStoreName(before, storeName);
 const removed: string[] = [];
 if (norm(noStore) !== norm(before)) removed.push(`store name "${(storeName || "").trim()}"`);
 const after = stripSkus(noStore);
 if (norm(after) !== norm(noStore)) removed.push("internal SKU/reference code");
 return { before, after: after || before, removed };
}


// ── the seller's garment word wins ──────────────────────────────────────────────────────────────

/** Garment nouns the pricer's queries actually hinge on, grouped by the canonical bucket. */
const GARMENT_WORDS: Record<string, string[]> = {
 Dresses: ["dress", "dresses", "gown", "gowns", "frock"],
 Tops: ["top", "tops", "blouse", "shirt", "tee", "t-shirt", "tank", "cami", "camisole", "bodysuit", "corset", "bustier", "halter"],
 Sweaters: ["sweater", "cardigan", "knit", "pullover", "jumper", "hoodie", "sweatshirt"],
 "Coats & Jackets": ["jacket", "coat", "blazer", "trench", "puffer", "bomber", "vest"],
 Skirts: ["skirt", "skirts"],
 Pants: ["pants", "trousers", "leggings"],
 Jeans: ["jeans", "denim pants"],
 Shorts: ["shorts"],
 Bags: ["bag", "handbag", "purse", "clutch", "tote", "backpack", "satchel"],
 Shoes: ["shoes", "boots", "heels", "sandals", "sneakers", "loafers", "flats", "pumps", "mules"],
};

/**
 * Replace a garment noun in a title with the one the seller actually chose.
 *
 * Correcting the category was not enough on its own: the TITLE still said "strapless mini dress",
 * every comp search was built from the title, so the corrected category changed the label on screen
 * and nothing else. A seller who answers "it's a top" and watches the price stay a dress price has
 * been asked a question for nothing.
 *
 * Only fires when the title's noun genuinely belongs to a DIFFERENT bucket than the chosen one —
 * a title with no garment word, or one that already agrees, is left exactly as it is.
 */
export function applyGarmentCorrection(title: string, category: string | null | undefined): string {
 const want = (category || "").trim();
 if (!title || !want) return title;
 const target = Object.keys(GARMENT_WORDS).find((k) => k.toLowerCase() === want.toLowerCase());
 if (!target) return title;

 const wrong = Object.entries(GARMENT_WORDS)
  .filter(([bucket]) => bucket !== target)
  .flatMap(([, words]) => words);

 let out = title, replaced = false;
 for (const w of wrong.sort((a, b) => b.length - a.length)) {
  const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  if (re.test(out)) {
   // Singular of the chosen bucket: "Tops" -> "top", "Dresses" -> "dress". Branch rather than
   // chain — chained replaces turn "dresses" into "dresse" or "dres".
   const t = target.toLowerCase();
   const singular = /ies$/.test(t) ? t.replace(/ies$/, "y") : /sses$/.test(t) ? t.replace(/es$/, "") : t.replace(/s$/, "");
   out = out.replace(re, singular);
   replaced = true;
   break; // one swap only — a title naming two garments is a set, and guessing which is wrong is worse
  }
 }
 return replaced ? out.replace(/\s{2,}/g, " ").trim() : title;
}
