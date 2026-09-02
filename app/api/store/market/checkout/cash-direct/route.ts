import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getOrOpenSession } from "@/app/lib/market/sessions-db";
import { startCheckout, finalizeMarketSale, setCash, getCheckoutByClientKey } from "@/app/lib/market/checkout-db";
import { changeDue } from "@/app/lib/market/sale-core";
import { setOrderCash } from "@/app/lib/db/orders";

export const dynamic = "force-dynamic";

// POST { lines, clientKey, tenderedCents?, at? } — a cash sale in ONE call: reserve + finalize. This is
// what the phone replays after being offline; `clientKey` makes a replay a no-op, so a sale that made
// it through before the connection dropped is never recorded twice.
export async function POST(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 const lines: { itemId: string; saleCents?: number | null }[] = Array.isArray(body?.lines) ? body.lines.map((l: { itemId?: unknown; saleCents?: unknown }) => ({ itemId: String(l?.itemId || ""), saleCents: l?.saleCents == null ? null : Number(l.saleCents) })) : [];
 const clientKey = String(body?.clientKey || "").slice(0, 80);
 if (!lines.length || !clientKey) return NextResponse.json({ error: "lines and clientKey required" }, { status: 400 });

 const already = await getCheckoutByClientKey(acting.seller.id, clientKey);
 if (already && (already.status === "paid" || already.status === "paid_conflict")) return NextResponse.json({ ok: true, checkout: already, replay: true });

 const session = await getOrOpenSession(acting.seller.id);
 const r = already ? { ok: true as const, checkout: already, existing: true } : await startCheckout({ sellerId: acting.seller.id, lines, sessionId: session.id, clientKey, tender: "cash", deviceLabel: "offline sync" });
 if (!r.ok) return NextResponse.json({ error: r.message, code: r.code, itemId: r.itemId ?? null }, { status: 409 });
 const tendered = body?.tenderedCents == null ? null : Math.round(Number(body.tenderedCents));
 const change = changeDue(r.checkout.amountCents, tendered);
 if (r.checkout.status === "awaiting_payment") await setCash(r.checkout.id, tendered, change == null ? null : change);
 let f = await finalizeMarketSale({ checkoutId: r.checkout.id, paymentIntent: null, tender: "cash", source: "cash-direct" });
 let paidCheckoutId = r.checkout.id;

 // A DEAD CHECKOUT UNDER THIS clientKey USED TO BLOCK THE SALE FOREVER.
 //
 // startCheckout hands back any existing checkout for the key, whatever state it is in, and only
 // `awaiting_payment` can become `paid`. So once the first attempt expired (15 min) or was
 // canceled, every retry found the same dead row and failed the same way: the seller is standing
 // at a market with the piece in her hand, the customer has paid her in cash, and the screen says
 // "Couldn't record the sale" no matter how many times she taps.
 //
 // A cash sale that has already happened must be recordable. So: start a FRESH checkout and
 // finalize that. startCheckout re-validates every line, so a piece that genuinely sold elsewhere
 // still refuses — this recovers the stale-row case without weakening the double-sell guard.
 const DEAD = ["expired", "canceled", "failed"];
 if (f.status === "not_claimable" && f.checkout && DEAD.includes(f.checkout.status)) {
  const retry = await startCheckout({
   sellerId: acting.seller.id, lines, sessionId: session.id,
   clientKey: `${clientKey}:retry-${f.checkout.id.slice(0, 8)}`, tender: "cash", deviceLabel: "cash retry",
  });
  if (!retry.ok) return NextResponse.json({ error: retry.message, code: retry.code, itemId: retry.itemId ?? null }, { status: 409 });
  if (retry.checkout.status === "awaiting_payment") await setCash(retry.checkout.id, tendered, change == null ? null : change);
  f = await finalizeMarketSale({ checkoutId: retry.checkout.id, paymentIntent: null, tender: "cash", source: "cash-direct-retry" });
  paidCheckoutId = retry.checkout.id;
 }

 if (tendered != null && change != null) await setOrderCash(paidCheckoutId, { tenderedCents: tendered, changeCents: change }).catch(() => {});
 // Name the state. "Couldn't record the sale" told the seller nothing and told us nothing either.
 if (f.status === "not_claimable") {
  return NextResponse.json({
   error: f.checkout
    ? `Couldn’t record the sale — this checkout is ${f.checkout.status}. Start it again from the item.`
    : "Couldn’t record the sale — that checkout no longer exists. Start it again from the item.",
   code: "not_claimable", status: f.checkout?.status ?? null,
  }, { status: 409 });
 }
 return NextResponse.json({ ok: f.status !== "paid_conflict", conflict: f.status === "paid_conflict", checkout: f.checkout, orderIds: f.orderIds });
}
