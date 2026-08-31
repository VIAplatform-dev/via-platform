import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getAnalyticsSuite, parseSections, StoreNotFoundError } from "@/app/lib/analytics/suite";

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
   // The slug authenticated but has no seller row — the synthetic admin workspace,
   // or a store mid-signup. An empty suite is the honest answer, not a 500.
   return NextResponse.json({ error: "No store data yet", slug }, { status: 404 });
  }
  return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}
