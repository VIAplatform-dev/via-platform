import { NextRequest, NextResponse } from "next/server";
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

const INTROSPECTION_QUERY = `
 query IntrospectionQuery {
 __schema {
 queryType { name }
 types {
 kind
 name
 fields(includeDeprecated: false) {
 name
 type {
 kind
 name
 ofType { kind name ofType { kind name } }
 }
 args {
 name
 type { kind name ofType { kind name } }
 }
 }
 }
 }
 }
`;

// Also try a targeted query for order/payout level data
const ORDER_PROBE_QUERY = `
 query OrderProbe {
 __type(name: "Query") {
 fields {
 name
 description
 args { name type { kind name ofType { kind name } } }
 type { kind name ofType { kind name ofType { kind name } } }
 }
 }
 }
`;

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const [cookie, csrfToken] = await Promise.all([
 getSetting("collabs_cookie"),
 getSetting("collabs_csrf_token"),
 ]);

 if (!cookie || !csrfToken) {
 return NextResponse.json({ error: "No Collabs credentials stored. Run sync-collabs first" }, { status: 400 });
 }

 const headers = {
 "content-type": "application/json",
 "cookie": cookie,
 "x-csrf-token": csrfToken,
 "origin": "https://collabs.shopify.com",
 "referer": "https://collabs.shopify.com/",
 "x-client-type": "web",
 "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
 };

 // Run introspection on the Query type to see all available top-level queries
 const probeRes = await fetch(COLLABS_GRAPHQL_URL, {
 method: "POST",
 headers,
 body: JSON.stringify({ operationName: "OrderProbe", query: ORDER_PROBE_QUERY }),
 });

 const probeJson = await probeRes.json();
 const queryFields = probeJson?.data?.__type?.fields ?? [];

 // Filter to anything that sounds order/payout/conversion related
 const interesting = queryFields.filter((f: { name: string }) =>
 /order|payout|conver|sale|revenue|commission|affiliate|transaction/i.test(f.name)
 );

 // Deeply probe the types we care most about
 const typesToProbe = [
 "Payout", "Payouts", "ManualPayout", "Analytics", "AnalyticsSummary",
 "Partnership", "CommissionDispute", "AnalyticsTimeSeries",
 "AffiliateOffer", "Money", "AnalyticsAggregationResult",
 "Commission", "CommissionConnection", "PartnershipPayout",
 "PartnershipPayoutConnection", "PayoutBill", "DateRangeInput",
 "CommissionRule",
 ];

 const typeDetails: Record<string, unknown> = {};
 for (const t of typesToProbe) {
 const q = `query Probe { __type(name: "${t}") { name kind fields { name type { kind name ofType { kind name ofType { kind name } } } } } }`;
 try {
 const r = await fetch(COLLABS_GRAPHQL_URL, { method: "POST", headers, body: JSON.stringify({ query: q }) });
 const j = await r.json();
 const fields = j?.data?.__type?.fields ?? null;
 typeDetails[t] = fields ? fields.map((f: { name: string; type: unknown }) => ({ name: f.name, type: f.type })) : null;
 } catch {
 typeDetails[t] = "fetch-error";
 }
 }

 // Fetch partnerships with CORRECT commission rule fragment names
 let partnershipWithOffer: unknown = null;
 try {
 const r = await fetch(COLLABS_GRAPHQL_URL, {
 method: "POST",
 headers,
 body: JSON.stringify({
 query: `query {
 partnerships(first: 50) {
 nodes {
 id
 partnershipBrand { name }
 totalOrders
 totalCommissionEarned { displayValue currency amount }
 affiliateOffer {
 affiliateCode
 commissionRules {
 __typename
 ... on GlobalCommissionRule { value type }
 ... on CollectionCommissionRule { value type collection { id title } }
 ... on ProductCommissionRule { value type }
 }
 }
 }
 }
 }`,
 }),
 });
 partnershipWithOffer = await r.json();
 } catch {
 partnershipWithOffer = "fetch-error";
 }

 // Probe PayoutGroup enum and Commission fields
 let commissionRuleTypes: unknown = null;
 try {
 const r = await fetch(COLLABS_GRAPHQL_URL, {
 method: "POST",
 headers,
 body: JSON.stringify({
 query: `query {
 payoutGroup: __type(name: "PayoutGroup") { enumValues { name } }
 commissionRuleType: __type(name: "CommissionRuleType") { enumValues { name } }
 }`,
 }),
 });
 commissionRuleTypes = await r.json();
 } catch {
 commissionRuleTypes = "fetch-error";
 }

 // Fetch individual commissions using correct PayoutGroup enum
 let commissionRecords: unknown = null;
 try {
 const partnershipsRes = await fetch(COLLABS_GRAPHQL_URL, {
 method: "POST",
 headers,
 body: JSON.stringify({
 query: `query { partnershipsForPayouts(first: 1) { nodes { id } } }`,
 }),
 });
 const pJson = await partnershipsRes.json();
 const firstId = pJson?.data?.partnershipsForPayouts?.nodes?.[0]?.id;

 if (firstId) {
 // Try ALL as the group value
 const r = await fetch(COLLABS_GRAPHQL_URL, {
 method: "POST",
 headers,
 body: JSON.stringify({
 query: `query {
 payouts {
 partnershipCommissions(group: ALL, partnershipId: "${firstId}", first: 5) {
 nodes { id commissionUsd { displayValue currency amount } earnedAt attributionTrigger }
 }
 }
 }`,
 }),
 });
 commissionRecords = await r.json();
 }
 } catch {
 commissionRecords = "fetch-error";
 }

 // Try payouts without pagination
 let payoutsSample: unknown = null;
 try {
 const r = await fetch(COLLABS_GRAPHQL_URL, {
 method: "POST",
 headers,
 body: JSON.stringify({
 query: `query { payouts { id amount { displayValue currency } status createdAt } }`,
 }),
 });
 payoutsSample = await r.json();
 } catch {
 payoutsSample = "fetch-error";
 }

 // Try analyticsSummary with required args
 let analyticsSample: unknown = null;
 try {
 const r = await fetch(COLLABS_GRAPHQL_URL, {
 method: "POST",
 headers,
 body: JSON.stringify({
 query: `query {
 analyticsSummary(
 dateRange: { start: "2024-01-01", end: "2026-12-31" }
 filter: {}
 ) {
 __typename
 }
 }`,
 }),
 });
 analyticsSample = await r.json();
 } catch {
 analyticsSample = "fetch-error";
 }

 return NextResponse.json({
 allQueryFields: queryFields.map((f: { name: string; type: unknown }) => ({ name: f.name, type: f.type })),
 interestingFields: interesting,
 typeDetails,
 partnershipWithOffer,
 commissionRuleTypes,
 commissionRecords,
 payoutsSample,
 analyticsSample,
 });
}
