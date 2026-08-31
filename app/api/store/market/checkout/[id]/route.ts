import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getCheckout, closeCheckout } from "@/app/lib/market/checkout-db";
import { sellerAccount } from "@/app/lib/market/stripe-market";
import { attachPayment } from "@/app/lib/market/attach-payment";
import { checkoutExpired } from "@/app/lib/market/checkout-core";
import { getMarketItem } from "@/app/lib/market/inventory-db";
import { reconcileCheckout } from "@/app/lib/market/reconcile";

export const dynamic = "force-dynamic";

// GET — the checkout's server state (the Checkout screen polls this). After 10 s of waiting it asks
// Stripe directly, so a delayed webhook never stalls the seller; expires it lazily if overdue.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { id } = await params;
 let c = await getCheckout(id);
 if (!c || c.sellerId !== acting.seller.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
 if (c.status === "awaiting_payment") {
 // Self-heal: a QR checkout that somehow has no Session (a crash between reserve and create) gets one
 // now — idempotent on the checkout id, so a racing poll can't mint two.
 if (c.tender === "qr" && !c.payUrl) {
 const acct = await sellerAccount(acting.slug);
 if (acct?.chargesEnabled) {
 try { c = (await attachPayment(c, acting.seller.id, acct.acct, "qr")).checkout; }
 catch (e) { console.error("[market-checkout] late session create failed:", e); }
 }
 }
 const ageMs = Date.now() - new Date(c.createdAt).getTime();
 if (c.tender !== "cash" && ageMs > 10_000) c = (await reconcileCheckout(c, "poll")) ?? c;
 else if (checkoutExpired(new Date(c.expiresAt))) c = (await closeCheckout(c.id, "expired", "poll")) ?? (await getCheckout(id))!;
 }
 const item = await getMarketItem(acting.seller.id, c.itemId);
 const items = await Promise.all(c.items.map(async (l) => ({ ...l, item: await getMarketItem(acting.seller.id, l.itemId) })));
 return NextResponse.json({ checkout: c, item, items });
}
