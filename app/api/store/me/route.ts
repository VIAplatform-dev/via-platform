import { NextRequest, NextResponse } from "next/server";
import { stores, convertCurrencyToUSD } from "@/app/lib/stores";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { neon } from "@neondatabase/serverless";

function getDatabaseUrl() {
 const url = process.env.DATABASE_URL;
 if (!url) throw new Error("DATABASE_URL is not set");
 return url;
}

export async function GET(request: NextRequest) {
 // ...Any, not the web-only resolver: the mobile app authenticates with a bearer JWT, and every
 // other /api/store/* route the app calls already accepts it. Rejecting it here made the app
 // see a 403 for a legitimate seller.
 const storeSlug = await resolveStoreSlugAny(request);
 if (!storeSlug) {
 return NextResponse.json({ error: "Not a registered store partner" }, { status: 403 });
 }

 // Admin test account — return synthetic store data
 if (storeSlug === "via-admin") {
 return NextResponse.json({
 storeSlug: "via-admin",
 storeName: "VYA Admin",
 location: "New York, NY",
 currency: "USD",
 website: "https://vyaplatform.com",
 logo: "/vya-logo.png",
 logoBg: "#FFFDF8",
 commissionType: "shopify-collabs",
 totalInventoryValue: 0,
 viaCommissionPotential: 0,
 });
 }

 const store = stores.find((s) => s.slug === storeSlug);
 if (!store) {
 // Store is in storeContactEmails but not yet fully onboarded — return a minimal portal
 return NextResponse.json({
 storeSlug,
 storeName: storeSlug,
 location: "",
 currency: "USD",
 website: "",
 logo: "",
 logoBg: "#FFFDF8",
 commissionType: "squarespace-manual",
 totalInventoryValue: 0,
 viaCommissionPotential: 0,
 storeFollowers: 0,
 topFavoritedProducts: [],
 pendingOnboarding: true,
 });
 }

 const commissionRates: { upTo?: number; rate: number }[] =
 (store as any).commissionRates ?? [{ upTo: 1000, rate: 0.07 }, { upTo: 5000, rate: 0.05 }, { rate: 0.03 }];

 function calcCommission(price: number): number {
 for (const tier of commissionRates) {
 if (tier.upTo === undefined || price < tier.upTo) return price * tier.rate;
 }
 return price * commissionRates[commissionRates.length - 1].rate;
 }

 // Calculate total inventory value, commission potential, store followers, and top favorited products
 let totalInventoryValue = 0;
 let viaCommissionPotential = 0;
 let storeFollowers = 0;
 let topFavoritedProducts: { title: string; favoriteCount: number; price: number }[] = [];

 try {
 const sql = neon(getDatabaseUrl());

 const [inventoryRows, followerRows, favProductRows] = await Promise.all([
 sql`
 SELECT price, currency FROM products
 WHERE store_slug = ${storeSlug}
 AND (shopify_product_id IS NULL OR collabs_link IS NOT NULL)
 `,
 sql`
 SELECT COUNT(*) AS cnt FROM store_favorites WHERE store_slug = ${storeSlug}
 `,
 sql`
 SELECT p.title, p.price, p.currency, COUNT(pf.id) AS favorite_count
 FROM products p
 JOIN product_favorites pf ON pf.product_id = p.id
 WHERE p.store_slug = ${storeSlug}
 GROUP BY p.id, p.title, p.price, p.currency
 ORDER BY favorite_count DESC
 LIMIT 10
 `,
 ]);

 // Every figure a store sees is in USD — non-US stores' prices are converted from
 // their own stored currency (a no-op for the USD prices we sync). Mirrors the way
 // conversions are always stored/shown in USD.
 const toUsd = (r: Record<string, unknown>) =>
 convertCurrencyToUSD(Number(r.price), (r.currency as string) || store.currency || "USD");

 totalInventoryValue = Math.round(inventoryRows.reduce((s, r) => s + toUsd(r), 0));
 viaCommissionPotential = Math.round(inventoryRows.reduce((s, r) => s + calcCommission(toUsd(r)), 0));
 storeFollowers = Number(followerRows[0]?.cnt ?? 0);
 topFavoritedProducts = favProductRows.map((r) => ({
 title: r.title as string,
 price: Math.round(toUsd(r)),
 favoriteCount: Number(r.favorite_count),
 }));
 } catch {
 // Non-fatal — dashboard still loads without these figures
 }

 return NextResponse.json({
 storeSlug: store.slug,
 storeName: store.name,
 location: store.location,
 currency: store.currency,
 website: store.website,
 logo: store.logo,
 logoBg: store.logoBg,
 commissionType: store.commissionType,
 commissionRates,
 totalInventoryValue,
 viaCommissionPotential,
 storeFollowers,
 topFavoritedProducts,
 });
}
