import { NextResponse } from "next/server";
import { getAbandonedCarts, markCartEmailed } from "@/app/lib/checkout-attempts-db";
import { sendAbandonedCartEmail } from "@/app/lib/automation-engine";

export const maxDuration = 300;

// Every few hours: nudge shoppers who opened a recommerce checkout 1h+ ago and never
// finished. Honoring each store's "abandoned cart" toggle. One email per attempt.
export async function GET(request: Request) {
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 const carts = await getAbandonedCarts(60).catch(() => []);
 let sent = 0;
 for (const cart of carts) {
 const ok = await sendAbandonedCartEmail(cart).catch(() => false);
 // Only consume it if we actually sent. Toggled-off / unsendable carts stay pending
 // and simply age out of the 3-day window (so flipping the toggle on still works).
 if (ok) { await markCartEmailed(cart.id); sent++; }
 }
 return NextResponse.json({ ok: true, abandoned: carts.length, sent });
}
