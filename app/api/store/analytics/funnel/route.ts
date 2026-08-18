import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getStoreFunnel, getItemFunnel } from "@/app/lib/analytics-events-db";
import { getListingsByStore } from "@/app/lib/listings-db";

export const dynamic = "force-dynamic";

// The clean funnel for the acting store, straight off the canonical event stream: views →
// favorites → checkout-starts → purchases over a window, plus the per-item breakdown (enriched with
// each piece's title/photo/price so the store sees WHICH item is viewed most / abandoned most).
// One key — the payoff of the unified events model. (?days=30 default.)
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const days = Math.min(365, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));
 const sinceISO = new Date(Date.now() - days * 86_400_000).toISOString();

 const [funnel, itemFunnel, listings] = await Promise.all([
  getStoreFunnel(slug, sinceISO),
  getItemFunnel(slug, sinceISO, 30),
  getListingsByStore(slug, false).catch(() => []),
 ]);

 const byId = new Map(listings.map((l) => [String(l.id), l]));
 const items = itemFunnel.map((it) => {
  const l = byId.get(it.itemId);
  return {
   itemId: it.itemId,
   title: l?.title ?? "(item removed)",
   image: l?.images?.[0] ?? null,
   price: l?.price ?? null,
   currency: l?.currency ?? "USD",
   status: l?.status ?? null,
   views: it.views,
   favorites: it.favorites,
   checkouts: it.checkouts,
   purchases: it.purchases,
   // A one-of-one sells once, so an abandon = a checkout start that didn't become the sale.
   abandoned: Math.max(0, it.checkouts - it.purchases),
  };
 });

 return NextResponse.json({ ok: true, days, funnel, items });
}
