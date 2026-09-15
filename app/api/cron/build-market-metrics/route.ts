import { NextResponse } from "next/server";
import { computeMarketMetrics } from "@/app/lib/data-layer/market-metrics-db";
import { pruneCompCache } from "@/app/lib/comp-cache-db";
import { sendOpsAlert } from "@/app/lib/email";

// Daily metric job: events → market_metrics (brand/category/era × 7d/30d).
// Runs after the events ETL so it reads a fresh log.
export const maxDuration = 300;

export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 try {
 const result = await computeMarketMetrics();
 const prunedCompCache = await pruneCompCache(90).catch(() => 0);
 const rows = Object.values(result.windows ?? {}).reduce((a, b) => a + b, 0);
 if (rows === 0) {
 await sendOpsAlert("build-market-metrics wrote 0 rows", `as-of ${result.asOfDate}: no market_metrics rows produced. The events log may be empty or the upstream build-events run failed.`);
 }
 return NextResponse.json({ ok: true, rows, prunedCompCache, ...result });
 } catch (err) {
 console.error("[cron/build-market-metrics] failed:", err);
 await sendOpsAlert("build-market-metrics FAILED", String(err));
 return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
 }
}
