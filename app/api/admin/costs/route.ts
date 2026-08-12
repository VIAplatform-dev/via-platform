import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getCostSummary } from "@/app/lib/cost-tracker";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 if (request.headers.get("authorization") === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return token === crypto.createHash("sha256").update(adminPassword).digest("hex");
}

// Measured API spend from the cost tracker: real $ per provider/operation, cost per listing, and the
// monthly run-rate — computed from each API's own usage numbers. GET ?days=30 (default).
export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const days = Math.max(1, Math.min(365, parseInt(request.nextUrl.searchParams.get("days") ?? "30", 10) || 30));
 try {
  return NextResponse.json(await getCostSummary(days));
 } catch (e) {
  return NextResponse.json({ error: "cost summary failed", detail: String(e) }, { status: 500 });
 }
}
