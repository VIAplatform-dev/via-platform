import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { embedImageData, isEmbeddingConfigured } from "@/app/lib/embeddings";
import { listSellerEmbeddings, indexItems } from "@/app/lib/market/embeddings-db";
import { rankCandidates, classifyMatch } from "@/app/lib/market/match-core";
import { getOpenSession, listSessionItemIds } from "@/app/lib/market/sessions-db";
import { getMarketItem, type MarketItem } from "@/app/lib/market/inventory-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // indexing a first batch inline can take a few seconds

// POST { image: data-URL (client-resized JPEG) } → { level, candidates:[{item, score}] }.
// The AI identifies; the SELLER confirms on the next screen. Never auto-selects.
export async function POST(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!isEmbeddingConfigured()) return NextResponse.json({ notConfigured: true, level: "none", candidates: [] });
 const body = await request.json().catch(() => null);
 const image = typeof body?.image === "string" ? body.image : "";
 if (!image.startsWith("data:image/") || image.length > 2_500_000) return NextResponse.json({ error: "Send a JPEG data URL under ~2 MB." }, { status: 400 });

 const [query, index0, session] = await Promise.all([embedImageData(image), listSellerEmbeddings(acting.seller.id), getOpenSession(acting.seller.id)]);
 if (!query) return NextResponse.json({ error: "Couldn't read that photo — try again with more light." }, { status: 502 });

 // BUILD THE INDEX HERE IF IT IS EMPTY, rather than telling her to go and run it.
 //
 // Photo search needs an embedding per piece, and those were only ever created by a cron or by a
 // "Run Index" button in Setup. So a seller standing at a market photographing a piece she is
 // holding was told "Photos not indexed yet · Run Index in Setup" — a setup step, in the middle of
 // a sale, for a feature whose entire point is that it is faster than typing.
 //
 // One batch, inline, then carry on with the match. If she has more pieces than a batch, the rest
 // keep filling in behind her (cron + the next photo), so this is worth doing even when partial.
 let index = index0;
 if (!index.length) {
  await indexItems(acting.seller.id, 24).catch(() => null); /* allow-swallow: indexing is best-effort here — a failure must degrade to "not found", never break the photo she just took */
  index = await listSellerEmbeddings(acting.seller.id).catch(() => index0);
 }
 if (!index.length) return NextResponse.json({ level: "none", candidates: [], unindexed: true });
 const bring = new Set(session ? await listSessionItemIds(session.id) : []);

 const ranked = rankCandidates(query, index.map((e) => ({ id: e.itemId, vec: e.embedding, onBringList: bring.has(e.itemId) })));
 const { level, candidates } = classifyMatch(ranked);
 const items = (await Promise.all(candidates.map((c) => getMarketItem(acting.seller.id, c.id)))).filter((i): i is MarketItem => !!i);
 const out = candidates.map((c) => ({ score: Math.round(c.score * 100) / 100, item: items.find((i) => i.id === c.id)! })).filter((c) => c.item);
 // A sold piece at the top is a useful hint ("looks like X — sold 2h ago"), but never a "We found it".
 const sellable = out.filter((c) => c.item.status === "active" || c.item.status === "draft" || c.item.status === "reserved");
 const effectiveLevel = level === "high" && out[0]?.item.status === "sold" ? "medium" : level;
 return NextResponse.json({ level: sellable.length ? effectiveLevel : (out.length ? "medium" : "none"), candidates: out, top: ranked[0] ? Math.round(ranked[0].score * 100) / 100 : null });
}
