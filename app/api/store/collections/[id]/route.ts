import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { getCollection, renameCollection, deleteCollection, listCollectionItems } from "@/app/lib/db/collections";

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

// PATCH { title } — rename.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const s = await seller(request);
 if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { id } = await params;
 const body = await request.json().catch(() => ({}));
 const title = String(body?.title ?? "").trim();
 if (!title) return NextResponse.json({ error: "Name required" }, { status: 400 });
 const col = await renameCollection(s.id, id, title);
 if (!col) return NextResponse.json({ error: "Not found" }, { status: 404 });
 return NextResponse.json({ ok: true, collection: { id: col.id, title: col.title, slug: col.slug } });
}

// DELETE — remove the collection (items and their other collections are untouched).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const s = await seller(request);
 if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { id } = await params;
 const ok = await deleteCollection(s.id, id);
 return NextResponse.json({ ok });
}
