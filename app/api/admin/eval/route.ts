import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { runEval, saveEvalRun, getRecentEvalRuns } from "@/app/lib/eval-intake";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // the exam runs the AI on each sampled photo

// GET — recent exam runs (nightly history + any manual runs).
export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 try {
 return NextResponse.json({ ok: true, runs: await getRecentEvalRuns(14) });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}

// POST { sample?, withReverseImage?, withPrice?, goldenOnly? } — grade the current intake
// AI against the labeled dataset (admin only). Costs tokens/searches per sampled photo,
// so keep the sample small. goldenOnly → run against the hand-verified benchmark.
export async function POST(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => ({}));
 const sample = Math.max(1, Math.min(50, Number(body?.sample) || 15));
 const withReverseImage = body?.withReverseImage !== false; // default on (matches production)
 const withPrice = body?.withPrice === true; // default off (extra cost)
 const goldenOnly = body?.goldenOnly === true; // grade against the hand-verified benchmark
 try {
 const result = await runEval({ sample, withReverseImage, withPrice, goldenOnly });
 await saveEvalRun(result).catch(() => {});
 return NextResponse.json({ ok: true, ...result });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Eval failed" }, { status: 500 });
 }
}
