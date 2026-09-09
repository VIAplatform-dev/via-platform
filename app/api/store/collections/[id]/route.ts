import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { getCollection, renameCollection, deleteCollection, listCollectionItems, setCollectionImage } from "@/app/lib/db/collections";

export const dynamic = "force-dynamic";

async function seller(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return null;
 return getSellerBySlug(slug);
}

// GET — one collection + the items in it (management view: all statuses except removed).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const s = await seller(request);
 if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { id } = await params;
 const col = await getCollection(s.id, id);
 if (!col) return NextResponse.json({ error: "Not found" }, { status: 404 });
 const rows = await listCollectionItems(id, { manage: true });
 const items = rows.map((i) => ({ id: i.id, title: i.title, priceCents: i.priceCents, currency: i.currency, image: i.images?.[0] ?? null, status: i.status }));
 return NextResponse.json({ collection: { id: col.id, title: col.title, slug: col.slug }, items });
}

// PATCH { title?, imageUrl? } — rename, and/or set the cover photo shoppers see on a collection
// tile. `imageUrl: null` clears the photo, which is why presence is tested rather than truthiness.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const s = await seller(request);
 if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { id } = await params;
 const body = await request.json().catch(() => ({})) as { title?: unknown; imageUrl?: unknown };
 const wantsTitle = typeof body?.title === "string";
 const wantsImage = "imageUrl" in (body || {});
 if (!wantsTitle && !wantsImage) return NextResponse.json({ error: "Name required" }, { status: 400 });

 let col = await getCollection(s.id, id);
 if (!col) return NextResponse.json({ error: "Not found" }, { status: 404 });
 if (wantsTitle) {
  const title = String(body.title).trim();
  if (!title) return NextResponse.json({ error: "Name required" }, { status: 400 });
  col = (await renameCollection(s.id, id, title)) ?? col;
 }
 if (wantsImage) {
  const raw = body.imageUrl;
  col = (await setCollectionImage(s.id, id, typeof raw === "string" ? raw : null)) ?? col;
 }
 return NextResponse.json({ ok: true, collection: { id: col.id, title: col.title, slug: col.slug, imageUrl: col.imageUrl ?? null } });
}

// DELETE — remove the collection (items and their other collections are untouched).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const s = await seller(request);
 if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { id } = await params;
 const ok = await deleteCollection(s.id, id);
 return NextResponse.json({ ok });
}
