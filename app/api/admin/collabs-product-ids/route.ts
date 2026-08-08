import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getProductsMissingCollabsLink } from "@/app/lib/db";
import { stores } from "@/app/lib/stores";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://collabs.shopify.com",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// This route is listed in middleware PUBLIC_ROUTES (so it can serve a cross-origin CORS caller),
// which means the middleware admin gate does NOT cover it — it MUST self-authenticate. The
// collabs-link generation now runs fully server-side (admin + cron generate-collabs-links), so
// this legacy read endpoint requires the standard admin credential.
function isAuthorized(request: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  if (request.headers.get("authorization") === `Bearer ${adminPassword}`) return true;
  const token = request.cookies.get("via_admin_token")?.value;
  return !!token && token === crypto.createHash("sha256").update(adminPassword).digest("hex");
}

const COLLABS_STORE_SLUGS = new Set(
  stores.filter((s) => "affiliatePath" in s).map((s) => s.slug)
);

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
  }
  const products = await getProductsMissingCollabsLink();
  const filtered = products.filter((p) => COLLABS_STORE_SLUGS.has(p.store_slug));

  return NextResponse.json(
    {
      products: filtered.map((p) => ({
        id: p.id,
        shopifyProductId: p.shopify_product_id,
        title: p.title,
        storeSlug: p.store_slug,
      })),
    },
    { headers: CORS_HEADERS }
  );
}
