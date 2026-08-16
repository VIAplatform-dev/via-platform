import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { getIntakeAccuracy, getSegmentCalibration, getRecentCorrections, getBrandAccuracyBySegment } from "@/app/lib/intake-accuracy-db";
import { getPriceConfidenceCalibration } from "@/app/lib/intake-memory-db";
import { getBetaReadiness } from "@/app/lib/beta-readiness";

export const dynamic = "force-dynamic";

// GET ?days=30 — cross-store AI-intake accuracy (admin only). Where the model is
// weak (which fields get corrected, top brand confusions, price calibration).
export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const raw = new URL(request.url).searchParams.get("days");
 const days = Math.max(1, Math.min(3650, Number(raw) || 30));
 try {
 const [data, segments, brandSegments, corrections, priceConfidence, betaReadiness] = await Promise.all([
 getIntakeAccuracy(days),
 getSegmentCalibration(days),
 getBrandAccuracyBySegment(days),
 getRecentCorrections(60),
 getPriceConfidenceCalibration(Math.max(days, 120)).catch(() => []),
 getBetaReadiness().catch(() => null),
 ]);
 return NextResponse.json({ ok: true, ...data, segments, brandSegments, corrections, priceConfidence, betaReadiness });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}
