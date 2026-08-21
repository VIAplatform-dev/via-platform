import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { getGoldenStats, getGoldenCandidates, markGolden, seedGolden, getGoldenForReview, getLabelingCandidates, saveGoldenLabel, clearSeededGolden } from "@/app/lib/training-data-db";
import { draftListing } from "@/app/lib/ai-intake";
import { reverseImageBestOf, matchesToComps, isCompsConfigured, type VisualMatch } from "@/app/lib/comps";
import { estimatePrice } from "@/app/lib/price-engine";
import { inferBrandFromTitle } from "@/app/lib/market-data-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The golden set = the hand-verified benchmark the intake exam grades against.
// GET  ?candidates=1&category=bags&limit=60 → rows to REVIEW for promotion; else current stats.
// POST { ids:[...], on?:true }               → promote/demote those examples to golden.
export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const q = new URL(request.url).searchParams;
 try {
 if (q.get("label")) {
 const limit = Number(q.get("limit")) || 20;
 return NextResponse.json({ ok: true, candidates: await getLabelingCandidates(limit), stats: await getGoldenStats() });
 }
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
 // AI proposes labels for a photo — POST { draft: "<imageUrl>" }.
 if (typeof body?.draft === "string" && body.draft) {
 try {
 // Phase 1 — labels only, so they render instantly. The price (reverse-image + full pricer) is a
 // separate, slower call (priceFor) that fills in after — the way the inventory upload does it.
 const d = await draftListing([body.draft]);
 return NextResponse.json({ ok: true, proposed: {
  brand: d?.brand?.value ?? null, era: d?.era?.value ?? null, material: d?.material?.value ?? null,
  condition: d?.condition?.value ?? null, category: d?.category ?? null,
  searchQuery: d?.searchQuery ?? null, title: d?.title ?? null,
 } });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "AI draft failed" }, { status: 502 });
 }
 }
 // Phase 2 — the REAL blind price for a photo: reverse-image + the full comp-based pricer, same as a
 // live listing. Split from the draft so labels show instantly and the price fills in after.
 if (body?.priceFor && typeof body.priceFor === "object" && typeof body.priceFor.image === "string") {
 try {
 const pf = body.priceFor as { image: string; brand?: string; category?: string; era?: string; material?: string; condition?: string; searchQuery?: string; title?: string };
 let priceUsd: number | null = null;
 if (isCompsConfigured()) {
  const rev = await reverseImageBestOf([pf.image], { maxFrames: 1 }).catch(() => ({ matches: [] as VisualMatch[], framesUsed: 0 }));
  const revBrand = rev.matches.map((m) => inferBrandFromTitle(m.title || "")).find(Boolean) || null;
  const brand = (pf.brand && pf.brand.trim()) || revBrand || null;
  const query = ((pf.searchQuery && pf.searchQuery.trim()) || [brand, pf.category].filter(Boolean).join(" ") || pf.title || "").trim();
  if (query) {
   const est = await estimatePrice({ query, photoUrl: pf.image, minMarkupBps: 3000, extraComps: matchesToComps(rev.matches), context: { brand, era: pf.era || null, material: pf.material || null, condition: pf.condition || null } }).catch(() => null);
   if (est?.marketCents && est.marketCents > 0) priceUsd = Math.round(est.marketCents / 100);
  }
 }
 return NextResponse.json({ ok: true, price: priceUsd });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Pricing failed" }, { status: 502 });
 }
 }
 // Save a human-verified label as golden — POST { saveGolden: {...} }.
 if (body?.saveGolden && typeof body.saveGolden === "object") {
 try {
 await saveGoldenLabel(body.saveGolden);
 return NextResponse.json({ ok: true, stats: await getGoldenStats() });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 500 });
 }
 }
 // Demote the bad auto-seeded rows — POST { clearSeeded: true }.
 if (body?.clearSeeded === true) {
 const cleared = await clearSeededGolden().catch(() => 0);
 return NextResponse.json({ ok: true, cleared, stats: await getGoldenStats() });
 }
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
