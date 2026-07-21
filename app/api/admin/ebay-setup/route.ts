import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { ensureEbayReady } from "@/app/lib/ebay";

export const dynamic = "force-dynamic";

// Opt a store's eBay account into Business Policies + create default payment/shipping/return
// policies (idempotent). This is what removes eBay's "User is not eligible for Business Policy"
// wall — it runs automatically on connect, but this lets you trigger/re-run it and see the result.
// Requires the account to have been connected under the `sell.account` write scope (reconnect if not).
// GET|POST ?store=<slug>
async function run(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const slug = new URL(request.url).searchParams.get("store");
 if (!slug) return NextResponse.json({ error: "store slug required (?store=<slug>)" }, { status: 400 });
 try {
 return NextResponse.json({ store: slug, ...(await ensureEbayReady(slug)) });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}

export const GET = run;
export const POST = run;
