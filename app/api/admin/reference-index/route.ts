import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { embedPendingTrainingExamples, getReferenceIndexStats, resetFailedEmbeddings } from "@/app/lib/training-data-db";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // embedding a batch of catalog photos (one Voyage call each)

// The reference index = a photo embedding on every labeled catalog example, so a new upload
// can be matched to the SPECIFIC known piece (see resolveSpecificPiece) and priced off it.
// GET  → coverage stats.
// POST { limit? } → embed the next batch of un-embedded examples (idempotent; run repeatedly
//                   until remaining hits 0). Voyage cost, so it's a run-when-ready job.
export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 try {
 return NextResponse.json({ ok: true, stats: await getReferenceIndexStats() });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}

export async function POST(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => ({}));
 try {
 // { reset: true } → un-poison rows a prior throttled run wrongly marked as failed, then re-stat.
 if (body?.reset === true) {
 const reset = await resetFailedEmbeddings();
 return NextResponse.json({ ok: true, reset, stats: await getReferenceIndexStats() });
 }
 const limit = Math.max(1, Math.min(300, Number(body?.limit) || 60));
 const stats = await embedPendingTrainingExamples(limit);
 return NextResponse.json({ ok: true, ...stats });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}
