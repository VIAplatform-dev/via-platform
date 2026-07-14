import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getStoreBrief, saveStoreBrief, EMPTY_BRIEF, type StoreBrief } from "@/app/lib/store-brief-db";

export const dynamic = "force-dynamic";

// GET — this store's brief (what the owner told VYA about voice + pricing).
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const brief = (await getStoreBrief(slug).catch(() => null)) ?? EMPTY_BRIEF;
 return NextResponse.json({ brief });
}

// POST { brief } — save this store's brief. Sanitized server-side in saveStoreBrief.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 const brief = (body?.brief ?? body) as StoreBrief;
 if (!brief || typeof brief !== "object") return NextResponse.json({ error: "Bad brief" }, { status: 400 });
 await saveStoreBrief(slug, brief);
 return NextResponse.json({ ok: true });
}
