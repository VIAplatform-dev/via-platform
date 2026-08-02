import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getStoreFunnel, getItemFunnel } from "@/app/lib/analytics-events-db";

export const dynamic = "force-dynamic";

// The clean funnel for the acting store, straight off the canonical event stream: views →
// favorites → checkout-starts → purchases over a window, plus the per-item breakdown. One query,
// one key — the payoff of the unified events model. (?days=30 default.)
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const days = Math.min(365, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));
 const sinceISO = new Date(Date.now() - days * 86_400_000).toISOString();

 const [funnel, items] = await Promise.all([
  getStoreFunnel(slug, sinceISO),
  getItemFunnel(slug, sinceISO, 20),
 ]);

 return NextResponse.json({ ok: true, days, funnel, items });
}
