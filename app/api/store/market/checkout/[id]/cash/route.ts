import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getCheckout, finalizeMarketSale, setCash } from "@/app/lib/market/checkout-db";
import { sellerAccount, expireMarketPayment } from "@/app/lib/market/stripe-market";
import { changeDue } from "@/app/lib/market/sale-core";
import { setOrderCash } from "@/app/lib/db/orders";

export const dynamic = "force-dynamic";

// POST { tenderedCents? } — the seller took cash. The one place a sale completes without a payment
// provider. Records what was handed over and the change due.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { id } = await params;
 const body = await request.json().catch(() => ({}));
 const c = await getCheckout(id);
 if (!c || c.sellerId !== acting.seller.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
 const tendered = body?.tenderedCents == null ? null : Math.round(Number(body.tenderedCents));
 const change = changeDue(c.amountCents, tendered);
 if (tendered != null && change == null) return NextResponse.json({ error: `That's short — the total is ${(c.amountCents / 100).toFixed(2)}.` }, { status: 400 });
 if (c.status === "awaiting_payment") await setCash(c.id, tendered, change);
 const r = await finalizeMarketSale({ checkoutId: id, paymentIntent: null, tender: "cash", source: "cash" });
 if (r.status === "not_claimable") return NextResponse.json({ error: `This checkout is ${r.checkout?.status ?? "gone"} — start again.`, checkout: r.checkout }, { status: 409 });
 if (tendered != null) await setOrderCash(c.id, { tenderedCents: tendered, changeCents: change }).catch(() => {});
 // The QR / keyed intent may still be open on the customer's phone — close it (a late payment is
 // still caught by the webhook and auto-refunded, but better never to take it).
 if (c.stripeCheckoutSession || c.stripePaymentIntent) {
 const acct = await sellerAccount(acting.slug);
 if (acct) expireMarketPayment({ session: c.stripeCheckoutSession, paymentIntent: c.stripePaymentIntent, acct: acct.acct }).catch(() => {});
 }
 if (r.status === "paid_conflict") return NextResponse.json({ error: "Some of these items sold elsewhere just now — check Sales today.", checkout: r.checkout, changeCents: change }, { status: 409 });
 return NextResponse.json({ ok: true, checkout: { ...r.checkout, tenderedCents: tendered, changeCents: change }, orderIds: r.orderIds, changeCents: change });
}
