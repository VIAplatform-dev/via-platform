import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { testEbayConnection } from "@/app/lib/ebay";

export const dynamic = "force-dynamic";

// Is THIS seller's eBay account ready to list? Confirms the token works and the three business
// policies exist — so the board can show "ready to list" vs "finish setup" without any curl.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 try {
 const t = await testEbayConnection(slug);
 return NextResponse.json({ ok: true, readyToList: t.readyToList, tokenValid: t.tokenValid, policies: t.policies });
 } catch {
 return NextResponse.json({ ok: false, readyToList: false, tokenValid: false, policies: { fulfillment: false, payment: false, return: false } });
 }
}
