import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { runAblation } from "@/app/lib/eval-ablation";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // two model drafts per item — keep the sample modest

// Does the learning loop actually work? Runs the same items with memory OFF vs ON and
// returns the accuracy lift. POST { sample?, goldenOnly? }. Costs ~2 drafts + 1 embedding
// per item, so keep the sample small.
export async function POST(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => ({}));
 const sample = Math.max(1, Math.min(40, Number(body?.sample) || 12));
 const goldenOnly = body?.goldenOnly === true;
 try {
 return NextResponse.json({ ok: true, ...(await runAblation({ sample, goldenOnly })) });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}
