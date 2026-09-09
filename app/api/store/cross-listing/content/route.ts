import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getItem } from "@/app/lib/db/inventory";
import { crossPostContent, PLATFORMS } from "@/app/lib/cross-listing-db";

export const dynamic = "force-dynamic";

// GET ?itemId= — paste-ready listing content for every platform, for one item.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const itemId = new URL(request.url).searchParams.get("itemId") || "";
 if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });
 const item = await getItem(itemId).catch(() => null);
 if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });

 const forPost = {
 title: item.title,
 brand: item.brand,
 condition: item.condition,
 size: item.size,
 category: item.category,
 priceCents: item.priceCents,
 description: (item as { description?: string | null }).description ?? null,
 flaws: item.flaws, measurementsJson: item.measurementsJson, measurements: item.measurements,
 };
 const content = Object.fromEntries(PLATFORMS.map((p) => [p.key, crossPostContent(forPost, p.key)]));
 return NextResponse.json({ ok: true, images: item.images || [], content });
}
