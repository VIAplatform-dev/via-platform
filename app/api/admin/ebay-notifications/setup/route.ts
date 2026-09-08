import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { setupDeps, setupNotifications } from "@/app/lib/ebay-notify-db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Subscribe every eBay-connected store (or one, ?store=<slug>) to instant sale notifications:
// creates/reuses the app's destination at ${BASE_URL}/api/webhooks/ebay, then an ORDER_CONFIRMATION
// subscription per store with her token. Idempotent — re-run it after every deploy and whenever a
// store connects eBay. Reports what it did; a "no" from eBay is a sentence in the report, not a 500.
//
//   curl -X POST -b via_admin_token=<sha256 of ADMIN_PASSWORD> https://vyaplatform.com/api/admin/ebay-notifications/setup
//   curl -X POST -b via_admin_token=…  '…/setup?store=sourcedbyscottie'
async function run(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const store = new URL(request.url).searchParams.get("store")?.trim() || null;
 try {
 const report = await setupNotifications(store ? { stores: [store] } : {}, setupDeps());
 return NextResponse.json(report);
 } catch (e) {
 return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Setup failed." }, { status: 500 });
 }
}

export const GET = run;
export const POST = run;
