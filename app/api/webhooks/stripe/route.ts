import { NextRequest, NextResponse } from "next/server";
import { sendSourcingConfirmationToUser, sendSourcingRequestToStores } from "@/app/lib/email";
import { markSourcingRequestPaid, getSourcingRequestBySession } from "@/app/lib/sourcing-db";
import { getAllStoreEmails } from "@/app/lib/stores";
import { saveConversion } from "@/app/lib/analytics-db";
import { setStorePlan } from "@/app/lib/store-plans-db";
import { type TierId, type Interval, tierForPriceId } from "@/app/lib/plans";
import { neon } from "@neondatabase/serverless";
import { timingSafeEqualStr } from "@/app/lib/safe-compare";
import { saveMandateFromSetupIntent } from "@/app/lib/store-debit";
import { settlePayoutByIntent, getPayoutByIntent, getConsignor } from "@/app/lib/consignment-db";
import { payoutStatusForIntent } from "@/app/lib/consignment-payout-core";
import { stripePost } from "@/app/lib/stripe";

function unixToIso(v: unknown): string | null {
 const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
 return Number.isFinite(n) ? new Date(n * 1000).toISOString() : null;
}

// Verify Stripe webhook signature without the SDK
async function verifyStripeSignature(
 body: string,
 sig: string,
 secret: string
): Promise<boolean> {
 const parts = sig.split(",").reduce<Record<string, string>>((acc, part) => {
 const [k, v] = part.split("=");
 acc[k] = v;
 return acc;
 }, {});

 const timestamp = parts["t"];
 const signature = parts["v1"];
 if (!timestamp || !signature) return false;

 // Replay protection: reject events whose signed timestamp is more than 5 minutes
 // old (or in the future). Without this, a captured valid event can be replayed
 // indefinitely to re-trigger subscription activations / conversions.
 const ts = Number(timestamp);
 if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

 const payload = `${timestamp}.${body}`;
 const encoder = new TextEncoder();
 const key = await crypto.subtle.importKey(
 "raw",
 encoder.encode(secret),
 { name: "HMAC", hash: "SHA-256" },
 false,
 ["sign"]
 );
 const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
 const expected = Array.from(new Uint8Array(signed))
 .map((b) => b.toString(16).padStart(2, "0"))
 .join("");

 return timingSafeEqualStr(expected, signature);
}

export async function POST(request: NextRequest) {
 const body = await request.text();
 const sig = request.headers.get("stripe-signature");
 const secret = process.env.STRIPE_WEBHOOK_SECRET;

 if (!sig || !secret) {
 return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
 }

 const valid = await verifyStripeSignature(body, sig, secret);
 if (!valid) {
 return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
 }

 let event: { type: string; data: { object: Record<string, unknown> } };
 try {
 event = JSON.parse(body);
 } catch {
 return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
 }

 try {
 switch (event.type) {
 case "checkout.session.completed": {
 const session = event.data.object;

 // A store finished the hosted bank-connect flow, authorising VYA to debit it for consignor
 // payouts on sales that settled off VYA. Nothing was saved when we handed out the link — this
 // is the only place the mandate becomes real. See app/lib/store-debit.ts.
 if (session.mode === "setup" && (session.metadata as Record<string, string>)?.type === "store_bank_mandate") {
 const slug = (session.metadata as Record<string, string>)?.store_slug;
 const si = session.setup_intent as string | null;
 if (slug && si) {
 await saveMandateFromSetupIntent(slug, si).catch((err) =>
 console.error("[stripe-webhook] store_bank_mandate save error:", err),
 );
 }
 break;
 }

 // Handle store VYA Pro (data layer) subscription
 if (session.mode === "subscription" && (session.metadata as Record<string, string>)?.type === "store_pro") {
 const slug = (session.metadata as Record<string, string>)?.store_slug;
 if (slug) {
 await setStorePlan(slug, {
 plan: "pro",
 status: "active",
 stripeCustomerId: (session.customer as string | null) ?? null,
 stripeSubscriptionId: (session.subscription as string | null) ?? null,
 }).catch((err) => console.error("[stripe-webhook] store_pro activate error:", err));
 }
 break;
 }

 // getvya.ai tiered subscription (starter/studio/atelier), 30-day trial
 if (session.mode === "subscription" && (session.metadata as Record<string, string>)?.type === "store_subscription") {
 const md = session.metadata as Record<string, string>;
 if (md?.store_slug) {
 await setStorePlan(md.store_slug, {
 tier: (md.tier as TierId) || null,
 interval: (md.interval as Interval) || null,
 status: "trialing",
 stripeCustomerId: (session.customer as string | null) ?? null,
 stripeSubscriptionId: (session.subscription as string | null) ?? null,
 }).catch((err) => console.error("[stripe-webhook] store_subscription activate error:", err));
 }
 break;
 }

 // Handle sourcing request payment
 if (session.mode === "payment" && (session.metadata as Record<string, string>)?.type === "sourcing_request") {
 const stripeSessionId = session.id as string;
 const request = await markSourcingRequestPaid(stripeSessionId);
 if (request) {
 const details = {
 userEmail: request.userEmail,
 userName: request.userName,
 description: request.description,
 priceMin: request.priceMin,
 priceMax: request.priceMax,
 condition: request.condition,
 size: request.size,
 deadline: request.deadline,
 imageUrl: request.imageUrl,
 };
 // Send confirmation to customer
 try {
 await sendSourcingConfirmationToUser(details);
 } catch (err) {
 console.error("Failed to send sourcing confirmation to user:", err);
 }
 // Send notification to VYA + all stores
 try {
 await sendSourcingRequestToStores(getAllStoreEmails(), details);
 } catch (err) {
 console.error("Failed to send sourcing request to stores:", err);
 }
 } else {
 // May already be processed — look it up for logging
 const existing = await getSourcingRequestBySession(stripeSessionId).catch(() => null);
 console.log(`Sourcing webhook: session ${stripeSessionId} — status: ${existing?.status ?? "not found"}`);
 }
 break;
 }

 // Handle Carroll Street Vintage payment link purchase
 const clientRef = session.client_reference_id as string | null;
 if (clientRef && !clientRef.startsWith("sourcing_")) {
 const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
 const amountTotal = (session.amount_total as number | null) ?? 0;
 const orderTotal = amountTotal / 100;
 const currency = ((session.currency as string | null) ?? "usd").toUpperCase();
 const buyerEmail = (session.customer_details as Record<string, unknown> | null)?.email as string | null
 ?? (session.customer_email as string | null);
 const sessionId = session.id as string;
 const conversionId = `stripe-cs-${sessionId}`;

 // Resolve user from email
 let userId: string | null = null;
 if (buyerEmail) {
 const rows = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${buyerEmail}) LIMIT 1`.catch(() => []);
 if (rows.length > 0) userId = String((rows[0] as { id: unknown }).id);
 }

 // Look up click by client_reference_id (the via_click_id we embedded)
 type ClickRow = { click_id: string; product_name: string; timestamp: string };
 let matchedClick: ClickRow | null = null;
 const clickRows = await sql`
 SELECT click_id, product_name, timestamp FROM clicks WHERE click_id = ${clientRef} LIMIT 1
 `.catch(() => []);
 if (clickRows.length > 0) matchedClick = clickRows[0] as ClickRow;

 await saveConversion({
 conversionId,
 timestamp: new Date().toISOString(),
 orderId: sessionId,
 orderTotal,
 currency,
 items: [],
 viaClickId: matchedClick?.click_id ?? null,
 userId: userId ?? undefined,
 storeSlug: "carroll-street-vintage",
 storeName: "Carroll Street Vintage",
 matched: !!(matchedClick || userId),
 matchedClickData: matchedClick
 ? { clickId: matchedClick.click_id, clickTimestamp: matchedClick.timestamp, productName: matchedClick.product_name, source: "stripe-payment-link" }
 : userId ? { source: "stripe-email-match", userId, buyerEmail: buyerEmail ?? undefined }
 : { source: "stripe-unmatched" },
 }).catch((err) => console.error("[stripe-webhook] Carroll Street save error:", err));
 }

 break;
 }

 case "customer.subscription.updated": {
 const sub = event.data.object;
 const slug = (sub.metadata as Record<string, string>)?.store_slug;
 if ((sub.metadata as Record<string, string>)?.type === "store_pro" && slug) {
 await setStorePlan(slug, {
 plan: "pro",
 status: sub.status as string,
 stripeSubscriptionId: sub.id as string,
 stripeCustomerId: (sub.customer as string | null) ?? null,
 currentPeriodEnd: unixToIso(sub.current_period_end),
 }).catch((err) => console.error("[stripe-webhook] store_pro update error:", err));
 }
 if ((sub.metadata as Record<string, string>)?.type === "store_subscription" && slug) {
 const md = sub.metadata as Record<string, string>;
 const priceId = (sub as { items?: { data?: { price?: { id?: string } }[] } }).items?.data?.[0]?.price?.id;
 const fromPrice = priceId ? tierForPriceId(priceId) : null;
 await setStorePlan(slug, {
 tier: (md.tier as TierId) || fromPrice?.tierId || null,
 interval: (md.interval as Interval) || fromPrice?.interval || null,
 status: sub.status as string,
 stripeSubscriptionId: sub.id as string,
 stripeCustomerId: (sub.customer as string | null) ?? null,
 currentPeriodEnd: unixToIso(sub.current_period_end),
 }).catch((err) => console.error("[stripe-webhook] store_subscription update error:", err));
 }
 break;
 }

 case "customer.subscription.deleted": {
 const sub = event.data.object;
 const slug = (sub.metadata as Record<string, string>)?.store_slug;
 if ((sub.metadata as Record<string, string>)?.type === "store_pro" && slug) {
 await setStorePlan(slug, { plan: "free", status: "canceled" }).catch((err) =>
 console.error("[stripe-webhook] store_pro cancel error:", err),
 );
 }
 if ((sub.metadata as Record<string, string>)?.type === "store_subscription" && slug) {
 await setStorePlan(slug, { status: "canceled" }).catch((err) =>
 console.error("[stripe-webhook] store_subscription cancel error:", err),
 );
 }
 break;
 }

 // ── ACH debits that fund consignor payouts ────────────────────────────────────────────────
 //
 // The consignor is paid HERE, days after the store pressed Pay, and only because the money has
 // actually arrived. The other half of this — a debit that bounces — must release the hold that
 // recordPayout put on her balance, or she is owed money that no longer appears anywhere.
 case "payment_intent.processing":
 case "payment_intent.succeeded":
 case "payment_intent.payment_failed":
 case "payment_intent.canceled": {
 const pi = event.data.object;
 if ((pi.metadata as Record<string, string>)?.type !== "consignment_debit") break;
 const intentId = pi.id as string;

 // payment_failed arrives with the intent walked back to requires_payment_method; the others
 // carry their own status. Anything that maps to null is a step on the way, not an outcome.
 const next = payoutStatusForIntent(
 event.type === "payment_intent.payment_failed" ? "requires_payment_method" : (pi.status as string),
 );
 if (!next) break;

 if (next === "paid") {
 // Send the money BEFORE recording it paid. A transfer that fails then leaves the row in
 // awaiting_funds and Stripe's redelivery retries it; the idempotency key means the retry
 // returns the same transfer rather than paying her twice.
 const payout = await getPayoutByIntent(intentId);
 if (!payout || payout.status !== "awaiting_funds") break;
 const consignor = await getConsignor(payout.consignorId);
 if (!consignor?.stripeAccountId) {
 console.error("[stripe-webhook] cleared debit for consignor with no connected account:", payout.id);
 break;
 }
 const transfer = await stripePost(
 "transfers",
 { amount: payout.amountCents, currency: "usd", destination: consignor.stripeAccountId },
 undefined,
 `consignor-ach-${payout.id}`,
 );
 await settlePayoutByIntent(intentId, "paid", { stripeTransferId: transfer.id as string });
 console.log("[stripe-webhook] consignment ACH cleared, paid:", payout.id, transfer.id);
 } else {
 // awaiting_funds is usually a no-op (the row was created in that state). failed/canceled
 // release the hold — settlePayoutByIntent writes the reversing ledger entry.
 await settlePayoutByIntent(intentId, next);
 }
 break;
 }

 default:
 break;
 }
 } catch (err) {
 console.error("Webhook handler error:", err);
 return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
 }

 return NextResponse.json({ received: true });
}
