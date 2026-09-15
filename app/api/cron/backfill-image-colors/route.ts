import { NextResponse } from "next/server";
import { isVisionConfigured } from "@/app/lib/data-layer/vision";
import { backfillImageColors } from "@/app/lib/data-layer/image-color-backfill";

export const maxDuration = 300;

// Daily: colour any NEW products (newly synced) off their image, so the colour
// filter stays complete without a manual backfill. Incremental + cheap, only
// processes products that don't have a colour yet. No-op when vision is off.
export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 if (!isVisionConfigured()) {
 return NextResponse.json({ skipped: true, reason: "ANTHROPIC_API_KEY not set" });
 }
 // A batch per run is plenty for daily new arrivals (and chips away at any backlog).
 const result = await backfillImageColors(200);
 return NextResponse.json({ ok: true, ...result });
}
