import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getUnbrandedPricingReport } from "@/app/lib/data-layer/unbranded-benchmark-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const adminToken = request.cookies.get("via_admin_token")?.value;
 if (adminToken && adminToken === crypto.createHash("sha256").update(adminPassword).digest("hex")) return true;
 return false;
}

// GET — THE GOLDEN SET: how VYA's own unbranded + lesser-known pieces are actually priced, by
// category × material tier. Review this to sanity-check (and calibrate) unbranded pricing — it's the
// same data the pricing engine now anchors an unbranded piece to. Dollars for readability.
export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 try {
 const r = await getUnbrandedPricingReport();
 const usd = (c: number) => Math.round(c / 100);
 return NextResponse.json({
 note: r.note,
 totals: { pieces: r.totalPieces, unbranded: r.unbranded, lesserKnown: r.lesserKnown, thinSegmentsHidden: r.thinSegments },
 segments: r.segments.map((s) => ({
  category: s.category,
  material: s.materialTier,
  pieces: s.count,
  stores: s.storeCount,
  p25: usd(s.p25Cents),
  median: usd(s.medianCents),
  p75: usd(s.p75Cents),
 })),
 });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Report failed" }, { status: 500 });
 }
}
