import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSubstackConsensus, getConsensusScorecard } from "@/app/lib/data-layer/substack-signal";

export const dynamic = "force-dynamic";

// The weekly Substack consensus — what fashion writers are collectively calling. Aggregate/editorial
// (public writing), so no per-store privacy concern; surfaced as a leading "watch" signal. The
// scorecard reports how well past consensus LED real VYA demand (null until history accrues).
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const [picks, scorecard] = await Promise.all([
 getSubstackConsensus(7, 20).catch(() => []),
 getConsensusScorecard(21).catch(() => null),
 ]);
 return NextResponse.json({ ok: true, picks, scorecard });
}
