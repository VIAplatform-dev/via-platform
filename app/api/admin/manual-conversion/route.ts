import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
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

function resolveStoreSlug(name: string): string {
  const key = name.toLowerCase();
  if (storeNameToSlug.has(key)) return storeNameToSlug.get(key)!;
  if (collabsHandleOverrides[key]) return collabsHandleOverrides[key];
  const normalized = key.replace(/[^a-z0-9]/g, "");
  if (slugByNormalized.has(normalized)) return slugByNormalized.get(normalized)!;
  return key.replace(/\s+/g, "-");
}

function estimateFromCommission(commission: number): number {
  if (commission <= 0) return 0;
  const implied = commission / 0.07;
  if (implied < 1000) return implied;
  const implied5 = commission / 0.05;
  if (implied5 <= 5000) return implied5;
  return commission / 0.03;
}

/**
 * POST /api/admin/manual-conversion
 *
 * Manually record a single missing order. Use this when a Collabs order was
 * lost due to a DB outage and the cron snapshot already advanced past it.
 *
 * Body:
 *   storeName    string. Store name (e.g. "Porter's Preloved")
 *   commission   number: commission earned in USD (order total will be estimated)
 *   orderTotal   number: (optional) exact order total if known; overrides commission estimate
 *   timestamp    string. (optional) ISO timestamp; defaults to now
 *   note         string. (optional) reason / context
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { storeName, commission, orderTotal, timestamp, note } = body as {
    storeName: string;
    commission?: number;
    orderTotal?: number;
    timestamp?: string;
    note?: string;
  };

  if (!storeName) {
    return NextResponse.json({ error: "storeName is required" }, { status: 400 });
  }
  if (!commission && !orderTotal) {
    return NextResponse.json({ error: "Either commission or orderTotal is required" }, { status: 400 });
  }

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) return NextResponse.json({ error: "No DB URL" }, { status: 500 });
  const sql = neon(dbUrl);

  const storeSlug = resolveStoreSlug(storeName);
  const total = orderTotal ?? estimateFromCommission(commission!);
  const ts = timestamp ?? new Date().toISOString();
  const uid = Date.now();
  const orderId = `collabs-manual-${storeSlug}-${uid}`;
  const conversionId = `collabs_manual_${storeSlug}_${uid}`;

  await sql`
    INSERT INTO conversions (
      conversion_id, timestamp, order_id, order_total, currency,
      items, via_click_id, store_slug, store_name, matched, matched_click_data
    )
    VALUES (
      ${conversionId}, ${ts}, ${orderId}, ${total}, 'USD',
      ${JSON.stringify([{
        productName: `Manual order entry via Shopify Collabs${note ? `: ${note}` : ""}`,
        quantity: 1,
        price: total,
      }])},
      NULL, ${storeSlug}, ${storeName}, true,
      ${JSON.stringify({
        source: "shopify-collabs-manual",
        commission: commission ?? null,
        orderTotal: orderTotal ?? null,
        note: note ?? null,
        enteredAt: new Date().toISOString(),
      })}
    )
    ON CONFLICT (order_id, store_slug) DO NOTHING
  `;

  return NextResponse.json({
    ok: true,
    orderId,
    storeSlug,
    orderTotal: total,
    timestamp: ts,
  });
}
