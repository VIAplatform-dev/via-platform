import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getBaseUrl } from "@/app/lib/base-url";
import { SQUARE_STORES, WIX_STORES, type WixStore } from "@/app/lib/storeConfig";
import { fetchWixOrders } from "@/app/lib/wixClient";
import { saveConversion } from "@/app/lib/analytics-db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Automatic order sync for the platforms that have no webhook and were previously
// manual-only ("press sync orders"): Square, Carroll Street (custom Stripe site),
// and Wix. Runs every 6h (vercel.json). All paths key conversions on a stable
// order id, so re-running is idempotent. Overlapping windows never duplicate.
//
// Square + Carroll reuse their existing, proven endpoints (no logic duplicated).
// Wix had no order path at all, so it's synced inline here via the verified
// Wix eCommerce Orders API.
const WINDOW_DAYS = 7;

function getSql() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 return url ? neon(url) : null;
}

async function callInternal(path: string, body: unknown, bearer?: string) {
 const res = await fetch(`${getBaseUrl()}${path}`, {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
 },
 body: JSON.stringify(body),
 });
 const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
 return { ok: res.ok, status: res.status, ...json };
}

// Wix → conversions. Mirrors the attribution the other syncs use: match the
// buyer email to a VYA user, then the most recent store click before the order.
async function syncWixStore(store: WixStore, sinceISO: string) {
 const apiKey = process.env[store.apiKeyEnvVar];
 if (!apiKey) return { store: store.slug, error: `missing ${store.apiKeyEnvVar}` };

 const sql = getSql();
 let saved = 0;
 let duplicates = 0;
 let errors = 0;
 let orders;
 try {
 orders = await fetchWixOrders(store.siteId, apiKey, sinceISO);
 } catch (err) {
 return { store: store.slug, error: String(err) };
 }

 type ClickRow = { click_id: string; product_name: string; timestamp: unknown };
 for (const o of orders) {
 try {
 let userId: string | null = null;
 let matchedClick: ClickRow | null = null;
 if (sql) {
 if (o.email) {
 const u = (await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${o.email}) LIMIT 1`.catch(() => [])) as Array<{ id: unknown }>;
 if (u.length > 0) userId = String(u[0].id);
 }
 const clickCutoff = new Date(new Date(o.createdDate).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
 const cr = (await sql`
 SELECT click_id, product_name, timestamp FROM clicks
 WHERE store_slug = ${store.slug} AND timestamp >= ${clickCutoff} AND timestamp <= ${o.createdDate}
 ORDER BY timestamp DESC LIMIT 1
 `.catch(() => [])) as ClickRow[];
 if (cr.length > 0) matchedClick = cr[0];
 }

 const matched = !!matchedClick || !!userId;
 const { duplicate } = await saveConversion({
 conversionId: `wix-${store.slug}-${o.id}`,
 timestamp: o.createdDate,
 orderId: o.id,
 orderTotal: o.total,
 currency: o.currency,
 items: o.items,
 viaClickId: matchedClick ? String(matchedClick.click_id) : null,
 userId: userId ?? undefined,
 storeSlug: store.slug,
 storeName: store.name,
 matched,
 matchedClickData: matchedClick
 ? {
 clickId: String(matchedClick.click_id),
 clickTimestamp: (matchedClick.timestamp as Date)?.toISOString?.() || String(matchedClick.timestamp),
 productName: String(matchedClick.product_name),
 source: "wix-click-match",
 }
 : userId
 ? { source: "wix-email-match", userId }
 : { source: "wix-unmatched" },
 });
 if (duplicate) duplicates++;
 else saved++;
 } catch {
 errors++;
 }
 }
 return { store: store.slug, ordersFound: orders.length, saved, duplicates, errors };
}

export async function GET(request: Request) {
 const cronSecret = process.env.CRON_SECRET;
 const authHeader = request.headers.get("authorization");
 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const sinceISO = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
 const results: Record<string, unknown> = {};

 // Square: reuse the existing endpoint, once per configured store.
 results.square = [];
 for (const store of SQUARE_STORES) {
 try {
 const r = await callInternal("/api/sync-square-orders", { storeSlug: store.slug, since: sinceISO });
 (results.square as unknown[]).push({ store: store.slug, ...r });
 } catch (err) {
 (results.square as unknown[]).push({ store: store.slug, error: String(err) });
 }
 }

 // Carroll Street: reuse its admin endpoint (admin-bearer auth).
 try {
 results.carrollStreet = await callInternal(
 "/api/admin/sync-carroll-street",
 { since: sinceISO },
 process.env.ADMIN_PASSWORD,
 );
 } catch (err) {
 results.carrollStreet = { error: String(err) };
 }

 // Wix: new inline sync per configured store.
 results.wix = [];
 for (const store of WIX_STORES) {
 (results.wix as unknown[]).push(await syncWixStore(store, sinceISO));
 }

 return NextResponse.json({ ok: true, since: sinceISO, ...results });
}
