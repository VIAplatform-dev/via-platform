import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { computeListingPricing } from "@/app/lib/intake-pricing";
import type { Comp } from "@/app/lib/comps";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Phase 2 of listing intake. Given the drafted/typed fields from phase 1 (/api/store/intake with
// draftOnly), compute the price estimate + over/under-market flag + runway. Split out so the form
// can render the fields immediately and slot pricing in a moment later.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => null);
 const f = (body?.fields && typeof body.fields === "object" ? body.fields : {}) as Record<string, unknown>;
 const str = (k: string) => (typeof f[k] === "string" ? (f[k] as string) : "");
 const imageUrls: string[] = Array.isArray(body?.imageUrls) ? body.imageUrls.filter((u: unknown) => typeof u === "string" && u).slice(0, 6) : [];
 if (!imageUrls.length) return NextResponse.json({ error: "imageUrls required" }, { status: 400 });
 const reverseComps: Comp[] = Array.isArray(body?.reverseComps) ? body.reverseComps : [];
 const reverseTitles: string[] = Array.isArray(body?.reverseTitles) ? body.reverseTitles.filter((t: unknown): t is string => typeof t === "string") : [];

 const pr = await computeListingPricing({
 slug,
 brand: str("brand"),
 title: str("title"),
 era: str("era"),
 material: str("material"),
 category: str("category"),
 condition: str("condition"),
 searchQuery: typeof body?.searchQuery === "string" ? body.searchQuery : null,
 price: str("price") || null,
 imageUrls,
 mainUrl: imageUrls[0],
 extraComps: reverseComps,
 reverseTitles,
 knowledgeHintCents: typeof body?.knowledgeHintCents === "number" ? body.knowledgeHintCents : null,
 runwaySoFar: str("runway") || null,
 draftRanFull: body?.draftRanFull === true,
 });

 return NextResponse.json({ ok: true, estimate: pr.estimate, priceFlag: pr.priceFlag, runway: pr.runway });
}
