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
 const f = await finalizeMarketSale({ checkoutId: r.checkout.id, paymentIntent: null, tender: "cash", source: "cash-direct" });
 if (tendered != null && change != null) await setOrderCash(r.checkout.id, { tenderedCents: tendered, changeCents: change }).catch(() => {});
 if (f.status === "not_claimable") return NextResponse.json({ error: "Couldn't record the sale." }, { status: 409 });
 return NextResponse.json({ ok: f.status !== "paid_conflict", conflict: f.status === "paid_conflict", checkout: f.checkout, orderIds: f.orderIds });
}
