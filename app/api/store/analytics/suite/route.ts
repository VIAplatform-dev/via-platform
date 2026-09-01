import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getAnalyticsSuite, emptyAnalyticsSuite, parseSections, StoreNotFoundError } from "@/app/lib/analytics/suite";

export const dynamic = "force-dynamic";

// GET /api/store/analytics/suite — the acting store's full analytics suite.
//
//   ?period=30d | 90d | mtd | qtd | ytd | 2026-08 | 2026-Q3 | 2026 | custom | all
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD   (with period=custom; `to` is inclusive)
//   ?tz=America/New_York             (calendar boundaries + day buckets; default UTC)
//   ?sections=sales,customers,...    (default: all six)
//
// Every section degrades to zeros rather than failing, so a brand-new store gets
// an empty dashboard instead of an error. The only real failure is "not a store".
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const q = new URL(request.url).searchParams;

 try {
  const suite = await getAnalyticsSuite(slug, {
   period: q.get("period"),
   from: q.get("from"),
   to: q.get("to"),
   tz: q.get("tz"),
   sections: parseSections(q.get("sections")),
  });
  return NextResponse.json({ ok: true, ...suite });
 } catch (e) {
  if (e instanceof StoreNotFoundError) {
   // The slug authenticated but has no seller row — a store that has signed up and not yet
   // written anything. An empty suite is the honest answer, and it has to be an ACTUAL suite:
   // answering 404 with an error object left the dashboard with nothing to render, so a brand-new
   // seller's first look at Analytics said "Analytics unavailable. Try refreshing." on a page
   // where refreshing could never help. She gets the real page, at zero, instead.
   return NextResponse.json({
    ok: true,
    ...emptyAnalyticsSuite(slug, {
     period: q.get("period"), from: q.get("from"), to: q.get("to"), tz: q.get("tz"),
     sections: parseSections(q.get("sections")),
    }),
   });
  }
  return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}
