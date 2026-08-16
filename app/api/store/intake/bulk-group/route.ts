import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { embedImage, cosine, isEmbeddingConfigured } from "@/app/lib/embeddings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Cluster a bulk photo drop into distinct ITEMS by visual similarity — each returned group is one
// item's set of photos (e.g. the front/back/tag shots of one bag). Best-effort: without embeddings
// it falls back to one item per photo, and the client lets the seller merge/split before drafting,
// so imperfect grouping is fine — this just gives a smart starting point.
const SAME_ITEM = 0.82; // cosine >= this ~ the same piece (a different angle of one item)

export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => null);
 const urls: string[] = Array.isArray(body?.imageUrls)
  ? body.imageUrls.filter((u: unknown) => typeof u === "string" && u).slice(0, 60)
  : [];
 if (!urls.length) return NextResponse.json({ groups: [], grouped: false });

 // No embeddings configured → one item per photo; the seller groups them manually.
 if (!isEmbeddingConfigured()) return NextResponse.json({ groups: urls.map((u) => [u]), grouped: false });

 const embs = await Promise.all(urls.map((u) => embedImage(u).catch(() => null)));

 // Greedy single-linkage: drop each photo into the first existing item it's similar enough to,
 // else start a new item. A photo that fails to embed becomes its own item.
 const groups: { urls: string[]; vecs: number[][] }[] = [];
 urls.forEach((url, i) => {
  const v = embs[i];
  if (!v) { groups.push({ urls: [url], vecs: [] }); return; }
  let best = -1, bestScore = SAME_ITEM;
  groups.forEach((g, gi) => {
   for (const gv of g.vecs) { const s = cosine(v, gv); if (s >= bestScore) { bestScore = s; best = gi; } }
  });
  if (best >= 0) { groups[best].urls.push(url); groups[best].vecs.push(v); }
  else groups.push({ urls: [url], vecs: [v] });
 });

 return NextResponse.json({ groups: groups.map((g) => g.urls), grouped: true });
}
