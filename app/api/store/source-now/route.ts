import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlug } from "@/app/lib/storeAuth";
import { isStorePro } from "@/app/lib/store-plans-db";
import { getSourceNow } from "@/app/lib/data-layer/source-now-db";

export const dynamic = "force-dynamic";

// GET /api/store/source-now?window=7d|30d — the "what to source now" board: brands / categories /
// eras where the market's own buyers show rising demand and the shelves are thin. VYA Pro feature.
export async function GET(request: NextRequest) {
 const storeSlug = await resolveStoreSlug(request);
 if (!storeSlug) return NextResponse.json({ error: "Not a registered store partner" }, { status: 403 });
 if (!(await isStorePro(storeSlug))) return NextResponse.json({ locked: true });

 const windowKey = request.nextUrl.searchParams.get("window") === "30d" ? "30d" : "7d";
 try {
  const data = await getSourceNow(windowKey);
  return NextResponse.json({ windowKey, ...data });
 } catch {
  return NextResponse.json({ windowKey, asOfDate: null, picks: [], empty: true });
 }
}
