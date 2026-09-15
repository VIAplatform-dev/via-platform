import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { stores } from "@/app/lib/stores";

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${adminPassword}`) return true;
  const adminToken = request.cookies.get("via_admin_token")?.value;
  if (!adminToken) return false;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(adminPassword));
  const expected = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return adminToken === expected;
}

export const runtime = "edge";

const storeNameToSlug = new Map<string, string>(
  stores.map((s) => [s.name.toLowerCase(), s.slug])
);

function resolveStoreSlug(brandName: string): string {
  const key = brandName.toLowerCase();
  return storeNameToSlug.get(key) ?? brandName.toLowerCase().replace(/\s+/g, "-");
}

function parseCommission(displayValue: string): number {
  const n = parseFloat(displayValue.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

function estimateRevenue(commission: number): number {
  if (commission <= 0) return 0;
  let implied = commission / 0.07;
  if (implied < 1000) return implied;
  implied = commission / 0.05;
  if (implied <= 5000) return implied;
  return commission / 0.03;
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) return NextResponse.json({ error: "No database URL" }, { status: 500 });
  const sql = neon(dbUrl);

  // Load cached Collabs data
  const rows = await sql`SELECT value FROM app_settings WHERE key = 'collabs_data'`;
  if (rows.length === 0 || !rows[0].value) {
    return NextResponse.json({ error: "No Collabs data cached. Run a Collabs sync first" }, { status: 404 });
  }

  type Partnership = {
    id: string;
    name: string;
    totalOrders: number;
    totalCommissionEarned: string;
  };

  let partnerships: Partnership[];
  try {
    partnerships = JSON.parse(rows[0].value as string) as Partnership[];
  } catch {
    return NextResponse.json({ error: "Failed to parse cached Collabs data" }, { status: 500 });
  }

  const now = new Date().toISOString();
  let inserted = 0;
  let skipped = 0;
  const results: { name: string; orders: number; estimatedRevenue: number; status: string }[] = [];

  for (const p of partnerships) {
    if (!p.totalOrders || p.totalOrders <= 0) {
      skipped++;
      continue;
    }

    const commission = parseCommission(p.totalCommissionEarned ?? "0");
    const estimatedTotal = estimateRevenue(commission);
    const storeSlug = resolveStoreSlug(p.name);

    // Use a stable order_id so re-running this is safe (ON CONFLICT skips duplicates)
    const orderId = `collabs-backfill-${p.id}`;
    const conversionId = `collabs_backfill_${p.id}`;

    const result = await sql`
      INSERT INTO conversions (
        conversion_id, timestamp, order_id, order_total, currency,
        items, via_click_id, store_slug, store_name, matched, matched_click_data
      )
      VALUES (
        ${conversionId}, ${now}, ${orderId}, ${estimatedTotal}, 'USD',
        ${JSON.stringify([{
          productName: `${p.totalOrders} order${p.totalOrders !== 1 ? "s" : ""} via Shopify Collabs (backfill)`,
          quantity: p.totalOrders,
          price: estimatedTotal,
        }])},
        NULL, ${storeSlug}, ${p.name}, true,
        ${JSON.stringify({ source: "shopify-collabs-backfill", partnershipId: p.id, totalOrders: p.totalOrders, totalCommission: commission })}
      )
      ON CONFLICT (conversion_id) DO NOTHING
      RETURNING id
    `;

    if (result.length > 0) {
      inserted++;
      results.push({ name: p.name, orders: p.totalOrders, estimatedRevenue: Math.round(estimatedTotal * 100) / 100, status: "inserted" });
    } else {
      skipped++;
      results.push({ name: p.name, orders: p.totalOrders, estimatedRevenue: Math.round(estimatedTotal * 100) / 100, status: "already exists" });
    }
  }

  return NextResponse.json({ ok: true, inserted, skipped, results });
}
