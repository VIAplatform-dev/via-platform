import { neon } from "@neondatabase/serverless";
import { draftListing } from "./ai-intake";
import { brandMatch } from "./brand-match";
import { specificMatch } from "./eval-intake";
import { embedImage, isEmbeddingConfigured } from "./embeddings";
import { getCrossStoreSimilar, resolveSpecificPiece } from "./intake-memory-db";
import { gate } from "./concurrency";

// ───────────────────────────────────────────────────────────────────────────
// The ablation — does the learning loop actually DO anything?
//
// Runs the SAME items through the model TWICE: once BLIND (no memory) and once WITH
// the cross-store memory (visually-similar confirmed pieces + the specific-piece
// reference index) fed in as hints. If memory works, the "with memory" arm scores
// higher — a real number, not a hope. Neither arm is given the brand (so brand lift
// is measurable) and reverse-image is held out of BOTH (so the delta is memory ALONE).
//
// Leak guard: retrieval drops a near-identical self-match (an item can't learn from a
// copy of itself). And we report how often memory even PRODUCED a hint — because at
// pilot volume the corpus is near-empty and the honest result is "no lift yet, nothing
// to retrieve". It becomes meaningful once the reference index is built + real listings flow.
// ───────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}
const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

export type ArmScore = {
 brand: { correct: number; total: number; pct: number | null };
 specific: { correct: number; total: number; pct: number | null };
 era: { correct: number; total: number; pct: number | null };
};
export type AblationResult = {
 sample: number;
 goldenOnly: boolean;
 memoryHitRate: number; // % of items where memory actually produced a hint (else it can't help)
 base: ArmScore;
 withMemory: ArmScore;
 delta: { brandPct: number | null; specificPct: number | null; eraPct: number | null };
 note: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function grade(items: { brandOk: boolean | null; specificOk: boolean | null; eraOk: boolean | null }[], key: "brandOk" | "specificOk" | "eraOk") {
 const gradable = items.filter((i) => i[key] !== null);
 const correct = gradable.filter((i) => i[key]).length;
 return { correct, total: gradable.length, pct: gradable.length ? Math.round((correct / gradable.length) * 100) : null };
}

export async function runAblation(opts: { sample: number; goldenOnly?: boolean }): Promise<AblationResult> {
 const sample = Math.max(1, Math.min(40, Math.round(opts.sample) || 12));
 const sql = db();

 let rows = opts.goldenOnly
 ? (await sql`SELECT image_urls, brand, era, title FROM training_examples WHERE golden AND brand IS NOT NULL AND brand <> '' AND jsonb_array_length(image_urls) > 0 ORDER BY random() LIMIT ${sample}`.catch(() => [])) as any[]
 : [];
 const ranGolden = rows.length > 0;
 if (!rows.length) {
 rows = (await sql`SELECT image_urls, brand, era, title FROM training_examples WHERE brand IS NOT NULL AND brand <> '' AND jsonb_array_length(image_urls) > 0 ORDER BY random() LIMIT ${sample}`.catch(() => [])) as any[];
 }

 const g = gate("ablation", 2); // two drafts per item — keep concurrency low
 let memoryHits = 0;
 const scored = await Promise.all(rows.map((r) => g.run(async () => {
 const imageUrl = Array.isArray(r.image_urls) ? r.image_urls[0] : null;
 if (!imageUrl || typeof imageUrl !== "string") return null;
 const truthBrand = r.brand as string;
 const truthTitle = (r.title as string) || "";
 const truthEra = (r.era as string | null) || null;
 try {
 // Build the memory hints (leak-guarded), in parallel with computing the embedding.
 const embedding = isEmbeddingConfigured() ? await embedImage(imageUrl).catch(() => null) : null;
 let hints = "";
 if (embedding && embedding.length) {
 const [cross, specific] = await Promise.all([
 getCrossStoreSimilar(embedding, null, 4, { excludeNearIdentical: true }).catch(() => ""),
 resolveSpecificPiece(embedding, null, { excludeNearIdentical: true }).catch(() => null),
 ]);
 const specificHint = specific
 ? `\n\nLIKELY THE SAME PIECE — a confirmed VYA/catalog reference matches this photo very closely (${Math.round(specific.similarity * 100)}% visual match): "${specific.model}"${specific.era ? ` (${specific.era})` : ""}. Treat this as a strong identification of the specific model/line. Never mention this reference in the copy.`
 : "";
 hints = cross + specificHint;
 }
 if (hints.trim()) memoryHits++;

 // Both arms blind on brand; reverse-image held out. Only difference = the memory hints.
 const [base, mem] = await Promise.all([
 draftListing([imageUrl]),
 draftListing([imageUrl], undefined, hints || undefined),
 ]);
 const score = (d: Awaited<ReturnType<typeof draftListing>>) => ({
 brandOk: brandMatch(d.brand?.value ?? null, truthBrand),
 specificOk: specificMatch(d.title || "", d.searchQuery, truthTitle, truthBrand),
 eraOk: truthEra ? norm(d.era?.value) === norm(truthEra) : null,
 });
 return { base: score(base), mem: score(mem) };
 } catch { return null; }
 })));

 const valid = scored.filter(Boolean) as { base: any; mem: any }[];
 const base: ArmScore = { brand: grade(valid.map((v) => v.base), "brandOk"), specific: grade(valid.map((v) => v.base), "specificOk"), era: grade(valid.map((v) => v.base), "eraOk") };
 const withMemory: ArmScore = { brand: grade(valid.map((v) => v.mem), "brandOk"), specific: grade(valid.map((v) => v.mem), "specificOk"), era: grade(valid.map((v) => v.mem), "eraOk") };
 const d = (a: number | null, b: number | null) => (a == null || b == null ? null : b - a);
 const memoryHitRate = valid.length ? Math.round((memoryHits / valid.length) * 100) : 0;
 const note = memoryHitRate === 0
 ? "Memory produced NO hints on any item — the corpus is empty, so it can't help yet. Build the reference index + get real listings flowing, then re-run."
 : `Memory produced a hint on ${memoryHitRate}% of items. A positive delta = the learning loop is really adding accuracy.`;

 return {
 sample: valid.length,
 goldenOnly: ranGolden,
 memoryHitRate,
 base,
 withMemory,
 delta: { brandPct: d(base.brand.pct, withMemory.brand.pct), specificPct: d(base.specific.pct, withMemory.specific.pct), eraPct: d(base.era.pct, withMemory.era.pct) },
 note,
 };
}
