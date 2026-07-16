import { neon } from "@neondatabase/serverless";
import { cosine, embedImage, isEmbeddingConfigured } from "./embeddings";
import { brandMatch } from "./brand-match";
import type { Comp } from "./comps";

// The intake "correction memory" — v1 of the learning loop.
//
// Every time a seller fixes a field the AI drafted (e.g. brand "Roberto Cavalli"
// → "Blumarine"), we log it. On the next intake we feed the store's recent brand
// corrections + the brands they actually deal in back into the model as hints, so
// it stops repeating the same misses. The same table is the substrate for the v2
// visual-retrieval layer (it already stores the photo URL per correction).

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 await db()`
  CREATE TABLE IF NOT EXISTS intake_corrections (
   id SERIAL PRIMARY KEY,
   store_slug TEXT NOT NULL,
   field TEXT NOT NULL,
   ai_value TEXT,
   final_value TEXT NOT NULL,
   image_url TEXT,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
 `;
 await db()`CREATE INDEX IF NOT EXISTS idx_intake_corr_store ON intake_corrections (store_slug, created_at DESC)`;
 ensured = true;
}

export type Correction = { field: string; aiValue: string | null; finalValue: string; imageUrl?: string | null };

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/**
 * Log the fields a seller changed from what the AI drafted. Only real changes are
 * kept (final differs from the AI's guess, case-insensitively) and only fields with
 * a meaningful final value.
 */
export async function logCorrections(storeSlug: string, corrections: Correction[]): Promise<void> {
 const real = corrections.filter((c) => c.finalValue && c.finalValue.trim() && norm(c.aiValue) !== norm(c.finalValue));
 if (real.length === 0) return;
 await ensureTable();
 const sql = db();
 for (const c of real) {
  await sql`
   INSERT INTO intake_corrections (store_slug, field, ai_value, final_value, image_url)
   VALUES (${storeSlug}, ${c.field}, ${c.aiValue ?? null}, ${c.finalValue.trim().slice(0, 200)}, ${c.imageUrl ?? null})
  `.catch(() => {});
 }
}

// ── Prediction log: every AI-proposed field + whether the seller kept it (accepted)
// or changed it (corrected). This is the acceptance flow — the denominator the
// correction log never had. Powers true per-field accuracy + the eval dataset.
let predEnsured = false;
async function ensurePredictionsTable() {
 if (predEnsured) return;
 await db()`
  CREATE TABLE IF NOT EXISTS intake_predictions (
   id SERIAL PRIMARY KEY,
   store_slug TEXT NOT NULL,
   field TEXT NOT NULL,
   ai_value TEXT,
   final_value TEXT,
   accepted BOOLEAN NOT NULL DEFAULT false,
   image_url TEXT,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
 `;
 await db()`CREATE INDEX IF NOT EXISTS idx_intake_pred_field ON intake_predictions (field, created_at DESC)`;
 await db()`ALTER TABLE intake_predictions ADD COLUMN IF NOT EXISTS category TEXT`; // to slice accuracy by segment
 predEnsured = true;
}

export type PredictionInput = { field: string; aiValue: string | null; finalValue: string; imageUrl?: string | null; category?: string | null };

/**
 * Log every field the AI actually PREDICTED (non-empty guess), with whether the
 * seller kept it (accepted) or changed it. Fields the seller pre-typed carry no AI
 * prediction and must arrive with a null aiValue → they're skipped, so accuracy
 * measures the model, not the seller doing its job.
 */
export async function logPredictions(storeSlug: string, preds: PredictionInput[]): Promise<void> {
 const real = preds.filter((p) => p.aiValue && p.aiValue.trim());
 if (real.length === 0) return;
 await ensurePredictionsTable();
 const sql = db();
 for (const p of real) {
  // Brand is graded house-level (Dior ≡ Christian Dior); other fields exact after normalize.
  const accepted = p.field === "brand"
   ? brandMatch(p.aiValue, p.finalValue)
   : (!!p.finalValue.trim() && norm(p.aiValue) === norm(p.finalValue));
  await sql`
   INSERT INTO intake_predictions (store_slug, field, ai_value, final_value, accepted, image_url, category)
   VALUES (${storeSlug}, ${p.field}, ${p.aiValue}, ${p.finalValue.trim().slice(0, 200)}, ${accepted}, ${p.imageUrl ?? null}, ${p.category ?? null})
  `.catch(() => {});
 }
}

/**
 * Build a compact, prompt-ready hint block from this store's correction history:
 *  • the brands they actually deal in (bias the model toward these), and
 *  • recent wrong→right brand fixes (don't repeat these mistakes).
 * Returns "" when there's no history yet, so early listings just use base Claude.
 */
export async function getIntakeHints(storeSlug: string): Promise<string> {
 await ensureTable();
 const sql = db();

 const brandFixes = (await sql`
  SELECT DISTINCT ON (lower(ai_value), lower(final_value)) ai_value, final_value
  FROM intake_corrections
  WHERE store_slug = ${storeSlug} AND field = 'brand' AND ai_value IS NOT NULL AND ai_value <> ''
  ORDER BY lower(ai_value), lower(final_value), created_at DESC
  LIMIT 20
 `.catch(() => [])) as { ai_value: string; final_value: string }[];

 const topBrands = (await sql`
  SELECT final_value AS brand, COUNT(*)::int AS n
  FROM intake_corrections
  WHERE store_slug = ${storeSlug} AND field = 'brand' AND final_value <> ''
  GROUP BY final_value ORDER BY n DESC LIMIT 12
 `.catch(() => [])) as { brand: string; n: number }[];

 const parts: string[] = [];
 if (topBrands.length) {
  parts.push(`Brands this seller commonly lists: ${topBrands.map((b) => b.brand).join(", ")}. Favor these when the visual evidence is ambiguous.`);
 }
 if (brandFixes.length) {
  parts.push(
   "Past brand corrections by this seller (the AI guessed the first, the seller's correct answer is the second — do NOT repeat these mistakes):\n" +
    brandFixes.map((f) => `• "${f.ai_value}" → "${f.final_value}"`).join("\n"),
  );
 }
 if (parts.length === 0) return "";
 return `\n\nSELLER MEMORY — this store has corrected the AI before; use it:\n${parts.join("\n")}`;
}

// ──────────────────────────────────────────────────────────────────────────
// v2: per-store memory. Every published item records its photo embedding + final
// labels (a visual corpus matched against new uploads) AND the comp market value
// vs. the seller's final price (so we learn how this store prices vs. the market).

let itemsEnsured = false;
async function ensureItemsTable() {
 if (itemsEnsured) return;
 await db()`
  CREATE TABLE IF NOT EXISTS intake_memory_items (
   id SERIAL PRIMARY KEY,
   store_slug TEXT NOT NULL,
   image_url TEXT,
   embedding TEXT NOT NULL,
   brand TEXT, era TEXT, material TEXT, condition TEXT, category TEXT,
   market_cents INTEGER, price_cents INTEGER,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
 `;
 await db()`ALTER TABLE intake_memory_items ADD COLUMN IF NOT EXISTS market_cents INTEGER`;
 await db()`ALTER TABLE intake_memory_items ADD COLUMN IF NOT EXISTS price_cents INTEGER`;
 await db()`ALTER TABLE intake_memory_items ADD COLUMN IF NOT EXISTS title TEXT`; // the confirmed descriptor — carries the specific model, so retrieval can teach it
 await db()`CREATE INDEX IF NOT EXISTS idx_intake_mem_store ON intake_memory_items (store_slug, created_at DESC)`;
 itemsEnsured = true;
}

export type MemoryItem = {
 imageUrl: string | null;
 embedding: number[];
 title?: string | null; // the seller's confirmed title — the specific-piece descriptor
 brand?: string | null; era?: string | null; material?: string | null; condition?: string | null; category?: string | null;
 marketCents?: number | null; // comp market value at intake (raw, before store adjustment)
 priceCents?: number | null;  // the seller's final list price
};

/**
 * Store a published item: photo embedding + labels (visual memory) AND the comp
 * market value vs. the final price (pricing memory). Recorded even without an
 * embedding, so pricing still learns when image embeddings are disabled.
 */
export async function rememberItem(storeSlug: string, item: MemoryItem): Promise<void> {
 await ensureItemsTable();
 await db()`
  INSERT INTO intake_memory_items (store_slug, image_url, embedding, brand, era, material, condition, category, market_cents, price_cents, title)
  VALUES (${storeSlug}, ${item.imageUrl ?? null}, ${JSON.stringify(item.embedding ?? [])},
   ${item.brand ?? null}, ${item.era ?? null}, ${item.material ?? null}, ${item.condition ?? null}, ${item.category ?? null},
   ${item.marketCents ?? null}, ${item.priceCents ?? null}, ${item.title ?? null})
 `.catch(() => {});
}

/**
 * Given a new photo's embedding, pull the most visually-similar past pieces from
 * this store's own catalog and return a prompt hint block. Empty until the store
 * has a corpus. Pilot-scale: scans recent items in JS (cosine); pgvector later.
 */
export async function getVisualHints(storeSlug: string, embedding: number[]): Promise<string> {
 if (!embedding || embedding.length === 0) return "";
 await ensureItemsTable();
 const rows = (await db()`
  SELECT image_url, embedding, brand, era, material, category, title
  FROM intake_memory_items WHERE store_slug = ${storeSlug}
  ORDER BY created_at DESC LIMIT 400
 `.catch(() => [])) as { embedding: string; brand: string | null; era: string | null; material: string | null; category: string | null; title: string | null }[];

 const scored = rows
  .map((r) => {
  let v: number[] = [];
  try { v = JSON.parse(r.embedding); } catch { /* skip malformed */ }
  return { r, score: v.length ? cosine(embedding, v) : 0 };
  })
  .filter((s) => s.score >= 0.6) // tune as we see real match scores
  .sort((a, b) => b.score - a.score)
  .slice(0, 4);

 if (scored.length === 0) return "";
 const lines = scored.map((s) => {
  const bits = s.r.title || [s.r.brand && `brand: ${s.r.brand}`, s.r.era, s.r.material, s.r.category].filter(Boolean).join(" · ");
  return `• a visually similar piece this seller listed → ${bits || "(no labels)"}`;
 });
 return `\n\nVISUALLY SIMILAR PAST LISTINGS (this seller's own catalog — strong signal; weight heavily for brand/era/material):\n${lines.join("\n")}`;
}

/**
 * Cross-store visual retrieval — the most visually-similar SELLER-CONFIRMED pieces across the WHOLE
 * platform (every store's published items), preferring the same brand when one is known. This is the
 * compounding loop: every seller's confirmed listing becomes a reference example for everyone —
 * including a brand-new store's very first upload, which the per-store getVisualHints can't help.
 * Labels only (era/model/category/material), NEVER another store's prices (that stays aggregated in
 * the pricing engine) — so it's privacy-safe and used only to sharpen identification.
 */
export async function getCrossStoreSimilar(embedding: number[], brand?: string | null, limit = 4, opts?: { excludeNearIdentical?: boolean }): Promise<string> {
 if (!embedding || embedding.length === 0) return "";
 await ensureItemsTable();
 const b = (brand || "").trim();
 const rows = (await (b
 ? db()`SELECT embedding, brand, era, material, category, title FROM intake_memory_items WHERE brand ILIKE ${b} AND embedding <> '[]' ORDER BY created_at DESC LIMIT 500`
 : db()`SELECT embedding, brand, era, material, category, title FROM intake_memory_items WHERE embedding <> '[]' ORDER BY created_at DESC LIMIT 500`
 ).catch(() => [])) as { embedding: string; brand: string | null; era: string | null; material: string | null; category: string | null; title: string | null }[];

 const hi = opts?.excludeNearIdentical ? 0.995 : 1.01; // drop a self/identical match in the eval
 const scored = rows
 .map((r) => { let v: number[] = []; try { v = JSON.parse(r.embedding); } catch { /* skip malformed */ } return { r, score: v.length ? cosine(embedding, v) : 0 }; })
 .filter((s) => s.score >= 0.62 && s.score < hi)
 .sort((a, b2) => b2.score - a.score)
 .slice(0, limit);
 if (scored.length === 0) return "";
 // Prefer the confirmed TITLE — it carries the specific model/line, which is what sharpens ID.
 const lines = scored.map((s) => `• ${s.r.title || ([s.r.brand, s.r.era, s.r.material, s.r.category].filter(Boolean).join(" · ") || "(no labels)")}`);
 return `\n\nSIMILAR PIECES CONFIRMED ACROSS VYA (sellers verified these labels — reference for era/model/category/material; do NOT invent a brand from them):\n${lines.join("\n")}`;
}

/**
 * Cross-store brand prior — what a KNOWN brand's pieces TEND to be and sell for across the whole
 * platform (aggregated over every store's confirmed listings). A soft calibration for era/category
 * and a price anchor when the exact piece isn't visually matched. Aggregated + N-gated, so it's
 * privacy-safe (no single store's numbers) and only appears once a brand has enough real history.
 */
export async function getBrandPrior(brand: string | null | undefined): Promise<string> {
 const b = (brand || "").trim();
 if (!b) return "";
 await ensureItemsTable();
 const rows = (await db()`
  SELECT era, category, material, price_cents
  FROM intake_memory_items
  WHERE brand ILIKE ${b} AND created_at >= now() - interval '540 days'
 `.catch(() => [])) as { era: string | null; category: string | null; material: string | null; price_cents: number | null }[];
 if (rows.length < 8) return ""; // need a real aggregate before we lean on it
 const top = (key: "era" | "category" | "material"): string[] => {
 const m = new Map<string, number>();
 for (const r of rows) { const v = (r[key] || "").toLowerCase().trim(); if (v) m.set(v, (m.get(v) || 0) + 1); }
 return [...m.entries()].sort((a, c) => c[1] - a[1]).slice(0, 3).map((e) => e[0]);
 };
 const prices = rows.map((r) => Number(r.price_cents)).filter((n) => n > 0).sort((a, c) => a - c);
 const med = prices.length ? prices[Math.floor(prices.length / 2)] : null;
 const cats = top("category"), eras = top("era"), mats = top("material");
 const parts: string[] = [];
 if (cats.length) parts.push(`usually ${cats.join(", ")}`);
 if (eras.length) parts.push(`typically ${eras.join(", ")}`);
 if (mats.length) parts.push(`often ${mats.join(", ")}`);
 if (!parts.length && !med) return "";
 const priceStr = med ? `; they resell around $${Math.round(med / 100)} on VYA` : "";
 return `\n\nVYA MEMORY for ${b}: ${parts.join(", ")}${priceStr} (across ${rows.length} listings). Use as a soft prior — calibrate era/category to it, but the actual photo always wins.`;
}

/**
 * Visual PRICE comps: VYA pieces (ANY store) whose photo looks like this one, returned as comps for
 * the price engine. Reuses embeddings we already stored at intake — so NO new embedding cost. Unlike
 * the brand-text `getVyaComps`, this matches on how the piece LOOKS, so it still finds comps when the
 * brand is unknown or mis-identified. Corpus grows with every intake; thin until it builds up.
 */
const parseVec = (s: string): number[] => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; } };
const VISUAL_MATCH_MIN = 0.72; // tighter than the label-hint threshold — pricing needs close matches

export async function getVisualVyaComps(embedding: number[], limit = 8): Promise<Comp[]> {
 if (!embedding || embedding.length === 0) return [];
 await ensureItemsTable();
 await ensureSoldEmbeddingCol();
 const scored: { score: number; comp: Comp }[] = [];

 // Corpus 1 — REAL sold pieces (actual realized price + how fast it sold). The strongest comp.
 const sold = (await db()`
  SELECT designer, final_price, embedding FROM sold_items
  WHERE embedding IS NOT NULL AND embedding <> '[]' AND final_price > 0
  ORDER BY sold_at DESC LIMIT 1500
 `.catch(() => [])) as { designer: string | null; final_price: number; embedding: string }[];
 for (const r of sold) {
 const v = parseVec(r.embedding); if (!v.length) continue;
 const score = cosine(embedding, v); if (score < VISUAL_MATCH_MIN) continue;
 scored.push({ score, comp: { title: r.designer || "similar VYA piece", priceCents: Math.round(Number(r.final_price) * 100), currency: "USD", sold: true, source: "VYA (sold)" } });
 }

 // Corpus 2 — currently/previously LISTED intake pieces (asking references).
 const listed = (await db()`
  SELECT brand, category, market_cents, price_cents, embedding FROM intake_memory_items
  WHERE embedding IS NOT NULL AND embedding <> '[]' AND (market_cents > 0 OR price_cents > 0)
  ORDER BY created_at DESC LIMIT 1500
 `.catch(() => [])) as { brand: string | null; category: string | null; market_cents: number | null; price_cents: number | null; embedding: string }[];
 for (const r of listed) {
 const v = parseVec(r.embedding); if (!v.length) continue;
 const score = cosine(embedding, v); if (score < VISUAL_MATCH_MIN) continue;
 scored.push({ score, comp: { title: [r.brand, r.category].filter(Boolean).join(" ") || "similar VYA piece", priceCents: r.market_cents || r.price_cents || 0, currency: "USD", sold: false, source: "VYA (visual match)" } });
 }

 return scored.filter((s) => s.comp.priceCents > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.comp);
}

// ── Specific-piece resolution (Phase 2): identify the exact model, not just the brand ──
// "Prada" is trivial (typed); "Prada Re-Nylon ~2019" is what makes the PRICE right. This matches the
// upload's embedding against the reference index — the labeled catalog (training_examples) + confirmed
// VYA listings, all carrying a TITLE (the model/line) — same-brand preferred. Returns a discrete
// resolution only when the best match clears a HIGH similarity bar (so it means "the same piece", not
// "looks similar"); otherwise null → the pipeline degrades gracefully to brand-only. The returned
// query drives tighter comps, and the reference price is a sanity prior.
export type SpecificPiece = {
 model: string;          // the matched title — carries the specific line/model
 query: string;          // tight comp query built from it (brand-guaranteed)
 similarity: number;     // best cosine, 0..1
 agree: number;          // how many references cleared the bar (confidence)
 brand: string | null; era: string | null; category: string | null;
 priceCents: number | null; // median reference price of the close matches (a prior)
 source: string;         // 'catalog' | 'vya-listing'
};

const SPECIFIC_MIN = 0.82; // asserts "the SAME specific piece" — deliberately high; below this, brand-only

export async function resolveSpecificPiece(embedding: number[], brand?: string | null, opts?: { excludeNearIdentical?: boolean }): Promise<SpecificPiece | null> {
 if (!embedding || embedding.length === 0) return null;
 await ensureItemsTable();
 const b = (brand || "").trim();
 const [catalog, listed] = await Promise.all([
 (b
  ? db()`SELECT title, brand, era, category, price_cents, embedding FROM training_examples WHERE brand ILIKE ${b} AND embedding IS NOT NULL AND embedding <> '[]' AND title IS NOT NULL ORDER BY created_at DESC LIMIT 800`
  : db()`SELECT title, brand, era, category, price_cents, embedding FROM training_examples WHERE embedding IS NOT NULL AND embedding <> '[]' AND title IS NOT NULL ORDER BY created_at DESC LIMIT 800`
 ).catch(() => []),
 (b
  ? db()`SELECT title, brand, era, category, price_cents, market_cents, embedding FROM intake_memory_items WHERE brand ILIKE ${b} AND embedding <> '[]' AND title IS NOT NULL ORDER BY created_at DESC LIMIT 500`
  : db()`SELECT title, brand, era, category, price_cents, market_cents, embedding FROM intake_memory_items WHERE embedding <> '[]' AND title IS NOT NULL ORDER BY created_at DESC LIMIT 500`
 ).catch(() => []),
 ]) as [{ title: string | null; brand: string | null; era: string | null; category: string | null; price_cents: number | null; embedding: string }[],
        { title: string | null; brand: string | null; era: string | null; category: string | null; price_cents: number | null; market_cents: number | null; embedding: string }[]];

 type Scored = { score: number; title: string | null; brand: string | null; era: string | null; category: string | null; priceCents: number | null; source: string };
 const refs: Scored[] = [];
 for (const r of catalog) {
 const v = parseVec(r.embedding); if (!v.length) continue;
 refs.push({ score: cosine(embedding, v), title: r.title, brand: r.brand, era: r.era, category: r.category, priceCents: r.price_cents != null ? Number(r.price_cents) : null, source: "catalog" });
 }
 for (const r of listed) {
 const v = parseVec(r.embedding); if (!v.length) continue;
 const p = r.price_cents ?? r.market_cents;
 refs.push({ score: cosine(embedding, v), title: r.title, brand: r.brand, era: r.era, category: r.category, priceCents: p != null ? Number(p) : null, source: "vya-listing" });
 }
 if (!refs.length) return null;
 refs.sort((a, c) => c.score - a.score);
 // Drop a near-identical self-match — the SAME photo scoring ~1.0. In production this de-dups an
 // item re-processed against its own stored embedding; in the eval it's the leak guard that keeps
 // "does memory help?" honest (an item can't match against a copy of itself).
 const pool = opts?.excludeNearIdentical ? refs.filter((x) => x.score < 0.995) : refs;
 if (!pool.length) return null;
 const best = pool[0];
 if (best.score < SPECIFIC_MIN) return null;
 const model = (best.title || "").trim();
 if (!model) return null;

 const close = pool.filter((x) => x.score >= SPECIFIC_MIN);
 const prices = close.map((x) => x.priceCents).filter((n): n is number => !!n && n > 0).sort((a, c) => a - c);
 const medPrice = prices.length ? prices[Math.floor(prices.length / 2)] : null;
 // Tight comp query: the matched title, brand guaranteed present so comps stay same-label.
 const query = b && !model.toLowerCase().includes(b.toLowerCase()) ? `${b} ${model}` : model;
 return {
 model, query, similarity: Math.round(best.score * 1000) / 1000, agree: close.length,
 brand: best.brand, era: best.era, category: best.category, priceCents: medPrice, source: best.source,
 };
}

// ── Embed-on-sale: build the visual comp corpus from REAL sales ──
// sold_items gets an embedding of its photo so getVisualVyaComps can match against actual
// transactions. Cheap: ~a few sold items/day, one Voyage call each. Run by a daily cron.

let soldColEnsured = false;
async function ensureSoldEmbeddingCol() {
 if (soldColEnsured) return;
 await db()`ALTER TABLE sold_items ADD COLUMN IF NOT EXISTS embedding TEXT`.catch(() => {});
 soldColEnsured = true;
}

export async function embedPendingSoldItems(limit = 60): Promise<{ embedded: number; remaining: number }> {
 if (!isEmbeddingConfigured()) return { embedded: 0, remaining: 0 };
 await ensureSoldEmbeddingCol();
 const rows = (await db()`
  SELECT id, image FROM sold_items
  WHERE embedding IS NULL AND image IS NOT NULL AND image <> ''
  ORDER BY sold_at DESC LIMIT ${limit}
 `.catch(() => [])) as { id: number; image: string }[];
 let embedded = 0;
 for (const r of rows) {
 const v = await embedImage(r.image).catch(() => null);
 if (v && v.length) { await db()`UPDATE sold_items SET embedding = ${JSON.stringify(v)} WHERE id = ${r.id}`.catch(() => {}); embedded++; }
 }
 const left = (await db()`SELECT count(*)::int AS n FROM sold_items WHERE embedding IS NULL AND image IS NOT NULL AND image <> ''`.catch(() => [{ n: 0 }])) as { n: number }[];
 return { embedded, remaining: left[0]?.n ?? 0 };
}

export type StorePricingSignal = {
 inferredMult: number; // how they price vs market (1 = at market, 1.15 = +15%)
 hasSignal: boolean;   // false = no history/catalog to learn from yet
 conviction: number;   // 0..1 — how consistently they price OFF the market read (≈ how
                       //        much they price hands-on / "keep changing the price a lot")
};

const clampMult = (m: number) => Math.min(2.5, Math.max(0.6, m));

/**
 * How this store prices relative to market comps, whether we actually have signal,
 * and how "convicted" their pricing is. Native-intake (final price ÷ comp value) is
 * the most direct read and carries conviction from how far off market they routinely
 * land; the synced-catalog fallback is structural, so it informs the level but not
 * conviction. Defaults to (1, no signal, 0) until there's enough to learn from.
 */
export async function getStorePricingSignal(storeSlug: string): Promise<StorePricingSignal> {
 await ensureItemsTable();
 // 1) Native-intake signal (most direct): the seller's final price vs the comp market value we
 //    computed at intake. Only exists for stores that use Add-a-listing.
 const rows = (await db()`
  SELECT price_cents::float / market_cents AS ratio
  FROM intake_memory_items
  WHERE store_slug = ${storeSlug} AND market_cents > 0 AND price_cents > 0
  ORDER BY created_at DESC LIMIT 100
 `.catch(() => [])) as { ratio: number }[];
 const ratios = rows.map((r) => Number(r.ratio)).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
 if (ratios.length >= 3) {
 const mid = Math.floor(ratios.length / 2);
 const median = ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
 // "constantly changing the price a lot" ≈ they routinely set prices well off the market read.
 const offMarket = ratios.filter((r) => Math.abs(r - 1) > 0.15).length / ratios.length;
 return { inferredMult: clampMult(median), hasSignal: true, conviction: Math.min(1, offMarket * 1.15) };
 }
 // 2) SYNCED-catalog fallback (every store): how the store's OWN prices compare to the marketplace
 //    median for the SAME category — controlled for category mix. >1 = this store prices above market
 //    (e.g. 1.15 ≈ +15%), <1 = below. Structural pattern, so no per-item conviction.
 const syn = (await db()`
  WITH cat_market AS (
   SELECT product_type c, percentile_cont(0.5) WITHIN GROUP (ORDER BY price) med
   FROM products WHERE price > 0 AND product_type IS NOT NULL AND product_type <> ''
   GROUP BY product_type HAVING count(*) >= 5
  ), store_cat AS (
   SELECT product_type c, percentile_cont(0.5) WITHIN GROUP (ORDER BY price) smed
   FROM products WHERE store_slug = ${storeSlug} AND price > 0 AND product_type IS NOT NULL AND product_type <> ''
   GROUP BY product_type
  )
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY s.smed / m.med) AS ratio, count(*)::int AS cats
  FROM store_cat s JOIN cat_market m ON s.c = m.c WHERE m.med > 0 AND s.smed > 0
 `.catch(() => [])) as { ratio: number | null; cats: number }[];
 const r = syn[0];
 if (r && r.cats >= 2 && r.ratio != null && Number.isFinite(Number(r.ratio)) && Number(r.ratio) > 0) {
 return { inferredMult: clampMult(Number(r.ratio)), hasSignal: true, conviction: 0 };
 }
 return { inferredMult: 1, hasSignal: false, conviction: 0 };
}

/**
 * How this store prices relative to market comps (the multiplier alone). >1 = above
 * market, <1 = below. Defaults to 1 until there's enough history. Thin wrapper over
 * getStorePricingSignal for callers that only need the number.
 */
export async function getStorePriceMultiplier(storeSlug: string): Promise<number> {
 return (await getStorePricingSignal(storeSlug)).inferredMult;
}
