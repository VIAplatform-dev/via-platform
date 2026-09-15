import { NextRequest, NextResponse } from "next/server";
import { getStorefrontBySlug } from "@/app/lib/storefront-db";
import { stores, convertCurrencyToUSD } from "@/app/lib/stores";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { neon } from "@neondatabase/serverless";
import { getDisplayNameOverride } from "@/app/lib/store-profile-db";
import { storeCurrency } from "@/app/lib/store-currency-db";

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

 // Admin test account: return synthetic store data
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

 // Her currency, from her own choice or her ship-from country. NOT the hardcoded "USD" that both
 // branches below used to return: `stores` is the original partner array and every store that
 // signed up since falls through it, so every one of them printed dollars whatever address it had
 // saved. See store-currency.ts.
 const currency = await storeCurrency(storeSlug);

 // HER LOGO, from where she actually set it.
 //
 // This route returned `logo: ""` for every real store, so the one asset a seller has definitely
 // uploaded, the mark on her own storefront, was invisible to everything that asked "who is this
 // shop": the phone's greeting drew a grey disc, and the workspace sidebar drew VYA's mark in the
 // corner of her own workspace. It is one read of the storefront theme, which the design editor
 // has been writing all along (app/api/store/storefront/design).
 /* allow-swallow: a shop with no storefront row yet simply has no logo */
 const storeLogo = await getStorefrontBySlug(storeSlug)
  .then((sf) => (typeof sf?.theme?.logo === "string" ? sf.theme.logo : "") || "")
  .catch(() => "");

 const store = stores.find((s) => s.slug === storeSlug);
 if (!store) {
 // Store is in storeContactEmails but not yet fully onboarded. Return a minimal portal.
 //
 // The name comes from the sellers row, not from the slug. `stores` is a hardcoded array of the
 // original partner shops; every store that signed up since is absent from it and fell through to
 // this branch, where the name WAS the slug. So a seller who set her name in Settings was greeted
 // by her URL, "Good afternoon, gianna-marie-raucher", and nothing she typed ever changed it.
 const named = await neon(getDatabaseUrl())`SELECT name FROM sellers WHERE slug = ${storeSlug} LIMIT 1`
  .then((r) => (r[0]?.name as string | undefined) || null)
  .catch(() => null);
 // What she renamed the shop to, if she did. Settings → Store details writes this override and
 // this route never read it, so a rename showed on her storefront and nowhere in her own
 // workspace: the greeting kept using the name from before.
 const renamed = await getDisplayNameOverride(storeSlug).catch(() => null);
 return NextResponse.json({
 storeSlug,
 storeName: renamed || named || storeSlug,
 location: "",
 currency,
 website: "",
 logo: storeLogo,
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

 // Every figure a store sees is in USD. Non-US stores' prices are converted from
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
 // Non-fatal: dashboard still loads without these figures
 }

 // Her own name for her shop beats the one VYA typed at onboarding. The same order
 // getStoreProfile resolves (override → static → slug), so the workspace, the app and the
 // storefront finally agree on what this shop is called.
 const renamedStore = await getDisplayNameOverride(storeSlug).catch(() => null);
 return NextResponse.json({
 storeSlug: store.slug,
 storeName: renamedStore || store.name,
 location: store.location,
 currency,
 website: store.website,
 // What she uploaded wins over the hardcoded partner asset: `stores` was written before
 // sellers could set their own, and a shop that has set one should see it.
 logo: storeLogo || store.logo,
 logoBg: store.logoBg,
 commissionType: store.commissionType,
 commissionRates,
 totalInventoryValue,
 viaCommissionPotential,
 storeFollowers,
 topFavoritedProducts,
 });
}
