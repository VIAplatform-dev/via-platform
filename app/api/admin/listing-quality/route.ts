import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getListingQuality } from "@/app/lib/listing-quality-db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

// GET /api/admin/listing-quality?store=<slug> products missing size /
// measurements / description / image, plus a per-store summary.
export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const store = request.nextUrl.searchParams.get("store") || undefined;
 try {
 return NextResponse.json(await getListingQuality(store));
 } catch (err) {
 console.error("[admin/listing-quality] error:", err);
 return NextResponse.json({ error: "Failed to compute listing quality" }, { status: 500 });
 }
}
