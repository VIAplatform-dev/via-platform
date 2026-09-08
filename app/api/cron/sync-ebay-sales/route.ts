import { NextResponse } from "next/server";
import { ebayConfigured } from "@/app/lib/ebay";
import { syncAllStores } from "@/app/lib/market-sync";
import { notifyStatus } from "@/app/lib/ebay-notify-db";

// eBay sale-sync — the missing half of "sold anywhere → pull everywhere". Polls each connected
// store's recent eBay orders; when a piece sold on eBay (SKU = our itemId), marks it sold on VYA
// and delists it elsewhere so it can't double-sell, and credits the consignor if it was consigned.
// Idempotent: a piece already sold on VYA is skipped, so re-seeing the same eBay order is a no-op.
//
// Since 2026-09-07 this is the BACKSTOP: eBay pushes ORDER_CONFIRMATION to /api/webhooks/ebay the
// moment a sale clears, and that runs the same per-store sync. The hourly pass catches anything a
// missed or unsubscribed notification would have — and its response says how the push side looks.
export const maxDuration = 300;

export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 if (!ebayConfigured()) return NextResponse.json({ ok: true, skipped: "ebay not configured" });

 // Look back 6h so nothing slips between hourly runs; re-seen sales are no-ops (item already sold).
 const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
 // The loop itself lives in lib/market-sync so checkout can run the same sync on demand for one
 // store — the cron is the backstop, not the only line of defence against a double sale.
 const r = await syncAllStores("ebay", since);
 const n = await notifyStatus().catch(() => null);
 return NextResponse.json({
 ok: true, stores: r.stores, checked: r.checked, pulled: r.pulled.length,
 // Instant notifications: how many stores are subscribed and when eBay last pushed one.
 notifications: n ? { summary: n.summary, subscribed: n.subscribed, of: n.stores.length, lastReceivedAt: n.lastReceivedAt } : "unavailable",
 });
}
