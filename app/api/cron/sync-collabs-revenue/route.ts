import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { saveSetting, getSetting } from "@/app/lib/settings-db";
import { stores, convertCurrencyToUSD } from "@/app/lib/stores";
import { markCartItemsPurchased } from "@/app/lib/cart-db";
import { findCachedOrder } from "@/app/lib/order-cache-db";

export const maxDuration = 60;

// Build a lowercase name → slug map from our store config
const storeNameToSlug = new Map<string, string>(
 stores.map((s) => [s.name.toLowerCase(), s.slug])
);

// Also build a normalized (no dashes/spaces) slug → slug map
// so camelCase Collabs handles like "PortersPreloved" resolve correctly
const slugByNormalized = new Map<string, string>(
 stores.map((s) => [s.slug.replace(/-/g, ""), s.slug])
);

// Explicit overrides for Collabs brand names that differ significantly from VYA names
const collabsHandleOverrides: Record<string, string> = {
 "source 24": "source-twenty-four",
 "chill boutique consignment": "chill-boutique",
 "chillboutiqueconsignment": "chill-boutique",
};

function resolveStoreSlug(brandName: string): string {
 // Strip leading/trailing punctuation and whitespace the Collabs API sometimes appends
 const key = brandName.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "").trim();

 // 1. Exact name match
 if (storeNameToSlug.has(key)) return storeNameToSlug.get(key)!;

 // 2. Explicit overrides for known mismatches
 if (collabsHandleOverrides[key]) return collabsHandleOverrides[key];

 // 3. Normalized match — handles camelCase handles like "PortersPreloved" → "porters-preloved"
 const normalized = key.replace(/[^a-z0-9]/g, "");
 if (slugByNormalized.has(normalized)) return slugByNormalized.get(normalized)!;

 // 4. Fallback
 return key.replace(/\s+/g, "-");
}

function parseCommission(displayValue: string): number {
 const n = parseFloat(displayValue.replace(/[^0-9.]/g, ""));
 return isNaN(n) ? 0 : n;
}

type CommissionRule = { value: number }; // value is a percentage, e.g. 7 means 7%

/**
 * Calculate order total from a commission amount using the store's actual commission rates.
 * For flat-rate stores (one rule), the result is exact.
 * For tiered stores, picks the tier whose implied price is self-consistent with that tier.
 */
function calculateOrderTotal(commissionUsd: number, rules: CommissionRule[]): number {
 if (commissionUsd <= 0) return 0;
 if (rules.length === 0) return estimateRevenue(commissionUsd);

 // Unique rates sorted high → low (highest rate applies to lowest price tier)
 const rates = [...new Set(rules.map((r) => r.value / 100))].sort((a, b) => b - a);
 if (rates.length === 1) return commissionUsd / rates[0]; // Flat rate — exact

 // Tiered: check every rate for self-consistency (implied price fits within that
 // tier's [floor, ceiling) range). When multiple tiers are valid — e.g. $52.50
 // commission is consistent with both $750@7% and $1050@5% — prefer the LAST
 // valid tier (lower rate, higher implied price). This avoids underreporting
 // order value when a commission falls right at a tier boundary.
 const tierCeilings = [1000, 5000]; // upper bound for each tier index
 let lastValid: number | null = null;
 for (let i = 0; i < rates.length; i++) {
 const implied = commissionUsd / rates[i];
 const ceiling = tierCeilings[i] ?? Infinity;
 const floor = i === 0 ? 0 : (tierCeilings[i - 1] ?? 0);
 if (implied >= floor && implied < ceiling) lastValid = implied;
 }
 if (lastValid !== null) return lastValid;
 return commissionUsd / rates[rates.length - 1];
}

/** Fallback: reverse-calculate from assumed VYA tiers (7/5/3%) when no rules are available. */
function estimateRevenue(commission: number): number {
 if (commission <= 0) return 0;
 let implied = commission / 0.07;
 if (implied < 1000) return implied;
 implied = commission / 0.05;
 if (implied <= 5000) return implied;
 return commission / 0.03;
}

/**
 * Try to fetch individual Commission records for a partnership.
 * Tries each PayoutGroup value until we find records.
 * Returns null if the API doesn't support this or no records are found.
 *
 * Attempts a rich query first (with lineItemTitle + order name); if the API
 * doesn't expose those fields, falls back to the minimal query.
 */
async function fetchIndividualCommissions(
 partnershipId: string,
 cookie: string,
 csrfToken: string,
 lastSyncedAt: string | null,
 deltaOrders: number
): Promise<{
 commissionId: string;
 commissionUsdAmount: number;
 lineItemPrice?: number;
 earnedAt: string;
 productName?: string;
 shopifyOrderName?: string;
 orderTotal?: number;
 orderCurrency?: string;
 orderLineItems?: { title: string; quantity: number; price: number }[];
}[] | null> {
 const groups = ["NEXT_PAYOUT", "IN_HOLDING_PERIOD", "PAYOUT_REQUESTED", "CREATOR_ACTION_REQUIRED", "PAID_OUT"];
 const headers = {
 "content-type": "application/json",
 "cookie": cookie,
 "x-csrf-token": csrfToken,
 "origin": "https://collabs.shopify.com",
 "referer": "https://collabs.shopify.com/",
 "x-client-type": "web",
 "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
 };

 // Three query tiers, tried in order until one works:
 // 1. Full: order total + all line items (ideal — exact amount, all items)
 // 2. Partial: line item title/price + order name (what we had before)
 // 3. Minimal: commission amount + earnedAt only (fallback)
 type QueryTier = "full" | "partial" | "minimal";
 let tier: QueryTier = "full";

 const makeBody = (group: string, t: QueryTier) => JSON.stringify({
 query: `query {
 payouts {
 partnershipCommissions(group: ${group}, partnershipId: "${partnershipId}", first: ${Math.max(20, deltaOrders * 8)}) {
 nodes {
 id commissionUsd { amount } earnedAt
 ${t !== "minimal" ? "lineItemTitle lineItemPrice { amount }" : ""}
 ${t === "full" ? "order { name total { amount currency } lineItems { nodes { title quantity price { amount } } } }" : ""}
 ${t === "partial" ? "order { name }" : ""}
 }
 }
 }
 }`,
 });

 for (const group of groups) {
 try {
 let res = await fetch(COLLABS_GRAPHQL_URL, { method: "POST", headers, body: makeBody(group, tier) });
 let json = await res.json();

 // Step down tiers on error
 if (json.errors && tier === "full") {
 tier = "partial";
 res = await fetch(COLLABS_GRAPHQL_URL, { method: "POST", headers, body: makeBody(group, tier) });
 json = await res.json();
 }
 if (json.errors && tier === "partial") {
 tier = "minimal";
 res = await fetch(COLLABS_GRAPHQL_URL, { method: "POST", headers, body: makeBody(group, tier) });
 json = await res.json();
 }

 if (json.errors) continue;

 const nodes = (json?.data?.payouts?.partnershipCommissions?.nodes ?? []) as {
 id: string;
 commissionUsd: { amount: number };
 lineItemPrice?: { amount: number };
 earnedAt: string;
 lineItemTitle?: string;
 order?: {
 name: string;
 total?: { amount: number; currency: string };
 lineItems?: { nodes: { title: string; quantity: number; price: { amount: number } }[] };
 };
 }[];
 if (nodes.length === 0) continue;

 const cutoff = lastSyncedAt ? new Date(lastSyncedAt) : null;
 // Held orders often have earnedAt predating lastSyncedAt — use a 45-day window
 // so we find the record even when the holding period started before our last sync.
 const effectiveCutoff = group === "IN_HOLDING_PERIOD"
 ? new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
 : cutoff;
 const recent = effectiveCutoff
 ? nodes.filter((n) => new Date(n.earnedAt) > effectiveCutoff)
 : nodes.slice(0, deltaOrders * 5);

 if (recent.length > 0) {
 return recent.map((n) => ({
 commissionId: n.id,
 commissionUsdAmount: n.commissionUsd.amount,
 lineItemPrice: n.lineItemPrice?.amount ?? undefined,
 earnedAt: n.earnedAt,
 productName: n.lineItemTitle ?? undefined,
 shopifyOrderName: n.order?.name ?? undefined,
 orderTotal: n.order?.total?.amount ?? undefined,
 orderCurrency: n.order?.total?.currency ?? undefined,
 orderLineItems: n.order?.lineItems?.nodes?.map(li => ({
 title: li.title,
 quantity: li.quantity,
 price: li.price.amount,
 })) ?? undefined,
 }));
 }
 } catch {
 continue;
 }
 }
 return null;
}

// Returns false when the commission is still in holding period and no order total is available.
// The caller should then hold back the snapshot for this partnership so the next run retries.
async function saveCollabsConversions(
 partnershipId: string,
 brandName: string,
 deltaOrders: number,
 deltaCommission: number,
 currency: string,
 now: string,
 lastSyncedAt: string | null,
 prevOrderCount: number,
 commissionRules: CommissionRule[],
 cookie: string,
 csrfToken: string
): Promise<boolean> {
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return false;
 const sql = neon(dbUrl);

 const storeSlug = resolveStoreSlug(brandName);

 // Try to get individual commission records for accurate per-order totals
 const individualCommissions = await fetchIndividualCommissions(
 partnershipId, cookie, csrfToken, lastSyncedAt, deltaOrders
 );

 if (individualCommissions && individualCommissions.length > 0) {
 // Group line-item commission nodes by Shopify order name so multi-item orders
 // become a single conversion record (not one record per item).
 type CommissionItem = NonNullable<typeof individualCommissions>[number];
 const orderGroups = new Map<string, CommissionItem[]>();
 for (const c of individualCommissions) {
 const key = c.shopifyOrderName ?? `solo-${c.commissionId}`;
 const group = orderGroups.get(key) ?? [];
 group.push(c);
 orderGroups.set(key, group);
 }

 // Sort groups by most-recent earnedAt and take up to deltaOrders orders
 const groupsToSave = [...orderGroups.values()]
 .sort((a, b) => {
 const aLatest = Math.max(...a.map(c => new Date(c.earnedAt).getTime()));
 const bLatest = Math.max(...b.map(c => new Date(c.earnedAt).getTime()));
 return bLatest - aLatest;
 })
 .slice(0, deltaOrders);

 const windowStart = lastSyncedAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

 const recentClicks = await sql`
 SELECT click_id, user_id, timestamp, product_name, cart_items
 FROM clicks
 WHERE store_slug = ${storeSlug}
 AND user_id IS NOT NULL
 AND timestamp >= ${windowStart}
 AND timestamp <= ${now}
 AND click_id NOT IN (
 SELECT via_click_id FROM conversions WHERE via_click_id IS NOT NULL AND store_slug = ${storeSlug}
 )
 ORDER BY timestamp DESC
 LIMIT ${groupsToSave.length}
 `;

 for (let i = 0; i < groupsToSave.length; i++) {
 const items = groupsToSave[i];
 const firstItem = items[0];
 const { shopifyOrderName, orderLineItems, orderTotal: apiOrderTotal, orderCurrency } = firstItem;
 const click = recentClicks[i] ?? null;
 const ts = [...items.map(c => c.earnedAt)].sort().reverse()[0] || now;
 const totalCommission = items.reduce((sum, c) => sum + c.commissionUsdAmount, 0);

 // Build the items array — prefer full order line items from API, else per-commission nodes
 let lineItems: { productName: string; quantity: number; price: number }[];
 let orderTotal: number;

 if (orderLineItems && orderLineItems.length > 0 && apiOrderTotal && apiOrderTotal > 0) {
 // Best case: Collabs API gave us the full order with all items and the actual total
 const orderCurr = orderCurrency ?? currency;
 orderTotal = convertCurrencyToUSD(apiOrderTotal, orderCurr);
 lineItems = orderLineItems.map(li => ({
 productName: li.title,
 quantity: li.quantity,
 price: Math.round(convertCurrencyToUSD(li.price, orderCurr) * 100) / 100,
 }));
 } else {
 // Fallback: Collabs gave us only the commission, not the order total. Prefer the
 // price of the product the buyer actually CLICKED (looked up from our catalog) —
 // it's the real listed price and avoids the ambiguous commission→total back-calc
 // that can land on the wrong rate tier (e.g. a $729 order reported as $1,020.60).
 // Order of preference: API line-item price → clicked product's price → estimate.
 const clickedName = (click?.product_name as string | null) ?? null;
 let clickedPriceUsd: number | null = null;
 if (clickedName && clickedName !== "unknown") {
 const pr = await sql`
 SELECT price, currency FROM products
 WHERE store_slug = ${storeSlug} AND lower(title) = lower(${clickedName}) AND price > 0
 ORDER BY id DESC LIMIT 1
 `.catch(() => [] as Record<string, unknown>[]);
 if (pr.length) {
 const p = Number(pr[0].price);
 if (p > 0) clickedPriceUsd = Math.round(convertCurrencyToUSD(p, (pr[0].currency as string) || "USD") * 100) / 100;
 }
 }
 // Only trust the clicked price for a single-item order (one click → one product).
 const singleItem = items.length === 1;
 lineItems = items.map(item => {
 let price: number;
 if (item.lineItemPrice && item.lineItemPrice > 0) {
 price = Math.round(convertCurrencyToUSD(item.lineItemPrice, currency) * 100) / 100;
 } else if (singleItem && clickedPriceUsd && clickedPriceUsd > 0) {
 price = clickedPriceUsd;
 } else {
 price = calculateOrderTotal(item.commissionUsdAmount, commissionRules);
 }
 return {
 productName: item.productName ?? clickedName ?? "Item via Shopify Collabs",
 quantity: 1,
 price,
 };
 });
 orderTotal = lineItems.reduce((sum, it) => sum + it.price, 0);
 }

 // The individual commission node hasn't resolved an amount yet (holding period). Don't hold the whole
 // sale back — recover the REAL order total from the Shopify order-webhook cache (matched by order name),
 // else back-calculate it from the known partnership commission delta. Only give up if there's no signal
 // at all. This keeps the conversion in the table immediately instead of waiting for Collabs to finalize.
 if (orderTotal <= 0) {
 const held = await findCachedOrder({ storeSlug, orderName: shopifyOrderName ?? null, totalUsd: null, aroundIso: ts }).catch(() => null);
 if (held && held.totalUsd > 0) {
 orderTotal = held.totalUsd;
 if (held.items.length > 0) lineItems = held.items;
 } else if (deltaCommission > 0) {
 orderTotal = calculateOrderTotal(convertCurrencyToUSD(deltaCommission, currency) / Math.max(1, deltaOrders), commissionRules);
 lineItems = [{ productName: firstItem.productName ?? (click?.product_name as string | null) ?? "Item via Shopify Collabs", quantity: 1, price: orderTotal }];
 }
 if (orderTotal <= 0) return false;
 }

 // Enrich with the REAL line items from the Shopify order-webhook cache. Collabs
 // frequently returns no itemized data, so without this the conversion is labeled
 // with just the product the buyer clicked — which may not be what they bought.
 // Collabs stays the source of truth for the total/commission; we only swap in
 // the true cart contents (by order name, else store+total+time). No-op if the
 // store has no webhook or we have no cache hit.
 const cached = await findCachedOrder({
 storeSlug,
 orderName: shopifyOrderName ?? null,
 totalUsd: orderTotal,
 aroundIso: ts,
 }).catch(() => null);
 if (cached && cached.items.length > 0) lineItems = cached.items;

 // Stable order ID: Shopify order name is most reliable; fall back to commission node ID
 const orderId = shopifyOrderName
 ? `collabs-${storeSlug}-${shopifyOrderName.replace(/^#/, "")}`
 : `collabs-commission-${firstItem.commissionId}`;

 const conversionId = `collabs_${partnershipId}_${Date.now()}_${i}`;

 // Buyer email: Collabs never includes it, but the Shopify order webhook does —
 // recover it from the order cache (matched by name, else store+total+time).
 const customerEmail = cached?.email ?? null;

 await sql`
 INSERT INTO conversions (
 conversion_id, timestamp, order_id, order_total, currency,
 items, via_click_id, store_slug, store_name, matched, matched_click_data, user_id, customer_email
 )
 VALUES (
 ${conversionId}, ${ts}, ${orderId}, ${orderTotal}, 'USD',
 ${JSON.stringify(lineItems)},
 ${click ? (click.click_id as string) : null},
 ${storeSlug}, ${brandName}, true,
 ${JSON.stringify({
 source: "shopify-collabs",
 partnershipId,
 commissionUsd: totalCommission,
 commissionRate: commissionRules.map(r => r.value),
 ...(shopifyOrderName ? { shopifyOrderName } : {}),
 dataSource: orderLineItems ? "collabs-order-api" : "commission-nodes",
 itemsSource: cached ? "webhook-cache" : (orderLineItems ? "collabs-order-api" : "commission-nodes"),
 })},
 ${click ? (click.user_id as string) : null},
 ${customerEmail}
 )
 ON CONFLICT (order_id, store_slug) DO NOTHING
 `;

 // Mark cart items purchased so the user won't get an abandoned-cart email
 const clickUserId = click ? (click.user_id as string | null) : null;
 if (clickUserId) {
 markCartItemsPurchased(clickUserId, storeSlug).catch(() => {});
 }
 }
 return true;
 }

 // Commission is in holding period and individual records weren't findable — retry next run.
 if (deltaCommission <= 0) return false;

 // Fallback: delta-based approach using actual commission rates
 const commissionUSD = convertCurrencyToUSD(deltaCommission, currency);
 const perOrderTotal = calculateOrderTotal(commissionUSD / deltaOrders, commissionRules);

 // Look for unmatched clicks to this store since the last sync
 // (fall back to 24h window if this is the first sync)
 const windowStart = lastSyncedAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

 const recentClicks = await sql`
 SELECT click_id, user_id, timestamp, product_name, cart_items
 FROM clicks
 WHERE store_slug = ${storeSlug}
 AND user_id IS NOT NULL
 AND timestamp >= ${windowStart}
 AND timestamp <= ${now}
 AND click_id NOT IN (
 SELECT via_click_id FROM conversions
 WHERE via_click_id IS NOT NULL AND store_slug = ${storeSlug}
 )
 ORDER BY timestamp DESC
 LIMIT ${deltaOrders}
 `;

 // Create one conversion row per order, matched to a click where possible
 for (let i = 0; i < deltaOrders; i++) {
 const click = recentClicks[i] ?? null;
 // Deterministic ID based on partnership + cumulative order index so ON CONFLICT
 // correctly deduplicates if this batch is retried after a partial failure.
 const orderId = `collabs-${partnershipId}-order-${prevOrderCount + i}`;
 const conversionId = `collabs_${partnershipId}_${Date.now()}_${i}`;

 // Prefer the REAL line items from the order-webhook cache (matched by
 // store + total + time). Else use the click's cart, else the single clicked
 // product. Collabs total/commission is unchanged — this only fixes the items.
 const cached = await findCachedOrder({
 storeSlug,
 totalUsd: perOrderTotal,
 aroundIso: now,
 }).catch(() => null);
 const itemsJson = (() => {
 if (cached && cached.items.length > 0) return JSON.stringify(cached.items);
 if (click?.cart_items && Array.isArray(click.cart_items) && click.cart_items.length > 1) {
 return JSON.stringify(
 (click.cart_items as { id: string; name: string; price: number }[]).map((ci) => ({
 productName: ci.name,
 quantity: 1,
 price: ci.price,
 }))
 );
 }
 return JSON.stringify([{ productName: click ? (click.product_name as string) : `Order via Shopify Collabs`, quantity: 1, price: perOrderTotal }]);
 })();

 // Buyer email from the webhook order cache (Collabs doesn't provide it).
 const customerEmail = cached?.email ?? null;

 await sql`
 INSERT INTO conversions (
 conversion_id, timestamp, order_id, order_total, currency,
 items, via_click_id, store_slug, store_name, matched, matched_click_data, user_id, customer_email
 )
 VALUES (
 ${conversionId}, ${now}, ${orderId}, ${perOrderTotal}, 'USD',
 ${itemsJson},
 ${click ? (click.click_id as string) : null},
 ${storeSlug}, ${brandName}, true,
 ${JSON.stringify({ source: "shopify-collabs", partnershipId, deltaOrders, deltaCommission, itemsSource: cached ? "webhook-cache" : (click?.cart_items ? "click-cart" : "click-product") })},
 ${click ? (click.user_id as string) : null},
 ${customerEmail}
 )
 ON CONFLICT (order_id, store_slug) DO NOTHING
 `;
 }
 return true;
}

/**
 * Retroactively match existing collabs conversions that have no user_id.
 * For each, look for a click to the same store within 48h before the conversion.
 */
async function retroactivelyMatchCollabsConversions() {
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return 0;
 const sql = neon(dbUrl);

 const unmatched = await sql`
 SELECT id, store_slug, timestamp
 FROM conversions
 WHERE user_id IS NULL
 AND matched_click_data->>'source' = 'shopify-collabs'
 ORDER BY timestamp DESC
 LIMIT 200
 `;

 let matchedCount = 0;

 for (const conv of unmatched) {
 const windowStart = new Date(new Date(conv.timestamp as string).getTime() - 48 * 60 * 60 * 1000).toISOString();

 const clicks = await sql`
 SELECT click_id, user_id
 FROM clicks
 WHERE store_slug = ${conv.store_slug as string}
 AND user_id IS NOT NULL
 AND timestamp >= ${windowStart}
 AND timestamp <= ${conv.timestamp as string}
 AND click_id NOT IN (
 SELECT via_click_id FROM conversions WHERE via_click_id IS NOT NULL
 )
 ORDER BY timestamp DESC
 LIMIT 1
 `;

 if (clicks.length > 0 && clicks[0].user_id) {
 await sql`
 UPDATE conversions
 SET user_id = ${clicks[0].user_id as string}, via_click_id = ${clicks[0].click_id as string}
 WHERE id = ${conv.id as number}
 `;
 matchedCount++;
 }
 }

 return matchedCount;
}

const COLLABS_GRAPHQL_URL = "https://api.collabs.shopify.com/creator/graphql";

const PARTNERSHIPS_QUERY = `query PartnershipsAnalyticsQuery($first: Int, $last: Int, $after: String, $before: String) {
 partnershipsForPayouts(
 first: $first
 last: $last
 after: $after
 before: $before
 ) {
 nodes {
 id
 partnershipBrand {
 logoUrl
 backgroundColor
 name
 __typename
 }
 totalCommissionEarned {
 displayValue
 symbol
 currency
 __typename
 }
 totalLinkVisits
 totalOrders
 affiliateOffer {
 commissionRules {
 __typename
 ... on GlobalCommissionRule { value }
 ... on CollectionCommissionRule { value }
 ... on ProductCommissionRule { value }
 }
 }
 __typename
 }
 pageInfo { hasNextPage endCursor }
 __typename
 }
}`;

export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const [cookie, csrfToken] = await Promise.all([
 getSetting("collabs_cookie"),
 getSetting("collabs_csrf_token"),
 ]);

 if (!cookie || !csrfToken) {
 console.log("[Sync Collabs Revenue] No credentials stored — skipping");
 return NextResponse.json({ skipped: true, reason: "No credentials" });
 }

 // Paginate through ALL partnerships (Collabs returns 50/page). Reading only the first page
 // meant orders from partnerships beyond the top 50 were never recorded as conversions. Follow
 // the cursor, rotating the CSRF token Shopify hands back on each response.
 const buildHeaders = (csrf: string) => ({
 "content-type": "application/json",
 "cookie": cookie,
 "x-csrf-token": csrf,
 "origin": "https://collabs.shopify.com",
 "referer": "https://collabs.shopify.com/",
 "x-client-type": "web",
 "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
 });
 const allNodes: Record<string, unknown>[] = [];
 let after: string | null = null;
 let activeCsrf = csrfToken;
 for (let page = 0; page < 20; page++) { // safety cap: 20 × 100 = 2000 partnerships
 let res: Response;
 try {
 res = await fetch(COLLABS_GRAPHQL_URL, {
 method: "POST",
 headers: buildHeaders(activeCsrf),
 body: JSON.stringify({
 operationName: "PartnershipsAnalyticsQuery",
 variables: { after, before: null, first: 100, last: null },
 query: PARTNERSHIPS_QUERY,
 }),
 });
 } catch (err) {
 if (page === 0) { console.error("[Sync Collabs Revenue] Fetch failed:", err); return NextResponse.json({ error: "Fetch failed", detail: String(err) }, { status: 502 }); }
 break;
 }
 if (!res.ok) {
 if (page === 0) { console.error(`[Sync Collabs Revenue] Shopify returned ${res.status} — credentials may have expired`); return NextResponse.json({ error: `Shopify returned ${res.status}` }, { status: res.status }); }
 break;
 }
 const rotated = res.headers.get("x-csrf-token");
 if (rotated) { activeCsrf = rotated; await saveSetting("collabs_csrf_token", rotated); }
 const json = await res.json();
 if (json.errors) {
 if (page === 0) { console.error("[Sync Collabs Revenue] GraphQL errors:", json.errors); return NextResponse.json({ error: "GraphQL errors", detail: json.errors }, { status: 401 }); }
 break;
 }
 const conn = json?.data?.partnershipsForPayouts;
 const pageNodes = (conn?.nodes ?? []) as Record<string, unknown>[];
 allNodes.push(...pageNodes);
 const pageInfo = conn?.pageInfo as { hasNextPage?: boolean; endCursor?: string } | undefined;
 if (!pageInfo?.hasNextPage || !pageInfo?.endCursor || pageNodes.length === 0) break;
 after = pageInfo.endCursor;
 }

 const partnerships = allNodes.map((node: Record<string, unknown>) => {
 const brand = node.partnershipBrand as Record<string, unknown>;
 const commission = node.totalCommissionEarned as Record<string, unknown>;
 const offer = node.affiliateOffer as Record<string, unknown> | null;
 const rules = (offer?.commissionRules as CommissionRule[] | null) ?? [];
 return {
 id: node.id as string,
 name: brand?.name as string,
 logoUrl: brand?.logoUrl as string | null,
 totalCommissionEarned: commission?.displayValue as string,
 currency: commission?.currency as string,
 totalLinkVisits: node.totalLinkVisits as number,
 totalOrders: node.totalOrders as number,
 commissionRules: rules,
 };
 });

 // Load previous snapshot to compute deltas
 const [prevRaw, lastSyncedAt] = await Promise.all([
 getSetting("collabs_data"),
 getSetting("collabs_last_synced_at"),
 ]);
 const prevMap = new Map<string, { totalOrders: number; totalCommissionEarned: string }>();
 if (prevRaw) {
 try {
 const prev = JSON.parse(prevRaw) as Array<{ id: string; totalOrders: number; totalCommissionEarned: string }>;
 for (const p of prev) prevMap.set(p.id, p);
 } catch {}
 }

 const now = new Date().toISOString();
 let newOrdersRecorded = 0;
 let dbWriteFailed = false;

 // Track partnerships whose commission is in holding period — we'll hold back their
 // order count in the snapshot so the next cron run sees deltaOrders > 0 and retries.
 const holdbackIds = new Set<string>();

 for (const p of partnerships) {
 const prev = prevMap.get(p.id);
 const prevOrders = prev?.totalOrders ?? 0;
 const prevCommission = parseCommission(prev?.totalCommissionEarned ?? "0");
 const currOrders = p.totalOrders ?? 0;
 const currCommission = parseCommission(p.totalCommissionEarned ?? "0");

 const deltaOrders = currOrders - prevOrders;
 const deltaCommission = currCommission - prevCommission;

 // First time we've ever seen this partnership (newly added to the config, or newly
 // surfaced by the pagination fix): BASELINE it at its current count — do not backfill its
 // whole prior order history as synthetic conversions. Those orders predate our tracking and
 // are already recorded via the Shopify order webhook, so fabricating them here duplicates.
 // Genuinely NEW orders after this baseline record normally on subsequent runs.
 if (deltaOrders > 0 && !prev) {
 console.log(`[Sync Collabs Revenue] ${p.name}: first seen — baselining at ${currOrders} orders (not backfilling history)`);
 continue;
 }

 if (deltaOrders > 0) {
 try {
 const recorded = await saveCollabsConversions(p.id, p.name, deltaOrders, deltaCommission, p.currency ?? "USD", now, lastSyncedAt, prevOrders, p.commissionRules ?? [], cookie, csrfToken);
 if (recorded) {
 newOrdersRecorded += deltaOrders;
 console.log(`[Sync Collabs Revenue] ${p.name}: +${deltaOrders} orders, +${deltaCommission.toFixed(2)} ${p.currency ?? "USD"} commission, rates: [${(p.commissionRules ?? []).map((r: CommissionRule) => r.value + "%").join(", ")}]`);
 } else {
 holdbackIds.add(p.id);
 console.log(`[Sync Collabs Revenue] ${p.name}: +${deltaOrders} orders in holding period — no amount yet, will retry next run`);
 }
 } catch (err) {
 dbWriteFailed = true;
 console.error(`[Sync Collabs Revenue] DB write failed for ${p.name}:`, err);
 }
 }
 }

 // Build snapshot: for held-back partnerships, preserve the previous order count so
 // the next run sees deltaOrders > 0 and retries once the holding period clears.
 const snapshotToSave = partnerships.map((p: Record<string, unknown> & { id: string; totalOrders: number }) => {
 if (holdbackIds.has(p.id)) {
 const prev = prevMap.get(p.id);
 // Hold BOTH the order count and the commission at their previous values. Advancing the commission
 // while holding the order count (the old behavior) made the retry see deltaOrders>0 but deltaCommission=0,
 // so it could never back-calculate an amount and stayed stuck. Preserving both keeps the full delta intact.
 return { ...p, totalOrders: prev?.totalOrders ?? p.totalOrders, ...(prev ? { totalCommissionEarned: prev.totalCommissionEarned } : {}) };
 }
 return p;
 });

 // Only advance the snapshot if all DB writes succeeded.
 if (!dbWriteFailed) {
 await saveSetting("collabs_last_synced_at", now);
 await saveSetting("collabs_data", JSON.stringify(snapshotToSave));
 } else {
 console.warn("[Sync Collabs Revenue] Snapshot NOT advanced due to DB write failures — will retry on next run");
 }

 // Retroactively match any older collabs conversions that still have no user_id
 const retroMatched = await retroactivelyMatchCollabsConversions();

 const heldBack = holdbackIds.size;
 console.log(`[Sync Collabs Revenue] Synced ${partnerships.length} partnerships, recorded ${newOrdersRecorded} new orders, ${heldBack} held back (holding period), retro-matched ${retroMatched} existing orders${dbWriteFailed ? " (snapshot NOT advanced — DB errors)" : ""}`);
 return NextResponse.json({ ok: !dbWriteFailed, partnerships: partnerships.length, newOrdersRecorded, heldBack, retroMatched, syncedAt: now, snapshotAdvanced: !dbWriteFailed });
}
