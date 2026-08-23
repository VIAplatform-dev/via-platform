// ───────────────────────────────────────────────────────────────────────────
// Data Layer — single source of configuration.
//
// Everything tunable about the B2B sourcing-intelligence product lives here:
// the privacy guardrail, the era buckets (seed for the era_buckets reference
// table), and the condition taxonomy. Pricing tiers + feature→tier mapping will
// be ADDED to this same file in Task 6. Never hardcode any of these values
// elsewhere — import from here (or, for eras, read the reference table that is
// seeded from here so buckets can be retuned without a code deploy).
// ───────────────────────────────────────────────────────────────────────────

// ── Privacy guardrail (Task 7) ──
// A metric may never be shown to sellers unless it aggregates at least this many
// distinct stores AND this many transactions/events. Sellers see market-level
// signal only — never another individual store's numbers.
export const PRIVACY = {
 minStores: 5,
 minTransactions: 5,
} as const;

// ── Demand Index (Task 2) ──
// Weights applied to each engagement type when scoring raw demand. Orders weigh
// most (real money), saves/clicks are strong intent, views are the floor.
export const DEMAND_WEIGHTS = {
 view: 1,
 save: 3,
 click: 2,
 order: 6,
} as const;

// A period is "flat" vs the prior period unless raw demand moved more than this
// fraction either way (±10%). Outside the band → rising / falling.
export const TREND_FLAT_BAND = 0.1;

// Trajectory bands — leading intent (saves+clicks) vs lagging sales (orders) growth.
// `accel`: leading growth ≥ +15% AND ≥15pts above sales growth → "accelerating".
// `cool`: both leading and sales below −10% → "cooling".
export const TRAJECTORY_BANDS = { accel: 0.15, cool: -0.1 } as const;

// Trailing windows the metric job computes for every segment.
export const METRIC_WINDOWS = [
 { key: "7d", days: 7 },
 { key: "30d", days: 30 },
] as const;
export type MetricWindow = (typeof METRIC_WINDOWS)[number]["key"];

// ── Sourcing verdict (Task 4 "Should I buy this?") ──
// Thresholds that turn the raw signals into a plain-language recommendation.
// Tunable here so we can calibrate as the marketplace grows.
export const SOURCING = {
 hotDemand: 70, // demand index ≥ this = strong demand
 warmDemand: 40, // demand index ≥ this = moderate demand
 underSupplied: 15, // supply gap ≥ this = supply is thin vs demand
 strongSellThrough: 3, // sell-through % ≥ this (when trustworthy) = it moves
} as const;

// ── External comps blend (eBay) ──
// Thresholds for folding eBay signal into the verdict when VYA data is thin.
// Placeholders to CALIBRATE once real comps flow — kept here so tuning is a
// one-line change, never buried in logic.
export const BLEND = {
 ebaySaturatedListings: 300, // active eBay listings ≥ this = heavily competed
 ebaySellsWellPer30d: 20, // eBay sales/30d ≥ this (when Insights available) = it moves
} as const;

// ── Era buckets ──
// SEED for the `era_buckets` reference table. Editing a row in that table (or
// changing this seed + re-seeding) retunes era classification with no schema
// migration. A detected year Y maps to the bucket where minYear <= Y <= maxYear.
export type EraBucket = {
 slug: string;
 label: string;
 minYear: number;
 maxYear: number;
};

export const ERA_BUCKETS_SEED: EraBucket[] = [
 { slug: "pre-60s", label: "Pre-60s", minYear: 0, maxYear: 1959 },
 { slug: "60s", label: "60s", minYear: 1960, maxYear: 1969 },
 { slug: "70s", label: "70s", minYear: 1970, maxYear: 1979 },
 { slug: "80s", label: "80s", minYear: 1980, maxYear: 1989 },
 { slug: "90s", label: "90s", minYear: 1990, maxYear: 1999 },
 { slug: "y2k", label: "Y2K (2000s)", minYear: 2000, maxYear: 2009 },
 { slug: "2010s", label: "2010s", minYear: 2010, maxYear: 2019 },
 { slug: "modern", label: "Modern", minYear: 2020, maxYear: 9999 },
];

// ── Condition taxonomy ──
// Ordered best→worst. inferCondition returns one of these labels ONLY when the
// seller's description states it clearly — otherwise null (never a guess).
export const CONDITIONS = [
 "Deadstock/NWT",
 "Excellent",
 "Very Good",
 "Good",
 "Fair",
] as const;
export type Condition = (typeof CONDITIONS)[number];

// ── Condition → price adjustment (Phase 4) ──
// Resale comps are typically listed at "very good", so that's the baseline (1.0). The valuation
// prices the piece at this standard condition; then we scale EXPLICITLY to the item's real grade,
// so wear/newness moves the price transparently instead of the model self-discounting invisibly.
// Tunable here — never hardcode a condition discount in the pricing logic.
export const CONDITION_REFERENCE: Condition = "Very Good";
export const CONDITION_MULTIPLIERS: Record<Condition, number> = {
 "Deadstock/NWT": 1.1,
 "Excellent": 1.05,
 "Very Good": 1.0,
 "Good": 0.95,
 "Fair": 0.9,
};

// Map a freeform condition string (seller-typed or AI) to a canonical grade — else null (no guess).
// "very good" is checked before "good" so it wins; nothing recognizable → null (no adjustment).
export function normalizeConditionGrade(text: string | null | undefined): Condition | null {
 const s = (text || "").toLowerCase().trim();
 if (!s) return null;
 if (/\b(nwt|bnwt|nib|new with tags|dead ?stock|unworn|never worn)\b/.test(s)) return "Deadstock/NWT";
 if (/\b(excellent|pristine|like ?new|mint|flawless)\b/.test(s)) return "Excellent";
 if (/\bvery good\b/.test(s)) return "Very Good";
 if (/\b(good|gently worn|minor wear)\b/.test(s)) return "Good";
 if (/\b(fair|poor|worn|distressed|as[- ]is|heavily used|damaged)\b/.test(s)) return "Fair";
 return null;
}

// ── Sold-comp anchoring (price engine) ──
// How many genuine SOLD comps (Buy It Now / realized sales — never auction closes) it takes
// before the sold median may anchor the valuation. Below this the sold prices are data points
// to triangulate with, not a verdict: one $900 auction-adjacent close once dragged a 1999
// archival piece to $1,155 against an asking cluster of $1,459–$2,082. Rare/archival pieces
// almost never have a deep sold set, which is exactly where underpricing hurt most.
export const MIN_SOLD_COMPS_FOR_ANCHOR = 3;

// ── FX → USD (comp pricing) ──
// Coarse market rates for normalizing foreign-currency comps (Google Lens returns international
// matches constantly; a €450 comp must never enter the median as $450). Comp pricing tolerates
// ±2% FX drift — refresh quarterly. Currencies not listed here are DROPPED, never guessed.
// Rates as of 2026-08 (USD per 1 unit).
export const FX_TO_USD: Record<string, number> = {
 USD: 1,
 EUR: 1.09,
 GBP: 1.27,
 JPY: 0.0068,
 CHF: 1.13,
 CAD: 0.73,
 AUD: 0.66,
 SEK: 0.095,
 DKK: 0.146,
 NOK: 0.093,
 PLN: 0.25,
 // Gulf/Asian boutiques show up in reverse-image comps too. These are pegged or stable;
 // deliberately NO hyper-volatile currencies (e.g. TRY, ARS) — for those, dropping the comp
 // is safer than converting at a rate that may be months stale.
 AED: 0.272, // pegged 3.6725/USD
 SAR: 0.267, // pegged 3.75/USD
 HKD: 0.128, // pegged ~7.8/USD
 SGD: 0.74,
 NZD: 0.60,
 CNY: 0.14,
 KRW: 0.00072,
 INR: 0.012,
 ILS: 0.27,
 CZK: 0.043,
};

// ── Event-quality filters (events ETL) ──
// Junk traffic inflates the Demand Index. The events ETL drops it BEFORE building
// the unified log (the legacy capture tables are never touched). Every threshold
// lives here — never hardcode in the ETL.
export const EVENT_FILTERS = {
 // Automated traffic, matched as case-insensitive substrings of the captured
 // user-agent (only `clicks` stores a UA today, so this applies there).
 botUserAgentPatterns: [
 "bot", "crawl", "spider", "slurp", "mediapartners", "adsbot", "bingpreview",
 "facebookexternalhit", "facebot", "ia_archiver", "headlesschrome", "phantomjs",
 "puppeteer", "playwright", "selenium", "lighthouse", "gtmetrix", "pingdom",
 "uptimerobot", "statuscake", "python-requests", "python-urllib", "curl/",
 "wget", "libwww", "httpclient", "okhttp", "go-http-client", "java/", "axios/",
 "node-fetch", "scrapy", "semrush", "ahrefs", "dotbot", "mj12bot", "petalbot",
 "yandex", "baiduspider", "duckduckbot", "applebot", "google-inspectiontool",
 "vercel-screenshot",
 ],
 // Our own / test traffic — never consumer demand. Emails matched case-insensitively;
 // any address at an internal domain is excluded too. Seller accounts are excluded
 // separately by the ETL using the live storeContactEmails (single source of truth,
 // so it's not duplicated here).
 internalEmails: [
 "helster@me.com",
 "hana@vyaplatform.com",
 ],
 internalEmailDomains: ["vyaplatform.com"],
 // Burst guard — the SAME user hammering the SAME product with the SAME event
 // type. Debounce rapid repeats, then cap per UTC day. Anonymous events (no
 // user id) can't be attributed and are left as-is.
 burst: {
 minGapSeconds: 5, // drop same user·product·type repeats closer than this
 maxPerUserProductPerDay: 12, // beyond this many/day for one user·product·type → drop extras
 },
} as const;
