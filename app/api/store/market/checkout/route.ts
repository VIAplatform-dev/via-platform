import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getOrOpenSession } from "@/app/lib/market/sessions-db";
import { startCheckout, closeCheckout } from "@/app/lib/market/checkout-db";
import { attachPayment } from "@/app/lib/market/attach-payment";
import type { MarketTender } from "@/app/lib/market/checkout-core";
import { sellerAccount, publishableKey } from "@/app/lib/market/stripe-market";
import { overRateLimit } from "@/app/lib/rate-limit-db";

export const dynamic = "force-dynamic";

// POST { lines:[{itemId, saleCents?}] | itemId, clientKey, tender } — reserve every item and open ONE
// checkout for ONE payment. For "qr" it also creates the Stripe Checkout Session; for "keyed" a
// PaymentIntent. Nothing here marks anything sold — only a verified payment (or cash) does.
export async function POST(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 const lines: { itemId: string; saleCents?: number | null }[] = Array.isArray(body?.lines) && body.lines.length
 ? body.lines.map((l: { itemId?: unknown; saleCents?: unknown }) => ({ itemId: String(l?.itemId || ""), saleCents: l?.saleCents == null ? null : Number(l.saleCents) }))
 : body?.itemId ? [{ itemId: String(body.itemId), saleCents: body?.saleCents == null ? null : Number(body.saleCents) }] : [];
 const clientKey = String(body?.clientKey || "").slice(0, 80);
 const tender = (["qr", "keyed", "cash"].includes(body?.tender) ? body.tender : "cash") as MarketTender;
 if (!lines.length || !clientKey) return NextResponse.json({ error: "items and clientKey required" }, { status: 400 });
 if (await overRateLimit({ bucket: "market-checkout", ip: `seller:${acting.seller.id}`, max: 40, windowMinutes: 1 })) {
 return NextResponse.json({ error: "Too many checkouts started — wait a moment and try again." }, { status: 429 });
 }
 const acct = tender === "cash" ? null : await sellerAccount(acting.slug);
 if (tender !== "cash" && !acct?.chargesEnabled) return NextResponse.json({ error: "Card payments are off — finish Stripe setup in Payments, or take cash.", code: "payments_disabled" }, { status: 409 });
 const session = await getOrOpenSession(acting.seller.id);
 const ua = request.headers.get("user-agent") || "";
 const deviceLabel = ua.includes("iPhone") ? "iPhone" : ua.includes("Android") ? "Android" : ua.includes("iPad") ? "iPad" : "another device";
 const r = await startCheckout({ sellerId: acting.seller.id, lines, sessionId: session.id, clientKey, tender, deviceLabel });
 if (!r.ok) return NextResponse.json({ error: r.message, code: r.code, holder: r.holder ?? null, itemId: r.itemId ?? null }, { status: r.code === "not_found" ? 404 : 409 });
 let checkout = r.checkout;
 let clientSecret: string | null = null;
 if (tender !== "cash" && acct && !checkout.payUrl && !checkout.stripePaymentIntent) {
 try {
 const a = await attachPayment(checkout, acting.seller.id, acct.acct, tender);
 checkout = a.checkout; clientSecret = a.clientSecret;
 } catch (e) {
 const reason = e instanceof Error ? e.message.slice(0, 300) : "stripe error";
 console.error("[market-checkout] stripe create failed:", reason);
 await closeCheckout(checkout.id, "failed", "ui", reason);
 return NextResponse.json({ error: `Couldn't start the card payment (${reason}). Try again or take cash.`, code: "stripe_error" }, { status: 502 });
 }
 }
 return NextResponse.json({ ok: true, checkout, existing: r.existing, clientSecret, publishableKey: publishableKey(), stripeAccount: acct?.acct ?? null });
}
