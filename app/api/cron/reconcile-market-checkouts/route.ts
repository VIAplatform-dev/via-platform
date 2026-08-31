import { NextRequest, NextResponse } from "next/server";
import { reconcileAll } from "@/app/lib/market/reconcile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Every minute: for every open in-person checkout, ask Stripe whether it was paid (finalize) or the
// hold ran out (expire + release the item), and finish any paid checkout that never got its order.
// This is what makes a dead phone, a lost webhook, or a crash mid-finalize converge on the truth.
export async function GET(request: NextRequest) {
 if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 try {
 const r = await reconcileAll();
 if (r.expired || r.finalized || r.repaired) console.log(`[reconcile-market-checkouts] ${JSON.stringify(r)}`);
 return NextResponse.json({ ok: true, ...r });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "reconcile failed" }, { status: 500 });
 }
}
