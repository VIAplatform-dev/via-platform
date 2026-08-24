import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { runPriceEval, getPriceAccuracy, getPriceMisses, getNoiseFloor, comparePriceAccuracy } from "@/app/lib/eval-price";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // prices a sample of real sales (reverse-image + comps per item)

const MODES = ["title", "title-ctx", "photo"] as const;

// Price accuracy against REAL sold prices.
// GET  ?mode=title|title-ctx|photo (&misses=N) → the accumulated accuracy picture for that mode.
//   title = pricer fed the real title but brand-only context (the historical baseline).
//   title-ctx = same title, plus era/material/condition inferred from it — production-shaped context.
//   photo = query derived from the photo via the reference index, no title (the honest
//   "can we price from a photo?" test).
// GET  ?compare=1 → side-by-side title vs title-ctx (overall, paired subset, per-category deltas).
// POST { sample?, mode? } (or legacy photoOnly) → grade a fresh batch; results accumulate per (sale, mode).
export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const q = new URL(request.url).searchParams;
 const misses = Number(q.get("misses")) || 0;
 // ?noise=1 — the ceiling on any pricer's accuracy for this catalogue, to judge the score against.
 const wantNoise = q.get("noise") === "1";
 const mode = MODES.includes(q.get("mode") as (typeof MODES)[number]) ? (q.get("mode") as string) : "title";
 if (q.get("compare")) {
 try {
  return NextResponse.json({ ok: true, ...(await comparePriceAccuracy(120)) });
 } catch (e) {
  return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
 }
 try {
 const acc = await getPriceAccuracy(120, mode);
 const noise = wantNoise ? await getNoiseFloor().catch(() => null) : null;
 return NextResponse.json({ ok: true, mode, ...acc, ...(noise ? { noiseFloor: noise } : {}), ...(misses ? { misses: await getPriceMisses(misses, 120, mode) } : {}) });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}

export async function POST(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => ({}));
 const sample = Math.max(1, Math.min(40, Number(body?.sample) || 12));
 const mode = body?.photoOnly === true ? "photo" : MODES.includes(body?.mode) ? (body.mode as string) : "title";
 try {
 const run = await runPriceEval({ sample, photoOnly: mode === "photo", withContext: mode === "title-ctx" });
 return NextResponse.json({ ok: true, run, accuracy: await getPriceAccuracy(120, mode) });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}
