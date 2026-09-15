import { NextRequest, NextResponse } from "next/server";
import { saveSetting, getSetting } from "@/app/lib/settings-db";

function hashPassword(password: string): string {
 const crypto = require("crypto");
 return crypto.createHash("sha256").update(password).digest("hex");
}
function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const token = request.cookies.get("via_admin_token")?.value;
 return token === hashPassword(adminPassword);
}

const COLLABS_GRAPHQL_URL = "https://api.collabs.shopify.com/creator/graphql";

const PARTNERSHIPS_QUERY = `query PartnershipsAnalyticsQuery($first: Int, $last: Int, $after: String, $before: String) {
 partnershipsForPayouts(
 first: $first
 last: $last
 after: $after
 before: $before
 ) {
 totalCount
 pageInfo {
 hasNextPage
 hasPreviousPage
 endCursor
 startCursor
 __typename
 }
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
 __typename
 }
 __typename
 }
}`;


/** Save credentials (cookie string + csrf token) */
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const { cookie, csrfToken } = await request.json();
 if (!cookie || !csrfToken) {
 return NextResponse.json({ error: "Missing cookie or csrfToken" }, { status: 400 });
 }

 await Promise.all([
 saveSetting("collabs_cookie", cookie),
 saveSetting("collabs_csrf_token", csrfToken),
 ]);

 return NextResponse.json({ ok: true });
}

/** Trigger a sync using stored credentials */
export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const [cookie, csrfToken] = await Promise.all([
 getSetting("collabs_cookie"),
 getSetting("collabs_csrf_token"),
 ]);

 if (!cookie || !csrfToken) {
 return NextResponse.json(
 { error: "No credentials stored. Please update your Shopify Collabs credentials." },
 { status: 400 }
 );
 }

 // Paginate through ALL partnerships. Collabs returns 50 per page; previously only the first
 // page was read, so the total commission summed just the top 50, and wobbled (e.g. dropped a
 // few dollars) whenever Collabs reordered which 50 came back first, with no refund involved.
 // Follow the cursor so every partnership is counted and the total is stable.
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
 if (page === 0) return NextResponse.json({ error: "Failed to reach Shopify Collabs API", detail: String(err) }, { status: 502 });
 break; // keep the pages we already gathered
 }
 if (!res.ok) {
 if (page === 0) return NextResponse.json({ error: `Shopify Collabs returned ${res.status}. Your session may have expired. Please refresh your credentials.` }, { status: res.status });
 break;
 }
 // Rotate the CSRF token. Shopify returns a fresh one with each response; the next page needs it.
 const rotated = res.headers.get("x-csrf-token");
 if (rotated) { activeCsrf = rotated; await saveSetting("collabs_csrf_token", rotated); }
 const json = await res.json();
 if (json.errors) {
 if (page === 0) return NextResponse.json({ error: "Shopify Collabs returned errors. Your session may have expired.", detail: json.errors }, { status: 401 });
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
 return {
 id: node.id as string,
 name: brand?.name as string,
 logoUrl: brand?.logoUrl as string | null,
 totalCommissionEarned: commission?.displayValue as string,
 currency: commission?.currency as string,
 totalLinkVisits: node.totalLinkVisits as number,
 totalOrders: node.totalOrders as number,
 };
 });

 // Save for analytics display only. Do NOT touch collabs_data or collabs_last_synced_at
 // which are used exclusively by the cron job to detect delta orders for conversion recording.
 await saveSetting("collabs_analytics_synced_at", new Date().toISOString());
 // Persist the per-store snapshot so each store's own dashboard can show its authoritative
 // Collabs commission (matched by brand name), not just the tracked-conversions estimate.
 await saveSetting("collabs_partnerships_snapshot", JSON.stringify(partnerships));

 return NextResponse.json({
 ok: true,
 syncedAt: new Date().toISOString(),
 partnerships,
 });
}
