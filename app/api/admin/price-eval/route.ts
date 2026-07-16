import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { runPriceEval, getPriceAccuracy } from "@/app/lib/eval-price";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // prices a sample of real sales (reverse-image + comps per item)

// Price accuracy against REAL sold prices.
// GET  → the accumulated accuracy picture (overall + by category + by tier, with CIs + verdicts).
// POST { sample? } → grade a fresh batch of sales; results accumulate. Costs SerpApi per item, so
//                    keep the sample small and run periodically until the graded count is large.
export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 try {
 return NextResponse.json({ ok: true, ...(await getPriceAccuracy(120)) });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}

export async function POST(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => ({}));
 const sample = Math.max(1, Math.min(40, Number(body?.sample) || 12));
 try {
 const run = await runPriceEval({ sample });
 return NextResponse.json({ ok: true, run, accuracy: await getPriceAccuracy(120) });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}
