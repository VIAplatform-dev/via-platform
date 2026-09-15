import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { buildEvents } from "@/app/lib/data-layer/events-db";

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

// POST /api/admin/build-events?full=1: run the events ETL on demand.
// full=1 rebuilds the whole history (use once to backfill); otherwise incremental.
// dryRun=1 computes the quality-filter breakdown (bots/internal/bursts) WITHOUT
// writing. Pair with full=1 to see what % of ALL current events would be filtered.
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const sp = new URL(request.url).searchParams;
 const full = sp.get("full") === "1";
 const dryRun = sp.get("dryRun") === "1";
 try {
 const result = await buildEvents({ full, dryRun, ...(full ? {} : { sinceDays: 30 }) });
 const f = result.filtered;
 const pct = (n: number) => (f.total > 0 ? Math.round((n / f.total) * 1000) / 10 : 0);
 return NextResponse.json({
  ok: true,
  full,
  dryRun,
  ...result,
  filterSummary: {
  totalCandidates: f.total,
  kept: f.kept,
  filtered: f.total - f.kept,
  filteredPct: pct(f.total - f.kept),
  byReason: {
   bot: { count: f.bot, pct: pct(f.bot) },
   internalOrSeller: { count: f.internal, pct: pct(f.internal) },
   burst: { count: f.burst, pct: pct(f.burst) },
  },
  },
 });
 } catch (err) {
 console.error("[admin/build-events] failed:", err);
 return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
 }
}
