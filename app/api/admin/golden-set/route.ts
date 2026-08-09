import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { getGoldenStats, getGoldenCandidates, markGolden, seedGolden, getGoldenForReview } from "@/app/lib/training-data-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The golden set = the hand-verified benchmark the intake exam grades against.
// GET  ?candidates=1&category=bags&limit=60 → rows to REVIEW for promotion; else current stats.
// POST { ids:[...], on?:true }               → promote/demote those examples to golden.
export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const q = new URL(request.url).searchParams;
 try {
 if (q.get("review")) {
 const limit = Number(q.get("limit")) || 40;
 return NextResponse.json({ ok: true, rows: await getGoldenForReview(limit), stats: await getGoldenStats() });
 }
 if (q.get("candidates")) {
 const limit = Number(q.get("limit")) || 60;
 const category = q.get("category") || undefined;
 return NextResponse.json({ ok: true, candidates: await getGoldenCandidates(limit, category), stats: await getGoldenStats() });
 }
 return NextResponse.json({ ok: true, stats: await getGoldenStats() });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}

export async function POST(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => ({}));
 // Seed the golden set from the most-trusted rows (no manual review) — POST { seed: true, limit? }.
 if (body?.seed === true) {
 try {
 const { promoted, goldenCount } = await seedGolden(Number(body?.limit) || 150);
 return NextResponse.json({ ok: true, seeded: promoted, goldenCount, stats: await getGoldenStats() });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
 }
 const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).map(Number).filter((n) => Number.isFinite(n)) : [];
 if (!ids.length) return NextResponse.json({ error: "ids[] required" }, { status: 400 });
 const on = body?.on !== false; // default promote
 try {
 const goldenCount = await markGolden(ids, on);
 return NextResponse.json({ ok: true, updated: ids.length, on, stats: await getGoldenStats(), goldenCount });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}
