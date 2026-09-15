import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getSetting } from "@/app/lib/settings-db";
import { stores, convertCurrencyToUSD } from "@/app/lib/stores";
import crypto from "crypto";

function isAuthorized(request: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${adminPassword}`) return true;
  const token = request.cookies.get("via_admin_token")?.value;
  return !!token && token === crypto.createHash("sha256").update(adminPassword).digest("hex");
}

const COLLABS_GRAPHQL_URL = "https://api.collabs.shopify.com/creator/graphql";

function calculateOrderTotal(commissionUsd: number, rules: { value: number }[]): number {
  if (commissionUsd <= 0) return 0;
  if (rules.length === 0) {
    const implied = commissionUsd / 0.07;
    if (implied < 1000) return implied;
    const implied5 = commissionUsd / 0.05;
    if (implied5 <= 5000) return implied5;
    return commissionUsd / 0.03;
  }
  const rates = [...new Set(rules.map((r) => r.value / 100))].sort((a, b) => b - a);
  if (rates.length === 1) return commissionUsd / rates[0];
  const tierCeilings = [1000, 5000];
  for (let i = 0; i < rates.length; i++) {
    const implied = commissionUsd / rates[i];
    const ceiling = tierCeilings[i] ?? Infinity;
    if (implied < ceiling) return implied;
  }
  return commissionUsd / rates[rates.length - 1];
}

type Node = {
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
};

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storeSlug } = await request.json();
  if (!storeSlug) return NextResponse.json({ error: "storeSlug required" }, { status: 400 });

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });

  const store = stores.find((s) => s.slug === storeSlug);
  if (!store) return NextResponse.json({ error: `Store '${storeSlug}' not found in stores config` }, { status: 404 });

  const [cookie, csrfToken, collabsDataRaw] = await Promise.all([
    getSetting("collabs_cookie"),
    getSetting("collabs_csrf_token"),
    getSetting("collabs_data"),
  ]);

  if (!cookie || !csrfToken) {
    return NextResponse.json({ error: "No Collabs credentials stored. Update them in the Collabs admin page first" }, { status: 400 });
  }

  // Find the Collabs partnership for this store by matching store name
  let partnershipId: string | null = null;
  let commissionRules: { value: number }[] = [];
  let partnershipCurrency = "USD";

  if (collabsDataRaw) {
    try {
      const collabsData = JSON.parse(collabsDataRaw) as Array<{
        id: string;
        name: string;
        currency?: string;
        commissionRules?: { value: number }[];
      }>;
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const match = collabsData.find((p) => normalize(p.name) === normalize(store.name));
      if (match) {
        partnershipId = match.id;
        commissionRules = match.commissionRules ?? [];
        partnershipCurrency = match.currency ?? "USD";
      }
    } catch {}
  }

  if (!partnershipId) {
    return NextResponse.json({
      error: `No Collabs partnership found for '${store.name}'. Run a Collabs sync first, or this store may not be on Shopify Collabs.`,
    }, { status: 404 });
  }

  // Fetch commission records. Try full tier (with order total + all line items) first
  const headers = {
    "content-type": "application/json",
    "cookie": cookie,
    "x-csrf-token": csrfToken,
    "origin": "https://collabs.shopify.com",
    "referer": "https://collabs.shopify.com/",
    "x-client-type": "web",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
  };

  type QueryTier = "full" | "partial" | "minimal";

  const makeQuery = (group: string, tier: QueryTier) => JSON.stringify({
    query: `query {
      payouts {
        partnershipCommissions(group: ${group}, partnershipId: "${partnershipId}", first: 50) {
          nodes {
            id commissionUsd { amount } earnedAt
            ${tier !== "minimal" ? "lineItemTitle lineItemPrice { amount }" : ""}
            ${tier === "full" ? "order { name total { amount currency } lineItems { nodes { title quantity price { amount } } } }" : ""}
            ${tier === "partial" ? "order { name }" : ""}
          }
        }
      }
    }`,
  });

  const groups = ["NEXT_PAYOUT", "IN_HOLDING_PERIOD", "PAYOUT_REQUESTED", "CREATOR_ACTION_REQUIRED", "PAID_OUT"];
  let allNodes: Node[] = [];
  let usedTier: QueryTier = "full";

  for (const group of groups) {
    let tier: QueryTier = "full";
    try {
      let res = await fetch(COLLABS_GRAPHQL_URL, { method: "POST", headers, body: makeQuery(group, tier) });
      let json = await res.json();
      if (json.errors) { tier = "partial"; res = await fetch(COLLABS_GRAPHQL_URL, { method: "POST", headers, body: makeQuery(group, tier) }); json = await res.json(); }
      if (json.errors) { tier = "minimal"; res = await fetch(COLLABS_GRAPHQL_URL, { method: "POST", headers, body: makeQuery(group, tier) }); json = await res.json(); }
      if (json.errors) continue;
      const nodes = (json?.data?.payouts?.partnershipCommissions?.nodes ?? []) as Node[];
      if (nodes.length > 0) { allNodes = nodes; usedTier = tier; break; }
    } catch { continue; }
  }

  if (allNodes.length === 0) {
    return NextResponse.json({ ok: true, message: "No commission records found in Collabs for this store", resynced: 0 });
  }

  // Group commission nodes by order name so multi-item orders become one record
  const orderGroups = new Map<string, Node[]>();
  for (const node of allNodes) {
    const key = node.order?.name ?? `solo-${node.id}`;
    const group = orderGroups.get(key) ?? [];
    group.push(node);
    orderGroups.set(key, group);
  }

  const sql = neon(dbUrl);
  const now = new Date().toISOString();

  // Delete old-format records: collabs-{digits}-{digits} (manual sync)
  // and collabs-{digits}-order-{digits} (cron fallback path)
  const deleted = await sql`
    DELETE FROM conversions
    WHERE store_slug = ${storeSlug}
      AND matched_click_data->>'source' = 'shopify-collabs'
      AND order_id ~ '^collabs-[0-9]+(-order)?-[0-9]+$'
    RETURNING order_id
  `;

  let resynced = 0;

  for (const [, items] of orderGroups) {
    const firstItem = items[0];
    const shopifyOrderName = firstItem.order?.name;
    const apiOrderTotal = firstItem.order?.total?.amount;
    const orderCurrency = firstItem.order?.total?.currency ?? partnershipCurrency;
    const orderLineItems = firstItem.order?.lineItems?.nodes?.map((li) => ({
      title: li.title,
      quantity: li.quantity,
      price: li.price.amount,
    }));
    const ts = items.map((i) => i.earnedAt).sort().reverse()[0] || now;
    const totalCommission = items.reduce((sum, i) => sum + i.commissionUsd.amount, 0);

    let lineItems: { productName: string; quantity: number; price: number }[];
    let orderTotal: number;

    if (orderLineItems && orderLineItems.length > 0 && apiOrderTotal && apiOrderTotal > 0) {
      orderTotal = convertCurrencyToUSD(apiOrderTotal, orderCurrency);
      lineItems = orderLineItems.map((li) => ({
        productName: li.title,
        quantity: li.quantity,
        price: Math.round(convertCurrencyToUSD(li.price, orderCurrency) * 100) / 100,
      }));
    } else {
      lineItems = items.map((item) => {
        const price =
          item.lineItemPrice && item.lineItemPrice.amount > 0
            ? Math.round(convertCurrencyToUSD(item.lineItemPrice.amount, partnershipCurrency) * 100) / 100
            : calculateOrderTotal(item.commissionUsd.amount, commissionRules);
        return { productName: item.lineItemTitle ?? "Item via Shopify Collabs", quantity: 1, price };
      });
      orderTotal = lineItems.reduce((sum, it) => sum + it.price, 0);
    }

    const orderId = shopifyOrderName
      ? `collabs-${storeSlug}-${shopifyOrderName.replace(/^#/, "")}`
      : `collabs-commission-${firstItem.id}`;

    const conversionId = `collabs_resync_${storeSlug}_${Date.now()}_${resynced}`;

    await sql`
      INSERT INTO conversions (
        conversion_id, timestamp, order_id, order_total, currency,
        items, store_slug, store_name, matched, matched_click_data
      )
      VALUES (
        ${conversionId}, ${ts}, ${orderId}, ${orderTotal}, 'USD',
        ${JSON.stringify(lineItems)},
        ${storeSlug}, ${store.name}, true,
        ${JSON.stringify({
          source: "shopify-collabs",
          partnershipId,
          commissionUsd: totalCommission,
          dataSource: orderLineItems ? "collabs-order-api" : "commission-nodes",
          resynced: true,
          ...(shopifyOrderName ? { shopifyOrderName } : {}),
        })}
      )
      ON CONFLICT (order_id, store_slug) DO UPDATE
        SET order_total = EXCLUDED.order_total,
            items = EXCLUDED.items,
            matched_click_data = EXCLUDED.matched_click_data
    `;

    resynced++;
  }

  return NextResponse.json({
    ok: true,
    storeSlug,
    partnershipId,
    usedTier,
    deletedOldRecords: deleted.map((r) => r.order_id),
    resynced,
    orders: [...orderGroups.keys()],
  });
}
