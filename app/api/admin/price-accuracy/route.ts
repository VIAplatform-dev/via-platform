import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAccuracyReport } from "@/app/lib/price-suggestions-db";

export const dynamic = "force-dynamic";

// Phase 3 report — how far sellers move our suggested price, sliced by category, prompt version,
// and how much same-piece evidence backed the number. Positive median = we're pricing that slice
// low. Internal only: this is per-store data and never goes near a seller-facing surface.
//   /api/admin/price-accuracy?days=90
function isAuthorized(request: NextRequest): boolean {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) return false;
 if (request.headers.get("authorization") === `Bearer ${pw}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === crypto.createHash("sha256").update(pw).digest("hex");
}

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const days = Math.max(1, Math.min(365, Number(new URL(request.url).searchParams.get("days")) || 90));
 try {
  return NextResponse.json(await getAccuracyReport(days));
 } catch (e) {
  return NextResponse.json({ error: String(e) }, { status: 500 });
 }
}
