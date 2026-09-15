import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getSetting, saveSetting } from "@/app/lib/settings-db";
import { stores } from "@/app/lib/stores";

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

const storeNameToSlug = new Map<string, string>(
  stores.map((s) => [s.name.toLowerCase(), s.slug])
);

const slugByNormalized = new Map<string, string>(
  stores.map((s) => [s.slug.replace(/-/g, ""), s.slug])
);

const collabsHandleOverrides: Record<string, string> = {
  "source 24": "source-twenty-four",
};

function resolveStoreSlug(brandName: string): string {
  const key = brandName.toLowerCase();
  if (storeNameToSlug.has(key)) return storeNameToSlug.get(key)!;
  if (collabsHandleOverrides[key]) return collabsHandleOverrides[key];
  const normalized = key.replace(/[^a-z0-9]/g, "");
  if (slugByNormalized.has(normalized)) return slugByNormalized.get(normalized)!;
  return key.replace(/\s+/g, "-");
}

function estimateRevenue(commission: number): number {
  if (commission <= 0) return 0;
  const implied = commission / 0.07;
  if (implied < 1000) return implied;
  const implied5 = commission / 0.05;
  if (implied5 <= 5000) return implied5;
  return commission / 0.03;
}

/**
 * POST /api/admin/backfill-collabs-orders
 *
 * One-time import: reads the cached Collabs partnership data and saves all
 * existing orders as conversion records so they appear in the main analytics.
 * Safe to run multiple times. Uses ON CONFLICT DO NOTHING.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawCollabs = await getSetting("collabs_data");
  if (!rawCollabs) {
    return NextResponse.json({ error: "No Collabs data cached. Run a Collabs sync first" }, { status: 400 });
  }

  const partnerships = JSON.parse(rawCollabs) as Array<{
    id: string;
    name: string;
    totalOrders: number;
    totalCommissionEarned: string;
    currency: string;
  }>;

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) return NextResponse.json({ error: "No DB URL" }, { status: 500 });
  const sql = neon(dbUrl);

  const now = new Date().toISOString();
  let saved = 0;
  let skipped = 0;

  for (const p of partnerships) {
    if (!p.totalOrders || p.totalOrders === 0) continue;

    const commission = parseFloat((p.totalCommissionEarned ?? "").replace(/[^0-9.]/g, ""));
    if (isNaN(commission) || commission <= 0) continue;

    const storeSlug = resolveStoreSlug(p.name);
    const estimatedTotal = estimateRevenue(commission);
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
      ON CONFLICT (order_id, store_slug) DO NOTHING
    `;

    if (result.length > 0) {
      saved++;
    } else {
      skipped++;
    }
  }

  // Clear the cached snapshot so the next cron sync only records true deltas going forward
  await saveSetting("collabs_data_prev_backfilled", "true");

  return NextResponse.json({ ok: true, saved, skipped, total: partnerships.length });
}
