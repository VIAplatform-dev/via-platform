import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { convertCatalogToItems } from "@/app/lib/capture-commerce";

// POST — turn the store's synced marketplace catalog (read-only `products`) into managed,
// sellable OS items the seller can edit/reprice/relist. Images are re-hosted to our storage.
// Idempotent by title, so it's safe to run more than once (only adds what's new).
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 try {
 const { added, total } = await convertCatalogToItems(slug);
 return NextResponse.json({ ok: true, added, total });
 } catch (err) {
 return NextResponse.json({ error: err instanceof Error ? err.message : "Convert failed" }, { status: 500 });
 }
}
