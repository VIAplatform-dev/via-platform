import { NextRequest, NextResponse } from "next/server";
import { snapshotAccuracy } from "@/app/lib/accuracy-snapshot-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily listing-accuracy snapshot — stores a rolling-30d + all-time reading so the accuracy trend
// (progress toward the 95% onboarding bar) is charted over time. Cheap (pure SQL, no API cost).
//   Scheduled in vercel.json; also runnable manually via /api/admin/accuracy-trend?snapshot=1.
export async function GET(request: NextRequest) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 try {
  const snap = await snapshotAccuracy();
  return NextResponse.json({ ok: true, date: snap.date, factualKeptPct30d: snap.rolling30d.accuracy.headlineKeptPct, listings30d: snap.rolling30d.totalAiListings });
 } catch (e) {
  return NextResponse.json({ error: String(e) }, { status: 500 });
 }
}
