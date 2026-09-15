import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { backfillSizeKeys } from "@/app/lib/size-keys-db";

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

// POST /api/admin/backfill-size-keys?onlyMissing=1: recompute products.size_keys
// from the derived display size. Run once after deploying the migration; the
// daily cron keeps it fresh thereafter.
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const onlyMissing = new URL(request.url).searchParams.get("onlyMissing") === "1";
 try {
 const result = await backfillSizeKeys({ onlyMissing });
 return NextResponse.json({ ok: true, ...result });
 } catch (err) {
 console.error("[backfill-size-keys] error:", err);
 return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
 }
}
