import { neon } from "@neondatabase/serverless";
import { embedImageResult, isEmbeddingConfigured } from "./embeddings";

// The VYA training dataset — one clean, append-only "golden record" per example, so
// that when we're ready to train our own model it starts from pristine data, not a
// mess we have to reconstruct. Two sources feed it:
//   • 'intake'      — new AI-assisted listings: photo + the AI's guess + the seller's
//                     final answer + which fields were accepted (the richest signal).
//   • 'items' /     — everything ALREADY on the platform (VYA inventory + marketplace
//     'marketplace'   products): photo → human-written brand/era/price/title. A
//                     finished listing IS a labeled example.
// Stable UNIQUE(source, item_ref) makes both capture and backfill idempotent.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 const sql = db();
 await sql`
  CREATE TABLE IF NOT EXISTS training_examples (
   id SERIAL PRIMARY KEY,
   source TEXT NOT NULL,
   store_slug TEXT,
   item_ref TEXT NOT NULL,
   image_urls JSONB NOT NULL DEFAULT '[]',
   brand TEXT, era TEXT, material TEXT, condition TEXT, category TEXT, size TEXT,
   title TEXT, description TEXT,
   price_cents INTEGER, market_cents INTEGER,
   ai_brand TEXT, ai_era TEXT, ai_material TEXT, ai_condition TEXT, ai_category TEXT,
   ai_title TEXT, ai_description TEXT, ai_runway TEXT,
   accepted JSONB,
   reverse_image JSONB,
   prompt_version TEXT,
   trust TEXT,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   UNIQUE (source, item_ref)
  )
 `;
 await sql`CREATE INDEX IF NOT EXISTS idx_training_source ON training_examples (source, created_at DESC)`;
 // Golden set: a small, hand-verified subset that IS the benchmark — the real exam, so
 // accuracy isn't measured against noisy auto-labels. Self-healing add for existing tables.
 await sql`ALTER TABLE training_examples ADD COLUMN IF NOT EXISTS golden BOOLEAN NOT NULL DEFAULT false`.catch(() => {});
 await sql`ALTER TABLE training_examples ADD COLUMN IF NOT EXISTS golden_at TIMESTAMPTZ`.catch(() => {});
 await sql`CREATE INDEX IF NOT EXISTS idx_training_golden ON training_examples (golden) WHERE golden`.catch(() => {});
 // Reference index: a photo embedding per labeled example, so a new upload can be matched to the
 // SPECIFIC known piece (title carries the model/line) and priced off it — not just brand-guessed.
 // Populated in batches by embedPendingTrainingExamples (Voyage cost, so it's a run-when-ready job).
 await sql`ALTER TABLE training_examples ADD COLUMN IF NOT EXISTS embedding TEXT`.catch(() => {});
 ensured = true;
}

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
const clean = (v: string | null | undefined, n = 300) => { const s = (v ?? "").trim(); return s ? s.slice(0, n) : null; };

export type IntakeExample = {
 itemId: string;
 storeSlug: string;
 imageUrls: string[];
 final: Partial<Record<"brand" | "era" | "material" | "condition" | "category" | "size" | "title" | "description", string | null>>;
 priceCents: number | null;
 marketCents: number | null;
 ai: Partial<Record<"brand" | "era" | "material" | "condition" | "category" | "title" | "description" | "runway", string | null>>;
 reverseImage?: unknown;
 promptVersion?: string | null;
 trust: string;
};

const AI_FIELDS = ["brand", "era", "material", "condition", "category", "title", "description"] as const;

/** Record one AI-assisted listing as a golden training example (upsert on republish). */
export async function recordIntakeExample(x: IntakeExample): Promise<void> {
 await ensureTable();
 // Which AI predictions the seller kept vs. changed — the label quality signal.
 const accepted: Record<string, boolean> = {};
 for (const f of AI_FIELDS) {
 const aiv = x.ai[f];
 if (aiv && aiv.trim()) accepted[f] = norm(aiv) === norm(x.final[f as keyof typeof x.final]);
 }
 const f = x.final, ai = x.ai;
 await db()`
  INSERT INTO training_examples
   (source, store_slug, item_ref, image_urls, brand, era, material, condition, category, size, title, description,
    price_cents, market_cents, ai_brand, ai_era, ai_material, ai_condition, ai_category, ai_title, ai_description, ai_runway,
    accepted, reverse_image, prompt_version, trust)
  VALUES ('intake', ${x.storeSlug}, ${x.itemId}, ${JSON.stringify(x.imageUrls ?? [])},
   ${clean(f.brand, 80)}, ${clean(f.era, 40)}, ${clean(f.material, 120)}, ${clean(f.condition, 80)}, ${clean(f.category, 60)}, ${clean(f.size, 40)},
   ${clean(f.title, 200)}, ${clean(f.description, 2000)},
   ${x.priceCents ?? null}, ${x.marketCents ?? null},
   ${clean(ai.brand, 80)}, ${clean(ai.era, 40)}, ${clean(ai.material, 120)}, ${clean(ai.condition, 80)}, ${clean(ai.category, 60)},
   ${clean(ai.title, 200)}, ${clean(ai.description, 2000)}, ${clean(ai.runway, 120)},
   ${JSON.stringify(accepted)}, ${x.reverseImage ? JSON.stringify(x.reverseImage) : null}, ${x.promptVersion ?? null}, ${x.trust})
  ON CONFLICT (source, item_ref) DO UPDATE SET
   image_urls = EXCLUDED.image_urls, brand = EXCLUDED.brand, era = EXCLUDED.era, material = EXCLUDED.material,
   condition = EXCLUDED.condition, category = EXCLUDED.category, size = EXCLUDED.size, title = EXCLUDED.title,
   description = EXCLUDED.description, price_cents = EXCLUDED.price_cents, accepted = EXCLUDED.accepted, trust = EXCLUDED.trust
 `.catch(() => {});
}

/** Backfill every VYA-native inventory item (rich human labels) into the dataset. */
export async function backfillFromItems(): Promise<number> {
 await ensureTable();
 const rows = (await db()`
  WITH ins AS (
   INSERT INTO training_examples (source, store_slug, item_ref, image_urls, brand, era, material, condition, category, size, title, price_cents, trust)
   SELECT 'items', s.slug, i.id::text, i.images, i.brand, i.era, i.material, i.condition, i.category, i.size, i.title, i.price_cents, 'high'
   FROM items i JOIN sellers s ON s.id = i.seller_id
   WHERE jsonb_array_length(i.images) > 0 AND i.title IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM training_examples te WHERE te.source = 'intake' AND te.item_ref = i.id::text)
   ON CONFLICT (source, item_ref) DO NOTHING
   RETURNING 1
  ) SELECT count(*)::int AS n FROM ins
 `.catch(() => [{ n: 0 }])) as { n: number }[];
 return rows[0]?.n ?? 0;
}

/** Backfill every marketplace product (photo → seller-written title/brand/price). */
export async function backfillFromProducts(): Promise<number> {
 await ensureTable();
 const rows = (await db()`
  WITH ins AS (
   INSERT INTO training_examples (source, store_slug, item_ref, image_urls, brand, title, description, size, price_cents, trust)
   SELECT 'marketplace', p.store_slug, p.id::text,
    jsonb_build_array(p.image), p.brand, p.title, p.description, p.size,
    CASE WHEN p.price IS NOT NULL THEN round(p.price * 100)::int ELSE NULL END, 'medium'
   FROM products p
   WHERE p.image IS NOT NULL AND p.image <> '' AND p.title IS NOT NULL
   ON CONFLICT (source, item_ref) DO NOTHING
   RETURNING 1
  ) SELECT count(*)::int AS n FROM ins
 `.catch(() => [{ n: 0 }])) as { n: number }[];
 return rows[0]?.n ?? 0;
}

export type TrainingStats = {
 total: number;
 bySource: { source: string; count: number; withBrand: number; withPrice: number; withImage: number }[];
};

export async function getTrainingStats(): Promise<TrainingStats> {
 await ensureTable();
 const rows = (await db()`
  SELECT source, COUNT(*)::int AS count,
   COUNT(*) FILTER (WHERE brand IS NOT NULL AND brand <> '')::int AS with_brand,
   COUNT(*) FILTER (WHERE price_cents > 0)::int AS with_price,
   COUNT(*) FILTER (WHERE jsonb_array_length(image_urls) > 0)::int AS with_image
  FROM training_examples GROUP BY source ORDER BY count DESC
 `.catch(() => [])) as { source: string; count: number; with_brand: number; with_price: number; with_image: number }[];
 const bySource = rows.map((r) => ({ source: r.source, count: Number(r.count), withBrand: Number(r.with_brand), withPrice: Number(r.with_price), withImage: Number(r.with_image) }));
 return { total: bySource.reduce((s, r) => s + r.count, 0), bySource };
}

// ── Golden set: the hand-verified benchmark ───────────────────────────────────
// "Golden" means a human confirmed the brand + sold price are correct — so it's the
// answer key we actually trust. The exam runs against these instead of noisy auto-labels.

export type GoldenExample = {
 id: number; source: string; itemRef: string; imageUrl: string | null;
 brand: string | null; era: string | null; category: string | null;
 priceCents: number | null; title: string | null; trust: string | null;
};

/** Promote/demote examples to the golden set by id. Idempotent; returns the new golden count. */
export async function markGolden(ids: number[], on = true): Promise<number> {
 await ensureTable();
 const clean = ids.map((n) => Math.round(Number(n))).filter((n) => Number.isFinite(n) && n > 0);
 if (clean.length) {
 await db()`UPDATE training_examples SET golden = ${on}, golden_at = ${on ? new Date().toISOString() : null} WHERE id = ANY(${clean})`.catch(() => {});
 }
 const rows = (await db()`SELECT COUNT(*)::int AS n FROM training_examples WHERE golden`.catch(() => [{ n: 0 }])) as { n: number }[];
 return rows[0]?.n ?? 0;
}

export type GoldenStats = { total: number; byCategory: { category: string; n: number }[]; withPrice: number; tiers: { trust: string; n: number }[] };
export async function getGoldenStats(): Promise<GoldenStats> {
 await ensureTable();
 const [tot, cats, tiers] = await Promise.all([
 db()`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE price_cents > 0)::int AS priced FROM training_examples WHERE golden`.catch(() => [{ n: 0, priced: 0 }]),
 db()`SELECT COALESCE(NULLIF(lower(trim(category)), ''), 'uncategorized') AS c, COUNT(*)::int AS n FROM training_examples WHERE golden GROUP BY c ORDER BY n DESC`.catch(() => []),
 db()`SELECT COALESCE(trust, 'unknown') AS t, COUNT(*)::int AS n FROM training_examples WHERE golden GROUP BY t ORDER BY n DESC`.catch(() => []),
 ]) as [{ n: number; priced: number }[], { c: string; n: number }[], { t: string; n: number }[]];
 return {
 total: Number(tot[0]?.n || 0),
 withPrice: Number(tot[0]?.priced || 0),
 byCategory: cats.map((r) => ({ category: String(r.c), n: Number(r.n) })),
 tiers: tiers.map((r) => ({ trust: String(r.t), n: Number(r.n) })),
 };
}

/** Best auto-labeled rows to REVIEW for promotion — the trustworthiest candidates first:
 *  high-trust, a usable photo, a brand + a real price, and (for intake rows) the seller KEPT
 *  the AI's brand. A human still confirms before these become golden. */
export async function getGoldenCandidates(limit = 60, category?: string): Promise<GoldenExample[]> {
 await ensureTable();
 const lim = Math.max(1, Math.min(200, Math.round(limit)));
 const cat = (category ?? "").trim().toLowerCase();
 const rows = (await db()`
  SELECT id, source, item_ref, image_urls, brand, era, category, price_cents, title, trust
  FROM training_examples
  WHERE NOT golden
   AND brand IS NOT NULL AND brand <> ''
   AND price_cents > 0
   AND jsonb_array_length(image_urls) > 0
   AND (${cat} = '' OR lower(trim(category)) = ${cat})
   AND (source <> 'intake' OR accepted IS NULL OR (accepted->>'brand') = 'true')
  ORDER BY (CASE WHEN trust = 'high' THEN 0 WHEN trust = 'medium' THEN 1 ELSE 2 END), created_at DESC
  LIMIT ${lim}
 `.catch(() => [])) as Record<string, unknown>[];
 const s = (v: unknown) => (v == null || v === "" ? null : String(v));
 return rows.map((r) => ({
 id: Number(r.id), source: String(r.source), itemRef: String(r.item_ref),
 imageUrl: Array.isArray(r.image_urls) && r.image_urls[0] ? String(r.image_urls[0]) : null,
 brand: s(r.brand), era: s(r.era), category: s(r.category),
 priceCents: r.price_cents != null ? Number(r.price_cents) : null, title: s(r.title), trust: s(r.trust),
 }));
}

// ── Reference index: embed the labeled catalog so uploads match a SPECIFIC piece ──
// Turns training_examples (brand + title + era + price for thousands of pieces) into a visual
// reference by adding a photo embedding to each. Batched + idempotent — one Voyage call per
// unembedded row, newest first, prioritizing rows with a brand + title (the useful references).

export type ReferenceIndexStats = { embedded: number; embeddable: number; remaining: number; withBrandTitle: number; badImage?: number; rateLimited?: number };

/**
 * Embed a batch of un-embedded training examples. Gated on Voyage; safe to re-run (only fills gaps).
 * Rate-limit-aware: a throttled image is LEFT unembedded (retried next run), only a genuinely bad
 * URL is marked '[]' (permanently skipped) — so throttling can't poison the index. Runs sequentially
 * so it self-paces against Voyage's rate limit; keep the batch modest (default 60, like the sold cron).
 */
export async function embedPendingTrainingExamples(limit = 60): Promise<ReferenceIndexStats> {
 await ensureTable();
 if (!isEmbeddingConfigured()) return { embedded: 0, embeddable: 0, remaining: 0, withBrandTitle: 0 };
 const lim = Math.max(1, Math.min(300, Math.round(limit)));
 const rows = (await db()`
  SELECT id, image_urls FROM training_examples
  WHERE embedding IS NULL AND jsonb_array_length(image_urls) > 0
   AND brand IS NOT NULL AND brand <> '' AND title IS NOT NULL AND title <> ''
  ORDER BY (CASE WHEN trust = 'high' THEN 0 WHEN trust = 'medium' THEN 1 ELSE 2 END), created_at DESC
  LIMIT ${lim}
 `.catch(() => [])) as { id: number; image_urls: unknown }[];
 let embedded = 0, badImage = 0, rateLimited = 0;
 for (const r of rows) {
 const url = Array.isArray(r.image_urls) && r.image_urls[0] ? String(r.image_urls[0]) : null;
 if (!url) { await db()`UPDATE training_examples SET embedding = '[]' WHERE id = ${r.id}`.catch(() => {}); badImage++; continue; }
 const { embedding, status } = await embedImageResult(url);
 if (status === "ok" && embedding && embedding.length) {
 await db()`UPDATE training_examples SET embedding = ${JSON.stringify(embedding)} WHERE id = ${r.id}`.catch(() => {});
 embedded++;
 } else if (status === "bad_image") {
 await db()`UPDATE training_examples SET embedding = '[]' WHERE id = ${r.id}`.catch(() => {}); // permanent skip — the URL is unusable
 badImage++;
 } else {
 rateLimited++; // throttled/transient — LEAVE it null so the next run retries it
 }
 }
 return getReferenceIndexStats().then((st) => ({ ...st, embedded, badImage, rateLimited }));
}

/** Un-poison rows a prior (buggy) run marked '[]' under throttling, so they get re-attempted. */
export async function resetFailedEmbeddings(): Promise<number> {
 await ensureTable();
 const rows = (await db()`
  WITH u AS (UPDATE training_examples SET embedding = NULL WHERE embedding = '[]' RETURNING 1)
  SELECT count(*)::int AS n FROM u
 `.catch(() => [{ n: 0 }])) as { n: number }[];
 return rows[0]?.n ?? 0;
}

export async function getReferenceIndexStats(): Promise<ReferenceIndexStats> {
 await ensureTable();
 const rows = (await db()`
  SELECT
   COUNT(*) FILTER (WHERE embedding IS NOT NULL AND embedding <> '[]')::int AS embedded,
   COUNT(*) FILTER (WHERE jsonb_array_length(image_urls) > 0 AND brand IS NOT NULL AND brand <> '' AND title IS NOT NULL AND title <> '')::int AS embeddable,
   COUNT(*) FILTER (WHERE embedding IS NULL AND jsonb_array_length(image_urls) > 0 AND brand IS NOT NULL AND brand <> '' AND title IS NOT NULL AND title <> '')::int AS remaining,
   COUNT(*) FILTER (WHERE brand IS NOT NULL AND brand <> '' AND title IS NOT NULL AND title <> '')::int AS with_bt
  FROM training_examples
 `.catch(() => [{ embedded: 0, embeddable: 0, remaining: 0, with_bt: 0 }])) as { embedded: number; embeddable: number; remaining: number; with_bt: number }[];
 const r = rows[0] || { embedded: 0, embeddable: 0, remaining: 0, with_bt: 0 };
 return { embedded: Number(r.embedded), embeddable: Number(r.embeddable), remaining: Number(r.remaining), withBrandTitle: Number(r.with_bt) };
}
