import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { markCrossListing } from "@/app/lib/cross-listing-db";

export const dynamic = "force-dynamic";

// ───────────────────────────────────────────────────────────────────────────
// Queue an item for Depop from the cross-listing board.
//
// Depop is an extension-mode platform: the actual listing happens in the seller's own browser via the
// Chrome extension. This endpoint just records intent — it flips the item's Depop row to "pending" so
// the board shows "Depop: Queued". The page ALSO messages the extension (window.postMessage) to stage
// the payload into the extension's queue; when the seller posts it on Depop, mark-listed flips this to
// "listed". Marking pending here is idempotent and safe to re-call.
// ───────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Sign into VYA first." }, { status: 401 });

 const body = await request.json().catch(() => null);
 const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
 if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

 await markCrossListing(slug, itemId, "depop", "pending").catch(() => {});
 return NextResponse.json({ ok: true });
}
