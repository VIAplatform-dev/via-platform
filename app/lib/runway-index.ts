import { neon } from "@neondatabase/serverless";
import { embedImages, isEmbeddingConfigured } from "./embeddings";
import { houseKey, scoreRunwayCandidates, type RunwayCandidate, type RunwayLook, type RunwayVerdict } from "./runway-score";

// The decision rules live next door, pure and tested; re-exported so callers need one import.
export * from "./runway-score";

/** How many neighbours to pull before scoring. */
const TOP_K = 16;

// ───────────────────────────────────────────────────────────────────────────
// Runway look index — matching a seller's photo to a documented show.
//
// The existing runway path (ai-intake `identifyRunway`) infers a season from
// editorial CAPTIONS that reverse-image search happened to return. That works
// when Getty has shot the piece and the caption survives, and returns null
// otherwise. This is the other half: an actual nearest-neighbour index over
// runway looks, so a match is made on the garment rather than on words about it.
//
// WHAT'S STORED. Vectors and metadata — never the photographs. Once a look is
// embedded the pixels are dead weight for matching, and a licensed image corpus
// should stay wherever it's licensed to live. `source_url` and `license_ref`
// point back to the rights holder so any look can be traced and, if a licence
// lapses, deleted.
//
// HOW HARD THIS IS. A runway photo is a garment on a moving model under show
// lighting; a seller's photo is the same garment flat on a bed. Same-item,
// different-context is exactly where image embeddings are weakest, so the
// thresholds below are deliberately strict and this returns null far more often
// than it returns a season. Naming a show is a falsifiable public claim that
// raises the asking price — a wrong one is worse than none.
// ───────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

/**
 * voyage-multimodal-3. Both sides of the comparison must use the same model, and
 * this must stay in step with the `vector(1024)` column declared below.
 */
export const RUNWAY_EMBED_DIMS = 1024;

let ensured = false;

/**
 * Create the extension, table and index. pgvector 0.8 ships with Neon but isn't
 * installed by default. Safe to call repeatedly; memoised per instance.
 */
export async function ensureRunwayIndex(): Promise<void> {
 if (ensured) return;
 const sql = db();
 await sql`CREATE EXTENSION IF NOT EXISTS vector`;
 // The dimension is written literally because a column type can't be a bind
 // parameter; RUNWAY_EMBED_DIMS is the value every other path checks against.
 await sql`CREATE TABLE IF NOT EXISTS runway_looks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house TEXT NOT NULL,
  house_key TEXT NOT NULL,
  season TEXT NOT NULL,
  year INTEGER NOT NULL,
  look_no INTEGER,
  source_url TEXT,
  license_ref TEXT,
  embedding vector(1024) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 // One row per look per source image — re-ingesting the same image updates in place.
 await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_runway_looks_source ON runway_looks (source_url) WHERE source_url IS NOT NULL`;
 await sql`CREATE INDEX IF NOT EXISTS idx_runway_looks_house ON runway_looks (house_key, year)`;
 // HNSW over cosine distance — the operator class must match the <=> used in search.
 await sql`CREATE INDEX IF NOT EXISTS idx_runway_looks_vec ON runway_looks USING hnsw (embedding vector_cosine_ops)`;
 ensured = true;
}

/** pgvector takes its literal as a bracketed list; neon binds it as text, then we cast. */
function vectorLiteral(v: number[]): string {
 return `[${v.join(",")}]`;
}

// ── Ingest ─────────────────────────────────────────────────────────────────

export type IngestLook = RunwayLook & { imageUrl: string };

/**
 * Add looks to the index. Embeds in batches and stores vectors only. Returns how
 * many landed, so a loader can report progress over a large corpus.
 */
export async function ingestRunwayLooks(looks: IngestLook[]): Promise<{ added: number; skipped: number }> {
 if (!looks.length) return { added: 0, skipped: 0 };
 if (!isEmbeddingConfigured()) throw new Error("VOYAGE_API_KEY is not set — nothing can be embedded.");
 await ensureRunwayIndex();
 const sql = db();

 const embeddings = await embedImages(looks.map((l) => l.imageUrl));
 let added = 0;
 let skipped = 0;
 for (let i = 0; i < looks.length; i++) {
  const emb = embeddings[i];
  const l = looks[i];
  // An unfetchable image is a skip, not a failure — big corpora always have some.
  if (!emb || emb.length !== RUNWAY_EMBED_DIMS || !l.house || !l.season || !l.year) { skipped++; continue; }
  await sql`
   INSERT INTO runway_looks (house, house_key, season, year, look_no, source_url, license_ref, embedding)
   VALUES (${l.house}, ${houseKey(l.house)}, ${l.season}, ${l.year}, ${l.lookNo ?? null}, ${l.sourceUrl ?? null}, ${l.licenseRef ?? null}, ${vectorLiteral(emb)}::vector)
   ON CONFLICT (source_url) WHERE source_url IS NOT NULL
   DO UPDATE SET house = EXCLUDED.house, house_key = EXCLUDED.house_key, season = EXCLUDED.season,
    year = EXCLUDED.year, look_no = EXCLUDED.look_no, license_ref = EXCLUDED.license_ref, embedding = EXCLUDED.embedding
  `.catch(() => { skipped++; });
  added++;
 }
 return { added: added - skipped < 0 ? 0 : added - skipped, skipped };
}

/** Remove looks by licence — the lever to pull if a corpus licence lapses. */
export async function deleteRunwayLooksByLicense(licenseRef: string): Promise<number> {
 await ensureRunwayIndex();
 const rows = (await db()`DELETE FROM runway_looks WHERE license_ref = ${licenseRef} RETURNING id`) as unknown[];
 return rows.length;
}

export async function runwayIndexStats(): Promise<{ looks: number; houses: number; years: [number, number] | null }> {
 await ensureRunwayIndex();
 const rows = (await db()`
  SELECT COUNT(*)::int AS looks, COUNT(DISTINCT house_key)::int AS houses, MIN(year)::int AS min_y, MAX(year)::int AS max_y
  FROM runway_looks
 `) as Array<Record<string, unknown>>;
 const r = rows[0] ?? {};
 const looks = Number(r.looks) || 0;
 return {
  looks,
  houses: Number(r.houses) || 0,
  years: looks && r.min_y != null ? [Number(r.min_y), Number(r.max_y)] : null,
 };
}

// ── Search ─────────────────────────────────────────────────────────────────

/** Nearest looks to one embedding. `1 - (a <=> b)` turns cosine distance into similarity. */
export async function searchRunwayLooks(embedding: number[], k = TOP_K, house?: string | null): Promise<RunwayCandidate[]> {
 await ensureRunwayIndex();
 const sql = db();
 const vec = vectorLiteral(embedding);
 // Narrowing to the known house first is both faster and safer — it stops a
 // visually similar look from another label being offered at all.
 const rows = (house
  ? await sql`
    SELECT house, season, year, look_no, source_url, license_ref, 1 - (embedding <=> ${vec}::vector) AS similarity
    FROM runway_looks WHERE house_key = ${houseKey(house)}
    ORDER BY embedding <=> ${vec}::vector LIMIT ${k}`
  : await sql`
    SELECT house, season, year, look_no, source_url, license_ref, 1 - (embedding <=> ${vec}::vector) AS similarity
    FROM runway_looks
    ORDER BY embedding <=> ${vec}::vector LIMIT ${k}`) as Array<Record<string, unknown>>;

 return rows.map((r) => ({
  house: String(r.house),
  season: String(r.season),
  year: Number(r.year),
  lookNo: r.look_no == null ? null : Number(r.look_no),
  sourceUrl: r.source_url ? String(r.source_url) : null,
  licenseRef: r.license_ref ? String(r.license_ref) : null,
  similarity: Number(r.similarity) || 0,
 }));
}

/**
 * The match step: seller photos in, a documented season out (or null). Tries each
 * photo and keeps the strongest verdict — the piece is often clearest in a shot
 * that isn't the first one.
 */
export async function matchRunwayByImage(imageUrls: string[], brand?: string | null): Promise<RunwayVerdict> {
 const urls = (imageUrls || []).filter(Boolean).slice(0, 3);
 if (!urls.length || !isEmbeddingConfigured()) return { runway: null, confidence: 0, reason: "no-index" };

 const embeddings = await embedImages(urls).catch(() => urls.map(() => null));
 let best: RunwayVerdict = { runway: null, confidence: 0, reason: "no-index" };
 for (const emb of embeddings) {
  if (!emb) continue;
  const candidates = await searchRunwayLooks(emb, TOP_K, brand).catch(() => [] as RunwayCandidate[]);
  const verdict = scoreRunwayCandidates(candidates, brand);
  if (verdict.runway) return verdict; // a confident hit ends it — no need to spend more
  if (verdict.confidence > best.confidence) best = verdict;
 }
 return best;
}
