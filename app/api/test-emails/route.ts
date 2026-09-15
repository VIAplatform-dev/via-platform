import { NextResponse } from "next/server";
import { getBaseUrl } from "@/app/lib/base-url";
import { neon } from "@neondatabase/serverless";
import {
 sendWinbackEmail,
 sendViewedItemReminderEmail,
 sendStoreDigestEmail,
 sendLastChanceEmail,
} from "@/app/lib/email";

const BASE_URL = getBaseUrl();

// Only callable with CRON_SECRET, not exposed publicly
export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;
 if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const { searchParams } = new URL(request.url);
 const to = searchParams.get("to");
 if (!to) return NextResponse.json({ error: "Missing ?to= param" }, { status: 400 });

 const flow = searchParams.get("flow"); // optional: winback-14d|winback-30d|viewed|digest|lastchance

 const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");

 // Look up user by email
 const userRows = await sql`SELECT id FROM users WHERE email = ${to} LIMIT 1`;
 const userId = userRows[0]?.id as string | undefined;

 // ── Last-chance: user's actual saved favorites ────────────────────────────
 let lastChanceItems: Array<{
 productTitle: string;
 productImage: string | null;
 storeName: string;
 productUrl: string;
 price: number;
 currency: string;
 daysSaved: number;
 }> = [];

 if (userId) {
 const lcRows = await sql`
 SELECT
 p.id AS product_id,
 p.title AS product_title,
 p.image AS product_image,
 p.store_name,
 p.store_slug,
 p.price,
 p.currency,
 FLOOR(EXTRACT(EPOCH FROM (NOW() - pf.created_at)) / 86400)::int AS days_saved
 FROM product_favorites pf
 JOIN products p ON p.id = pf.product_id
 WHERE pf.user_id = ${userId}
 AND (p.shopify_product_id IS NULL OR p.collabs_link IS NOT NULL)
 AND p.price IS NOT NULL
 ORDER BY pf.created_at ASC
 LIMIT 5
 `;
 lastChanceItems = lcRows.map((p) => ({
 productTitle: p.product_title as string,
 productImage: p.product_image as string | null,
 storeName: p.store_name as string,
 productUrl: `${BASE_URL}/products/${p.store_slug}-${p.product_id}`,
 price: p.price as number,
 currency: p.currency as string,
 daysSaved: p.days_saved as number,
 }));
 }

 // ── Viewed-item reminder: user's actual click history ────────────────────
 let viewedItems: Array<{
 productTitle: string;
 productImage: string | null;
 storeName: string;
 productUrl: string;
 price: number;
 currency: string;
 }> = [];

 if (userId) {
 const viewedRows = await sql`
 SELECT DISTINCT ON (p.id)
 p.id AS product_id,
 p.title AS product_title,
 p.image AS product_image,
 p.store_name,
 p.store_slug,
 p.price,
 p.currency,
 c.timestamp AS clicked_at
 FROM clicks c
 JOIN products p ON CONCAT(p.store_slug, '-', p.id::text) = c.product_id
 WHERE c.user_id = ${userId}
 AND (p.shopify_product_id IS NULL OR p.collabs_link IS NOT NULL)
 AND p.price IS NOT NULL
 ORDER BY p.id, c.timestamp DESC
 LIMIT 5
 `;
 viewedItems = viewedRows.map((p) => ({
 productTitle: p.product_title as string,
 productImage: p.product_image as string | null,
 storeName: p.store_name as string,
 productUrl: `${BASE_URL}/products/${p.store_slug}-${p.product_id}`,
 price: p.price as number,
 currency: p.currency as string,
 }));
 }

 // ── Store digest: products from user's hearted stores ────────────────────
 let digestStores: Array<{
 store_slug: string;
 store_name: string;
 items: Array<{ product_id: number; product_title: string; product_image: string | null; price: number; currency: string; store_slug: string }>;
 }> = [];

 if (userId) {
 const digestRows = await sql`
 SELECT
 p.id AS product_id,
 p.title AS product_title,
 p.image AS product_image,
 p.store_name,
 p.store_slug,
 p.price,
 p.currency
 FROM store_favorites sf
 JOIN products p ON p.store_slug = sf.store_slug
 WHERE sf.user_id = ${userId}
 AND (p.shopify_product_id IS NULL OR p.collabs_link IS NOT NULL)
 AND p.price IS NOT NULL
 ORDER BY p.store_slug, p.created_at DESC
 LIMIT 15
 `;
 const storeMap = new Map<string, { store_name: string; items: typeof digestStores[0]["items"] }>();
 for (const p of digestRows) {
 const slug = p.store_slug as string;
 if (!storeMap.has(slug)) {
 if (storeMap.size >= 3) continue;
 storeMap.set(slug, { store_name: p.store_name as string, items: [] });
 }
 const store = storeMap.get(slug)!;
 if (store.items.length < 5) {
 store.items.push({
 product_id: p.product_id as number,
 product_title: p.product_title as string,
 product_image: p.product_image as string | null,
 price: p.price as number,
 currency: p.currency as string,
 store_slug: slug,
 });
 }
 }
 digestStores = Array.from(storeMap.entries()).map(([store_slug, { store_name, items }]) => ({
 store_slug,
 store_name,
 items,
 }));
 }

 const results: Record<string, string> = {};

 if (!userId) {
 results["warning"] = `No user found for ${to}: winback emails only`;
 }

 try {
 if (!flow || flow === "winback-14d") {
 await sendWinbackEmail(to, "14d");
 results["winback-14d"] = "sent";
 }
 } catch (e) {
 results["winback-14d"] = String(e);
 }

 try {
 if (!flow || flow === "winback-30d") {
 await sendWinbackEmail(to, "30d");
 results["winback-30d"] = "sent";
 }
 } catch (e) {
 results["winback-30d"] = String(e);
 }

 try {
 if (!flow || flow === "viewed") {
 if (viewedItems.length === 0) {
 results["viewed-item-reminder"] = "skipped, no click history found";
 } else {
 await sendViewedItemReminderEmail(to, viewedItems);
 results["viewed-item-reminder"] = `sent (${viewedItems.length} items)`;
 }
 }
 } catch (e) {
 results["viewed-item-reminder"] = String(e);
 }

 try {
 if (!flow || flow === "digest") {
 if (digestStores.length === 0) {
 results["store-digest"] = "skipped, no hearted stores found";
 } else {
 await sendStoreDigestEmail(to, digestStores, BASE_URL);
 results["store-digest"] = `sent (${digestStores.length} stores)`;
 }
 }
 } catch (e) {
 results["store-digest"] = String(e);
 }

 try {
 if (!flow || flow === "lastchance") {
 if (lastChanceItems.length === 0) {
 results["last-chance"] = "skipped, no saved favorites found";
 } else {
 await sendLastChanceEmail(to, lastChanceItems);
 results["last-chance"] = `sent (${lastChanceItems.length} items)`;
 }
 }
 } catch (e) {
 results["last-chance"] = String(e);
 }

 return NextResponse.json({ ok: true, to, userId: userId ?? null, results });
}
