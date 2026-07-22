import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { ensureEbayReady } from "@/app/lib/ebay";

export const dynamic = "force-dynamic";

// Seller-triggered "Finish eBay setup": opt into Business Policies + create default payment/shipping/
// return policies for any that are missing. Runs automatically on connect too — this is the manual
// re-run button for accounts connected earlier or where a policy was removed.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 try {
 return NextResponse.json(await ensureEbayReady(slug));
 } catch (e) {
 return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Setup failed." }, { status: 500 });
 }
}
