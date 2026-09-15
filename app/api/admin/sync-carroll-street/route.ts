import { NextRequest, NextResponse } from "next/server";
import { saveConversion } from "@/app/lib/analytics-db";
import { syncProducts } from "@/app/lib/db";
import { neon } from "@neondatabase/serverless";

const STORE_SLUG = "carroll-street-vintage";
const STORE_NAME = "Carroll Street Vintage";

interface StripeCharge {
 id: string;
 payment_intent: string | null;
 amount: number;
 currency: string;
 status: string;
 created: number;
 billing_details: { email: string | null; name: string | null };
 receipt_email: string | null;
 description: string | null;
}

async function fetchStripeCharges(apiKey: string, createdAfter: number): Promise<StripeCharge[]> {
 const all: StripeCharge[] = [];
 let startingAfter: string | null = null;

 while (true) {
 const params = new URLSearchParams({
 limit: "100",
 "created[gte]": String(createdAfter),
 });
 if (startingAfter) params.set("starting_after", startingAfter);

 const resp = await fetch(`https://api.stripe.com/v1/charges?${params}`, {
 headers: { Authorization: `Bearer ${apiKey}` },
 });

 if (!resp.ok) {
 const err = await resp.text();
 throw new Error(`Stripe API error ${resp.status}: ${err}`);
 }

 const data = (await resp.json()) as { data: StripeCharge[]; has_more: boolean };
 all.push(...data.data);
 if (!data.has_more || data.data.length === 0) break;
 startingAfter = data.data[data.data.length - 1].id;
 }

 return all;
}

export async function POST(request: NextRequest) {
 const apiKey = process.env.STRIPE_SECRET_KEY_CARROLL;
 if (!apiKey) {
 return NextResponse.json({ error: "STRIPE_SECRET_KEY_CARROLL not set" }, { status: 500 });
 }

 const body = await request.json().catch(() => ({}));
 const since = (body as { since?: string }).since;
 const cutoffDate = since
 ? new Date(since)
 : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
 const createdAfter = Math.floor(cutoffDate.getTime() / 1000);

 const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");

 let charges: StripeCharge[];
 try {
 charges = await fetchStripeCharges(apiKey, createdAfter);
 } catch (err) {
 return NextResponse.json({ error: String(err) }, { status: 500 });
 }

 const succeeded = charges.filter((c) => c.status === "succeeded");

 let saved = 0;
 let skipped = 0;
 let errors = 0;

 for (const charge of succeeded) {
 const email = charge.billing_details?.email || charge.receipt_email;
 // Key on the payment-intent so this backfill sync and the live Stripe webhook
 // produce the SAME conversion_id + order_id per order. Otherwise the same sale
 // lands twice (ch_… from here, py_… from the webhook) and deleting one leaves the
 // other to reappear. payment_intent is the stable shared id; fall back to charge id.
 const orderKey = charge.payment_intent || charge.id;
 const conversionId = `stripe-${STORE_SLUG}-${orderKey}`;
 const orderTotal = charge.amount / 100;
 const currency = charge.currency.toUpperCase();
 const timestamp = new Date(charge.created * 1000).toISOString();

 type ClickRow = { click_id: string; product_name: string; timestamp: string; user_id: string | null };

 // Match buyer to a VYA user by email
 let userId: string | null = null;
 if (email) {
 const userRows = await sql`
 SELECT id FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1
 `.catch(() => []);
 if (userRows.length > 0) userId = String((userRows[0] as { id: unknown }).id);
 }

 // Find the most recent VYA click for this store (within 7 days before the charge)
 const clickCutoff = new Date(charge.created * 1000 - 7 * 24 * 60 * 60 * 1000).toISOString();
 let matchedClick: ClickRow | null = null;

 if (userId) {
 const clickRows = await sql`
 SELECT click_id, product_name, timestamp, user_id
 FROM clicks
 WHERE store_slug = ${STORE_SLUG}
 AND user_id = ${userId}
 AND timestamp >= ${clickCutoff}
 AND timestamp <= ${timestamp}
 ORDER BY timestamp DESC
 LIMIT 1
 `.catch(() => []);
 if (clickRows.length > 0) matchedClick = clickRows[0] as ClickRow;
 }

 // Fallback: any recent click for this store (last 7 days) if no user match
 if (!matchedClick && !userId) {
 const clickRows = await sql`
 SELECT click_id, product_name, timestamp, user_id
 FROM clicks
 WHERE store_slug = ${STORE_SLUG}
 AND timestamp >= ${clickCutoff}
 AND timestamp <= ${timestamp}
 ORDER BY timestamp DESC
 LIMIT 1
 `.catch(() => []);
 if (clickRows.length > 0) matchedClick = clickRows[0] as ClickRow;
 }

 const isMatched = !!matchedClick || !!userId;

 try {
 const { duplicate } = await saveConversion({
 conversionId,
 timestamp,
 orderId: orderKey,
 orderTotal,
 currency,
 items: charge.description ? [{ productName: charge.description, quantity: 1, price: orderTotal }] : [],
 viaClickId: matchedClick ? matchedClick.click_id : null,
 userId: userId ?? undefined,
 storeSlug: STORE_SLUG,
 storeName: STORE_NAME,
 matched: isMatched,
 matchedClickData: matchedClick
 ? { clickId: matchedClick.click_id, clickTimestamp: matchedClick.timestamp, productName: matchedClick.product_name, source: "stripe-click-match" }
 : userId
 ? { source: "stripe-email-match", userId, buyerEmail: email ?? undefined }
 : { source: "stripe-unmatched" },
 });

 if (duplicate) {
 skipped++;
 } else {
 saved++;
 console.log(`[carroll-street-stripe] Saved: ${charge.id} $${orderTotal} matched=${isMatched}`);
 }
 } catch (err) {
 console.error(`[carroll-street-stripe] Error saving ${charge.id}:`, err);
 errors++;
 }
 }

 return NextResponse.json({
 ok: true,
 totalCharges: succeeded.length,
 saved,
 skipped,
 errors,
 since: cutoffDate.toISOString(),
 });
}

// ── Product sync via Supabase ─────────────────────────────────────────────────

const CARROLL_SUPABASE_URL = "https://pzolnmlysfhbkvidlpvp.supabase.co";
const FALLBACK_TABLES = ["sold_items", "products", "items", "clothing", "inventory", "product", "listings", "pieces", "catalog", "shop_items", "store_items", "clothes", "vintage_items", "collection", "all_items", "inventory_items"];

type SupabaseRow = Record<string, unknown>;

async function fetchSupabaseTable(anonKey: string, table: string): Promise<{ rows: SupabaseRow[] | null; status: number; body?: unknown }> {
 try {
 const resp = await fetch(`${CARROLL_SUPABASE_URL}/rest/v1/${table}?select=*`, {
 headers: {
 apikey: anonKey,
 Authorization: `Bearer ${anonKey}`,
 Accept: "application/json",
 "Content-Type": "application/json",
 },
 });
 const body = await resp.json().catch(() => null);
 if (!resp.ok) return { rows: null, status: resp.status, body };
 return { rows: Array.isArray(body) ? body : null, status: resp.status, body };
 } catch (err) {
 return { rows: null, status: 0, body: String(err) };
 }
}

// Discover all tables exposed by Supabase via its OpenAPI spec
async function discoverTables(anonKey: string): Promise<string[]> {
 try {
 const resp = await fetch(`${CARROLL_SUPABASE_URL}/rest/v1/`, {
 headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Accept: "application/json" },
 });
 if (!resp.ok) return [];
 const spec = await resp.json() as { definitions?: Record<string, unknown> };
 return Object.keys(spec.definitions ?? {});
 } catch {
 return [];
 }
}

function mapRowToProduct(row: SupabaseRow) {
 const title = String(row.name ?? row.title ?? row.product_name ?? "").trim();
 const price = Number(row.price ?? row.amount ?? row.cost ?? 0);
 const rawImages = row.images ?? row.image_urls ?? row.photos;
 const images: string[] = Array.isArray(rawImages)
 ? (rawImages as unknown[]).map(String).filter(Boolean)
 : [];
 const image = String(row.image ?? row.image_url ?? row.photo ?? images[0] ?? "").trim() || null;
 const description = String(row.description ?? row.details ?? "").trim() || undefined;
 const size = String(row.size ?? "").trim() || undefined;
 const sold = !!(row.sold ?? row.is_sold ?? row.sold_out ?? false);

 return { title, price, image, images: images.length ? images : undefined, description, size, sold };
}

const CARROLL_SITE = "https://carrollstreetvintage.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Build a map of minified variable name → asset URL from a Vite bundle.
// Vite outputs image imports as: varName="/assets/file-HASH.ext"
function buildVarUrlMap(js: string): Map<string, string> {
 const map = new Map<string, string>();
 // Match: varName="/assets/..." or varName='...'
 const re = /\b([a-zA-Z_$][a-zA-Z0-9_$]{1,6})="(\/assets\/[^"]+\.(?:jpe?g|png|webp|gif|avif))"/g;
 for (const m of js.matchAll(re)) {
 map.set(m[1], CARROLL_SITE + m[2]);
 }
 return map;
}

// Resolve an `images:[varA,varB]` expression using the var→url map.
function resolveImages(chunk: string, varMap: Map<string, string>): string[] {
 const imgArrayMatch = chunk.match(/images\s*:\s*\[([^\]]*)\]/);
 if (!imgArrayMatch) return [];
 return imgArrayMatch[1]
 .split(",")
 .map(v => v.trim())
 .map(v => varMap.get(v) ?? "")
 .filter(Boolean);
}

// Extract product objects from a minified Vite JS bundle.
// Carroll Street hardcodes products as {id:N,name:"...",price:N,...} objects.
// Images are minified variable references resolved via buildVarUrlMap.
function extractProductsFromJS(js: string): SupabaseRow[] {
 const products: SupabaseRow[] = [];
 const seen = new Set<string>();

 // Build variable→URL map once for the whole bundle
 const varMap = buildVarUrlMap(js);

 // Strategy A: anchor on {id:N,name:": precise format Carroll Street uses
 const idNameRe = /\{id\s*:\s*(\d+)\s*,\s*name\s*:\s*"([^"]{2,100})"/g;
 for (const anchor of js.matchAll(idNameRe)) {
 const pos = anchor.index!;
 // Walk forward tracking brace depth to find the closing brace
 let depth = 0, end = pos;
 for (let i = pos; i < Math.min(pos + 4000, js.length); i++) {
 if (js[i] === "{") depth++;
 else if (js[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
 }
 if (end <= pos) continue;
 const chunk = js.slice(pos, end + 1);

 const id = anchor[1];
 const name = anchor[2];
 if (seen.has(id)) continue;
 seen.add(id);

 const priceMatch = chunk.match(/price\s*:\s*(\d+(?:\.\d+)?)/);
 if (!priceMatch) continue;
 const price = parseFloat(priceMatch[1]);
 if (price < 1 || price > 50000) continue;

 // Minified booleans: sold:!1 = sold:false, sold:!0 = sold:true
 const soldMatch = chunk.match(/sold\s*:\s*(!0|!1|true|false)/);
 const sold = soldMatch ? (soldMatch[1] === "!0" || soldMatch[1] === "true") : false;

 const sizeMatch = chunk.match(/size\s*:\s*"([^"]+)"/);
 const materialMatch = chunk.match(/material\s*:\s*"([^"]+)"/);
 const measurementsMatch = chunk.match(/measurements\s*:\s*`([^`]+)`/);
 const conditionMatch = chunk.match(/condition\s*:\s*"([^"]+)"/);

 const images = resolveImages(chunk, varMap);
 const image = images[0] ?? null;

 products.push({
 id,
 name,
 price,
 image,
 images: images.length > 1 ? images : undefined,
 sold,
 size: sizeMatch?.[1],
 description: [materialMatch?.[1], conditionMatch?.[1], measurementsMatch?.[1]].filter(Boolean).join(" · ") || undefined,
 });
 }
 if (products.length > 0) return products;

 // Strategy B: anchor on price:NUMBER (broader fallback)
 for (const priceMatch of js.matchAll(/price\s*:\s*(\d+(?:\.\d+)?)/g)) {
 const price = parseFloat(priceMatch[1]);
 if (price < 1 || price > 50000) continue;

 const pos = priceMatch.index!;
 let start = pos;
 for (let i = pos; i >= Math.max(0, pos - 600); i--) {
 if (js[i] === "{") { start = i; break; }
 }
 let depth = 0, end = start;
 for (let i = start; i < Math.min(start + 2000, js.length); i++) {
 if (js[i] === "{") depth++;
 else if (js[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
 }
 if (end <= start) continue;
 const chunk = js.slice(start, end + 1);

 const nameMatch = chunk.match(/(?:name|title)\s*:\s*"([^"]{2,80})"/);
 if (!nameMatch) continue;
 const key = `${nameMatch[1]}::${price}`;
 if (seen.has(key)) continue;
 seen.add(key);

 const soldMatch = chunk.match(/sold\s*:\s*(!0|!1|true|false)/);
 const sold = soldMatch ? (soldMatch[1] === "!0" || soldMatch[1] === "true") : false;
 const sizeMatch = chunk.match(/size\s*:\s*"([^"]+)"/);
 const imageMatch = chunk.match(/(?:image|photo|img|image_url|imageUrl|thumbnail)\s*:\s*"([^"]+)"/);
 let imgUrl = imageMatch?.[1] ?? "";
 if (imgUrl && !imgUrl.startsWith("http")) imgUrl = `${CARROLL_SITE}${imgUrl}`;
 const images = resolveImages(chunk, varMap);

 products.push({
 name: nameMatch[1],
 price,
 image: images[0] ?? (imgUrl || null),
 images: images.length > 1 ? images : undefined,
 sold,
 size: sizeMatch?.[1],
 });
 }
 return products;
}

async function scrapeCarrollStreetProducts(): Promise<{ rows: SupabaseRow[]; source: string }> {
 let html = "";
 try {
 html = await fetch(CARROLL_SITE, { headers: { "user-agent": UA } }).then(r => r.text());
 } catch { return { rows: [], source: "scrape-failed-html" }; }

 const scriptSrcs = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)]
 .map(m => CARROLL_SITE + m[1]);

 for (const src of scriptSrcs) {
 let js = "";
 try {
 js = await fetch(src, { headers: { "user-agent": UA } }).then(r => r.text());
 } catch { continue; }

 if (js.length < 5000) continue;

 // Strategy 1: look for JSON.parse("...") with an embedded product array
 for (const m of js.matchAll(/JSON\.parse\("((?:[^"\\]|\\.)*)"\)/g)) {
 try {
 const inner = JSON.parse(`"${m[1]}"`);
 const data = JSON.parse(inner);
 if (Array.isArray(data) && data.length > 0) {
 const first = data[0] as Record<string, unknown>;
 const keys = Object.keys(first);
 if (keys.some(k => ["price", "cost", "amount"].includes(k)) &&
 keys.some(k => ["name", "title", "product_name"].includes(k))) {
 return { rows: data as SupabaseRow[], source: src };
 }
 }
 } catch { /* not product data */ }
 }

 // Strategy 2: anchor on price:NUMBER and extract surrounding product objects
 if (js.includes("price")) {
 const products = extractProductsFromJS(js);
 if (products.length > 0) return { rows: products, source: src };
 }
 }

 return { rows: [], source: "scrape-no-products-found" };
}

export async function GET(request: NextRequest) {
 void request;
 const anonKey = process.env.SUPABASE_ANON_KEY_CARROLL;
 if (!anonKey) {
 return NextResponse.json({ error: "SUPABASE_ANON_KEY_CARROLL not set" }, { status: 500 });
 }

 let rows: SupabaseRow[] | null = null;
 let foundTable = "";

 // 1. Try Supabase tables (skip sold_items. It only tracks past sales, not current inventory)
 const discoveredTables = await discoverTables(anonKey);
 const tablesToTry = (discoveredTables.length > 0
 ? [...new Set([...discoveredTables, ...FALLBACK_TABLES])]
 : FALLBACK_TABLES
 ).filter(t => t !== "sold_items");

 for (const table of tablesToTry) {
 const result = await fetchSupabaseTable(anonKey, table);
 if (result.rows !== null && result.rows.length > 0) {
 rows = result.rows;
 foundTable = table;
 break;
 }
 }

 // Map whatever Supabase rows we have
 let mapped = (rows ?? [])
 .map(mapRowToProduct)
 .filter((p) => p.title && p.price > 0 && !p.sold)
 .map((p) => ({
 title: p.title,
 price: p.price,
 currency: "USD",
 image: p.image ?? undefined,
 images: p.images,
 externalUrl: "https://carrollstreetvintage.com",
 description: p.description,
 }));

 // 2. Fallback: scrape the website's JS bundle when Supabase has no usable products
 let scrapeSource = "";
 if (mapped.length === 0) {
 const scraped = await scrapeCarrollStreetProducts();
 scrapeSource = scraped.source;
 if (scraped.rows.length > 0) {
 rows = scraped.rows;
 foundTable = "js-bundle-scrape";
 mapped = scraped.rows
 .map(mapRowToProduct)
 .filter((p) => p.title && p.price > 0 && !p.sold)
 .map((p) => ({
 title: p.title,
 price: p.price,
 currency: "USD",
 image: p.image ?? undefined,
 images: p.images,
 externalUrl: "https://carrollstreetvintage.com",
 description: p.description,
 }));
 }
 }

 if (mapped.length === 0) {
 return NextResponse.json({
 error: "No available products found via Supabase or site scraping.",
 discoveredTables,
 scrapeSource,
 }, { status: 404 });
 }

 const { count } = await syncProducts(STORE_SLUG, STORE_NAME, mapped);

 return NextResponse.json({ ok: true, productCount: count, total: rows?.length ?? mapped.length, table: foundTable, scrapeSource });
}
