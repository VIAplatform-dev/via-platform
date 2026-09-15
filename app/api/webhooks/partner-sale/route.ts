import { NextRequest, NextResponse } from "next/server";
import { saveConversion } from "@/app/lib/analytics-db";

// Map from webhook token → store slug. Tokens come ONLY from env vars, never hardcode
// a credential in source (a committed literal is a live commission-fraud vector since this
// endpoint records sales). Set PARTNER_WEBHOOK_TOKEN_CARROLL in the environment.
const TOKEN_TO_STORE: Record<string, string> = {};
if (process.env.PARTNER_WEBHOOK_TOKEN_CARROLL) {
 TOKEN_TO_STORE[process.env.PARTNER_WEBHOOK_TOKEN_CARROLL] = "carroll-street-vintage";
}

export async function POST(request: NextRequest) {
 let body: Record<string, unknown>;
 try {
 body = await request.json();
 } catch {
 return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
 }

 const { storeToken, orderId, total, currency } = body as {
 storeToken?: string;
 orderId?: string;
 total?: unknown;
 currency?: string;
 };

 if (!storeToken || typeof storeToken !== "string") {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const storeSlug = TOKEN_TO_STORE[storeToken];
 if (!storeSlug) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 if (!orderId || typeof orderId !== "string") {
 return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
 }

 const orderTotal = parseFloat(String(total ?? "0"));
 if (isNaN(orderTotal) || orderTotal <= 0) {
 return NextResponse.json({ error: "Invalid total" }, { status: 400 });
 }

 const resolvedCurrency = (typeof currency === "string" && currency) ? currency.toUpperCase() : "USD";

 // Resolve store name
 let storeName = storeSlug;
 try {
 const { stores } = await import("@/app/lib/stores");
 const store = stores.find((s) => s.slug === storeSlug);
 if (store) storeName = store.name;
 } catch {}

 const conversionId = `partner-${storeSlug}-${orderId}`;

 try {
 const { duplicate } = await saveConversion({
 conversionId,
 timestamp: new Date().toISOString(),
 orderId,
 orderTotal,
 currency: resolvedCurrency,
 items: [],
 viaClickId: null,
 storeSlug,
 storeName,
 matched: false,
 });

 if (duplicate) {
 console.log(`[partner-sale] Duplicate order ignored: ${orderId} (${storeName})`);
 } else {
 console.log(`[partner-sale] Conversion saved: store=${storeSlug}, order=${orderId}, total=${resolvedCurrency} ${orderTotal}`);
 }
 } catch (err) {
 console.error(`[partner-sale] Failed to save conversion for order ${orderId}:`, err);
 return NextResponse.json({ error: "Internal error" }, { status: 500 });
 }

 return NextResponse.json({ received: true });
}
