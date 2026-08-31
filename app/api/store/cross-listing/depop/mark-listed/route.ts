import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { markCrossListing } from "@/app/lib/cross-listing-db";

export const dynamic = "force-dynamic";

// ───────────────────────────────────────────────────────────────────────────
// Record that an item was listed on Depop.
//
// The extension posts the listing in the seller's own browser, where our server can't see it happen.
// So the extension remembers which items it posted, and the dashboard — which IS signed into VYA —
// drains that list to here, marking each cross-listing "listed". That closes the loop: the inventory
// now shows the piece is on Depop, and the sold-sync / delist bookkeeping has a row to work with.
//
// Best-effort external_url: the extension may not know the listing's Depop URL (Depop assigns the
// slug on Post and navigates away), so it's optional.
// ───────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Sign into VYA first." }, { status: 401 });

 const body = await request.json().catch(() => null);
 const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
 if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

 const url = typeof body?.url === "string" && /^https?:\/\//.test(body.url) ? body.url : null;
 await markCrossListing(slug, itemId, "depop", "listed", url).catch(() => {});
 return NextResponse.json({ ok: true });
}
