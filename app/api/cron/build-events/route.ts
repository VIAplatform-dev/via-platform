import { NextResponse } from "next/server";
import { buildEvents, backfillEventColors, backfillEventModels } from "@/app/lib/data-layer/events-db";
import { sendOpsAlert } from "@/app/lib/email";

// Daily incremental ETL of the capture tables into the unified `events` log.
// Idempotent (ON CONFLICT(source) DO NOTHING), so a few days of overlap is safe.
export const maxDuration = 300;

export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 try {
 const result = await buildEvents({ sinceDays: 3 });
 // Backfill the colour dimension on older rows (chips away at the backlog each run).
 const colors = await backfillEventColors().catch(() => ({ scanned: 0, colored: 0, remaining: -1 }));
 const models = await backfillEventModels().catch(() => ({ scanned: 0, filled: 0, remaining: -1 }));
 return NextResponse.json({ ok: true, ...result, colorBackfill: colors, modelBackfill: models });
 } catch (err) {
 console.error("[cron/build-events] failed:", err);
 await sendOpsAlert("build-events FAILED", String(err));
 return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
 }
}
