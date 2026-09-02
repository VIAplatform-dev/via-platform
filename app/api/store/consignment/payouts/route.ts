import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { listConsignors, getConsignorBalanceCents, getPayableBalanceCents, offPlatformOwedCents, getConsignmentSettings, getConsignor, recordPayout, inFlightOffPlatformCents } from "@/app/lib/consignment-db";
import { planOffPlatformPayout } from "@/app/lib/consignment-payout-core";
import { startBankDebit, debitMandateSummary } from "@/app/lib/store-debit";
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
 // Owed for sales that happened on eBay or Depop. Real debt, but the marketplace paid the STORE
 // directly, so VYA has nothing to send — it is settled by the store and recorded here. Without
 // this the screen showed a balance with nothing payable against it and no reason why.
 offPlatform: await offPlatformOwedCents(c.id),
 // Reserved by a debit that hasn't cleared. Shown so the store doesn't look at an owed figure,
 // press Pay again, and wonder why nothing is payable.
 inFlightCents: await inFlightOffPlatformCents(c.id),
 })));
 return NextResponse.json({
 holdDays: settings.holdDays,
 defaultMethod: settings.defaultPayoutMethod,
 bank: await debitMandateSummary(slug),
 consignors: rows,
 });
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
 const method = typeof body?.method === "string" ? body.method : (consignor.payoutMethod ?? settings.defaultPayoutMethod);

 // What this method is ALLOWED to settle.
 //
 // Direct deposit pays from VYA's balance, which only holds the cut routed off a VYA sale — so it
 // can never settle an eBay sale, however much is owed. Cash, cheque and store credit are the store
 // paying out of its own pocket and recording it, so they can settle everything, marketplace sales
 // included. Offering one ceiling for both would either hide real debt or promise a transfer that
 // cannot happen.
 const payable = await getPayableBalanceCents(consignorId, settings.holdDays);

 // ── ACH: VYA debits the store, waits for it to clear, then pays her ─────────────────────────
 //
 // The only method that can settle an off-platform balance with real money rather than a note that
 // the store paid her herself. Nothing is transferred here — recordPayout HOLDS the amount against
 // her balance and the Stripe webhook releases or pays it days later, once the debit has cleared.
 // See app/lib/store-debit.ts for why paying on click is the one thing that must not happen.
 if (method === "ach") {
  if (!stripeConfigured()) return NextResponse.json({ error: "Payments aren’t enabled on the server yet." }, { status: 503 });
  const owed = (await offPlatformOwedCents(consignorId)).totalCents;
  const bank = await debitMandateSummary(slug);
  const plan = planOffPlatformPayout({
   owedCents: typeof body?.amountCents === "number" && body.amountCents > 0 ? Math.min(Math.round(body.amountCents), owed) : owed,
   inFlightCents: await inFlightOffPlatformCents(consignorId),
   storeBankConnected: bank.ready,
   consignorPayoutReady: Boolean(consignor.stripeAccountId),
  });
  if (!plan.ok) return NextResponse.json({ error: plan.reason }, { status: 400 });

  // Stable per logical payout, so a double-click returns the SAME debit rather than charging the
  // store twice for one sale. The owed term keeps genuinely distinct payouts distinct.
  const debit = await startBankDebit({
   storeSlug: slug,
   amountCents: plan.amountCents,
   consignorId,
   payoutDescription: `VYA consignment payout — ${consignor.name}`,
   idempotencyKey: `ach-payout-${consignorId}-${plan.amountCents}-of-${owed}`,
  });
  if (!debit.ok) return NextResponse.json({ error: debit.reason }, { status: 502 });

  const payoutId = await recordPayout({
   storeSlug: slug, consignorId, amountCents: plan.amountCents, method: "ach",
   status: "awaiting_funds", paymentIntentId: debit.paymentIntentId,
  });
  return NextResponse.json({
   ok: true, payoutId, amountCents: plan.amountCents, method: "ach", status: "awaiting_funds",
   message: "On its way. We’re debiting your bank now — she’s paid automatically once it clears, usually 3–5 working days.",
  });
 }

 const offPlatform = method === "stripe" ? 0 : (await offPlatformOwedCents(consignorId)).totalCents;
 const ceiling = payable + offPlatform;
 const amountCents = typeof body?.amountCents === "number" && body.amountCents > 0 ? Math.min(Math.round(body.amountCents), ceiling) : ceiling;
 if (amountCents <= 0) {
  return NextResponse.json({
   error: method === "stripe"
    ? "Nothing can be sent by direct deposit — either it's still within the return hold, or it was sold on a marketplace that paid you directly. Record those as cash or a bank transfer."
    : "Nothing is payable for this consignor yet (sales may still be within the return hold).",
  }, { status: 400 });
 }

 // Stripe direct-deposit (Model A): VYA pays the consignor from its OWN balance, which holds the
 // cut that was routed off this sale at checkout. (Stripe won't let the store transfer directly to
 // another connected account, so the platform disburses.) Cash / store credit never reach here —
 // for those the cut stayed with the store and this is just a bookkeeping record below.
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
