import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { getRecentErrors, getErrorSummary } from "@/app/lib/error-log";

export const dynamic = "force-dynamic";

// The error dashboard: what's failing on the important paths, so silent failures stop hiding.
// GET ?source=<tag>&severity=<warn|error|critical>&hours=<n>&limit=<n>
// Returns a roll-up (counts by source/severity) + the recent individual failures.
export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const p = new URL(request.url).searchParams;
 const sinceHours = Number(p.get("hours")) || 168;
 try {
 const [summary, recent] = await Promise.all([
 getErrorSummary(sinceHours),
 getRecentErrors({
 source: p.get("source") || undefined,
 severity: p.get("severity") || undefined,
 sinceHours,
 limit: Number(p.get("limit")) || 100,
 }),
 ]);
 return NextResponse.json({ ok: true, windowHours: sinceHours, summary, recent });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}
