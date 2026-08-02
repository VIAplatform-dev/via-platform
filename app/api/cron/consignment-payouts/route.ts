import { NextResponse } from "next/server";
import { listStripeConnectedConsignors, getConsignmentSettings, getPayableBalanceCents, recordPayout } from "@/app/lib/consignment-db";
import { stripePost, stripeConfigured } from "@/app/lib/stripe";
import { logError } from "@/app/lib/error-log";

// Auto-payout: for stores that turned it on, direct-deposit each consignor's balance once their
// sales clear the store's return window (hold_days) — no clicking. Only touches consignors who
// connected a bank; cash/check/store-credit stay manual. Model A: VYA disburses via a platform
// transfer from its own balance (which holds the consignor's cut routed at checkout).
export const maxDuration = 300;

export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 if (!stripeConfigured()) return NextResponse.json({ ok: true, skipped: "stripe not configured" });

 const consignors = await listStripeConnectedConsignors();
 const storeCache = new Map<string, { auto: boolean; holdDays: number }>();
 let paid = 0;
 let totalCents = 0;
 let skipped = 0;

 for (const c of consignors) {
 let sc = storeCache.get(c.storeSlug);
 if (!sc) {
 const settings = await getConsignmentSettings(c.storeSlug);
 sc = { auto: settings.autoPayout, holdDays: settings.holdDays };
 storeCache.set(c.storeSlug, sc);
 }
 if (!sc.auto) { skipped++; continue; }
 const payable = await getPayableBalanceCents(c.id, sc.holdDays);
 if (payable <= 0) continue;
 try {
 // Platform transfer from VYA's balance (holds the consignor's cut routed from the sale).
 // Idempotency key = consignor + amount + the payable-balance-at-time. The balance term is what
 // makes DISTINCT payouts distinct (a $50 payout of $100 vs a $50 payout of $50 differ), so they
 // no longer collide and short-pay — while a retry of the SAME payout (ledger write failed → balance
 // unchanged) still re-sends the SAME key, so Stripe returns the existing transfer, not a second one.
 const idem = `consignor-payout-${c.id}-${payable}-of-${payable}`;
 const transfer = await stripePost("transfers", { amount: payable, currency: "usd", destination: c.stripeAccountId }, undefined, idem);
 await recordPayout({ storeSlug: c.storeSlug, consignorId: c.id, amountCents: payable, method: "stripe", status: "paid", stripeTransferId: transfer.id as string });
 paid++;
 totalCents += payable;
 } catch (e) {
 // Critical: a Stripe transfer may have gone out while the ledger write failed — surfaces to ops
 // so a stuck/undebited payout is caught before the next run (the idempotency key prevents a
 // double-transfer, but this failure still needs eyes).
 await logError("consignment-payout", e, { severity: "critical", context: { consignorId: c.id, storeSlug: c.storeSlug, payable } });
 skipped++;
 }
 }
 return NextResponse.json({ ok: true, paid, totalCents, skipped });
}
