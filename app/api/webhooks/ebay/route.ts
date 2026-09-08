import { NextRequest, NextResponse } from "next/server";
import { handleChallenge, handleDelivery } from "@/app/lib/ebay-notify-receive";
import { receiveDeps } from "@/app/lib/ebay-notify-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// A delivery awaits the store's sale sync (capped at 20s inside) before answering eBay.
export const maxDuration = 60;

// eBay sale notifications — "sold on eBay" reaching VYA in seconds instead of on the hour.
//
// GET  = eBay's endpoint-verification challenge (answered from EBAY_NOTIFY_VERIFICATION_TOKEN).
// POST = a signed notification (Commerce Notification API, topic ORDER_CONFIRMATION; or a legacy
//        Trading platform notification). Verified, matched to a store, then that store's recent
//        eBay orders are pulled through syncMarketplaceSalesForStore — the same code the hourly
//        cron runs, which stays as the backstop. Every delivery lands in ebay_notifications.
//
// Reachable without a session: /api/webhooks is allowlisted in proxy.ts. All the logic is in
// app/lib/ebay-notify-receive.ts, tested with fakes.

export async function GET(req: NextRequest) {
 const r = await handleChallenge(req.nextUrl.searchParams.get("challenge_code"), receiveDeps());
 return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
 const body = await req.text().catch(() => "");
 const r = await handleDelivery({ body, signatureHeader: req.headers.get("x-ebay-signature") }, receiveDeps());
 return NextResponse.json(r.body, { status: r.status });
}
