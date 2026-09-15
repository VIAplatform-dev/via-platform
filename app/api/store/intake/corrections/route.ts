import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { logCorrections, logPredictions } from "@/app/lib/intake-memory-db";

export const dynamic = "force-dynamic";

/**
 * POST { aiDraft, final, photo?, category? }: what the AI proposed against what she actually listed.
 *
 * WHY THIS EXISTS SEPARATELY FROM PUBLISH. The correction memory is the loop that makes intake
 * better: every field a seller overrides is logged against the photograph and fed back as a hint on
 * the next one. /api/store/intake/publish has done this since it was built, and it only ever fires
 * on the path that CREATES a piece.
 *
 * The phone's AI path does not take that path. It saves a draft the moment pricing returns (so that
 * walking away keeps the piece), which means publishing is a PATCH of that row and publish's
 * comparison never runs. So every correction a seller made on her phone, the richest signal there
 * is because it is a human holding the garment, went in the bin.
 *
 * Separate rather than folded into the items PATCH because a correction is not an edit: renaming a
 * piece six weeks later is not the seller disagreeing with a draft, and logging it as one would
 * teach the model from a decision it was never part of.
 */
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => null);
 const ai = (body?.aiDraft && typeof body.aiDraft === "object" ? body.aiDraft : null) as Record<string, unknown> | null;
 const final = (body?.final && typeof body.final === "object" ? body.final : null) as Record<string, unknown> | null;
 if (!ai || !final) return NextResponse.json({ error: "aiDraft and final required" }, { status: 400 });

 const photoUrl = typeof body.photo === "string" && body.photo ? body.photo : null;
 const category = typeof body.category === "string" ? body.category.slice(0, 60) : null;

 // The same five fields publish compares, for the same reason: they are the ones the drafter
 // guesses at, and the ones a wrong answer is expensive in.
 const rows = (["brand", "era", "material", "condition", "category"] as const)
  // Only fields the AI actually proposed. A blank prediction is not a prediction, and counting it
  // would flatter the accuracy numbers with answers it never gave.
  .filter((f) => typeof ai[f] === "string" && String(ai[f]).trim())
  .map((f) => ({
   field: f,
   aiValue: String(ai[f]),
   finalValue: String(final[f] ?? "").trim(),
   imageUrl: photoUrl,
   category,
  }));
 if (!rows.length) return NextResponse.json({ ok: true, logged: 0 });

 // logCorrections → the hint loop (brand fixes). logPredictions → the acceptance flow: every
 // predicted field and whether she kept it, which is what the accuracy numbers are built from.
 await logCorrections(slug, rows).catch(() => {});
 await logPredictions(slug, rows).catch(() => {});
 return NextResponse.json({ ok: true, logged: rows.length });
}
