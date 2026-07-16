import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { getIntakeAccuracy, getSegmentCalibration, getRecentCorrections } from "@/app/lib/intake-accuracy-db";

export const dynamic = "force-dynamic";

// GET ?days=30 — cross-store AI-intake accuracy (admin only). Where the model is
// weak (which fields get corrected, top brand confusions, price calibration).
export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const raw = new URL(request.url).searchParams.get("days");
 const days = Math.max(1, Math.min(3650, Number(raw) || 30));
 try {
 const [data, segments, corrections] = await Promise.all([
 getIntakeAccuracy(days),
 getSegmentCalibration(days),
 getRecentCorrections(60),
 ]);
 return NextResponse.json({ ok: true, ...data, segments, corrections });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}
