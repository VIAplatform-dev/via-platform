import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getSetting } from "@/app/lib/settings-db";

function hashPassword(password: string): string {
 const crypto = require("crypto");
 return crypto.createHash("sha256").update(password).digest("hex");
}
function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return token === hashPassword(adminPassword);
}

const COLLABS_GRAPHQL_URL = "https://api.collabs.shopify.com/creator/graphql";
const ALL_GROUPS = ["NEXT_PAYOUT", "IN_HOLDING_PERIOD", "PAYOUT_REQUESTED", "CREATOR_ACTION_REQUIRED", "PAID_OUT"];

type CommissionNode = {
 id: string;
 commissionUsd: { amount: number };
 earnedAt: string;
 lineItemTitle?: string;
 order?: { name: string };
};

/**
 * Fetch all commission records for a partnership across all payout groups.
 * Tries to include lineItemTitle and order name; falls back to minimal if not supported.
 */
async function fetchAllCommissions(
 partnershipId: string,
 cookie: string,
 csrfToken: string
): Promise<{ earnedAt: string; productName?: string; shopifyOrderName?: string }[]> {
 const headers = {
 "content-type": "application/json",
 "cookie": cookie,
 "x-csrf-token": csrfToken,
 "origin": "https://collabs.shopify.com",
 "referer": "https://collabs.shopify.com/",
 "x-client-type": "web",
 "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
 };

 const all: { earnedAt: string; productName?: string; shopifyOrderName?: string }[] = [];
 let richFieldsSupported: boolean | null = null;

 for (const group of ALL_GROUPS) {
 const makeBody = (rich: boolean) => JSON.stringify({
 query: `query {
 payouts {
 partnershipCommissions(group: ${group}, partnershipId: "${partnershipId}", first: 250) {
 nodes {
 id commissionUsd { amount } earnedAt
 ${rich ? "lineItemTitle order { name }" : ""}
 }
 }
 }
 }`,
 });

 try {
 const useRich = richFieldsSupported !== false;
 let res = await fetch(COLLABS_GRAPHQL_URL, { method: "POST", headers, body: makeBody(useRich) });
 let json = await res.json();

 if (json.errors && useRich) {
 richFieldsSupported = false;
 res = await fetch(COLLABS_GRAPHQL_URL, { method: "POST", headers, body: makeBody(false) });
 json = await res.json();
 }

 if (json.errors) continue;
 if (richFieldsSupported === null) richFieldsSupported = true;

 const nodes = (json?.data?.payouts?.partnershipCommissions?.nodes ?? []) as CommissionNode[];
 for (const n of nodes) {
 all.push({
 earnedAt: n.earnedAt,
 productName: n.lineItemTitle ?? undefined,
 shopifyOrderName: n.order?.name ?? undefined,
 });
 }
 } catch {
 continue;
 }
 }

 return all;
}

/**
 * POST /api/admin/backfill-collabs-products
 *
 * Re-queries the Shopify Collabs API for all commission records and backfills
 * product names on conversions that have a generic or missing product name.
 *
 * Matches conversion ↔ commission by earnedAt timestamp (within ±5 minutes).
 * Only updates conversions that genuinely lack a real product name.
 */
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });

 const [cookie, csrfToken] = await Promise.all([
 getSetting("collabs_cookie"),
 getSetting("collabs_csrf_token"),
 ]);
 if (!cookie || !csrfToken) {
 return NextResponse.json({ error: "No Collabs credentials. Update them in the admin sync panel first" }, { status: 400 });
 }

 const sql = neon(dbUrl);

 // Find Collabs conversions with missing/generic product names
 const candidates = await sql`
 SELECT
 conversion_id,
 timestamp,
 matched_click_data->>'partnershipId' AS partnership_id,
 items
 FROM conversions
 WHERE matched_click_data->>'source' = 'shopify-collabs'
 AND (
 items IS NULL
 OR items::text = '[]'
 OR items::jsonb @> '[{"productName": "Order via Shopify Collabs"}]'
 OR matched_click_data->>'productName' IS NULL
 )
 ORDER BY timestamp DESC
 LIMIT 500
 `;

 if (candidates.length === 0) {
 return NextResponse.json({ ok: true, updated: 0, message: "No conversions need backfilling" });
 }

 // Group by partnershipId to minimise API calls
 const byPartnership = new Map<string, { conversionId: string; timestamp: string }[]>();
 for (const c of candidates) {
 const pid = c.partnership_id as string | null;
 if (!pid) continue;
 if (!byPartnership.has(pid)) byPartnership.set(pid, []);
 byPartnership.get(pid)!.push({ conversionId: c.conversion_id as string, timestamp: c.timestamp instanceof Date ? (c.timestamp as Date).toISOString() : c.timestamp as string });
 }

 let updated = 0;
 let noProductName = 0;
 const MATCH_WINDOW_MS = 5 * 60 * 1000; // ±5 minutes

 for (const [partnershipId, convs] of byPartnership) {
 const commissions = await fetchAllCommissions(partnershipId, cookie, csrfToken);

 // Only keep commissions that actually have a product name
 const withName = commissions.filter(c => c.productName);
 if (withName.length === 0) {
 noProductName += convs.length;
 continue;
 }

 for (const conv of convs) {
 const convTime = new Date(conv.timestamp).getTime();

 // Find closest commission by earnedAt within ±5 minutes
 let best: (typeof withName)[0] | null = null;
 let bestDelta = Infinity;
 for (const commission of withName) {
 const delta = Math.abs(new Date(commission.earnedAt).getTime() - convTime);
 if (delta < bestDelta && delta <= MATCH_WINDOW_MS) {
 bestDelta = delta;
 best = commission;
 }
 }

 if (!best?.productName) continue;

 const productName = best.productName;
 const shopifyOrderName = best.shopifyOrderName;

 await sql`
 UPDATE conversions SET
 items = ${JSON.stringify([{ productName, quantity: 1, price: 0 }])}::jsonb,
 matched_click_data = COALESCE(matched_click_data, '{}'::jsonb)
 || ${JSON.stringify({
 productName,
 ...(shopifyOrderName ? { shopifyOrderName } : {}),
 })}::jsonb
 WHERE conversion_id = ${conv.conversionId}
 `;
 updated++;
 }
 }

 return NextResponse.json({
 ok: true,
 updated,
 noProductName,
 total: candidates.length,
 partnerships: byPartnership.size,
 });
}
