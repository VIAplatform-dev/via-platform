import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listCollections, getOrCreateCollection } from "@/app/lib/db/collections";

export const dynamic = "force-dynamic";

// GET [?all=1] — the store's collections with live item counts. Default hides empty ones (for the listing
// picker + storefront nav); ?all=1 includes empties for the Collections manager.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const seller = await getSellerBySlug(slug);
 if (!seller) return NextResponse.json({ collections: [] });
 const includeEmpty = new URL(request.url).searchParams.get("all") === "1";
 const cols = await listCollections(seller.id, includeEmpty);
 return NextResponse.json({ collections: cols.map((c) => ({ id: c.id, title: c.title, slug: c.slug, itemCount: c.itemCount })) });
}

// POST { title } — create a new (empty) collection. Idempotent by slug.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const seller = await getSellerBySlug(slug);
 if (!seller) return NextResponse.json({ error: "Not found" }, { status: 404 });
 const body = await request.json().catch(() => ({}));
 const title = String(body?.title ?? "").trim();
 if (!title) return NextResponse.json({ error: "Name required" }, { status: 400 });
 const col = await getOrCreateCollection(seller.id, title);
 return NextResponse.json({ ok: true, collection: { id: col.id, title: col.title, slug: col.slug, itemCount: 0 } });
}
