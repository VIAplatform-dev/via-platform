import { NextResponse } from "next/server";
import { embedPendingTrainingExamples } from "@/app/lib/training-data-db";
import { isEmbeddingConfigured } from "@/app/lib/embeddings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Chips away at the reference index — embeds a batch of catalog photos each run so specific-piece
// matching (resolveSpecificPiece) has coverage, and keeps up with new listings over time. Once
// everything embeddable is done it no-ops cheaply (a query returns nothing, no Voyage calls).
// Batch kept ≤150 so it finishes inside the 5-minute function limit even at ~1.5s/image.
// Manual run: ?key=<CRON_SECRET>&limit=150
export async function GET(request: Request) {
 const cronSecret = process.env.CRON_SECRET;
 const url = new URL(request.url);
 const authed = request.headers.get("authorization") === `Bearer ${cronSecret}` || (cronSecret && url.searchParams.get("key") === cronSecret);
 if (!cronSecret || !authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!isEmbeddingConfigured()) {
 return NextResponse.json({ ok: true, skipped: "Voyage not enabled (set VOYAGE_API_KEY).", embedded: 0 });
 }
 const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 150));
 const stats = await embedPendingTrainingExamples(limit).catch((e) => { console.error("embed-reference-index:", e); return null; });
 return NextResponse.json({ ok: true, ...(stats || { error: "failed" }) });
}
