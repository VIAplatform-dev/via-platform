import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { computeMarketMetrics } from "@/app/lib/data-layer/market-metrics-db";

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

// POST /api/admin/build-market-metrics. Run the metric job on demand.
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 try {
 const result = await computeMarketMetrics();
 return NextResponse.json({ ok: true, ...result });
 } catch (err) {
 console.error("[admin/build-market-metrics] failed:", err);
 return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
 }
}
