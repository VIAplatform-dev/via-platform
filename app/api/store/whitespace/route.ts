import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getStoreWhitespace } from "@/app/lib/data-layer/market-metrics-db";
import type { MetricWindow } from "@/app/lib/data-layer/config";

export const dynamic = "force-dynamic";

// Whitespace: rising, under-supplied market segments this store doesn't carry yet — the sourcing
// gap. Aggregated + privacy-gated in getStoreWhitespace; never exposes an individual store.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const w = request.nextUrl.searchParams.get("window");
 const windowKey: MetricWindow = w === "7d" ? "7d" : "30d";
 const picks = await getStoreWhitespace(slug, windowKey).catch(() => []);
 return NextResponse.json({ ok: true, picks, window: windowKey });
}
