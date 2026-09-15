import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getBrandHeatIndex, getCategoryHeat, getStoreHeat } from "@/app/lib/brand-heat-db";

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

// GET /api/admin/brand-heat?days=30: cross-store Brand Heat Index (internal/beta).
export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 const { searchParams } = new URL(request.url);
 const days = Math.min(Math.max(parseInt(searchParams.get("days") ?? "30", 10) || 30, 7), 90);
 const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 100);
 try {
 const [index, categories, stores] = await Promise.all([
 getBrandHeatIndex(days, limit),
 getCategoryHeat(days, 20),
 getStoreHeat(days, 25),
 ]);
 return NextResponse.json({ ...index, categories, stores });
 } catch (err) {
 console.error("[admin/brand-heat] error:", err);
 return NextResponse.json({ error: "Failed to compute brand heat" }, { status: 500 });
 }
}
