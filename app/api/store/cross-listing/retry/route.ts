import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { syncItemToApiPlatforms, getCrossListBoard } from "@/app/lib/cross-listing-db";

export const dynamic = "force-dynamic";

// Retry publishing a single item to its API marketplaces (eBay/Etsy/Depop) after a failure —
// the "Retry" button on the board. Re-runs the push and returns the refreshed board so the row
// updates in place. { itemId }
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const b = await request.json().catch(() => ({}));
 const itemId = String(b?.itemId || "");
 if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });
 const channels = Array.isArray(b?.channels) ? b.channels.filter((c: unknown): c is string => typeof c === "string") : null;
 try {
 await syncItemToApiPlatforms(slug, itemId, channels);
 return NextResponse.json({ ok: true, board: await getCrossListBoard(slug) });
 } catch (e) {
 return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Retry failed." }, { status: 500 });
 }
}
