import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { reseedBrandAliases } from "@/app/lib/data-layer/brands-db";

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

// POST /api/admin/reseed-brands. Idempotently upsert every alias from BRAND_SEED
// into brand_aliases (adds new brands/aliases, refreshes existing rows, wipes
// nothing). Run after brandData gains brands; then re-run build-events so events
// re-resolve, then check /api/admin/brand-coverage.
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 try {
 const result = await reseedBrandAliases();
 return NextResponse.json({ ok: true, ...result });
 } catch (err) {
 console.error("[admin/reseed-brands] failed:", err);
 return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
 }
}
