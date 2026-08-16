// Multimodal image embeddings (Voyage) for the intake visual-memory layer.
// We embed each listing photo so a new upload can be matched against the seller's
// own past pieces ("this looks like 3 things you listed as Blumarine").
//
// Gated on VOYAGE_API_KEY — if it's not set, embedImage returns null and the whole
// visual-retrieval path degrades gracefully back to the v1 text hints.

import { recordVoyage } from "./cost-tracker";

const VOYAGE_URL = "https://api.voyageai.com/v1/multimodalembeddings";
const MODEL = "voyage-multimodal-3"; // 1024-dim, text+image

export function isEmbeddingConfigured(): boolean {
 return Boolean(process.env.VOYAGE_API_KEY);
}

export type EmbedStatus = "ok" | "rate_limited" | "bad_image" | "error";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Embed a single image by URL, reporting WHY it failed so batch jobs can react correctly:
 *  • rate_limited (429 / 5xx, after retries) → transient; do NOT mark the row permanently failed.
 *  • bad_image (4xx / empty result) → the URL is genuinely unfetchable/unusable; safe to skip.
 * Retries a couple times with backoff on throttling, so one rate-limit blip doesn't lose an image.
 */
export async function embedImageResult(imageUrl: string): Promise<{ embedding: number[] | null; status: EmbedStatus }> {
 const key = process.env.VOYAGE_API_KEY;
 if (!key || !imageUrl) return { embedding: null, status: "bad_image" };
 for (let attempt = 0; attempt < 3; attempt++) {
 try {
 const res = await fetch(VOYAGE_URL, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify({ model: MODEL, inputs: [{ content: [{ type: "image_url", image_url: imageUrl }] }] }),
  signal: AbortSignal.timeout(15000),
 });
 if (res.status === 429 || res.status >= 500) {
  if (attempt < 2) { await sleep(800 * (attempt + 1)); continue; } // back off and retry
  return { embedding: null, status: "rate_limited" };
 }
 if (!res.ok) {
  console.error(`[embeddings] Voyage ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return { embedding: null, status: "bad_image" }; // 4xx = the image URL itself is the problem
 }
 const data = (await res.json()) as { data?: Array<{ embedding?: number[] }>; usage?: { total_tokens?: number } };
 const emb = data?.data?.[0]?.embedding;
 if (Array.isArray(emb) && emb.length > 0) { await recordVoyage(data); return { embedding: emb, status: "ok" }; }
 return { embedding: null, status: "bad_image" };
 } catch (err) {
  if (attempt < 2) { await sleep(800 * (attempt + 1)); continue; }
  console.error("[embeddings] failed:", err);
  return { embedding: null, status: "error" };
 }
 }
 return { embedding: null, status: "error" };
}

/** Embed a single image by URL. Returns the vector, or null on any failure. */
export async function embedImage(imageUrl: string): Promise<number[] | null> {
 return (await embedImageResult(imageUrl)).embedding;
}

/** Embed several images in ONE Voyage call (far cheaper + faster than N calls) — used to
 *  visually verify a batch of reverse-image comp thumbnails against the query photo. Returns a
 *  vector per input URL in order, null where that image failed. Chunks large batches. */
export async function embedImages(imageUrls: string[]): Promise<(number[] | null)[]> {
 const key = process.env.VOYAGE_API_KEY;
 const urls = (imageUrls || []).map((u) => (typeof u === "string" ? u : ""));
 if (!key || !urls.length) return urls.map(() => null);
 const CHUNK = 16; // keep each request comfortably within Voyage's batch limits
 const out: (number[] | null)[] = [];
 for (let start = 0; start < urls.length; start += CHUNK) {
 const slice = urls.slice(start, start + CHUNK);
 const inputs = slice.map((u) => ({ content: [{ type: "image_url", image_url: u }] }));
 let filled: (number[] | null)[] | null = null;
 for (let attempt = 0; attempt < 3 && !filled; attempt++) {
 try {
 const res = await fetch(VOYAGE_URL, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify({ model: MODEL, inputs }),
  signal: AbortSignal.timeout(20000),
 });
 if (res.status === 429 || res.status >= 500) { if (attempt < 2) { await sleep(800 * (attempt + 1)); continue; } filled = slice.map(() => null); break; }
 if (!res.ok) { filled = slice.map(() => null); break; }
 const data = (await res.json()) as { data?: Array<{ embedding?: number[]; index?: number }>; usage?: { total_tokens?: number } };
 await recordVoyage(data);
 const vecs: (number[] | null)[] = slice.map(() => null);
 (data.data || []).forEach((d, j) => { const idx = typeof d.index === "number" ? d.index : j; if (idx >= 0 && idx < vecs.length && Array.isArray(d.embedding) && d.embedding.length) vecs[idx] = d.embedding; });
 filled = vecs;
 } catch { if (attempt < 2) { await sleep(800 * (attempt + 1)); continue; } filled = slice.map(() => null); }
 }
 out.push(...(filled || slice.map(() => null)));
 }
 return out;
}

/** Cosine similarity between two equal-length vectors (0..1 for normalized inputs). */
export function cosine(a: number[], b: number[]): number {
 let dot = 0, na = 0, nb = 0;
 const n = Math.min(a.length, b.length);
 for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
 return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
