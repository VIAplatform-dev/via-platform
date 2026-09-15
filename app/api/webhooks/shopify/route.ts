import { NextRequest, NextResponse } from "next/server";
import { cacheShopifyOrder } from "@/app/lib/order-cache-db";
import { saveConversion } from "@/app/lib/analytics-db";
import { stores, convertCurrencyToUSD, refreshExchangeRates } from "@/app/lib/stores";
import { getSetting } from "@/app/lib/settings-db";
import { neon } from "@neondatabase/serverless";
import { timingSafeEqualStr } from "@/app/lib/safe-compare";

async function verifyShopifyHmac(body: string, hmacHeader: string, secret: string): Promise<boolean> {
 const encoder = new TextEncoder();
 const key = await crypto.subtle.importKey(
 "raw",
 encoder.encode(secret),
 { name: "HMAC", hash: "SHA-256" },
 false,
 ["sign"]
 );
 const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
 const digest = Buffer.from(new Uint8Array(signed)).toString("base64");
 return timingSafeEqualStr(digest, hmacHeader);
}

function resolveStore(storeSlugParam: string | null, shopDomain: string | null): { slug: string; name: string } | null {
 if (storeSlugParam) {
 const store = stores.find((s) => s.slug === storeSlugParam);
 if (store) return { slug: store.slug, name: store.name };
 // Accept unknown slug if it came from a per-store webhook URL. We'll record it as-is.
 // The secret validation below is the real auth gate.
 if (storeSlugParam.trim()) return { slug: storeSlugParam, name: storeSlugParam };
 }
 if (shopDomain) {
 const store = stores.find((s) => {
 try {
 const hostname = new URL(s.website).hostname.replace(/^www\./, "");
 return shopDomain === hostname || shopDomain.startsWith(hostname) || hostname.startsWith(shopDomain.replace(".myshopify.com", ""));
 } catch {
 return false;
 }
 });
 if (store) return { slug: store.slug, name: store.name };
 }
 return null;
}

export async function POST(request: NextRequest) {
 const body = await request.text();

 const hmac = request.headers.get("x-shopify-hmac-sha256");
 const topic = request.headers.get("x-shopify-topic");
 const shopDomain = request.headers.get("x-shopify-shop-domain");

 if (!hmac) {
 return NextResponse.json({ error: "Missing signature" }, { status: 400 });
 }

 // Resolve store slug early so we can look up the per-store signing secret
 const { searchParams } = new URL(request.url);
 const storeSlugParam = searchParams.get("store");
 const shopDomainHeader = request.headers.get("x-shopify-shop-domain");
 const resolved = resolveStore(storeSlugParam, shopDomainHeader);

 if (!resolved) {
 console.error(`[shopify-webhook] Unknown store: domain=${shopDomain}, store param=${storeSlugParam}`);
 return NextResponse.json({ received: true });
 }

 const { slug: storeSlug, name: storeName } = resolved;

 // Per-store secret wins; fall back to global env var
 const storeSecret = await getSetting(`shopify_webhook_secret_${storeSlug}`).catch(() => null);
 const secret = storeSecret || process.env.SHOPIFY_WEBHOOK_SECRET;

 if (!secret) {
 console.error(`[shopify-webhook] No webhook secret configured for store: ${storeSlug}`);
 return NextResponse.json({ error: "No webhook secret configured for this store" }, { status: 400 });
 }

 const valid = await verifyShopifyHmac(body, hmac, secret);
 if (!valid) {
 console.error(`[shopify-webhook] Invalid HMAC from shop: ${shopDomain}, store: ${storeSlug}`);
 return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
 }

 // Acknowledge non-order events silently
 if (topic !== "orders/create" && topic !== "orders/paid") {
 return NextResponse.json({ received: true });
 }

 let order: Record<string, unknown>;
 try {
 order = JSON.parse(body);
 } catch {
 return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
 }

 if (topic === "orders/create" && order.financial_status !== "paid") {
 return NextResponse.json({ received: true });
 }

 const orderId = String(order.id);
 const orderCurrency = (order.currency as string) || "USD";

 const lineItems = (order.line_items as Array<Record<string, unknown>>) || [];
 const items = lineItems.map((item) => ({
 productName: (item.title as string) || "Unknown",
 quantity: (item.quantity as number) || 1,
 price: parseFloat(String(item.price || "0")),
 productId: item.product_id ? String(item.product_id) : undefined,
 }));

 const rawTotal = parseFloat(String(order.total_price || order.subtotal_price || "0"));
 const itemsTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
 const localTotal = rawTotal > 0 ? rawTotal : itemsTotal;

 if (orderCurrency !== "USD") await refreshExchangeRates();
 const orderTotal = convertCurrencyToUSD(localTotal, orderCurrency);

 const buyerEmail: string | null =
 (order.email as string | null) ||
 ((order.customer as Record<string, unknown> | null)?.email as string | null) ||
 null;

 // Shopify stores cart attributes in order.note_attributes: [{name, value}, ...]
 const noteAttributes = (order.note_attributes as Array<{ name: string; value: string }>) || [];
 const cartViaClickId = noteAttributes.find((a) => a.name === "via_click_id")?.value ?? null;

 const orderName = (order.name as string) || `#${orderId}`;
 const orderedAt = (order.created_at as string) || new Date().toISOString();

 // ALWAYS cache the order's real line items, for every store. The Collabs sync
 // reads this cache to replace its single guessed product with the true cart.
 try {
 await cacheShopifyOrder({
 storeSlug, orderName, orderId, email: buyerEmail,
 totalUsd: orderTotal, currency: "USD", items, viaClickId: cartViaClickId, orderedAt,
 });
 console.log(`[shopify-webhook] Cached: store=${storeSlug}, order=${orderName} (${items.length} item(s), USD ${orderTotal})`);
 } catch (err) {
 console.error(`[shopify-webhook] Failed to cache order ${orderName} (${storeSlug}):`, err);
 }

 // Conversion RECORDING is owned by Collabs for shopify-collabs stores (their
 // commission feed is the source of truth. Letting the webhook also record
 // double-counts). The webhook only records for NON-Collabs stores (e.g.
 // custom-webhook stores like Carroll Street), where it's the only revenue path.
 const storeObj = stores.find((s) => s.slug === storeSlug);
 const isCollabsStore = storeObj?.commissionType === "shopify-collabs";
 if (isCollabsStore) {
 return NextResponse.json({ received: true, cached: true, recorded: false, reason: "collabs-owns-recording" });
 }

 // ── Non-Collabs store: webhook is the recorder. Require via_click_id (set by
 // /api/track) as proof the order came through VYA, then record the conversion.
 if (!cartViaClickId) {
 console.log(`[shopify-webhook] Cached only: store=${storeSlug}, order=${orderName} (no via_click_id: direct sale, non-collabs store)`);
 return NextResponse.json({ received: true, cached: true, recorded: false });
 }

 const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
 type ClickRow = { click_id: string; timestamp: unknown; product_name: string; user_id: string | null };
 let matchedClick: ClickRow | null = null;
 try {
 const rows = await sql`SELECT click_id, timestamp, product_name, user_id FROM clicks WHERE click_id = ${cartViaClickId} LIMIT 1`;
 if (rows.length > 0) matchedClick = rows[0] as ClickRow;
 } catch (err) {
 console.error(`[shopify-webhook] Failed to look up click by via_click_id:`, err);
 }
 if (!matchedClick) {
 console.warn(`[shopify-webhook] Cached only: store=${storeSlug}, order=${orderName}: via_click_id ${cartViaClickId} not found in clicks`);
 return NextResponse.json({ received: true, cached: true, recorded: false });
 }

 let matchedUserId: string | null = matchedClick.user_id;
 if (!matchedUserId && buyerEmail) {
 try {
 const userRows = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${buyerEmail}) LIMIT 1`;
 if (userRows.length > 0) matchedUserId = String(userRows[0].id);
 } catch (err) {
 console.error(`[shopify-webhook] Failed to look up user by email:`, err);
 }
 }

 try {
 const { duplicate } = await saveConversion({
 conversionId: `shopify-${storeSlug}-${orderId}`,
 timestamp: new Date().toISOString(),
 orderId, orderTotal, currency: "USD", items,
 viaClickId: String(matchedClick.click_id),
 userId: matchedUserId ?? undefined,
 customerEmail: buyerEmail,
 storeSlug, storeName, matched: true,
 matchedClickData: {
 clickId: String(matchedClick.click_id),
 clickTimestamp: (matchedClick.timestamp as Date)?.toISOString?.() || String(matchedClick.timestamp),
 productName: String(matchedClick.product_name),
 source: "cart-attribute",
 },
 });
 console.log(`[shopify-webhook] ${duplicate ? "Duplicate" : "Saved"}: store=${storeSlug}, order=${orderName}, total=USD ${orderTotal}`);
 } catch (err) {
 console.error(`[shopify-webhook] Failed to save conversion for order ${orderName}:`, err);
 }

 return NextResponse.json({ received: true, cached: true, recorded: true });
}
