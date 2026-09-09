import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { notifyStatus } from "@/app/lib/ebay-notify-db";

export const dynamic = "force-dynamic";

// Is instant eBay sale notification on, for whom, and when did we last hear from eBay? Per store:
// subscription id, status, on-since, last error, last delivery + its outcome; plus the last ten
// rows of ebay_notifications. Read by the admin block on Settings › Marketplaces and by curl.
export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 try {
 return NextResponse.json({ ok: true, ...(await notifyStatus()) });
 } catch (e) {
 return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Status failed." }, { status: 500 });
 }
}
