import { neon } from "@neondatabase/serverless";
import { embedImages, isEmbeddingConfigured } from "@/app/lib/embeddings";

// The photo index: one Voyage vector per item (first photo). Pilot-scale storage — JSON text scanned
// in JS per seller (a few hundred rows); pgvector when a seller passes ~5k items.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

export const EMBED_MODEL = "voyage-multimodal-3";

let ensured = false;
async function ensure(): Promise<void> {
 if (ensured) return;
 const s = db();
 await s`CREATE TABLE IF NOT EXISTS item_embeddings (
  item_id UUID PRIMARY KEY,
  seller_id UUID NOT NULL,
  image_url TEXT NOT NULL,
  model TEXT NOT NULL,
  embedding TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await s`CREATE INDEX IF NOT EXISTS item_embeddings_seller_idx ON item_embeddings (seller_id)`;
 ensured = true;
}

export type IndexedItem = { itemId: string; embedding: number[] };

/** Every usable vector for a seller's sellable items. */
export async function listSellerEmbeddings(sellerId: string): Promise<IndexedItem[]> {
 await ensure();
 const rows = (await db()`SELECT e.item_id, e.embedding FROM item_embeddings e JOIN items i ON i.id = e.item_id
  WHERE e.seller_id = ${sellerId} AND e.status = 'ok' AND i.status IN ('active','draft','reserved','sold')`) as Array<{ item_id: string; embedding: string }>;
 const out: IndexedItem[] = [];
 for (const r of rows) {
 try { const v = JSON.parse(r.embedding); if (Array.isArray(v) && v.length) out.push({ itemId: String(r.item_id), embedding: v }); } catch { /* skip malformed */ }
 }
 return out;
}

export async function indexStatus(sellerId: string): Promise<{ withPhotos: number; indexed: number; configured: boolean }> {
 await ensure();
 const [a] = (await db()`SELECT count(*)::int AS n FROM items WHERE seller_id = ${sellerId} AND status IN ('active','draft') AND jsonb_array_length(images) > 0`) as Array<{ n: number }>;
 const [b] = (await db()`SELECT count(*)::int AS n FROM item_embeddings e JOIN items i ON i.id = e.item_id WHERE e.seller_id = ${sellerId} AND e.status = 'ok' AND i.status IN ('active','draft') AND e.image_url = i.images->>0`) as Array<{ n: number }>;
 return { withPhotos: a?.n ?? 0, indexed: b?.n ?? 0, configured: isEmbeddingConfigured() };
}

/** Sellable items whose first photo has no (current) vector. Re-indexes when the first photo changed. */
async function backlog(sellerId: string | null, limit: number): Promise<{ id: string; sellerId: string; image: string }[]> {
 await ensure();
 const rows = sellerId
 ? await db()`SELECT i.id, i.seller_id, i.images->>0 AS image FROM items i LEFT JOIN item_embeddings e ON e.item_id = i.id
   WHERE i.seller_id = ${sellerId} AND i.status IN ('active','draft') AND jsonb_array_length(i.images) > 0
   AND (e.item_id IS NULL OR (e.image_url <> i.images->>0 AND e.status = 'ok')) ORDER BY i.created_at DESC LIMIT ${limit}`
 : await db()`SELECT i.id, i.seller_id, i.images->>0 AS image FROM items i LEFT JOIN item_embeddings e ON e.item_id = i.id
   WHERE i.status IN ('active','draft') AND jsonb_array_length(i.images) > 0
   AND (e.item_id IS NULL OR (e.image_url <> i.images->>0 AND e.status = 'ok')) ORDER BY i.updated_at DESC LIMIT ${limit}`;
 return (rows as Array<Record<string, unknown>>).map((r) => ({ id: String(r.id), sellerId: String(r.seller_id), image: String(r.image) }));
}

/** Embed up to `limit` backlog items (one seller, or everyone for the cron). Rate-limit blips are
 *  left for the next run; genuinely bad images are marked so they aren't retried forever. */
export async function indexItems(sellerId: string | null, limit = 48): Promise<{ attempted: number; indexed: number; bad: number; deferred: number }> {
 const out = { attempted: 0, indexed: 0, bad: 0, deferred: 0 };
 if (!isEmbeddingConfigured()) return out;
 const todo = await backlog(sellerId, limit);
 if (!todo.length) return out;
 out.attempted = todo.length;
 const vecs = await embedImages(todo.map((t) => t.image));
 for (let i = 0; i < todo.length; i++) {
 const t = todo[i], v = vecs[i];
 if (v) {
 await db()`INSERT INTO item_embeddings (item_id, seller_id, image_url, model, embedding, status, updated_at)
  VALUES (${t.id}, ${t.sellerId}, ${t.image}, ${EMBED_MODEL}, ${JSON.stringify(v)}, 'ok', now())
  ON CONFLICT (item_id) DO UPDATE SET image_url = EXCLUDED.image_url, embedding = EXCLUDED.embedding, status = 'ok', updated_at = now()`;
 out.indexed++;
 } else out.deferred++; // embedImages can't tell us which failures are permanent; the cron retries, cheap at this scale
 }
 return out;
}

/** Index one item right now (after Quick List / a photo change). Best-effort. */
export async function indexItem(itemId: string, sellerId: string, image: string): Promise<void> {
 if (!isEmbeddingConfigured() || !image) return;
 const [v] = await embedImages([image]);
 if (!v) return;
 await ensure();
 await db()`INSERT INTO item_embeddings (item_id, seller_id, image_url, model, embedding, status, updated_at)
  VALUES (${itemId}, ${sellerId}, ${image}, ${EMBED_MODEL}, ${JSON.stringify(v)}, 'ok', now())
  ON CONFLICT (item_id) DO UPDATE SET image_url = EXCLUDED.image_url, embedding = EXCLUDED.embedding, status = 'ok', updated_at = now()`;
}
