import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";
import { inferCategoryFromTitle, inferBrandFromTitle } from "@/app/lib/loadStoreProducts";
import { bagsSlugs } from "@/app/lib/categoryMap";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 if (request.headers.get("authorization") === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return token === crypto.createHash("sha256").update(adminPassword).digest("hex");
}

// Read-only sizing for the Entrupy partnership: how many DESIGNER BAGS (bag category + a recognized
// brand = authenticatable) are in the catalog, what share of stores sell them, and the monthly
// listing + sale rate — so authentication-volume projections use real data, not a guess.
export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });
 const sql = neon(dbUrl);

 const now = Date.now();
 const days = (d: number) => new Date(now - d * 86_400_000).toISOString();

 // Current live inventory + sold items. created_at ~ when it was listed/synced; sold_at ~ real sale.
 const [current, sold] = await Promise.all([
  sql`SELECT store_slug, title, created_at FROM products WHERE title IS NOT NULL` as Promise<Array<Record<string, unknown>>>,
  sql`SELECT store_slug, title, sold_at FROM sold_items WHERE title IS NOT NULL` as Promise<Array<Record<string, unknown>>>,
 ]);

 const isDesignerBag = (title: string) =>
  bagsSlugs.has(inferCategoryFromTitle(title)) && inferBrandFromTitle(title) !== null;

 const allStores = new Set<string>();
 const bagStores = new Set<string>();
 const bagsByBrand = new Map<string, number>();
 let currentBags = 0, listed30 = 0, listed90 = 0;

 for (const r of current) {
  const store = String(r.store_slug || ""); if (store) allStores.add(store);
  const title = String(r.title || "");
  if (!isDesignerBag(title)) continue;
  currentBags++;
  if (store) bagStores.add(store);
  const brand = inferBrandFromTitle(title) || "other";
  bagsByBrand.set(brand, (bagsByBrand.get(brand) || 0) + 1);
  const created = r.created_at ? new Date(String(r.created_at)).toISOString() : null;
  if (created && created >= days(30)) listed30++;
  if (created && created >= days(90)) listed90++;
 }

 let sold30 = 0, sold90 = 0, soldBagsTotal = 0;
 for (const r of sold) {
  const store = String(r.store_slug || ""); if (store) allStores.add(store);
  const title = String(r.title || "");
  if (!isDesignerBag(title)) continue;
  soldBagsTotal++;
  if (store) bagStores.add(store);
  const at = r.sold_at ? new Date(String(r.sold_at)).toISOString() : null;
  if (at && at >= days(30)) sold30++;
  if (at && at >= days(90)) sold90++;
 }

 const topBrands = [...bagsByBrand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  .map(([brand, count]) => ({ brand, count }));

 const totalStores = allStores.size;
 const pctBagStores = totalStores ? bagStores.size / totalStores : 0;
 const listRatePerMo = Math.round(listed90 / 3);   // designer bags newly listed / month (last 90d avg)
 const soldRatePerMo = Math.round(sold90 / 3);      // designer bags sold / month (last 90d avg)

 // Authentication-volume projection. You'd authenticate a bag around listing, so the LISTING rate is
 // the natural base; SOLD rate is the conservative floor. 80% = assumed adoption among bag sellers.
 const ADOPTION = 0.80;
 const project = (ratePerMo: number) => ({
  ratePerMo,
  atAdoption80: Math.round(ratePerMo * ADOPTION),
 });

 return NextResponse.json({
  as_of: new Date(now).toISOString(),
  stores: { total: totalStores, sellingDesignerBags: bagStores.size, pctSellingDesignerBags: Number((pctBagStores * 100).toFixed(1)) },
  designerBags: {
   currentlyListed: currentBags,
   listedLast30d: listed30, listedLast90d: listed90,
   soldLast30d: sold30, soldLast90d: sold90, soldAllTime: soldBagsTotal,
  },
  monthlyRate: { listedPerMonth: listRatePerMo, soldPerMonth: soldRatePerMo },
  authVolumeProjection: {
   assumption: "80% of bag-selling stores authenticate; rate = designer bags per month",
   byListingRate: project(listRatePerMo),
   bySoldRate: project(soldRatePerMo),
  },
  perBagStore: {
   avgBagsCurrent: bagStores.size ? Math.round(currentBags / bagStores.size) : 0,
   avgListedPerMonth: bagStores.size ? Number((listRatePerMo / bagStores.size).toFixed(1)) : 0,
  },
  topBrands,
  notes: "created_at may reflect Shopify sync time, not original listing date; sold_at is real sale time. 'Designer bag' = bag category + a recognized brand.",
 });
}
