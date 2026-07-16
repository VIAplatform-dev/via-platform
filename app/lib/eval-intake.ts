import { neon } from "@neondatabase/serverless";
import { draftListing } from "./ai-intake";
import { reverseImageMatches, isCompsConfigured } from "./comps";
import { inferBrandFromTitle } from "./market-data-db";
import { estimatePrice } from "./price-engine";
import { gate } from "./concurrency";

// The eval harness — a "practice exam" for the intake AI. Takes labeled examples from
// the training dataset (photo → the seller-confirmed brand/era/category/price), runs
// the CURRENT AI on each photo blind, and grades its guesses against the answer key.
// Run it before/after a prompt change to know — not guess — whether it got better.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

// ── brand grading ────────────────────────────────────────────────────────────
// Exact string match tanked the exam to ~5%: "Dior" ≠ "Christian Dior", "YSL" ≠
// "Yves Saint Laurent", "Levi's" ≠ "Levi Strauss". Grade a brand as CORRECT when it's the same
// house, allowing for abbreviations, corporate/location suffixes, punctuation, and diacritics.
const BRAND_STOP = /\b(inc|incorporated|llc|ltd|limited|co|company|corp|corporation|spa|s ?p ?a|sa|s ?a|srl|gmbh|ag|nv|group|paris|milano|milan|london|roma|rome|italy|italia|france|usa|nyc|new york|official|brand|the)\b/g;
function normBrand(v: string | null | undefined): string {
 return (v ?? "")
 .toLowerCase()
 .normalize("NFKD").replace(/[̀-ͯ]/g, "") // strip diacritics: garçons → garcons
 .replace(/&/g, " and ")
 .replace(/[^a-z0-9\s]/g, " ") // drop punctuation: Levi's → levi s, A.P.C. → a p c
 .replace(BRAND_STOP, " ")
 .replace(/\s+/g, " ").trim();
}
// Abbreviations / alternate names that normalize+containment can't bridge → a shared canonical form.
const BRAND_ALIASES: Record<string, string> = {
 "ysl": "saint laurent", "yves saint laurent": "saint laurent",
 "lv": "louis vuitton", "cdg": "comme des garcons", "mm6": "maison margiela", "margiela": "maison margiela",
 "apc": "apc", "a p c": "apc", "ck": "calvin klein", "d and g": "dolce and gabbana", "dolce gabbana": "dolce and gabbana",
 "tnf": "the north face", "north face": "the north face", "rl": "ralph lauren", "polo": "ralph lauren", "polo ralph lauren": "ralph lauren",
 "bottega": "bottega veneta", "ferragamo": "salvatore ferragamo", "mcqueen": "alexander mcqueen", "vuitton": "louis vuitton",
};
const canonBrand = (b: string | null | undefined): string => { const n = normBrand(b); return BRAND_ALIASES[n] ?? n; };
export function brandMatch(guess: string | null | undefined, truth: string | null | undefined): boolean {
 const g = canonBrand(guess), t = canonBrand(truth);
 if (!g || !t) return false;
 if (g === t) return true;
 // Same house, one name a fuller form of the other: "dior" ⊂ "christian dior", "levis" ⊂ "levistrauss".
 const gj = g.replace(/\s/g, ""), tj = t.replace(/\s/g, "");
 const short = gj.length <= tj.length ? gj : tj, long = gj.length <= tj.length ? tj : gj;
 if (short.length >= 3 && long.includes(short)) return true;
 // Every word of the shorter name appears in the longer (handles reordering / extra words).
 const gt = g.split(" ").filter((w) => w.length >= 3), tt = t.split(" ").filter((w) => w.length >= 3);
 const [small, big] = gt.length <= tt.length ? [gt, tt] : [tt, gt];
 return small.length > 0 && small.every((w) => big.includes(w));
}

// Same deterministic brand consensus production uses on reverse-image matches.
function brandFromTitles(titles: string[]): string | null {
 const tally = new Map<string, number>();
 for (const t of titles) { const b = inferBrandFromTitle(t); if (b) tally.set(b, (tally.get(b) || 0) + 1); }
 let best: string | null = null, n = 0;
 for (const [b, c] of tally) if (c > n) { best = b; n = c; }
 return best;
}

export type EvalMiss = { field: string; image: string; guessed: string | null; truth: string };
export type FieldScore = { field: string; correct: number; total: number; pct: number | null };
export type EvalResult = {
 sample: number;
 withReverseImage: boolean;
 fields: FieldScore[];
 price?: { within20: number; total: number; pct: number };
 misses: EvalMiss[];
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function runEval(opts: { sample: number; withReverseImage: boolean; withPrice: boolean }): Promise<EvalResult> {
 const sample = Math.max(1, Math.min(50, Math.round(opts.sample) || 15));
 const sql = db();

 // Answer key: labeled examples with a known brand + a usable photo, sampled at random.
 const rows = (await sql`
  SELECT item_ref, image_urls, brand, era, category, price_cents
  FROM training_examples
  WHERE brand IS NOT NULL AND brand <> '' AND jsonb_array_length(image_urls) > 0
  ORDER BY random() LIMIT ${sample}
 `.catch(() => [])) as any[];

 const g = gate("eval", 3); // keep concurrency low so the exam doesn't trip rate limits

 const scored = await Promise.all(rows.map((r) => g.run(async () => {
 const imageUrl = Array.isArray(r.image_urls) ? r.image_urls[0] : null;
 if (!imageUrl || typeof imageUrl !== "string") return null;
 try {
 const draft = await draftListing([imageUrl]); // blind — no seller memory, no answer
 let brand = draft.brand?.value ?? null;
 if (opts.withReverseImage && isCompsConfigured()) {
 const matches = await reverseImageMatches(imageUrl).catch(() => []);
 const consensus = brandFromTitles(matches.map((m) => m.title));
 if (consensus) brand = consensus; // production trusts reverse-image consensus
 }
 let priceOk: boolean | null = null;
 if (opts.withPrice && Number(r.price_cents) > 0) {
 const query = [brand, draft.category].filter(Boolean).join(" ") || draft.title;
 const est = await estimatePrice({ query, photoUrl: imageUrl, minMarkupBps: 3000, context: { brand, era: draft.era?.value ?? null } }).catch(() => null);
 if (est?.suggestedCents) priceOk = Math.abs(est.suggestedCents - Number(r.price_cents)) / Number(r.price_cents) <= 0.2;
 }
 return {
 image: imageUrl,
 brand: { guess: brand, truth: r.brand as string, ok: brandMatch(brand, r.brand) },
 era: { guess: draft.era?.value ?? null, truth: r.era as string | null, ok: r.era ? norm(draft.era?.value) === norm(r.era) : null },
 category: { guess: draft.category ?? null, truth: r.category as string | null, ok: r.category ? norm(draft.category) === norm(r.category) : null },
 priceOk,
 };
 } catch { return null; }
 })));

 const valid = scored.filter(Boolean) as any[];
 const fieldStat = (key: string): FieldScore => {
 const graded = valid.filter((v) => v[key].ok !== null && v[key].truth);
 const correct = graded.filter((v) => v[key].ok).length;
 // No labeled answers for this field → "n/a" (null), not a misleading 0%.
 return { field: key, correct, total: graded.length, pct: graded.length ? Math.round((correct / graded.length) * 100) : null };
 };

 const misses: EvalMiss[] = [];
 for (const v of valid) for (const k of ["brand", "era", "category"]) if (v[k].truth && v[k].ok === false) misses.push({ field: k, image: v.image, guessed: v[k].guess, truth: v[k].truth });

 const priceGraded = valid.filter((v) => v.priceOk !== null);
 const price = opts.withPrice && priceGraded.length
 ? { within20: priceGraded.filter((v) => v.priceOk).length, total: priceGraded.length, pct: Math.round((priceGraded.filter((v) => v.priceOk).length / priceGraded.length) * 100) }
 : undefined;

 return { sample: valid.length, withReverseImage: opts.withReverseImage, fields: ["brand", "era", "category"].map(fieldStat), price, misses: misses.slice(0, 30) };
}

// ── Nightly exam history — one row per automated run, so the trend is visible each
// morning without re-spending tokens.
let runsEnsured = false;
async function ensureRunsTable() {
 if (runsEnsured) return;
 await db()`
  CREATE TABLE IF NOT EXISTS eval_runs (
   id SERIAL PRIMARY KEY,
   ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   sample INTEGER,
   brand_pct INTEGER, era_pct INTEGER, category_pct INTEGER, price_pct INTEGER,
   result JSONB
  )
 `;
 runsEnsured = true;
}

export type EvalRun = { ranAt: string; sample: number; brandPct: number | null; eraPct: number | null; categoryPct: number | null; pricePct: number | null; result: EvalResult };

export async function saveEvalRun(r: EvalResult): Promise<void> {
 await ensureRunsTable();
 const pct = (f: string) => r.fields.find((x) => x.field === f)?.pct ?? null;
 await db()`
  INSERT INTO eval_runs (sample, brand_pct, era_pct, category_pct, price_pct, result)
  VALUES (${r.sample}, ${pct("brand")}, ${pct("era")}, ${pct("category")}, ${r.price?.pct ?? null}, ${JSON.stringify(r)})
 `.catch(() => {});
}

export async function getRecentEvalRuns(limit = 14): Promise<EvalRun[]> {
 await ensureRunsTable();
 const rows = (await db()`
  SELECT ran_at, sample, brand_pct, era_pct, category_pct, price_pct, result
  FROM eval_runs ORDER BY ran_at DESC LIMIT ${Math.max(1, Math.min(60, limit))}
 `.catch(() => [])) as any[];
 return rows.map((r) => ({
 ranAt: new Date(r.ran_at).toISOString(),
 sample: Number(r.sample || 0),
 brandPct: r.brand_pct == null ? null : Number(r.brand_pct),
 eraPct: r.era_pct == null ? null : Number(r.era_pct),
 categoryPct: r.category_pct == null ? null : Number(r.category_pct),
 pricePct: r.price_pct == null ? null : Number(r.price_pct),
 result: r.result as EvalResult,
 }));
}
