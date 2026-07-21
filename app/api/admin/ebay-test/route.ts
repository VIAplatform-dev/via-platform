import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { testEbayConnection } from "@/app/lib/ebay";

export const dynamic = "force-dynamic";

// Does a store's eBay connection actually work — without posting anything? Confirms the token
// refreshes + the eBay API responds, and that the business policies needed to publish exist.
// GET ?store=<slug>
export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const slug = new URL(request.url).searchParams.get("store");
 if (!slug) return NextResponse.json({ error: "store slug required (?store=<slug>)" }, { status: 400 });
 try {
 return NextResponse.json({ store: slug, ...(await testEbayConnection(slug)) });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}
