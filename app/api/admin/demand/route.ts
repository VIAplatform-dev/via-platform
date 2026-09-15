import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getMarketplaceDemand } from "@/app/lib/demand-db";

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
 const adminToken = request.cookies.get("via_admin_token")?.value;
 return !!adminToken && adminToken === hashPassword(adminPassword);
}

// GET /api/admin/demand?days=30: marketplace-wide demand intelligence (internal/beta).
export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { searchParams } = new URL(request.url);
 const days = Math.min(Math.max(parseInt(searchParams.get("days") ?? "30", 10) || 30, 7), 90);
 try {
 return NextResponse.json(await getMarketplaceDemand({ windowDays: days }));
 } catch (err) {
 console.error("[admin/demand] error:", err);
 return NextResponse.json({ error: "Failed to compute demand" }, { status: 500 });
 }
}
