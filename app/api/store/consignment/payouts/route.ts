import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { listConsignors, getConsignorBalanceCents, getPayableBalanceCents, getConsignmentSettings, getConsignor, recordPayout } from "@/app/lib/consignment-db";
import { stripePost, stripeConfigured } from "@/app/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Each consignor's balance owed vs. what's payable now (sale credits past the return hold).
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const settings = await getConsignmentSettings(slug);
 const consignors = (await listConsignors(slug)).filter((c) => c.status === "active");
 const rows = await Promise.all(consignors.map(async (c) => ({
 id: c.id,
 name: c.name,
 method: c.payoutMethod ?? settings.defaultPayoutMethod,
 portalToken: c.portalToken,
 balanceCents: await getConsignorBalanceCents(c.id),
 payableCents: await getPayableBalanceCents(c.id, settings.holdDays),
 })));
 return NextResponse.json({ holdDays: settings.holdDays, defaultMethod: settings.defaultPayoutMethod, consignors: rows });
}

// Record a payout to a consignor. For cash / check / store credit this IS the payout (paid
// out-of-band, recorded here). For Stripe direct deposit it's recorded pending until the
// transfer — executed through the store's Connect setup — clears.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 const consignorId = Number(body?.consignorId);
 if (!consignorId) return NextResponse.json({ error: "consignorId is required" }, { status: 400 });
 const consignor = await getConsignor(consignorId);
 if (!consignor || consignor.storeSlug !== slug) return NextResponse.json({ error: "Not found" }, { status: 404 });

 const settings = await getConsignmentSettings(slug);
 const payable = await getPayableBalanceCents(consignorId, settings.holdDays);
 const amountCents = typeof body?.amountCents === "number" && body.amountCents > 0 ? Math.min(Math.round(body.amountCents), payable) : payable;
 if (amountCents <= 0) return NextResponse.json({ error: "Nothing is payable for this consignor yet (sales may still be within the return hold)." }, { status: 400 });

 const method = typeof body?.method === "string" ? body.method : (consignor.payoutMethod ?? settings.defaultPayoutMethod);

 // Model B — the STORE pays the consignor: a Stripe transfer from the store's connected
 // account to the consignor's, funded by the store's balance. VYA never holds the money.
 if (method === "stripe") {
 if (!consignor.stripeAccountId) return NextResponse.json({ error: "This consignor hasn't connected a bank for direct deposit yet." }, { status: 400 });
 if (!stripeConfigured()) return NextResponse.json({ error: "Payments aren't enabled on the server yet." }, { status: 503 });
 try {
 // Platform transfer — VYA pays the consignor from its own balance (which holds the cut routed
 // from the sale). Stripe won't let the store transfer directly to another connected account.
 // Idempotency key = consignor + amount + the payable-balance-at-time. The balance term keeps
 // DISTINCT payouts distinct (a $50-of-$100 partial won't collide with a later $50-of-$50 payout →
 // no silent short-pay), while a genuine double-click / retry (balance unchanged) still returns the
 // SAME transfer instead of paying twice.
 const idem = `consignor-payout-${consignorId}-${amountCents}-of-${payable}`;
 const transfer = await stripePost("transfers", { amount: amountCents, currency: "usd", destination: consignor.stripeAccountId }, undefined, idem);
 const payoutId = await recordPayout({ storeSlug: slug, consignorId, amountCents, method, status: "paid", stripeTransferId: transfer.id as string });
 return NextResponse.json({ ok: true, payoutId, amountCents, method, status: "paid" });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "The Stripe transfer didn't go through." }, { status: 502 });
 }
 }

 // Cash / check / store credit — paid out-of-band, recorded here.
 const payoutId = await recordPayout({ storeSlug: slug, consignorId, amountCents, method, status: "paid" });
 return NextResponse.json({ ok: true, payoutId, amountCents, method, status: "paid" });
}
