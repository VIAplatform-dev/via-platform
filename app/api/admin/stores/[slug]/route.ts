import { NextRequest, NextResponse } from "next/server";
import { stores, convertCurrencyToUSD } from "@/app/lib/stores";
import { getStoreAnalytics } from "@/app/lib/analytics-db";
import { neon } from "@neondatabase/serverless";

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const store = stores.find((s) => s.slug === slug);
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const range = request.nextUrl.searchParams.get("range") || "all";
  const analytics = await getStoreAnalytics(slug, range);

  // Also fetch inventory + followers
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  let totalInventoryValue = 0;
  let viaCommissionPotential = 0;
  let storeFollowers = 0;
  let topFavoritedProducts: { title: string; price: number; favoriteCount: number }[] = [];

  if (dbUrl) {
    const sql = neon(dbUrl);
    try {
      const [inventoryRows, followerRows, favRows] = await Promise.all([
        sql`SELECT price, currency FROM products WHERE store_slug = ${slug}`,
        sql`SELECT COUNT(*) AS cnt FROM store_favorites WHERE store_slug = ${slug}`,
        sql`
          SELECT p.title, p.price, p.currency, COUNT(pf.id) AS favorite_count
          FROM products p
          JOIN product_favorites pf ON pf.product_id = p.id
          WHERE p.store_slug = ${slug}
          GROUP BY p.id, p.title, p.price, p.currency
          ORDER BY favorite_count DESC LIMIT 10
        `,
      ]);
      // Show every figure in USD. Convert non-US stores from their stored currency
      // (a no-op for the USD prices we sync), matching how conversions are stored.
      const toUsd = (r: Record<string, unknown>) =>
        convertCurrencyToUSD(Number(r.price), (r.currency as string) || store.currency || "USD");
      const commission = (usd: number) =>
        usd < 1000 ? usd * 0.07 : usd < 5000 ? usd * 0.05 : usd * 0.03;
      totalInventoryValue = Math.round(inventoryRows.reduce((s, r) => s + toUsd(r), 0));
      viaCommissionPotential = Math.round(inventoryRows.reduce((s, r) => s + commission(toUsd(r)), 0));
      storeFollowers = Number(followerRows[0]?.cnt ?? 0);
      topFavoritedProducts = favRows.map((r) => ({
        title: r.title as string,
        price: Math.round(toUsd(r)),
        favoriteCount: Number(r.favorite_count),
      }));
    } catch {}
  }

  return NextResponse.json({
    store: {
      slug: store.slug,
      name: store.name,
      location: store.location,
      currency: store.currency,
      website: store.website,
      commissionType: store.commissionType,
    },
    totalInventoryValue,
    viaCommissionPotential,
    storeFollowers,
    topFavoritedProducts,
    analytics,
  });
}
