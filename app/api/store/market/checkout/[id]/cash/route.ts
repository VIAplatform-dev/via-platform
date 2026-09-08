import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getCheckout, finalizeMarketSale, setCash } from "@/app/lib/market/checkout-db";
import { sellerAccount, expireMarketPayment } from "@/app/lib/market/stripe-market";
import { changeDue } from "@/app/lib/market/sale-core";
import { setOrderCash } from "@/app/lib/db/orders";
import { normalizeReceiptEmail } from "@/app/lib/market/receipt-core";
import { sendCashReceipt, liveReceiptDeps } from "@/app/lib/market/receipt";
import { getSession } from "@/app/lib/market/sessions-db";
import { getItem } from "@/app/lib/db/inventory";
import { stores } from "@/app/lib/stores";

export const dynamic = "force-dynamic";

// POST { tenderedCents?, receiptEmail? } — the seller took cash. The one place a sale completes
// without a payment provider. Records what was handed over and the change due. With an email, a
// receipt goes out afterwards and the customer joins the list tagged with this market — both
// best-effort, never in the way of the sale.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { id } = await params;
 const body = await request.json().catch(() => ({}));
 const c = await getCheckout(id);
 if (!c || c.sellerId !== acting.seller.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
 const tendered = body?.tenderedCents == null ? null : Math.round(Number(body.tenderedCents));
 const receiptEmail = normalizeReceiptEmail(body?.receiptEmail);
 const change = changeDue(c.amountCents, tendered);
 if (tendered != null && change == null) return NextResponse.json({ error: `That's short — the total is ${(c.amountCents / 100).toFixed(2)}.` }, { status: 400 });
 if (c.status === "awaiting_payment") await setCash(c.id, tendered, change);
 const r = await finalizeMarketSale({ checkoutId: id, paymentIntent: null, tender: "cash", source: "cash", receiptEmail });
 if (r.status === "not_claimable") return NextResponse.json({ error: `This checkout is ${r.checkout?.status ?? "gone"} — start again.`, checkout: r.checkout }, { status: 409 });
 if (tendered != null) await setOrderCash(c.id, { tenderedCents: tendered, changeCents: change }).catch(() => {});
 // The QR / keyed intent may still be open on the customer's phone — close it (a late payment is
 // still caught by the webhook and auto-refunded, but better never to take it).
 if (c.stripeCheckoutSession || c.stripePaymentIntent) {
 const acct = await sellerAccount(acting.slug);
 if (acct) expireMarketPayment({ session: c.stripeCheckoutSession, paymentIntent: c.stripePaymentIntent, acct: acct.acct }).catch(() => {});
 }
 if (r.status === "paid_conflict") return NextResponse.json({ error: "Some of these items sold elsewhere just now — check Sales today.", checkout: r.checkout, changeCents: change }, { status: 409 });
 // The receipt, once the sale is a fact. Only on the call that recorded it — a retry that finds the
 // sale already paid must not send a second receipt.
 let receipt: { emailed: boolean; tagged: boolean } | null = null;
 if (r.status === "paid" && receiptEmail) {
 try {
 const session = c.sessionId ? await getSession(acting.seller.id, c.sessionId) : null;
 const lines = await Promise.all(c.items.map(async (l) => ({ title: (await getItem(l.itemId).catch(() => null))?.title || "Piece", saleCents: l.saleCents })));
 const storeName = stores.find((s) => s.slug === acting.slug)?.name || acting.seller.name || acting.slug;
 receipt = await sendCashReceipt({
 storeSlug: acting.slug, storeName, sessionName: session?.name || "the market", currency: c.currency,
 lines, amountCents: c.amountCents, tender: "cash", tenderedCents: tendered, changeCents: change, receiptEmail,
 }, await liveReceiptDeps());
 } catch { receipt = { emailed: false, tagged: false }; }
 }
 return NextResponse.json({ ok: true, checkout: { ...r.checkout, tenderedCents: tendered, changeCents: change, receiptEmail: receiptEmail ?? r.checkout?.receiptEmail ?? null }, orderIds: r.orderIds, changeCents: change, receipt });
}
