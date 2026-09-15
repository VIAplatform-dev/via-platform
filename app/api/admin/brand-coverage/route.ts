import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getBrandCoverage } from "@/app/lib/data-layer/brands-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

// GET /api/admin/brand-coverage?limit=50: across all events, what % resolve to a
// known canonical brand, plus the highest-volume UNRESOLVED titles to expand the
// alias map. Read-only. (Run build-events first so events.title + canonical brand
// are populated.)
export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const limit = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10), 1), 500);
 try {
 const coverage = await getBrandCoverage(limit);
 return NextResponse.json({ ok: true, ...coverage });
 } catch (err) {
 console.error("[admin/brand-coverage] failed:", err);
 return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
 }
}
