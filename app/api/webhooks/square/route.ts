import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl } from "@/app/lib/base-url";
import { saveConversion } from "@/app/lib/analytics-db";
import { neon } from "@neondatabase/serverless";
import { timingSafeEqualStr } from "@/app/lib/safe-compare";

/**
 * Verify Square's HMAC-SHA256 webhook signature.
 * Square signs: webhookSignatureKey + notificationUrl + rawBody
 * and base64-encodes the result.
 * Docs: https://developer.squareup.com/docs/webhooks/step3validate
 */
async function verifySquareSignature(
 body: string,
 signatureHeader: string,
 signatureKey: string,
 notificationUrl: string
): Promise<boolean> {
 try {
 const encoder = new TextEncoder();
 const message = signatureKey + notificationUrl + body;
 const key = await crypto.subtle.importKey(
 "raw",
 encoder.encode(signatureKey),
 { name: "HMAC", hash: "SHA-256" },
 false,
 ["sign"]
 );
 const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
 const digest = Buffer.from(new Uint8Array(signed)).toString("base64");
 return timingSafeEqualStr(digest, signatureHeader);
 } catch {
 return false;
 }
}

export async function POST(request: NextRequest) {
 const body = await request.text();

 const signatureHeader = request.headers.get("x-square-hmacsha256-signature");

 // Resolve store slug early so we can pick the right per-store signature key
 const { searchParams } = new URL(request.url);
 const storeSlugForSig = searchParams.get("store");

 // Per-store key takes precedence (e.g. SQUARE_WEBHOOK_SIG_HONEYBEAR_VINTAGE),
 // falling back to the shared SQUARE_WEBHOOK_SIGNATURE_KEY.
 const perStoreEnvVar = storeSlugForSig
 ? `SQUARE_WEBHOOK_SIG_${storeSlugForSig.toUpperCase().replace(/-/g, "_")}`
 : null;
 const signatureKey =
 (perStoreEnvVar && process.env[perStoreEnvVar]) ||
 process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;

 // Fail CLOSED: without a signing key we cannot verify the payload, so reject rather than
 // trust an unsigned webhook — an unsigned "COMPLETED payment" would let anyone fabricate a
 // sale and manufacture commission. (Shopify already fails closed; Square must too.)
 if (!signatureKey) {
 console.error("[square-webhook] No signing key configured — rejecting unverifiable webhook");
 return NextResponse.json({ error: "Webhook signature not configured" }, { status: 401 });
 }
 // Reject if we have a key configured but no/bad signature
 if (signatureKey) {
 if (!signatureHeader) {
 return NextResponse.json({ error: "Missing signature" }, { status: 401 });
 }
 // Square signs the exact URL the webhook was registered with (including query params).
 const baseUrl =
 getBaseUrl();
 const notificationUrl = `${baseUrl}/api/webhooks/square${storeSlugForSig ? `?store=${storeSlugForSig}` : ""}`;

 const valid = await verifySquareSignature(body, signatureHeader, signatureKey, notificationUrl);
 if (!valid) {
 console.error("[square-webhook] Invalid signature");
 return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
 }
 }

 let event: Record<string, unknown>;
 try {
 event = JSON.parse(body);
 } catch {
 return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
 }

 const eventType = event.type as string;

 // Only process payment.updated and payment.created events
 if (eventType !== "payment.updated" && eventType !== "payment.created") {
 return NextResponse.json({ received: true });
 }

 const data = event.data as Record<string, unknown> | undefined;
 const object = data?.object as Record<string, unknown> | undefined;
 const payment = object?.payment as Record<string, unknown> | undefined;

 if (!payment) {
 return NextResponse.json({ received: true });
 }

 // Only process completed payments
 if (payment.status !== "COMPLETED") {
 return NextResponse.json({ received: true });
 }

 const orderId = String(payment.order_id || payment.id);
 const paymentId = String(payment.id);
 const locationId = String(payment.location_id || "");
 const currency = (payment.total_money as Record<string, unknown> | undefined)?.currency as string || "USD";
 const amountMoney = payment.total_money as Record<string, unknown> | undefined;
 const amountCents = (amountMoney?.amount as number) ?? 0;
 const orderTotal = amountCents / 100;
 // Square includes the buyer's email on the payment object for most online payments.
 const buyerEmail = (payment.buyer_email_address as string | null) || null;

 // Resolve which VYA store this belongs to using the ?store= query param
 // Square doesn't send a shop domain header, so the webhook URL must include ?store=slug
 const storeSlug = storeSlugForSig;

 if (!storeSlug) {
 console.error(`[square-webhook] No store slug in webhook URL. Add ?store=your-slug to your Square webhook URL.`);
 return NextResponse.json({ received: true });
 }

 // Try to find the most recent VYA click for this store in the last 24h for attribution
 let matchedClick: { click_id: string; timestamp: unknown; product_name: string } | null = null;
 try {
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (dbUrl) {
 const sql = neon(dbUrl);
 const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
 const rows = await sql`
 SELECT click_id, timestamp, product_name
 FROM clicks
 WHERE store_slug = ${storeSlug}
 AND timestamp >= ${cutoff}
 ORDER BY timestamp DESC
 LIMIT 1
 `;
 if (rows.length > 0) matchedClick = rows[0] as { click_id: string; timestamp: unknown; product_name: string };
 }
 } catch (err) {
 console.error("[square-webhook] Failed to query clicks:", err);
 }

 // Resolve store name from storeSlug
 let storeName = storeSlug;
 try {
 const { stores } = await import("@/app/lib/stores");
 const store = stores.find((s) => s.slug === storeSlug);
 if (store) storeName = store.name;
 } catch {}

 const conversionId = `square-${storeSlug}-${paymentId}`;

 try {
 const { duplicate } = await saveConversion({
 conversionId,
 timestamp: new Date().toISOString(),
 orderId,
 orderTotal,
 currency,
 items: [],
 viaClickId: matchedClick ? String(matchedClick.click_id) : null,
 storeSlug,
 storeName,
 matched: !!matchedClick,
 customerEmail: buyerEmail,
 matchedClickData: matchedClick
 ? {
 clickId: String(matchedClick.click_id),
 clickTimestamp:
 (matchedClick.timestamp as Date)?.toISOString?.() ||
 String(matchedClick.timestamp),
 productName: String(matchedClick.product_name),
 }
 : undefined,
 });

 if (duplicate) {
 console.log(`[square-webhook] Duplicate payment ignored: ${paymentId} (${storeName})`);
 } else {
 console.log(`[square-webhook] Conversion saved: store=${storeSlug}, payment=${paymentId}, total=${currency} ${orderTotal}, matched=${!!matchedClick}`);
 }
 } catch (err) {
 console.error(`[square-webhook] Failed to save conversion for payment ${paymentId}:`, err);
 }

 return NextResponse.json({ received: true });
}
