import { NextResponse } from "next/server";
import { isIntakeConfigured } from "@/app/lib/ai-intake";
import { runEval, saveEvalRun } from "@/app/lib/eval-intake";

export const maxDuration = 300;

// Weekly (Monday 6 AM UTC): grade the current intake AI against a sample of the labeled
// dataset and store the scorecard, so the trend has a fresh weekly point. Dropped from
// nightly — a frozen base model's score barely moves day to day, so nightly just burned
// SerpApi quota. Run the exam ON-DEMAND (POST /api/admin/eval) after a change; this weekly
// tick is just the background trend. Reverse-image on (matches production); price off by
// default to protect quota — flip EVAL_NIGHTLY_PRICE=true to include it.
export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 if (!isIntakeConfigured()) {
 return NextResponse.json({ skipped: true, reason: "ANTHROPIC_API_KEY not set" });
 }
 const sample = Math.max(1, Math.min(50, Number(process.env.EVAL_NIGHTLY_SAMPLE) || 20));
 const withPrice = process.env.EVAL_NIGHTLY_PRICE === "true";
 try {
 // Grade against the hand-verified golden key when it exists (runEval falls back to the full
 // set automatically if none has been seeded yet), so the weekly number is the trustworthy one.
 const result = await runEval({ sample, withReverseImage: true, withPrice, goldenOnly: true });
 await saveEvalRun(result);
 return NextResponse.json({ ok: true, ...result });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Eval failed" }, { status: 500 });
 }
}
