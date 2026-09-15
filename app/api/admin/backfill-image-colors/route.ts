import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { isVisionConfigured } from "@/app/lib/data-layer/vision";
import { backfillImageColors, resetTitlelessImageColors } from "@/app/lib/data-layer/image-color-backfill";

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

// POST /api/admin/backfill-image-colors?limit=100: read the dominant colour off
// each product's IMAGE via vision and store it (normalized to the filter palette).
// Incremental: only unprocessed products; failures retried next run. Costs ~1
// cheap vision call per product. YOU trigger it, in batches. Re-run until
// "remaining" hits 0. (The daily cron keeps new products colored automatically.)
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!isVisionConfigured()) {
 return NextResponse.json(
 { ok: false, notConfigured: true, error: "ANTHROPIC_API_KEY not set: vision colour reading is off." },
 { status: 503 },
 );
 }
 // One-time: ?reset=titleless clears stored colours for title-less products so they
 // get re-read with the hint-aware prompt. Run this ONCE, then run the batches below.
 if (request.nextUrl.searchParams.get("reset") === "titleless") {
 const { reset } = await resetTitlelessImageColors();
 return NextResponse.json({ ok: true, reset, note: "Now run the backfill (no reset param) in batches until remaining=0." });
 }
 const limit = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10), 1), 500);
 const result = await backfillImageColors(limit);
 return NextResponse.json({ ok: true, ...result });
}
