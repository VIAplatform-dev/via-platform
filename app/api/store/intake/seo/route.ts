import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { polishDescriptionForSeo } from "@/app/lib/ai-intake";
import { getVoice } from "@/app/lib/store-voice";

export const dynamic = "force-dynamic";

// POST { description, title?, brand?, era?, material?, condition?, size?, category? }
// → an SEO-polished rewrite of a SELLER-TYPED description, in their voice, no invented facts.
// Powers the "Improve for search" button in the listing editor. (Under /api/store/intake → public
// prefix; does its own auth.)
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => null);
 const description = String(body?.description || "").trim();
 if (description.length < 10) {
  return NextResponse.json({ error: "Write a description first, then I'll polish it for search." }, { status: 400 });
 }

 try {
  const voice = await getVoice(slug).catch(() => null);
  const polished = await polishDescriptionForSeo(
   {
    description,
    title: body?.title, brand: body?.brand, era: body?.era, material: body?.material,
    condition: body?.condition, size: body?.size, category: body?.category,
   },
   voice,
  );
  if (!polished) return NextResponse.json({ error: "Couldn't polish that — try again." }, { status: 502 });
  return NextResponse.json({ ok: true, description: polished });
 } catch {
  return NextResponse.json({ error: "Couldn't polish right now — try again in a moment." }, { status: 502 });
 }
}
