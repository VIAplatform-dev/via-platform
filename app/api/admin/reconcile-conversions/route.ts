import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { reconcileConversionsFromCache } from "@/app/lib/order-cache-db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function hashPassword(password: string): string {
 return crypto.createHash("sha256").update(password).digest("hex");
}
function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === hashPassword(adminPassword);
}

// POST /api/admin/reconcile-conversions?limit=500: re-enrich existing Shopify
// Collabs conversions with the REAL line items from the order-webhook cache.
// Collabs stays the recorder; this only fixes the `items` (product labels), not
// totals or commission. Safe to re-run. Only matches orders the webhook has
// cached (i.e. orders placed after the cache went live).
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const limit = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get("limit") ?? "500", 10), 1), 2000);
 const result = await reconcileConversionsFromCache(limit);
 return NextResponse.json({ ok: true, ...result });
}
