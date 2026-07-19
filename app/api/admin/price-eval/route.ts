import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { runPriceEval, getPriceAccuracy, getPriceMisses } from "@/app/lib/eval-price";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // prices a sample of real sales (reverse-image + comps per item)

// Price accuracy against REAL sold prices.
// GET  ?mode=title|photo (&misses=N) → the accumulated accuracy picture for that mode.
//   title = pricer fed the real title (easy). photo = query derived from the photo via the reference
//   index, no title (the honest "can we price from a photo?" test).
// POST { sample?, photoOnly? } → grade a fresh batch in that mode; results accumulate per (sale, mode).
export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const q = new URL(request.url).searchParams;
 const misses = Number(q.get("misses")) || 0;
 const mode = q.get("mode") === "photo" ? "photo" : "title";
 try {
 const acc = await getPriceAccuracy(120, mode);
 return NextResponse.json({ ok: true, mode, ...acc, ...(misses ? { misses: await getPriceMisses(misses, 120, mode) } : {}) });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}

export async function POST(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => ({}));
 const sample = Math.max(1, Math.min(40, Number(body?.sample) || 12));
 const photoOnly = body?.photoOnly === true;
 try {
 const run = await runPriceEval({ sample, photoOnly });
 return NextResponse.json({ ok: true, run, accuracy: await getPriceAccuracy(120, photoOnly ? "photo" : "title") });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}
