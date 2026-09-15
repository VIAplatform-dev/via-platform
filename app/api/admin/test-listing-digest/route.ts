import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl } from "@/app/lib/base-url";
import crypto from "crypto";
import { getListingQuality } from "@/app/lib/listing-quality-db";
import { sendStoreListingDigest } from "@/app/lib/email";

// Admin: send a real listing-quality digest for one store to a chosen email, so
// we can preview exactly what stores receive. Uses live product data. Same logic
// as the weekly cron, just to an override address.
//   /api/admin/test-listing-digest?store=to-us-vintage&email=someone@example.com

function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === crypto.createHash("sha256").update(adminPassword).digest("hex");
}

const BASE_URL = getBaseUrl();

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const slug = request.nextUrl.searchParams.get("store") || "to-us-vintage";
 const email = request.nextUrl.searchParams.get("email");
 if (!email) {
 return NextResponse.json({ error: "email query param required" }, { status: 400 });
 }

 const quality = await getListingQuality(slug);
 const summary = quality.stores[0];
 if (!summary) {
 return NextResponse.json({ error: `No products found for store "${slug}"` }, { status: 404 });
 }

 const products = quality.products.slice(0, 10).map((p) => ({
 title: p.title,
 url: `${BASE_URL}${p.url}`,
 flags: [
 p.noDescription ? "no description" : null,
 p.noSizing ? "no size or measurements" : null,
 p.noImage ? "no image" : null,
 ].filter(Boolean) as string[],
 }));

 await sendStoreListingDigest({
 email,
 storeName: summary.storeName,
 flagged: summary.flagged,
 total: summary.total,
 counts: { noDescription: summary.noDescription, noSizing: summary.noSizing, noImage: summary.noImage },
 products,
 dashboardUrl: `${BASE_URL}/store/dashboard`,
 });

 return NextResponse.json({
 ok: true,
 sentTo: email,
 store: slug,
 storeName: summary.storeName,
 flagged: summary.flagged,
 total: summary.total,
 });
}
