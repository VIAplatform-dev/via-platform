import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { estimatePrice, valueFromComps } from "@/app/lib/price-engine";
import { compactQuery, fetchEbaySold, fetchComps, rankComps, filterModelConflicts, isCompsConfigured, type Comp } from "@/app/lib/comps";
import { getCachedComps, newestCompAgeDays } from "@/app/lib/comp-cache-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Read-only pricing X-ray. Runs the REAL valuation for a query and returns the comps it actually
// used, the market/median number, the source, and the rationale — so we can see WHY a price landed
// where it did (e.g. a Chanel Jumbo dragged down by cheaper look-alike flaps polluting the comp set).
//   /api/admin/price-debug?query=Chanel Jumbo Single Flap lambskin&brand=Chanel&era=2000s&condition=very good
function isAuthorized(request: NextRequest): boolean {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) return false;
 if (request.headers.get("authorization") === `Bearer ${pw}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === crypto.createHash("sha256").update(pw).digest("hex");
}

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const sp = new URL(request.url).searchParams;
 const query = (sp.get("query") || sp.get("q") || "").trim();
 if (!query) return NextResponse.json({ error: "Pass ?query=<title or brand + model> (optionally &brand=&era=&material=&condition=)" }, { status: 400 });
 const context = {
  brand: sp.get("brand") || null,
  era: sp.get("era") || null,
  material: sp.get("material") || null,
  condition: sp.get("condition") || null,
 };

 const d0 = (c: number | null | undefined) => (c == null ? null : Math.round(c) / 100);

 // ?fresh=1 — bypass estimatePrice's comp cache entirely: fetch live comps NOW (incl. eBay sold),
 // apply the model filter, and value straight from them. Shows what the price SHOULD be with the
 // fixed comp set, independent of any poisoned cache.
 if (sp.get("fresh") === "1") {
  const live = await fetchComps(query).catch(() => [] as Comp[]);
  const ranked = rankComps(live);
  const mf = filterModelConflicts(ranked, query);
  const comps = (mf.length >= 3 ? mf : ranked).slice(0, 40);
  const v = await valueFromComps(query, undefined, comps, { ...context });
  const sortedF = [...comps].sort((a, b) => a.priceCents - b.priceCents);
  return NextResponse.json({
   query, context, mode: "fresh (cache bypassed)",
   result: { marketPrice: d0(v.marketCents), range: [d0(v.low), d0(v.high)], confidence: v.confidence, rationale: v.rationale },
   liveCount: live.length,
   liveSoldCount: live.filter((c) => c.sold).length,
   afterFilterCount: comps.length,
   afterFilterSoldCount: comps.filter((c) => c.sold).length,
   comps: sortedF.slice(0, 30).map((c) => ({ price: d0(c.priceCents), sold: c.sold, source: c.source, title: c.title })),
  });
 }

 let est;
 try {
  est = await estimatePrice({ query, minMarkupBps: 3000, context });
 } catch (e) {
  return NextResponse.json({ query, context, error: String(e) }, { status: 502 });
 }

 const d = (c: number | null | undefined) => (c == null ? null : Math.round(c) / 100);

 // Isolate the eBay-SOLD retrieval — the sold anchor is what's missing. Shows the exact compact query
 // used and whatever eBay actually returned, so we can tell "query wrong" vs "SerpApi eBay broken".
 let ebay: unknown = { compsConfigured: isCompsConfigured() };
 if (sp.get("ebay") !== "0") {
  const cq = compactQuery(query);
  try {
   const sold = await fetchEbaySold(query);
   ebay = { compsConfigured: isCompsConfigured(), compactQuery: cq, soldCount: sold.length, sample: sold.slice(0, 10).map((c) => ({ price: d(c.priceCents), title: c.title, source: c.source, condition: c.condition })) };
  } catch (e) {
   ebay = { compsConfigured: isCompsConfigured(), compactQuery: cq, error: String(e) };
  }
 }

 const comps = (est.comps || []) as Comp[];
 // Sort the comps by price so pollution (a cluster of cheap look-alikes dragging the median) is obvious.
 const sorted = [...comps].sort((a, b) => a.priceCents - b.priceCents);
 return NextResponse.json({
  query,
  context,
  result: {
   source: est.source, // comps | knowledge | benchmark | floor | none
   marketPrice: d(est.marketCents),
   suggestedPrice: d(est.suggestedCents),
   floor: d(est.floorCents),
   range: [d(est.lowCents), d(est.highCents)],
   confidence: est.confidence,
   rationale: est.rationale,
  },
  ebaySoldDebug: ebay,
  cacheDebug: await (async () => {
   try {
    const cached = await getCachedComps({ query, brand: context.brand, category: "bags", maxAgeDays: 45, limit: 40 });
    const soldCached = cached.filter((c) => c.sold).length;
    const ageDays = await newestCompAgeDays(query).catch(() => null);
    // Mirrors estimatePrice: refetch when cold, or sold anchor is thin (<3 sold, or a big cache with
    // sold making up less than a quarter of it).
    const soldThin = soldCached < 3 || (cached.length >= 12 && soldCached < cached.length * 0.25);
    return { cachedCount: cached.length, soldCached, ageDays, wouldRefetchLive: cached.length < 8 || soldThin, note: soldThin ? "sold anchor thin → refetch live" : "cache has enough sold → no refetch" };
   } catch (e) { return { error: String(e) }; }
  })(),
  compCount: comps.length,
  soldCount: comps.filter((c) => c.sold).length,
  comps: sorted.map((c) => ({ price: d(c.priceCents), sold: c.sold, source: c.source, condition: c.condition, title: c.title, link: c.link })),
 });
}
