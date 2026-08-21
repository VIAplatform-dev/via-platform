import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAccuracyTrend, snapshotAccuracy, backfillAccuracyTrend } from "@/app/lib/accuracy-snapshot-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Listing-accuracy TREND over time — the "are we getting better?" view. Reads the daily snapshots and
// surfaces the headline numbers per day so you can watch recent-listing quality climb toward the 95%
// onboarding gate. rolling-30d is the line to watch (recent quality); *All is all-time (drags on old
// pre-fix listings). Pass ?snapshot=1 to take today's reading now (seed the baseline before the cron).
//   /api/admin/accuracy-trend?days=90   (&snapshot=1 to snapshot now)
function isAuthorized(request: NextRequest): boolean {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) return false;
 if (request.headers.get("authorization") === `Bearer ${pw}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === crypto.createHash("sha256").update(pw).digest("hex");
}

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const q = new URL(request.url).searchParams;
 const days = Math.max(1, Math.min(365, Number(q.get("days")) || 90));
 try {
  // ?backfill=N — reconstruct N weeks of history from the timestamped training data (one-time seed so
  // the chart shows where accuracy has already been). ?snapshot=1 — just take today's point.
  const backfillWeeks = Number(q.get("backfill"));
  if (backfillWeeks > 0) await backfillAccuracyTrend(backfillWeeks);
  else if (q.get("snapshot") === "1") await snapshotAccuracy();
  const trend = await getAccuracyTrend(days);
  const latest = trend.latest;
  const gap = latest?.factualKeptPct != null ? Math.round((trend.gate - latest.factualKeptPct) * 10) / 10 : null;
  return NextResponse.json({
   gate: trend.gate,
   readyToOnboard: latest?.factualKeptPct != null && latest.factualKeptPct >= trend.gate,
   gapToGatePct: gap,                       // how far the recent (30d) factual accuracy is below 95
   deltaSinceFirstSnapshotPct: trend.deltaVsFirstPct, // + means improving
   latest,
   points: trend.points,                    // one per day — chart the factualKeptPct line
  });
 } catch (e) {
  return NextResponse.json({ error: String(e) }, { status: 500 });
 }
}
