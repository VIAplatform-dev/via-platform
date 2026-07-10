import { NextResponse } from "next/server";
import { embedPendingSoldItems } from "@/app/lib/intake-memory-db";
import { isEmbeddingConfigured } from "@/app/lib/embeddings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily: embed the photos of items that recently SOLD so the visual price-comp corpus grows from
// real transactions ("pieces that look like this sold for $X"). Cheap — a handful of items/day,
// one Voyage call each. Dormant if VOYAGE_API_KEY isn't set. Manual run: ?key=<CRON_SECRET>.
export async function GET(request: Request) {
 const cronSecret = process.env.CRON_SECRET;
 const url = new URL(request.url);
 const authed = request.headers.get("authorization") === `Bearer ${cronSecret}` || (cronSecret && url.searchParams.get("key") === cronSecret);
 if (!cronSecret || !authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 if (!isEmbeddingConfigured()) {
 return NextResponse.json({ ok: true, skipped: "Voyage not enabled (set VOYAGE_API_KEY).", embedded: 0 });
 }

 const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 60));
 const res = await embedPendingSoldItems(limit).catch((e) => { console.error("embed-sold-items:", e); return { embedded: 0, remaining: -1 }; });
 return NextResponse.json({ ok: true, ...res });
}
